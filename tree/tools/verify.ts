// Headless checks for the tree generator. No GPU, no rendering.
//   bun tools/verify.ts

import { seededRandom } from "@voxolith/renderer/core";
import {
  clampToSpec,
  decodeState,
  encodeState,
  fingerprint,
  generateFromState,
  getGenerator,
  modelAt,
  readParams,
  voxelCount,
  withParam,
} from "@voxolith/engine";
import { entityToVox } from "@voxolith/engine/vox";
import { generateTree, PRESETS, PRESET_NAMES, registerTreeGenerators } from "../src/index";
import type { Season } from "../src/params";

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

/** 6-connected component count over a model's occupied voxels. */
function components(model: { size: { x: number; y: number; z: number }; data: Uint8Array }): number {
  const { x: sx, y: sy, z: sz } = model.size;
  const sxy = sx * sy;
  const seen = new Uint8Array(model.data.length);
  const queue = new Int32Array(model.data.length);
  let parts = 0;
  for (let start = 0; start < model.data.length; start++) {
    if (model.data[start] === 0 || seen[start]) continue;
    parts++;
    let head = 0, tail = 0;
    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % sx;
      const y = ((i / sx) | 0) % sy;
      const z = (i / sxy) | 0;
      const push = (j: number) => {
        if (model.data[j] !== 0 && !seen[j]) {
          seen[j] = 1;
          queue[tail++] = j;
        }
      };
      if (x > 0) push(i - 1);
      if (x < sx - 1) push(i + 1);
      if (y > 0) push(i - sx);
      if (y < sy - 1) push(i + sx);
      if (z > 0) push(i - sxy);
      if (z < sz - 1) push(i + sxy);
    }
  }
  return parts;
}

console.log("presets:");
for (const name of PRESET_NAMES) {
  const { entity, stats } = generateTree(PRESETS[name], seededRandom(7), name);
  const m = entity.model;
  console.log(
    `  ${name.padEnd(7)} ${String(m.size.x).padStart(3)}x${String(m.size.y).padStart(3)}x${String(m.size.z).padStart(3)}` +
      ` · ${String(stats.total).padStart(7)} voxels (wood ${stats.wood}, leaf ${stats.foliage})` +
      ` · ${stats.stems} stems, ${stats.clusters} clusters` +
      ` · carved ${stats.shellCarved}+${stats.macroCarved}, pruned ${stats.pruned}` +
      ` · ${stats.ms.toFixed(0)} ms`,
  );
  ok(stats.total > 12000, `${name}: has substantial geometry`);
  ok(m.size.y >= PRESETS[name].shape.height * 0.92, `${name}: reaches the requested height`);
  ok(m.size.x <= 255 && m.size.y <= 255 && m.size.z <= 255, `${name}: fits the .vox 255-per-axis cap`);
  ok(m.roles.length <= 255, `${name}: within the 255-colour cap`);
  ok(components(m) === 1, `${name}: one 6-connected piece`);
  ok(stats.ms < 4000, `${name}: generates in ${stats.ms.toFixed(0)} ms`);
  // The anchor must sit at the trunk base so a host can plant it on the ground.
  ok(Math.abs(m.anchor[1]) < 2, `${name}: anchor sits at the base`);
  const nearAnchor = modelAt(m, Math.round(m.anchor[0]), 0, Math.round(m.anchor[2]));
  ok(nearAnchor !== 0, `${name}: solid wood under the anchor`);
}

console.log("determinism:");
{
  const a = generateTree(PRESETS.oak, seededRandom(1234));
  const b = generateTree(PRESETS.oak, seededRandom(1234));
  let same = a.entity.model.data.length === b.entity.model.data.length;
  if (same) {
    for (let i = 0; i < a.entity.model.data.length; i++) {
      if (a.entity.model.data[i] !== b.entity.model.data[i]) {
        same = false;
        break;
      }
    }
  }
  ok(same, "the same seed reproduces the same tree exactly");
  const c = generateTree(PRESETS.oak, seededRandom(99));
  ok(voxelCount(c.entity.model) !== voxelCount(a.entity.model), "a different seed gives a different tree");
}

