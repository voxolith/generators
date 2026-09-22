// Per-level skeleton report, for tuning branch angles and radii quickly.
//   bun tools/debug.ts [preset] [seed]

import { seededRandom } from "@voxolith/renderer/core";
import { makeNoise } from "@voxolith/gen-kit";
import { PRESETS } from "../src/index";
import { cloneParams } from "../src/params";
import { applyAgeAndHealth } from "../src/season";
import { fitHeight, growSkeleton } from "../src/skeleton";

const name = process.argv[2] ?? "oak";
const seed = Number(process.argv[3] ?? 100);
const p = cloneParams(PRESETS[name]);
applyAgeAndHealth(p.shape, p.look);
const rng = seededRandom(seed);
const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
const skel = growSkeleton(p.shape, rng, noise);
const s = fitHeight(skel, p.shape.height - 8);

console.log(`${name} seed ${seed}: fit scale ${s.toFixed(2)}, top ${skel.topY.toFixed(0)}, spread ${skel.spread.toFixed(0)}`);
console.log("level  stems   meanLen  meanR0   meanR1   elevation(deg from horizontal)");
const byLevel = new Map<number, typeof skel.stems>();
for (const st of skel.stems) {
  const list = byLevel.get(st.level) ?? [];
  list.push(st);
  byLevel.set(st.level, list);
}
for (const [level, list] of [...byLevel].sort((a, b) => a[0] - b[0])) {
  const mean = (f: (x: (typeof list)[0]) => number) => list.reduce((a, b) => a + f(b), 0) / list.length;
  const elev = mean((st) => {
    const a = st.points[0], b = st.points[st.points.length - 1];
    const dy = b[1] - a[1];
    const dh = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return (Math.atan2(dy, dh) * 180) / Math.PI;
  });
  console.log(
    `${String(level).padStart(5)} ${String(list.length).padStart(6)} ` +
      `${mean((st) => st.length).toFixed(1).padStart(9)} ${mean((st) => st.radii[0]).toFixed(2).padStart(8)} ` +
      `${mean((st) => st.radii[st.radii.length - 1]).toFixed(2).padStart(8)} ${elev.toFixed(0).padStart(8)}`,
  );
}
console.log(`tips ${skel.tips.length}, segments ${skel.segments.length}`);
