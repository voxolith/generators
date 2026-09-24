// Headless checks for the terrain generator. No GPU.  bun tools/verify.ts

import { DEFAULT_TERRAIN, generateTerrain, ROLE, terrainHeight } from "../src/index";

let failures = 0;
const ok = (c: boolean, m: string) => {
  if (c) console.log(`  ✓ ${m}`);
  else { console.error(`  ✗ ${m}`); failures++; }
};

const t0 = performance.now();
const t = generateTerrain({ width: 640, depth: 640 }, 7);
const ms = performance.now() - t0;
const W = t.width, D = t.depth;

console.log("shape:");
{
  let lo = Infinity, hi = -Infinity, wet = 0, rock = 0, sand = 0, dry = 0;
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const h = t.heights[x + z * W];
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (t.waterAt(x, z)) wet++;
      const r = t.topRole(x, z);
      if (r === ROLE.ROCK || r === ROLE.ROCK_DARK) rock++;
      if (r === ROLE.SAND) sand++;
      if (r === ROLE.GRASS_DRY) dry++;
    }
  const n = W * D;
  ok(hi < t.params.height - 40 && lo >= 2, `heights ${lo}..${hi} leave headroom in a ${t.params.height}-tall grid (${ms.toFixed(0)} ms for ${W}x${D})`);
  ok(wet / n > 0.02 && wet / n < 0.4, `some of the map is water, not most of it (${((100 * wet) / n).toFixed(1)}%)`);
  ok(rock > 0 && sand > 0 && dry > 0, `surfaces vary: rock ${rock}, sand ${sand}, dry grass ${dry}`);
}

console.log("river:");
{
  // The river crosses the map: flood-fill the wet columns and find a component
  // spanning at least half the map in one direction.
  const seen = new Uint8Array(W * D);
  let best = 0;
  for (let i = 0; i < W * D; i++) {
    if (seen[i] || !t.waterAt(i % W, (i / W) | 0)) continue;
    let x0 = W, x1 = 0, z0 = D, z1 = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % W, z = (j / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const k = nx + nz * W;
        if (!seen[k] && t.waterAt(nx, nz)) { seen[k] = 1; stack.push(k); }
      }
    }
    best = Math.max(best, x1 - x0, z1 - z0);
  }
  ok(best > W / 2, `one body of water spans ${best} of ${W} columns — a river, not puddles`);
}

console.log("voxels:");
{
  // fillBrick agrees with roleAt everywhere in a sample of bricks.
  let mismatches = 0, bricks = 0;
  const cells = new Uint8Array(512);
  for (let bz = 0; bz < D; bz += 72)
    for (let bx = 0; bx < W; bx += 72)
      for (let by = 0; by < 48; by += 8) {
        cells.fill(0);
        t.fillBrick(cells, bx, by, bz, 1);
        bricks++;
        for (let z = 0; z < 8; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
          if (cells[x + y * 8 + z * 64] !== t.roleAt(bx + x, by + y, bz + z)) mismatches++;
      }
  ok(mismatches === 0, `fillBrick matches roleAt over ${bricks} bricks`);
  let waterOk = true;
  for (let z = 0; z < D; z += 5) for (let x = 0; x < W; x += 5) {
    const h = t.heightAt(x, z), s = t.waterLevel - 1;
    if (t.waterAt(x, z) !== (t.roleAt(x, s, z) === ROLE.WATER && h < s)) waterOk = false;
  }
  ok(waterOk, "waterAt agrees with where water voxels are");
  ok(t.roles[ROLE.WATER - 1].material?.kind === "water", "the water role carries the water material");
}

console.log("determinism:");
{
  const a = generateTerrain({ width: 200, depth: 200 }, 42).heights;
  const b = generateTerrain({ width: 200, depth: 200 }, 42).heights;
  const c = generateTerrain({ width: 200, depth: 200 }, 43).heights;
  ok(a.every((v, i) => v === b[i]), "the same seed gives the same heights");
  ok(!a.every((v, i) => v === c[i]), "a different seed gives different heights");
  const fn = terrainHeight({ ...DEFAULT_TERRAIN, width: 200, depth: 200 }, 42);
  ok([[0, 0], [199, 3], [77, 150]].every(([x, z]) => fn(x, z) === a[x + z * 200]), "the pure height function matches the sampled map (streamable)");
}

console.log("picking:");
{
  const x = 300, z = 300, h = t.heightAt(x, z);
  const hit = t.pick([x, h + 80, z - 80], [0, -1, 1]);
  ok(!!hit && Math.abs(hit[1] - (t.heightAt(hit[0], hit[2]))) <= 1.5, `a ray from above lands on the ground (${hit?.map((v) => v.toFixed(1))})`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
