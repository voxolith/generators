// Contact sheets for iterating on the look.
//   bun tools/preview.ts [species|roofs|walls|seeds] [--width N]

import { mkdirSync, writeFileSync } from "node:fs";
import { seededRandom } from "@voxolith/renderer/core";
import { contactSheet, encodePng, renderEntity, type SheetCell } from "@voxolith/gen-kit/preview";
import { PRESETS, PRESET_NAMES } from "../src/index";
import { GENERATE } from "./shared";

const args = process.argv.slice(2);
const round = args.find((a) => !a.startsWith("--")) ?? "species";
const flag = (n: string, d: number) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d;
};
const W = flag("width", 300);
const H = Math.round(W * 0.95);
const OUT = new URL("../previews/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function cell(params: unknown, seed: number, label: string): SheetCell {
  const { entity, stats } = GENERATE(params as never, seededRandom(seed), label);
  const render = renderEntity(entity, { width: W, height: H, yawDeg: 38, pitchDeg: 18 });
  console.log(
    `  ${label.padEnd(20)} ${String(stats.total).padStart(7)} vox ` +
      `${entity.model.size.x}x${entity.model.size.y}x${entity.model.size.z} ${stats.windows} win ${stats.ms.toFixed(0)}+${render.ms.toFixed(0)} ms`,
  );
  return { render, label };
}

const cells: SheetCell[] = [];
let cols = PRESET_NAMES.length;
let title = round;
const clone = (p: unknown) => JSON.parse(JSON.stringify(p));

if (round === "species") {
  title = "presets";
  for (const name of PRESET_NAMES) cells.push(cell(PRESETS[name], 21, name));
} else if (round === "roofs") {
  cols = 3;
  for (const roof of ["gable", "hip", "flat"]) {
    const p = clone(PRESETS.farmhouse); p.shape.roof = roof; cells.push(cell(p, 21, roof));
  }
  for (const pitch of [0.6, 1.2, 2]) {
    const p = clone(PRESETS.cottage); p.shape.roofPitch = pitch; cells.push(cell(p, 21, `pitch ${pitch}`));
  }
} else if (round === "walls") {
  cols = 4;
  for (const wall of ["plaster", "brick", "stone", "timber"]) {
    const p = clone(PRESETS.farmhouse); p.look.wall = wall; cells.push(cell(p, 21, wall));
  }
  for (const roof of ["tile", "slate", "thatch", "shingle"]) {
    const p = clone(PRESETS.farmhouse); p.look.roofStyle = roof; cells.push(cell(p, 21, roof));
  }
} else if (round === "seeds") {
  cols = 3;
  for (const name of ["cottage", "townhouse"]) for (let s = 0; s < 3; s++) cells.push(cell(PRESETS[name], 100 + s * 7, `${name} #${s}`));
}

const sheet = contactSheet(cells, cols, title);
const file = `${OUT}${round}.png`;
writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.rgb));
console.log(`wrote ${file} (${sheet.width}x${sheet.height})`);
