// Headless checks for the toolkit. No GPU.  bun tools/verify.ts

import { seededRandom } from "@voxolith/renderer/core";
import { blob, capsule, drawSkeletonFine, facet, line3, makeNoise, RiggedVolume, SparseWriter, Volume } from "../src/index";
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

console.log("rigs:");
{
  const r = new RiggedVolume(40, 20, 20);
  const body = r.bone("body", null, [5, 10, 10], [25, 10, 10]);
  const leg = r.bone("leg", "body", [25, 10, 10], [35, 10, 10]);
  r.capsule(body, [5, 10, 10], [25, 10, 10], 6, 6, 1);
  r.capsule(leg, [25, 10, 10], [35, 10, 10], 3, 2, 1);
  const own = (x: number, y: number, z: number) => r.owner[r.vol.index(x, y, z)];
  ok(own(10, 10, 10) === body && own(32, 10, 10) === leg && own(25, 10, 10) === leg, "voxels belong to the bone that filled them last (the joint goes to the child)");
  const depth = r.layerInterior([7, 8, 9]);
  ok(r.vol.get(10, 10, 4) === 7 && r.vol.get(10, 10, 5) === 8 && r.vol.get(10, 10, 10) === 9, "layers follow depth below the surface: skin, then the next layer, then the core");
  ok(depth[r.vol.index(10, 10, 10)] >= 5, "depth counts voxels to the nearest air");
  const { model, rig } = r.crop([5, 4, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ id: `r${i}`, name: `R${i}`, color: [0.5, 0.5, 0.5] as [number, number, number] })));
  const b = r.vol.bounds()!;
  ok(!!model.bones && model.bones.length === model.data.length, "the crop carries the bone binding");
  ok(rig.bones[1].head[0] === 25 - b.x0 && rig.bones[1].parent === 0, "and moves the rig into the same space");
}

console.log("fine skeleton:");
{
  // A thin diagonal twig: at k = 2 a one-voxel, face-connected line; at k = 5
  // a capsule widened to radius 1 (three voxels across).
  const seg = [{ a: [1.2, 1.3, 1.1], b: [9.6, 7.7, 5.4], ra: 0.3, rb: 0.3, level: 2 }];
  const draw = (k: number) => {
    const w = new SparseWriter({ x: 12 * k, y: 12 * k, z: 12 * k });
    drawSkeletonFine(w, seg, { k, toFine: (p) => [p[0] * k, p[1] * k, p[2] * k], value: () => 1 });
    const cells = new Set<string>();
    for (let z = 0; z < 12 * k; z++) for (let y = 0; y < 12 * k; y++) for (let x = 0; x < 12 * k; x++) if (w.get(x, y, z)) cells.add(`${x},${y},${z}`);
    const [first] = cells;
    const seen = new Set([first]);
    const stack = [first];
    while (stack.length) {
      const [x, y, z] = stack.pop()!.split(",").map(Number);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const key = `${x + dx},${y + dy},${z + dz}`;
        if (cells.has(key) && !seen.has(key)) { seen.add(key); stack.push(key); }
      }
    }
    return { n: cells.size, connected: seen.size === cells.size };
  };
  const two = draw(2), five = draw(5);
  const len2 = Math.abs(19.2 - 2.4) + Math.abs(15.4 - 2.6) + Math.abs(10.8 - 2.2);
  ok(two.connected && two.n <= len2 + 2, `k = 2: a thin limb is a 6-connected line one voxel thick (${two.n} voxels)`);
  ok(five.connected && five.n > 3 * 45, `k = 5: it is still a widened capsule (${five.n} voxels)`);
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
