// The generator contract, checked for every registered entity generator.
//
//   bun tools/contract.ts            all generators
//   bun tools/contract.ts --quick    defaults only, no parameter sweep
//
// What the engine and its hosts rely on (see @voxolith/engine EntityGenerator):
// stable identity and roles, defaults inside their own ParamSpecs, pure and
// deterministic generation from the injected rng (no state leaking between
// calls, inputs untouched), output values within the declared roles, the
// anchor inside the model, nothing floating, share codes that rebuild the
// same model, and every parameter extreme still generating.

import { seededRandom } from "@voxolith/renderer/core";
import {
  clampToSpec,
  decodeState,
  encodeState,
  generateFromState,
  getParam,
  listGenerators,
  withParam,
  type Entity,
  type EntityGenerator,
  type ParamSpec,
} from "@voxolith/engine";
import { registerTreeGenerators } from "@voxolith/gen-tree";
import { registerBushGenerators } from "@voxolith/gen-bush";
import { registerGrassGenerators } from "@voxolith/gen-grass";
import { registerRockGenerators } from "@voxolith/gen-rock";
import { registerBuildingGenerators } from "@voxolith/gen-building";
import { registerCreatureGenerators } from "@voxolith/gen-creature";
import { bakePose, poseMatrices, sampleClip } from "@voxolith/engine/animation";

registerTreeGenerators();
registerBushGenerators();
registerGrassGenerators();
registerRockGenerators();
registerBuildingGenerators();
registerCreatureGenerators();

const quick = process.argv.includes("--quick");
let failed = 0, checks = 0;
const problems: string[] = [];
const ok = (c: boolean, m: string, detail = "") => {
  checks++;
  if (c) return;
  failed++;
  problems.push(`${m}${detail ? ` — ${detail}` : ""}`);
  console.log(`    ✗ ${m}${detail ? ` — ${detail}` : ""}`);
};

const sameData = (a: Entity, b: Entity) =>
  a.model.data.length === b.model.data.length && a.model.data.every((v, i) => v === b.model.data[i]);

/**
 * Fraction of solid voxels 6-connected to the model's base (its two lowest
 * layers). Several pieces that each stand on the ground — blades in a tuft,
 * stones in an outcrop — are fine; anything floating is not.
 */
function grounded(e: Entity): number {
  const { x: sx, y: sy, z: sz } = e.model.size;
  const d = e.model.data, sxy = sx * sy;
  const seen = new Uint8Array(d.length);
  const stack = new Int32Array(d.length);
  let top = 0, total = 0, reached = 0;
  for (let i = 0; i < d.length; i++) if (d[i]) total++;
  for (let z = 0; z < sz; z++)
    for (let y = 0; y <= Math.min(1, sy - 1); y++)
      for (let x = 0; x < sx; x++) {
        const i = x + y * sx + z * sxy;
        if (d[i] && !seen[i]) { seen[i] = 1; stack[top++] = i; }
      }
  while (top) {
    const j = stack[--top];
    reached++;
    const x = j % sx, y = ((j / sx) | 0) % sy, z = (j / sxy) | 0;
    const push = (k: number) => { if (d[k] && !seen[k]) { seen[k] = 1; stack[top++] = k; } };
    if (x > 0) push(j - 1);
    if (x < sx - 1) push(j + 1);
    if (y > 0) push(j - sx);
    if (y < sy - 1) push(j + sx);
    if (z > 0) push(j - sxy);
    if (z < sz - 1) push(j + sxy);
  }
  return total ? reached / total : 1;
}

