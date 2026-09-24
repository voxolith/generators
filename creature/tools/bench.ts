// How many animated rats a frame can afford, measured headless against a real
// BrickGrid: posing, the pose cache, baking and stamping — everything but the
// GPU upload and the draw.   bun tools/bench.ts [counts...]

import { BrickGrid, seededRandom } from "@voxolith/renderer/core";
import { makeBrickStamper, type Entity } from "@voxolith/engine";
import { makeAnimator, makeCrowd, type CrowdMember } from "@voxolith/engine/animation";
import { generateCreature, PRESETS } from "../src/index";

const counts = process.argv.slice(2).map(Number).filter((n) => n > 0);
const COUNTS = counts.length ? counts : [10, 100, 500, 1000];
const size = { x: 512, y: 48, z: 512 };
const rng = seededRandom(1);
const kinds = ["rat", "grey rat", "lab rat", "black rat"];
const variants: Entity[] = kinds.map((k, i) => generateCreature(PRESETS[k], seededRandom(10 + i), k).entity);

console.log(`rats on a ${size.x}x${size.z} field, 60 Hz, camera over the middle; ms are CPU per frame\n`);
console.log("rats   ms/frame  bakes/frame  cache hits  bricks/frame  KB/frame (upload)");
for (const N of COUNTS) {
  const grid = new BrickGrid(size);
  grid.editBox({ x0: 0, y0: 0, z0: 0, x1: size.x - 1, y1: 3, z1: size.z - 1 }, (cells) => { cells.fill(1, 0, 8 * 8 * 4); return true; });
  const stamper = makeBrickStamper({ edit: (b, f) => void grid.editBox(b, f), editMany: (bs, f) => { for (const b of bs) grid.editBox(b, f); } }, { size });
  const crowd = makeCrowd({ stamper, budgetMs: 6 });
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
  let ms = 0, bakes = 0, hits = 0, bricks = 0, frames = 0;
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
    if (f >= 120) { // after two seconds of warm-up
      ms += t; bakes += st.bakes; hits += st.hits; bricks += st.bricks; frames++;
    }
  }
  const kb = (bricks / frames) * (256 + 32) / 1024;
  console.log(
    `${String(N).padStart(4)}   ${(ms / frames).toFixed(2).padStart(8)}  ${(bakes / frames).toFixed(1).padStart(11)}  ${((100 * hits) / Math.max(1, hits + bakes)).toFixed(1).padStart(9)}%  ${(bricks / frames).toFixed(0).padStart(12)}  ${kb.toFixed(0).padStart(8)}`,
  );
}
