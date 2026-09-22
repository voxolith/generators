// Headless checks for the building generator. No GPU.  bun tools/verify.ts

import { seededRandom } from "@voxolith/renderer/core";
import { decodeState, encodeState, generateFromState, getGenerator } from "@voxolith/engine";
import { entityToVox } from "@voxolith/engine/vox";
import { generateBuilding, PRESETS, PRESET_NAMES, registerBuildingGenerators, ROLE } from "../src/index";

let failures = 0;
const ok = (c: boolean, m: string) => {
  if (c) console.log(`  ✓ ${m}`);
  else { console.error(`  ✗ ${m}`); failures++; }
};

function groundedFraction(model: { size: { x: number; y: number; z: number }; data: Uint8Array }): number {
  const { x: sx, y: sy, z: sz } = model.size;
  const sxy = sx * sy;
  const seen = new Uint8Array(model.data.length);
  const queue = new Int32Array(model.data.length);
  let head = 0, tail = 0, total = 0;
  for (let i = 0; i < model.data.length; i++) if (model.data[i] !== 0) total++;
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++)
      for (let y = 0; y <= 1; y++) {
        const i = x + y * sx + z * sxy;
        if (model.data[i] !== 0 && !seen[i]) { seen[i] = 1; queue[tail++] = i; }
      }
  let reached = 0;
  const push = (j: number) => { if (model.data[j] !== 0 && !seen[j]) { seen[j] = 1; queue[tail++] = j; } };
  while (head < tail) {
    const i = queue[head++];
    reached++;
    const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / sxy) | 0;
    if (x > 0) push(i - 1);
    if (x < sx - 1) push(i + 1);
    if (y > 0) push(i - sx);
    if (y < sy - 1) push(i + sx);
    if (z > 0) push(i - sxy);
    if (z < sz - 1) push(i + sxy);
  }
  return total ? reached / total : 1;
}

const count = (data: Uint8Array, role: number) => { let n = 0; for (const v of data) if (v === role) n++; return n; };

console.log("presets:");
for (const name of PRESET_NAMES) {
  const { entity, stats } = generateBuilding(PRESETS[name], seededRandom(3), name);
  const { x, y, z } = entity.model.size;
  const d = entity.model.data;
  ok(stats.total > 200, `${name}: ${stats.total} voxels, ${x}x${y}x${z}, ${stats.storeys} storeys, ${stats.windows} windows, ${stats.ms.toFixed(0)} ms`);
  ok(groundedFraction(entity.model) > 0.999, `  ${name} is one grounded piece`);
  ok(x <= 255 && y <= 255 && z <= 255, `  ${name} fits the .vox axis cap`);
  ok(stats.windows > 0 && count(d, ROLE.GLASS) + count(d, ROLE.GLASS_LIT) > 0, `  ${name} has glazed windows`);
  ok(count(d, ROLE.DOOR) > 0 && count(d, ROLE.FRAME) > 0, `  ${name} has a framed door`);
  ok(count(d, ROLE.ROOF) + count(d, ROLE.ROOF_DARK) + count(d, ROLE.RIDGE) > 0, `  ${name} has a roof`);
  // Hollow: the footprint's interior must contain empty voxels above the floor.
  const solid = stats.total, box = x * y * z;
  ok(solid < box * 0.6, `  ${name} is hollow (${((100 * solid) / box).toFixed(0)}% of its box is solid)`);
  ok(count(d, ROLE.FLOOR) > 0, `  ${name} has interior floors`);
  const glassRole = entity.model.roles[ROLE.GLASS - 1];
  ok(glassRole.material?.kind === "glass", `  ${name} windows carry a glass material hint`);
}

console.log("determinism:");
{
  const a = generateBuilding(PRESETS.farmhouse, seededRandom(77)).entity.model.data;
  const b = generateBuilding(PRESETS.farmhouse, seededRandom(77)).entity.model.data;
  ok(a.length === b.length && a.every((v, i) => v === b[i]), "the same seed gives byte-identical voxels");
  const c = generateBuilding(PRESETS.farmhouse, seededRandom(78)).entity.model.data;
  ok(!(a.length === c.length && a.every((v, i) => v === c[i])), "a different seed changes which windows are cut or lit");
}

console.log("knobs:");
{
  const p = JSON.parse(JSON.stringify(PRESETS.cottage));
  p.shape.storeys = 3;
  const tall = generateBuilding(p, seededRandom(5)).entity.model.size.y;
  p.shape.storeys = 1;
  const low = generateBuilding(p, seededRandom(5)).entity.model.size.y;
  ok(tall > low + 20, `storeys raise the building (${low} -> ${tall})`);
  p.look.lit = 1;
  const lit = generateBuilding(p, seededRandom(5)).stats;
  ok(lit.lit === lit.windows && lit.lit > 0, `lit=1 makes every window glow (${lit.lit}/${lit.windows})`);
  p.look.lit = 0;
  ok(generateBuilding(p, seededRandom(5)).stats.lit === 0, "lit=0 makes none glow");
  for (const roof of ["gable", "hip", "flat"] as const) {
    p.shape.roof = roof;
    const r = generateBuilding(p, seededRandom(5));
    ok(groundedFraction(r.entity.model) > 0.999, `  ${roof} roof stays connected`);
  }
  p.shape.roof = "gable"; p.look.wall = "timber";
  ok(count(generateBuilding(p, seededRandom(5)).entity.model.data, ROLE.BEAM) > 0, "timber walls get exposed beams");
}

console.log("vox export:");
{
  const { entity } = generateBuilding(PRESETS.tower, seededRandom(11));
  const buf = entityToVox(entity);
  ok(new TextDecoder().decode(new Uint8Array(buf, 0, 4)) === "VOX ", `tower exports ${(buf.byteLength / 1024).toFixed(0)} KB of .vox`);
}

console.log("share codes:");
{
  registerBuildingGenerators();
  for (const id of ["voxolith/house", "voxolith/townhouse"]) {
    const gen = getGenerator(id)!;
    const code = encodeState(gen as never, { seed: 4242, params: PRESETS.cottage });
    const back = decodeState(code);
    ok(back.generator === id && back.seed === 4242, `${id} round-trips its id and seed`);
    const a = generateFromState(decodeState(code));
    const b = generateFromState(decodeState(code));
    ok(a.model.data.length === b.model.data.length && a.model.data.every((v, i) => v === b.model.data[i]), `  ${id} rebuilds byte-identical voxels`);
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
