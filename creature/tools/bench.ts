// How many animated rats a frame can afford, measured headless against a real
// BrickGrid: posing, the pose cache, baking and stamping — everything but the
// GPU upload and the draw.   bun tools/bench.ts [counts...] [--rigged]
//
// --rigged measures posing on the GPU instead (makeCrowd({ instances, rigged: true })): bone
// matrices per rat and the renderer's own instance packing (packInstance, parts and masks), with
// the words it would upload per frame. There is nothing to bake or stamp.

import { BrickGrid, INST_WORDS, maxPartWords, packInstance, partBoxes, seededRandom } from "@voxolith/renderer/core";
import { makeBrickStamper, makeInstanceLayer, type Entity, type InstanceTarget } from "@voxolith/engine";
import { makeAnimator, makeCrowd, type CrowdMember } from "@voxolith/engine/animation";
import { generateCreature, PRESETS } from "../src/index";

const rigged = process.argv.includes("--rigged");
const counts = process.argv.slice(2).map(Number).filter((n) => n > 0);
const COUNTS = counts.length ? counts : [10, 100, 500, 1000];
const size = { x: 512, y: 48, z: 512 };
const rng = seededRandom(1);
const kinds = ["rat", "grey rat", "lab rat", "black rat"];
const variants: Entity[] = kinds.map((k, i) => generateCreature(PRESETS[k], seededRandom(10 + i), k).entity);

/** A headless InstanceTarget that packs placements as the renderer does, counting the words it would upload. */
function packingTarget() {
  const models: { size: { x: number; y: number; z: number }; partBoxes?: Int32Array; joints?: { parent: number; at: readonly [number, number, number] }[] }[] = [];
  let inst = new Uint32Array(INST_WORDS * 1024), parts = new Uint32Array(1 << 20), uploaded = 0;
  const target: InstanceTarget = {
    addModel(src) {
      const n = src.parts ? Math.max(...src.parts) + 1 : 0;
      models.push({ size: src.size, partBoxes: src.parts && src.data ? partBoxes(src.size, src.data, src.parts, Math.max(n, src.joints?.length ?? 0)) : undefined, joints: src.joints as never });
      return models.length - 1;
    },
    removeModel() {},
    addPalette: () => 256,
    setPaletteColors() {},
    removePalette() {},
    setInstances(list) {
      if (inst.length < list.length * INST_WORDS) inst = new Uint32Array(list.length * INST_WORDS * 2);
      let off = 0;
      list.forEach((p, k) => {
        const m = models[p.model];
        if (p.parts && parts.length < off + maxPartWords(m)) { const g = new Uint32Array((off + maxPartWords(m)) * 2); g.set(parts); parts = g; }
        off += packInstance(p, m, p.model, inst, k * INST_WORDS, parts, off).partWords;
      });
      uploaded += (list.length * INST_WORDS + off) * 4;
    },
  };
  return { target, takeUploaded: () => { const u = uploaded; uploaded = 0; return u; } };
}

console.log(`rats on a ${size.x}x${size.z} field, 60 Hz, camera over the middle; ms are CPU per frame${rigged ? " (posed on the GPU)" : ""}\n`);
console.log(rigged ? "rats   ms/frame  matrix sets/frame  KB/frame (upload)" : "rats   ms/frame  bakes/frame  cache hits  bricks/frame  KB/frame (upload)");
for (const N of COUNTS) {
  const grid = new BrickGrid(size);
  grid.editBox({ x0: 0, y0: 0, z0: 0, x1: size.x - 1, y1: 3, z1: size.z - 1 }, (cells) => { cells.fill(1, 0, 8 * 8 * 4); return true; });
  const stamper = makeBrickStamper({ edit: (b, f) => void grid.editBox(b, f), editMany: (bs, f) => { for (const b of bs) grid.editBox(b, f); } }, { size });
  const packing = packingTarget();
  const crowd = rigged ? makeCrowd({ instances: makeInstanceLayer(packing.target), rigged: true }) : makeCrowd({ stamper, budgetMs: 6 });
  const clips = ["walk", "run", "idle", "sniff", "turn-left", "turn-right"];
  const members: (CrowdMember & { vx: number; vz: number })[] = Array.from({ length: N }, (_, i) => {
    const e = variants[i % variants.length];
    const anim = makeAnimator(e, clips[i % clips.length]);
    anim.update(rng() * 2);
    const yaw = rng() * Math.PI * 2;
    return { id: i + 1, entity: e, variant: kinds[i % kinds.length], anim, base: 2 + (i % 4) * 20, x: 20 + rng() * 472, y: 4, z: 20 + rng() * 472, yaw, vx: Math.sin(yaw), vz: Math.cos(yaw) };
  });
  const cam: [number, number, number] = [256, 200, 256];
  const dt = 1 / 60;
  let ms = 0, bakes = 0, hits = 0, bricks = 0, frames = 0, bytes = 0;
  for (let f = 0; f < 60 * 6; f++) {
    for (const m of members) {
      m.anim.update(dt);
      const speed = m.anim.clip() === "run" ? 30 : m.anim.clip().startsWith("walk") || m.anim.clip().startsWith("turn") ? 12 : 0;
      m.x += m.vx * speed * dt; m.z += m.vz * speed * dt;
      if (m.x < 20 || m.x > 492) { m.vx = -m.vx; m.yaw = Math.atan2(m.vx, m.vz); }
      if (m.z < 20 || m.z > 492) { m.vz = -m.vz; m.yaw = Math.atan2(m.vx, m.vz); }
    }
    const t0 = performance.now();
    const st = crowd.update(members, cam);
    const t = performance.now() - t0;
    const up = packing.takeUploaded();
    if (f >= 120) { // after two seconds of warm-up
      ms += t; bakes += st.bakes; hits += st.hits; bricks += st.bricks; bytes += up; frames++;
    }
  }
  if (rigged) {
    console.log(`${String(N).padStart(4)}   ${(ms / frames).toFixed(2).padStart(8)}  ${(bakes / frames).toFixed(1).padStart(17)}  ${(bytes / frames / 1024).toFixed(0).padStart(8)}`);
    continue;
  }
  const kb = (bricks / frames) * (256 + 32) / 1024;
  console.log(
    `${String(N).padStart(4)}   ${(ms / frames).toFixed(2).padStart(8)}  ${(bakes / frames).toFixed(1).padStart(11)}  ${((100 * hits) / Math.max(1, hits + bakes)).toFixed(1).padStart(9)}%  ${(bricks / frames).toFixed(0).padStart(12)}  ${kb.toFixed(0).padStart(8)}`,
  );
}
