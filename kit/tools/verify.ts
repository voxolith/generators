// Headless checks for the toolkit. No GPU.  bun tools/verify.ts

import { seededRandom } from "@voxolith/renderer/core";
import { blob, capsule, facet, line3, makeNoise, Volume } from "../src/index";
import { renderEntity } from "../src/preview/index";

let failures = 0;
const ok = (c: boolean, m: string) => {
  if (c) console.log(`  ✓ ${m}`);
  else { console.error(`  ✗ ${m}`); failures++; }
};

/** Solid voxels 6-connected to the first solid voxel found. */
function oneComponent(vol: Volume): boolean {
  const { sx, sy, data } = vol;
  const sxy = sx * sy;
  const start = data.findIndex((v) => v !== 0);
  if (start < 0) return false;
  const seen = new Uint8Array(data.length);
  const stack = [start];
  seen[start] = 1;
  let reached = 0, total = 0;
  for (const v of data) if (v) total++;
  while (stack.length) {
    const i = stack.pop()!;
    reached++;
    const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / sxy) | 0;
    for (const [j, inside] of [[i - 1, x > 0], [i + 1, x < sx - 1], [i - sx, y > 0], [i + sx, y < sy - 1], [i - sxy, z > 0], [i + sxy, z < vol.sz - 1]] as const)
      if (inside && data[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
  }
  return reached === total;
}

console.log("primitives:");
{
  const vol = new Volume(64, 64, 64);
  line3(vol, [2, 3, 5], [60, 57, 41], 1);
  ok(oneComponent(vol), "line3 stays 6-connected on a skewed diagonal");
  const cap = new Volume(64, 64, 64);
  capsule(cap, [10, 10, 10], [50, 40, 30], 4, 1.5, 1);
  ok(oneComponent(cap), "a tapered capsule is one piece");
}

console.log("masses:");
{
  const rng = seededRandom(9);
  const noise = makeNoise(9);
  const vol = new Volume(48, 40, 48);
  blob(vol, { centre: [24, 18, 24], radii: [16, 12, 14], exponent: 2.2, roughness: 0.2, detail: 0.12, noise }, 1);
  const before = vol.data.reduce((n, v) => n + (v ? 1 : 0), 0);
  const { removed, planes } = facet(vol, { centre: [24, 18, 24], radii: [16, 12, 14], count: 5, depth: [0.1, 0.3], rng });
  ok(before > 1000 && removed > 0 && planes.length === 5, `blob ${before} voxels, facet removed ${removed} along ${planes.length} planes`);
  ok(oneComponent(vol), "a faceted blob stays one piece");
}

console.log("preview:");
{
  const vol = new Volume(16, 16, 16);
  capsule(vol, [8, 0, 8], [8, 14, 8], 3, 3, 1);
  const model = vol.crop([8, 0, 8], [{ id: "a", name: "A", color: [0.8, 0.3, 0.2] }]);
  const r = renderEntity({ id: "t", kind: "test", model }, { width: 64, height: 64 });
  let lit = 0;
  for (let i = 0; i < r.rgb.length; i += 3) if (r.rgb[i] > r.rgb[i + 2] + 40) lit++;
  ok(lit > 100, `renders a test model (${lit} model pixels)`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