/** Largest 6-connected component as a fraction of solid voxels (a jumping pose need not touch the ground). */
function largestPart(m: Entity["model"]): number {
  const { x: sx, y: sy } = m.size, sxy = sx * sy, d = m.data;
  const seen = new Uint8Array(d.length);
  let best = 0, total = 0;
  for (let i = 0; i < d.length; i++) if (d[i]) total++;
  for (let i = 0; i < d.length; i++) {
    if (!d[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1; let n = 0;
    while (st.length) {
      const j = st.pop()!; n++;
      const x = j % sx, y = ((j / sx) | 0) % sy, z = (j / sxy) | 0;
      for (const [k, inb] of [[j - 1, x > 0], [j + 1, x < sx - 1], [j - sx, y > 0], [j + sx, y < sy - 1], [j - sxy, z > 0], [j + sxy, z < m.size.z - 1]] as const)
        if (inb && d[k] && !seen[k]) { seen[k] = 1; st.push(k); }
    }
    best = Math.max(best, n);
  }
  return total ? best / total : 1;
}

function checkEntity(gen: EntityGenerator<unknown>, e: Entity, label: string, minGrounded: number) {
  const { x, y, z } = e.model.size;
  ok(e.model.data.length === x * y * z, `${label}: data matches size`);
  let max = 0, solid = 0;
  for (const v of e.model.data) { if (v > max) max = v; if (v) solid++; }
  ok(solid > 0, `${label}: produces voxels`);
  ok(max <= e.model.roles.length, `${label}: every voxel value is a declared role`, `max value ${max}, ${e.model.roles.length} roles`);
  ok(e.model.roles.length === gen.roles.length && e.model.roles.every((r, i) => r.id === gen.roles[i].id),
    `${label}: emits the generator's roles in the declared order`, `${e.model.roles.map((r) => r.id).join(",")} vs ${gen.roles.map((r) => r.id).join(",")}`);
  const [ax, ay, az] = e.model.anchor;
  ok(ax >= 0 && ax <= x && az >= 0 && az <= z && ay >= 0 && ay <= y, `${label}: anchor inside the model`, `anchor ${e.model.anchor} in ${x}x${y}x${z}`);
  const g = grounded(e);
  ok(g >= minGrounded, `${label}: nothing floats`, `${(100 - g * 100).toFixed(2)}% of voxels not connected to the base`);
}

const t0 = performance.now();
for (const gen of listGenerators()) {
  const tg = performance.now();
  console.log(`${gen.id}  v${gen.version}`);

  // Identity and roles.
  ok(/^voxolith\/[a-z0-9.-]+$/.test(gen.id), "id is namespaced");
  ok(/^\d+\.\d+\.\d+$/.test(gen.version), "version is semver");
  ok(gen.roles.length > 0 && gen.roles.length <= 255, "declares 1..255 roles", `${gen.roles.length}`);
  ok(new Set(gen.roles.map((r) => r.id)).size === gen.roles.length, "role ids are unique");
  ok(gen.roles.every((r) => r.color.every((c) => c >= 0 && c <= 1)), "role colours are in 0..1");

  // Defaults satisfy their own specs.
  for (const spec of gen.params) {
    const v = getParam(gen.defaults, spec.path);
    ok(v !== undefined, `param ${spec.path} exists in the defaults`);
    if (v !== undefined) ok(clampToSpec(spec, v) === v, `default ${spec.path} = ${v} lies inside its spec`, `clamps to ${clampToSpec(spec, v)}`);
  }
  ok(new Set(gen.params.map((s) => s.path)).size === gen.params.length, "param paths are unique");

  // Purity and determinism.
  const before = JSON.stringify(gen.defaults);
  const a = gen.generate(structuredClone(gen.defaults), seededRandom(1234));
  const b = gen.generate(structuredClone(gen.defaults), seededRandom(9876));
  const a2 = gen.generate(structuredClone(gen.defaults), seededRandom(1234));
  ok(sameData(a, a2), "the same seed gives the same voxels, even after another call");
  ok(!sameData(a, b), "a different seed gives a different model");
  const passed = structuredClone(gen.defaults);
  gen.generate(passed, seededRandom(5));
  ok(JSON.stringify(passed) === before && JSON.stringify(gen.defaults) === before, "generate does not mutate its params or the defaults");
  checkEntity(gen, a, "defaults", 0.999);

  // Rigged generators: the rig and clips must be usable by the engine.
  if (a.rig) {
    const rig = a.rig, n = rig.bones.length, m = a.model;
    ok(n > 0 && n <= 255, "a rig has 1..255 bones", `${n}`);
    ok(rig.bones.every((b, i) => b.parent < i && b.parent >= -1), "bones are ordered parents first");
    ok(new Set(rig.bones.map((b) => b.id)).size === n, "bone ids are unique");
    ok(!!m.bones && m.bones.length === m.data.length, "the model binds every voxel to a bone");
    if (m.bones) {
      let bad = 0;
      for (let i = 0; i < m.data.length; i++) if (m.data[i] && m.bones[i] >= n) bad++;
      ok(bad === 0, "every bone binding names a real bone", `${bad} voxels`);
    }
    for (const clip of a.clips ?? []) {
      const tracksOk = clip.tracks.every((t) => t.bone >= 0 && t.bone < n && t.times.length > 0 && t.times[0] === 0 &&
        t.times.every((v, i) => i === 0 || v > t.times[i - 1]) && t.rotations.length === t.times.length * 4 &&
        t.times.every((_, k) => Math.abs(Math.hypot(t.rotations[k * 4], t.rotations[k * 4 + 1], t.rotations[k * 4 + 2], t.rotations[k * 4 + 3]) - 1) < 1e-3));
      ok(tracksOk, `clip ${clip.id}: tracks name real bones, times ascend from 0, rotations are unit quaternions`);
      if (clip.loop) {
        const s0 = sampleClip(clip, 0, n).rotations, s1 = sampleClip(clip, clip.duration - 1e-6, n).rotations;
        ok(s0.every((v, i) => Math.abs(Math.abs(v) - Math.abs(s1[i])) < 2e-3), `clip ${clip.id}: the loop closes`);
      }
      const mid = bakePose(m, rig, poseMatrices(rig, sampleClip(clip, clip.duration * 0.4, n)));
      const g = grounded({ ...a, model: mid });
      const c = largestPart(mid);
      ok(c >= 0.98, `clip ${clip.id}: a mid-clip pose stays in one piece`, `${(c * 100).toFixed(1)}% (grounded ${(g * 100).toFixed(1)}%)`);
    }
  }

  // Share codes rebuild the same model.
  const code = encodeState(gen, { seed: 4242, params: gen.defaults });
  const direct = gen.generate(structuredClone(gen.defaults), seededRandom(4242));
  ok(sameData(generateFromState(decodeState(code)), direct), "a share code rebuilds the same model");

  // Every parameter at its extremes still generates.
  if (!quick) {
    for (const spec of gen.params as ParamSpec[]) {
      const values: readonly unknown[] =
        spec.kind === "enum" ? spec.options : spec.kind === "bool" ? [false, true] : [spec.min, spec.max];
      for (const v of values) {
        const label = `${spec.path}=${String(v)}`;
        let e: Entity | null = null;
        try {
          e = gen.generate(withParam(structuredClone(gen.defaults), spec.path, v) as never, seededRandom(77));
        } catch (err) {
          ok(false, `${label}: generates`, (err as Error).message);
        }
        if (e) checkEntity(gen, e, label, 0.99);
      }
    }
  }
  console.log(`  ${((performance.now() - tg) / 1000).toFixed(1)}s`);
}

console.log(`\n${checks - failed}/${checks} contract checks passed in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
if (failed) {
  console.log(`\n${failed} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
