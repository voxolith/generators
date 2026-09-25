// Contact sheets for judging the creature.
//   bun tools/preview.ts [species|cut|clips|walk|turns] [--width N] [--scale VOXELS_PER_METRE]
// species: every preset at rest. cut: halves and slices showing the inside.
// clips: a strip of frames per clip, to judge whether the resolution animates.

import { mkdirSync, writeFileSync } from "node:fs";
import { seededRandom } from "@voxolith/renderer/core";
import { contactSheet, cutAway, encodePng, renderEntity, type SheetCell } from "@voxolith/gen-kit/preview";
import { bakePose, poseMatrices, sampleClip } from "@voxolith/engine/animation";
import type { Entity } from "@voxolith/engine";
import { atScale, generateCreature, PRESETS, PRESET_NAMES } from "../src/index";

const args = process.argv.slice(2);
const round = args.find((a) => !a.startsWith("--")) ?? "species";
const W = Number(args[args.indexOf("--width") + 1] ?? 0) || 260;
const OUT = new URL("../previews/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const view = { width: W, height: Math.round(W * 0.75), yawDeg: 55, pitchDeg: 18 };
const cells: SheetCell[] = [];
let cols = 4;
// --scale 100 judges the rat as it is sized for a 1 cm world (atScale).
const scale = Number(args[args.indexOf("--scale") + 1] ?? 0) || 0;
const ratParams = scale ? atScale(PRESETS.rat, scale) : PRESETS.rat;
const rat = generateCreature(ratParams, seededRandom(7)).entity;
const posed = (e: Entity, clip: string, t: number, yaw = 0): Entity => {
  const c = e.clips!.find((k) => k.id === clip)!;
  const m = bakePose(e.model, e.rig!, poseMatrices(e.rig!, sampleClip(c, t, e.rig!.bones.length)), { yaw });
  return { ...e, model: m };
};

if (round === "species") {
  cols = 3;
  for (const name of PRESET_NAMES) {
    const { entity, stats } = generateCreature(PRESETS[name], seededRandom(7), name);
    cells.push({ render: renderEntity(entity, view), label: `${name} ${stats.voxels}v` });
  }
  cells.push({ render: renderEntity(rat, { ...view, yawDeg: 0, pitchDeg: 8, zoom: 0.55, aimY: 0.45, aimOffset: [0, 0, rat.model.size.z * 0.28] }), label: "head" });
} else if (round === "cut") {
  cols = 3;
  const cx = Math.floor(rat.model.size.x / 2);
  cells.push({ render: renderEntity({ ...rat, model: cutAway(rat.model, "x", cx) }, { ...view, yawDeg: 90, pitchDeg: 10 }), label: "half (x)" });
  for (const f of [0.55, 0.72, 0.88]) {
    const z = Math.floor(rat.model.size.z * f);
    cells.push({ render: renderEntity({ ...rat, model: cutAway(rat.model, "z", z) }, { ...view, yawDeg: 0, pitchDeg: 12, zoom: 0.8 }), label: `slice z=${z}` });
  }
  cells.push({ render: renderEntity({ ...rat, model: cutAway(rat.model, "y", Math.floor(rat.model.anchor[1] + 7)) }, { ...view, pitchDeg: 60 }), label: "top off" });
} else if (round === "clips") {
  cols = 6;
  for (const clip of rat.clips!) {
    for (let k = 0; k < 6; k++) {
      const t = (clip.duration * k) / (clip.loop ? 6 : 5);
      cells.push({ render: renderEntity(posed(rat, clip.id, t), { ...view, yawDeg: 90, pitchDeg: 8 }), label: `${clip.id} ${t.toFixed(2)}s` });
    }
  }
} else if (round === "walk") {
  // Close up on the legs at several sizes: does the gait read?
  cols = 6;
  const legs = (process.env.LEGS ?? "").split(",").filter(Boolean).map(Number);
  for (const [size, leg] of legs.length ? legs.map((l) => [1.25, l]) : [[1, 1], [1.25, 1], [1.5, 1]]) {
    const p = JSON.parse(JSON.stringify(PRESETS.rat));
    p.shape.size = size;
    p.shape.legLength = leg;
    const e = generateCreature(p, seededRandom(7)).entity;
    for (let k = 0; k < 6; k++) {
      const t = (e.clips![0].duration * k) / 6;
      cells.push({ render: renderEntity(posed(e, "walk", t), { ...view, yawDeg: 90, pitchDeg: 4, zoom: 0.62, aimY: 0.35, aimOffset: [0, 0, e.model.size.z * 0.18] }), label: `size ${size} legs ${leg} ${t.toFixed(2)}s` });
    }
  }
} else if (round === "turns") {
  cols = 4;
  for (const deg of [0, 22.5, 45, 67.5, 90, 135, 200, 300]) {
    cells.push({ render: renderEntity(posed(rat, "walk", 0.2, (deg * Math.PI) / 180), { ...view, yawDeg: 30 }), label: `yaw ${deg}°` });
  }
}

const sheet = contactSheet(cells, cols, `rat · ${round}`);
writeFileSync(`${OUT}${round}.png`, encodePng(sheet.width, sheet.height, sheet.rgb));
console.log(`wrote ${OUT}${round}.png`);