console.log("seasons:");
for (const season of ["spring", "summer", "autumn", "winter"] as Season[]) {
  const p = JSON.parse(JSON.stringify(PRESETS.oak));
  p.look.season = season;
  const { stats } = generateTree(p, seededRandom(3));
  console.log(`  oak ${season.padEnd(7)} ${String(stats.total).padStart(7)} voxels (leaf ${stats.foliage})`);
  ok(stats.total > 10000, `oak in ${season}: generates`);
  if (season === "winter") ok(stats.foliage < stats.wood, "winter broadleaf is bare");
}

console.log("heights:");
for (const h of [64, 128, 192]) {
  const p = JSON.parse(JSON.stringify(PRESETS.oak));
  p.shape.height = h;
  const { entity, stats } = generateTree(p, seededRandom(5));
  console.log(`  ${String(h).padStart(3)} -> ${entity.model.size.y} tall, ${stats.total} voxels, ${stats.ms.toFixed(0)} ms`);
  ok(Math.abs(entity.model.size.y - h) <= h * 0.12, `height ${h} is honoured within 12%`);
}

console.log("vox export:");
{
  const { entity } = generateTree(PRESETS.spruce, seededRandom(11));
  const buf = entityToVox(entity);
  ok(buf.byteLength > 1000, `spruce exports ${(buf.byteLength / 1024).toFixed(0)} KB of .vox`);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  ok(magic === "VOX ", "the export carries a valid .vox header");
}

console.log("share codes:");
{
  // A code has to rebuild the exact model, or it is not worth sharing.
  registerTreeGenerators();
  const gen = getGenerator("voxolith/tree.broadleaf")!;
  const read = (o: unknown, path: string) =>
    path.split(".").reduce<any>((c, k) => (c == null ? c : c[k]), o);

  const state = { seed: 12345, params: JSON.parse(JSON.stringify(PRESETS.oak)) };
  const code = encodeState(gen as never, state);
  console.log(`  ${code.length}-char code, fingerprint ${fingerprint(code)}`);

  const back = decodeState(code);
  ok(back.generator === gen.id && back.seed === 12345, "a code round-trips its generator and seed");

  let drift = "";
  for (const { spec } of readParams(gen as never, state.params)) {
    const want = String(clampToSpec(spec, read(state.params, spec.path)));
    const got = String(read(back.params, spec.path));
    if (want !== got) drift ||= `${spec.path}: ${want} -> ${got}`;
  }
  ok(!drift, "every declared parameter round-trips", drift);

  // All four spec kinds, with values that are not the defaults.
  let tweaked = JSON.parse(JSON.stringify(PRESETS.oak));
  tweaked = withParam(tweaked, "shape.height", 171);
  tweaked = withParam(tweaked, "shape.trunk.taperExp", 0.85);
  tweaked = withParam(tweaked, "foliage.enabled", false);
  tweaked = withParam(tweaked, "look.season", "autumn");
  const t = decodeState(encodeState(gen as never, { seed: 7, params: tweaked }));
  ok(read(t.params, "shape.height") === 171, "int survives");
  ok(read(t.params, "shape.trunk.taperExp") === 0.85, "number survives");
  ok(read(t.params, "foliage.enabled") === false, "bool survives");
  ok(read(t.params, "look.season") === "autumn", "enum survives");

  const a = generateFromState(decodeState(code));
  const b = generateFromState(decodeState(code));
  ok(
    a.model.data.length === b.model.data.length && a.model.data.every((v, i) => v === b.model.data[i]),
    "the same code rebuilds byte-identical voxels",
  );
  const other = generateFromState(decodeState(encodeState(gen as never, { seed: 999, params: PRESETS.oak })));
  ok(
    other.model.data.length !== a.model.data.length || !other.model.data.every((v, i) => v === a.model.data[i]),
    "a different seed gives a different tree",
  );
  ok(encodeState(gen as never, state) === code, "encoding is stable across runs");

  // A code written against a different parameter list must be refused, not
  // quietly misread into a different tree.
  const shifted = { ...gen, params: (gen.params as unknown[]).slice(1) } as never;
  let refused = false;
  try {
    decodeState(encodeState(shifted, state));
  } catch (e) {
    refused = String(e).includes("different parameters");
  }
  ok(refused, "a code from a different parameter set is refused");

  let rejected = false;
  try {
    decodeState("not a real code!!");
  } catch {
    rejected = true;
  }
  ok(rejected, "garbage is rejected");
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
