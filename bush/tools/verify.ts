// Headless checks for the bush generator. No GPU.  bun tools/verify.ts

import { seededRandom } from "@voxolith/renderer/core";
import { modelAt } from "@voxolith/engine";
import { decodeState, encodeState, generateFromState, getGenerator } from "@voxolith/engine";
import { entityToVox } from "@voxolith/engine/vox";
import { generateBush, PRESETS, PRESET_NAMES, registerBushGenerators } from "../src/index";

let failures = 0;
const ok = (c: boolean, m: string) => {
  if (c) console.log(`  ✓ ${m}`);
  else { console.error(`  ✗ ${m}`); failures++; }
};

/** Every voxel must connect, through faces, to something standing on the ground. */
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
  return total === 0 ? 0 : reached / total;
}

console.log("presets:");
for (const name of PRESET_NAMES) {
  const { entity, stats } = generateBush(PRESETS[name], seededRandom(7), name);
  const m = entity.model;
  console.log(
    `  ${name.padEnd(10)} ${String(m.size.x).padStart(3)}x${String(m.size.y).padStart(3)}x${String(m.size.z).padStart(3)}` +
      ` · ${String(stats.total).padStart(6)} voxels (wood ${stats.wood}, leaf ${stats.foliage})` +
      ` · ${stats.stems} stems, ${stats.clusters} clumps · pruned ${stats.pruned} · ${stats.ms.toFixed(0)} ms`,
  );
  ok(stats.total > 2000, `${name}: has substantial geometry`);
  ok(m.size.x <= 255 && m.size.y <= 255 && m.size.z <= 255, `${name}: fits the .vox axis cap`);
  ok(groundedFraction(m) > 0.999, `${name}: everything connects to the ground`);
  ok(Math.abs(m.anchor[1]) < 2, `${name}: anchor sits at the base`);
  ok(modelAt(m, Math.round(m.anchor[0]), 0, Math.round(m.anchor[2])) !== 0 || stats.stems > 1, `${name}: rooted`);
  ok(stats.ms < 4000, `${name}: generates in ${stats.ms.toFixed(0)} ms`);
}

console.log("determinism:");
{
  const a = generateBush(PRESETS.bush, seededRandom(99));
  const b = generateBush(PRESETS.bush, seededRandom(99));
  let same = a.entity.model.data.length === b.entity.model.data.length;
  if (same) for (let i = 0; i < a.entity.model.data.length; i++) if (a.entity.model.data[i] !== b.entity.model.data[i]) { same = false; break; }
  ok(same, "the same seed reproduces the same bush exactly");
}

console.log("seasons:");
for (const season of ["spring", "summer", "autumn", "winter"] as const) {
  const p = JSON.parse(JSON.stringify(PRESETS.bush));
  p.look.season = season;
  const { stats } = generateBush(p, seededRandom(3));
  console.log(`  bush ${season.padEnd(7)} ${String(stats.total).padStart(6)} voxels (leaf ${stats.foliage})`);
  ok(stats.total > 800, `bush in ${season}: generates`);
}

console.log("vox export:");
{
  const { entity } = generateBush(PRESETS.thicket, seededRandom(11));
  const buf = entityToVox(entity);
  ok(new TextDecoder().decode(new Uint8Array(buf, 0, 4)) === "VOX ", `thicket exports ${(buf.byteLength / 1024).toFixed(0)} KB of .vox`);
}

console.log("share codes:");
{
  // Every generator this package registers has to survive a round trip: the
  // viewer builds its UI and its share codes straight off the registry.
  registerBushGenerators();
  for (const id of ["voxolith/bush", "voxolith/thicket"]) {
    const gen = getGenerator(id)!;
    const code = encodeState(gen as never, { seed: 4242, params: PRESETS.bush });
    const back = decodeState(code);
    ok(back.generator === id && back.seed === 4242, `${id} round-trips its id and seed`);
    const a = generateFromState(decodeState(code));
    const b = generateFromState(decodeState(code));
    ok(
      a.model.data.length === b.model.data.length && a.model.data.every((v, i) => v === b.model.data[i]),
      `  ${id} rebuilds byte-identical voxels`,
    );
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
