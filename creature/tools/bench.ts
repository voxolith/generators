// How many animated rats a frame can afford, measured headless: the crowd's real code for each
// path, with the renderer's own brick encoding and instance packing standing in for the GPU
// upload. Everything but the draw.
//
//   bun tools/bench.ts [counts...] [--mode=stamped|instances|rigged] [--damaged]
//
// Modes:
//   stamped    makeCrowd({ stamper }): poses baked, cached as sprites, stamped into world bricks.
//   instances  makeCrowd({ instances }): poses baked, each pose uploaded once as a model and drawn
//              by reference.
//   rigged     makeCrowd({ instances, rigged: true }): one rest model per variant, posed on the GPU;
//              each pose is packed and uploaded once and shared (as the renderer does), each rat
//              costs one instance record per frame; nothing baked.
// --damaged gives every rat its own wound, so no two rats can share a pose (the case a bake cache
// cannot help with).
//
// Columns: CPU ms per frame; poses baked per frame; members shown a stale pose because the bake
// budget ran out (deferred); GPU memory the crowd's models hold (stamped: the world bricks the
// rats occupy); bytes uploaded per frame (bricks, instance words, part records, new models).

import { BrickGrid, INST_WORDS, maxPoseWords, packInstance, packPose, partBoxes, seededRandom } from "@voxolith/renderer/core";
import { makeBrickStamper, makeInstanceLayer, type Entity, type InstanceTarget } from "@voxolith/engine";
import { makeAnimator, makeCrowd, wound, type CrowdMember } from "@voxolith/engine/animation";
import { generateCreature, PRESETS } from "../src/index";

const argv = process.argv.slice(2);
const mode = argv.includes("--rigged") ? "rigged" : (argv.find((a) => a.startsWith("--mode="))?.slice(7) ?? "stamped");
if (!["stamped", "instances", "rigged"].includes(mode)) throw new Error(`unknown mode ${mode}`);
const damaged = argv.includes("--damaged");
const counts = argv.map(Number).filter((n) => n > 0);
const COUNTS = counts.length ? counts : [10, 100, 500, 1000];
const size = { x: 512, y: 48, z: 512 };
const kinds = ["rat", "grey rat", "lab rat", "black rat"];
const variants: Entity[] = kinds.map((k, i) => generateCreature(PRESETS[k], seededRandom(10 + i), k).entity);

/** GPU bytes of a model as the renderer stores it: brick payload, index blocks and top level. */
function modelBytes(sz: { x: number; y: number; z: number }, data: Uint8Array): number {
  const g = new BrickGrid(sz, data);
  const st = g.stats();
  return st.payloadBytes + st.blocks * 512 * 4 + g.top.length * 4;
}

/** A headless InstanceTarget: encodes models, packs poses once and placements every frame, as the renderer does. */
function headlessTarget() {
  const models: ({ size: { x: number; y: number; z: number }; partBoxes?: Int32Array; joints?: { parent: number; at: readonly [number, number, number] }[]; bytes: number } | null)[] = [];
  let inst = new Uint32Array(INST_WORDS * 1024), poses = new Uint32Array(1 << 20), poseEnd = 0;
  const poseCache = new WeakMap<object, Map<Int32Array, { off: number; box: number[] }>>();
  let resident = 0, uploaded = 0;
  const target: InstanceTarget = {
    addModel(src) {
      let bytes = modelBytes(src.size, src.data!);
      let pb: Int32Array | undefined;
      if (src.parts && src.data) {
        const n = Math.max(Math.max(...src.parts) + 1, src.joints?.length ?? 0);
        pb = src.partBoxes ?? partBoxes(src.size, src.data, src.parts, n);
        const ids = new Uint8Array(src.data.length);
        for (let i = 0; i < ids.length; i++) if (src.data[i]) ids[i] = src.parts[i] + 1;
        bytes += modelBytes(src.size, ids);
      }
      models.push({ size: src.size, partBoxes: pb, joints: src.joints as never, bytes });
      resident += bytes;
      uploaded += bytes;
      return models.length - 1;
    },
    removeModel(id) {
      resident -= models[id]?.bytes ?? 0;
      models[id] = null;
    },
    addPalette: () => 256,
    setPaletteColors() {},
    removePalette() {},
    setInstances(list) {
      if (inst.length < list.length * INST_WORDS) inst = new Uint32Array(list.length * INST_WORDS * 2);
      list.forEach((p, k) => {
        const m = models[p.model]!;
        let pose: { off: number; box: number[] } | undefined;
        if (p.parts && m.partBoxes) {
          let byBoxes = poseCache.get(p.parts as unknown as object);
          if (!byBoxes) poseCache.set(p.parts as unknown as object, (byBoxes = new Map()));
          pose = byBoxes.get(m.partBoxes);
          if (!pose) {
            if (poses.length < poseEnd + maxPoseWords(m)) { const g = new Uint32Array((poseEnd + maxPoseWords(m)) * 2); g.set(poses); poses = g; }
            const packed = packPose(p.parts, m, poses, poseEnd);
            pose = { off: poseEnd, box: packed.box };
            poseEnd += packed.words;
            uploaded += packed.words * 4;
            resident += packed.words * 4;
            byBoxes.set(m.partBoxes, pose);
          }
        }
        packInstance(p, m, p.model, inst, k * INST_WORDS, pose);
      });
      uploaded += list.length * INST_WORDS * 4;
    },
  };
  return { target, resident: () => resident, takeUploaded: () => { const u = uploaded; uploaded = 0; return u; } };
}

