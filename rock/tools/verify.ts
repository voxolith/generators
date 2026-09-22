// Headless checks for the rock generator. No GPU.  bun tools/verify.ts

import { seededRandom } from "@voxolith/renderer/core";
import { decodeState, encodeState, generateFromState, getGenerator } from "@voxolith/engine";
import { entityToVox } from "@voxolith/engine/vox";
import { generateRock, PRESETS, PRESET_NAMES, registerRockGenerators, ROLE } from "../src/index";

let failures = 0;
const ok = (c: boolean, m: string) => {
  if (c) console.log(`  ✓ ${m}`);
  else { console.error(`  ✗ ${m}`); failures++; }
};

/** Fraction of solid voxels reachable, through faces, from the bottom layers. */
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

console.log("presets:");
for (const name of PRESET_NAMES) {
  const { entity, stats } = generateRock(PRESETS[name], seededRandom(3), name);
  const { x, y, z } = entity.model.size;
  const grounded = groundedFraction(entity.model);
  ok(stats.total > 50, `${name}: ${stats.total} voxels, ${x}x${y}x${z}, ${stats.rocks} rock(s), ${stats.ms.toFixed(0)} ms`);
  ok(grounded > 0.999, `  ${name} is one grounded piece (${(grounded * 100).toFixed(2)}%)`);
  ok(x <= 255 && y <= 255 && z <= 255, `  ${name} fits the .vox axis cap`);
  ok(entity.model.anchor[1] >= 0 && entity.model.anchor[1] < y, `  ${name} anchor sits inside the model`);
  const hist = new Map<number, number>();
  for (const v of entity.model.data) if (v) hist.set(v, (hist.get(v) ?? 0) + 1);
  ok(hist.size >= 3, `  ${name} uses ${hist.size} roles on its surface`);
}

console.log("determinism:");
{
  const a = generateRock(PRESETS.outcrop, seededRandom(77));
  const b = generateRock(PRESETS.outcrop, seededRandom(77));
  ok(a.entity.model.data.length === b.entity.model.data.length && a.entity.model.data.every((v, i) => v === b.entity.model.data[i]),
    "the same seed gives byte-identical voxels");
  const c = generateRock(PRESETS.outcrop, seededRandom(78));
  ok(!(c.entity.model.data.length === a.entity.model.data.length && c.entity.model.data.every((v, i) => v === a.entity.model.data[i])),
    "a different seed gives a different rock");
}

console.log("look knobs:");
{
  const p = JSON.parse(JSON.stringify(PRESETS.boulder));
  p.look.moss = 1; p.look.lichen = 0; p.look.cracks = 0;
  const mossy = generateRock(p, seededRandom(5)).stats;
  p.look.moss = 0;
  const bare = generateRock(p, seededRandom(5)).stats;
  ok(mossy.moss > bare.moss && bare.moss === 0, `moss responds to its knob (${mossy.moss} vs ${bare.moss} voxels)`);
  p.look.cracks = 1;
  const cracked = generateRock(p, seededRandom(5)).stats;
  ok(cracked.cracks > 0, `cracks appear when asked (${cracked.cracks} voxels)`);
  p.look.snow = 1; p.look.moss = 0; p.look.cracks = 0;
  const snowy = generateRock(p, seededRandom(5)).entity.model.data;
  let snow = 0; for (const v of snowy) if (v === ROLE.SNOW) snow++;
  ok(snow > 0, `snow lands on top faces (${snow} voxels)`);
}

console.log("shape knobs:");
{
  const p = JSON.parse(JSON.stringify(PRESETS.boulder));
  p.shape.size = 32;
  const small = generateRock(p, seededRandom(9)).entity.model.size;
  p.shape.size = 96;
  const big = generateRock(p, seededRandom(9)).entity.model.size;
  ok(big.x > small.x * 2.4 && big.x < small.x * 3.6, `size scales the footprint (${small.x} -> ${big.x})`);
  p.shape.size = 48; p.shape.aspect = 0.35;
  const slab = generateRock(p, seededRandom(9)).entity.model.size;
  ok(slab.y < slab.x * 0.55, `low aspect makes a slab (${slab.x}x${slab.y})`);
  p.shape.aspect = 0.8; p.shape.cluster = 6;
  const cl = generateRock(p, seededRandom(9));
  ok(cl.stats.rocks === 7 && groundedFraction(cl.entity.model) > 0.999, `a cluster of ${cl.stats.rocks} stays one connected piece`);
}

console.log("vox export:");
{
  const { entity } = generateRock(PRESETS.outcrop, seededRandom(11));
  const buf = entityToVox(entity);
  ok(new TextDecoder().decode(new Uint8Array(buf, 0, 4)) === "VOX ", `outcrop exports ${(buf.byteLength / 1024).toFixed(0)} KB of .vox`);
}

console.log("share codes:");
{
  registerRockGenerators();
  for (const id of ["voxolith/rock", "voxolith/outcrop"]) {
    const gen = getGenerator(id)!;
    const code = encodeState(gen as never, { seed: 4242, params: PRESETS.boulder });
    const back = decodeState(code);
    ok(back.generator === id && back.seed === 4242, `${id} round-trips its id and seed`);
    const a = generateFromState(decodeState(code));
    const b = generateFromState(decodeState(code));
    ok(a.model.data.length === b.model.data.length && a.model.data.every((v, i) => v === b.model.data[i]), `  ${id} rebuilds byte-identical voxels`);
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
