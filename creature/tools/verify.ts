// Headless checks for the creature generator. No GPU.  bun tools/verify.ts

import { seededRandom } from "@voxolith/renderer/core";
import type { EntityModel } from "@voxolith/engine";
import { bakePose, poseMatrices, sampleClip, sever, wound } from "@voxolith/engine/animation";
import { generateCreature, INTERIOR, PRESETS, PRESET_NAMES, ROLE } from "../src/index";

let failures = 0;
const ok = (c: boolean, m: string) => {
  if (c) console.log(`  ✓ ${m}`);
  else { console.error(`  ✗ ${m}`); failures++; }
};

const neighbours = (m: EntityModel, i: number) => {
  const { x: sx, y: sy } = m.size, sxy = sx * sy, n = m.data.length;
  return [i - 1, i + 1, i - sx, i + sx, i - sxy, i + sxy].map((j) => (j < 0 || j >= n ? 0 : m.data[j]));
};
const onSurface = (m: EntityModel, i: number) => neighbours(m, i).some((v) => !v);
function largest(m: EntityModel): number {
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

console.log("presets:");
for (const name of PRESET_NAMES) {
  const { entity, stats } = generateCreature(PRESETS[name], seededRandom(3), name);
  const m = entity.model, rig = entity.rig!;
  let unbound = 0, exposed = 0;
  for (let i = 0; i < m.data.length; i++) {
    if (!m.data[i]) continue;
    if (m.bones![i] >= rig.bones.length) unbound++;
    if (INTERIOR.has(m.data[i]) && onSurface(m, i)) exposed++;
  }
  ok(unbound === 0, `${name}: ${stats.voxels} voxels, ${stats.bones} bones, every voxel bound to a bone (${stats.ms.toFixed(0)} ms)`);
  ok(exposed === 0, `  ${name}: nothing of the inside shows on an undamaged animal (${exposed})`);
  ok(rig.bones.every((b, i) => b.parent < i), `  ${name}: bones are ordered parents first`);
}

const { entity: rat } = generateCreature(PRESETS.rat, seededRandom(3));
const m = rat.model, rig = rat.rig!;
const n = rig.bones.length;

console.log("inside:");
{
  const chest = rig.bones.findIndex((b) => b.id === "chest");
  const z = Math.round((rig.bones[chest].head[2] + rig.bones[chest].tail[2]) / 2);
  const found = new Set<number>();
  for (let y = 0; y < m.size.y; y++) for (let x = 0; x < m.size.x; x++) found.add(m.data[x + y * m.size.x + z * m.size.x * m.size.y]);
  ok([ROLE.BONE, ROLE.FLESH, ROLE.ORGAN].every((r) => found.has(r)), "a slice through the chest shows bone, flesh and organs");
  const head = rig.bones.findIndex((b) => b.id === "head");
  const hz = Math.round(rig.bones[head].head[2] + 3);
  const inHead = new Set<number>();
  for (let y = 0; y < m.size.y; y++) for (let x = 0; x < m.size.x; x++) inHead.add(m.data[x + y * m.size.x + hz * m.size.x * m.size.y]);
  ok(inHead.has(ROLE.BONE) && inHead.has(ROLE.ORGAN), "the head has a skull around a brain");
}

console.log("clips:");
{
  const minYOf = (b: EntityModel, bone: number | null) => {
    const { x: sx, y: sy } = b.size;
    let lo = Infinity;
    for (let i = 0; i < b.data.length; i++) {
      if (!b.data[i] || (bone !== null && b.bones![i] !== bone)) continue;
      lo = Math.min(lo, ((i / sx) | 0) % sy);
    }
    return lo;
  };
  for (const clip of rat.clips!) {
    let worst = 1, maxExposed = 0;
    for (let k = 0; k < 12; k++) {
      const t = (clip.duration * k) / 12;
      const b = bakePose(m, rig, poseMatrices(rig, sampleClip(clip, t, n)));
      worst = Math.min(worst, largest(b));
      let ex = 0, surf = 0;
      for (let i = 0; i < b.data.length; i++) {
        if (!b.data[i] || !onSurface(b, i)) continue;
        surf++;
        if (INTERIOR.has(b.data[i])) ex++;
      }
      maxExposed = Math.max(maxExposed, ex / Math.max(1, surf));
    }
    ok(worst > 0.985, `${clip.id}: stays one piece in every frame (worst ${(worst * 100).toFixed(1)}%)`);
    ok(maxExposed < 0.01, `  ${clip.id}: no inside showing in any pose (worst ${(maxExposed * 100).toFixed(2)}% of the surface)`);
    if (clip.loop) {
      const a = sampleClip(clip, 0, n).rotations, e = sampleClip(clip, clip.duration - 1e-6, n).rotations;
      ok(a.every((v, i) => Math.abs(Math.abs(v) - Math.abs(e[i])) < 1e-3), `  ${clip.id}: the loop closes`);
    }
  }
  const walk = rat.clips!.find((c) => c.id === "walk")!;
  let grounded = true;
  for (const ev of walk.events ?? []) {
    const leg = ev.name.split(".")[1];
    const foot = rig.bones.findIndex((b) => b.id === `${leg}.foot`);
    const b = bakePose(m, rig, poseMatrices(rig, sampleClip(walk, ev.t, n)));
    const lowestFoot = Math.min(...["FL", "FR", "HL", "HR"].map((l) => minYOf(b, rig.bones.findIndex((x) => x.id === `${l}.foot`))));
    if (minYOf(b, foot) > lowestFoot + 1 || minYOf(b, null) < lowestFoot - 1) grounded = false;
  }
  ok(grounded, "walk: each foot is down at its footfall event, and nothing hangs below the feet");
}

console.log("damage:");
{
  const blood = ROLE.BLOOD;
  const spine = rig.bones.findIndex((b) => b.id === "spine");
  const [px, py, pz] = rig.bones[spine].head;
  const hurt = wound(m, [px + 5, py, pz], 3, { rim: blood });
  let inside = 0;
  for (let i = 0; i < hurt.data.length; i++) if (hurt.data[i] && INTERIOR.has(hurt.data[i]) && onSurface(hurt, i)) inside++;
  ok(inside > 10, `a wound in the flank shows the inside (${inside} voxels)`);
  const tail = rig.bones.findIndex((b) => b.id === "tail2");
  const cut = sever(m, rig, tail, { rim: blood });
  ok(!!cut.piece && cut.piece.rig.bones.length === 5, `severing the tail at the third bone takes the rest of the tail with it (${cut.piece?.rig.bones.length} bones)`);
  const leg = rig.bones.findIndex((b) => b.id === "HL.upper");
  const cutLeg = sever(m, rig, leg, { rim: blood });
  ok(!!cutLeg.piece && cutLeg.piece.rig.bones.length === 3, "a hind leg comes off whole (thigh, shin, foot)");
}

console.log("determinism and cost:");
{
  const a = generateCreature(PRESETS.rat, seededRandom(9)).entity.model.data;
  const b = generateCreature(PRESETS.rat, seededRandom(9)).entity.model.data;
  ok(a.every((v, i) => v === b[i]), "the same seed gives the same rat");
  const run = rat.clips!.find((c) => c.id === "run")!;
  const t0 = performance.now();
  const N = 200;
  for (let i = 0; i < N; i++) bakePose(m, rig, poseMatrices(rig, sampleClip(run, i * 0.02, n)), { yaw: i * 0.05 });
  const us = ((performance.now() - t0) / N) * 1000;
  ok(us < 3000, `baking a posed rat takes ${us.toFixed(0)} µs`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