const mb = (b: number) => (b / (1024 * 1024)).toFixed(1);
console.log(`${mode}${damaged ? ", every rat wounded differently" : ""}: rats on a ${size.x}x${size.z} field, 60 Hz, camera over the middle; CPU ms per frame\n`);
console.log("rats   ms/frame  bakes/frame  deferred/frame  models MB  KB/frame (upload)");
for (const N of COUNTS) {
  const rng = seededRandom(1);
  const grid = new BrickGrid(size);
  grid.editBox({ x0: 0, y0: 0, z0: 0, x1: size.x - 1, y1: 3, z1: size.z - 1 }, (cells) => { cells.fill(1, 0, 8 * 8 * 4); return true; });
  const groundBricks = grid.stats().used;
  let stampedBytes = 0;
  const stamper = makeBrickStamper({
    edit: (b, f) => void grid.editBox(b, f),
    editMany: (bs, f) => { for (const b of bs) { const e = grid.editBox(b, f); stampedBytes += e.slots4.length * 288 + e.slots8.length * 512; } },
  }, { size });
  const headless = headlessTarget();
  const crowd = mode === "stamped"
    ? makeCrowd({ stamper, budgetMs: 6 })
    : makeCrowd({ instances: makeInstanceLayer(headless.target), rigged: mode === "rigged", budgetMs: 6 });
  const clips = ["walk", "run", "idle", "sniff", "turn-left", "turn-right"];
  const members: (CrowdMember & { vx: number; vz: number })[] = Array.from({ length: N }, (_, i) => {
    const e = variants[i % variants.length];
    const anim = makeAnimator(e, clips[i % clips.length]);
    anim.update(rng() * 2);
    const yaw = rng() * Math.PI * 2;
    const m: CrowdMember & { vx: number; vz: number } = { id: i + 1, entity: e, variant: kinds[i % kinds.length], anim, base: 2 + (i % 4) * 20, x: 20 + rng() * 472, y: 4, z: 20 + rng() * 472, yaw, vx: Math.sin(yaw), vz: Math.cos(yaw) };
    if (damaged) {
      // A wound somewhere on the flank: every rat's rest model is its own.
      const s = e.model.size;
      m.rest = wound(e.model, [s.x * (0.2 + 0.6 * rng()), s.y * (0.3 + 0.4 * rng()), s.z * (0.2 + 0.6 * rng())], 2.5);
      m.damage = i + 1;
    }
    return m;
  });
  const cam: [number, number, number] = [256, 200, 256];
  const dt = 1 / 60;
  let ms = 0, bakes = 0, deferred = 0, bricks = 0, frames = 0, bytes = 0, peak = 0;
  headless.takeUploaded();
  for (let f = 0; f < 60 * 6; f++) {
    for (const m of members) {
      m.anim.update(dt);
      const speed = m.anim.clip() === "run" ? 30 : m.anim.clip().startsWith("walk") || m.anim.clip().startsWith("turn") ? 12 : 0;
      m.x += m.vx * speed * dt; m.z += m.vz * speed * dt;
      if (m.x < 20 || m.x > 492) { m.vx = -m.vx; m.yaw = Math.atan2(m.vx, m.vz); }
      if (m.z < 20 || m.z > 492) { m.vz = -m.vz; m.yaw = Math.atan2(m.vx, m.vz); }
    }
    stampedBytes = 0;
    const t0 = performance.now();
    const st = crowd.update(members, cam);
    const t = performance.now() - t0;
    const up = headless.takeUploaded() + stampedBytes;
    const resident = mode === "stamped" ? (grid.stats().used - groundBricks) * 288 : headless.resident();
    if (f >= 120) { // after two seconds of warm-up
      ms += t; bakes += mode === "rigged" ? 0 : st.bakes; deferred += st.deferred; bricks += st.bricks; bytes += up; frames++;
      peak = Math.max(peak, resident);
    }
  }
  console.log(
    `${String(N).padStart(4)}   ${(ms / frames).toFixed(2).padStart(8)}  ${(bakes / frames).toFixed(1).padStart(11)}  ${(deferred / frames).toFixed(1).padStart(14)}  ${mb(peak).padStart(9)}  ${(bytes / frames / 1024).toFixed(0).padStart(8)}`,
  );
}
