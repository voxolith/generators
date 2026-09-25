// Headless checks for the terrain generator. No GPU.  bun tools/verify.ts

import { DEFAULT_TERRAIN, generateTerrain, refineTerrain, ROLE, terrainHeight } from "../src/index";

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

console.log("river width:");
{
  // Local width at each wet column: the shorter of its horizontal and
  // vertical water runs (a run along a diagonal river overstates both, the
  // shorter one less). The spread between narrows and pools is p90 / p10.
  const widths = (variation: number) => {
    const r = generateTerrain({ width: 640, depth: 640, river: { ...DEFAULT_TERRAIN.river, widthVariation: variation } }, 7);
    const run = (x: number, z: number, dx: number, dz: number) => {
      let n = 1;
      for (let s = 1; s < 80 && r.waterAt(x + dx * s, z + dz * s); s++) n++;
      for (let s = 1; s < 80 && r.waterAt(x - dx * s, z - dz * s); s++) n++;
      return n;
    };
    const out: number[] = [];
    for (let z = 4; z < 636; z += 6) for (let x = 4; x < 636; x += 6) if (r.waterAt(x, z)) out.push(Math.min(run(x, z, 1, 0), run(x, z, 0, 1)));
    out.sort((a, b) => a - b);
    const q = (f: number) => out[Math.floor(f * (out.length - 1))];
    return { p10: q(0.1), p90: q(0.9), spread: q(0.9) / Math.max(1, q(0.1)) };
  };
  const flat = widths(0), varied = widths(0.6);
  ok(varied.spread > flat.spread * 1.4, `the width varies along the river: narrows ${varied.p10} to pools ${varied.p90} voxels (constant width: ${flat.p10}..${flat.p90})`);
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

console.log("refined (k = 10):");
{
  const c = generateTerrain({ width: 160, depth: 160, height: 192 }, 11);
  // Level a pad, as a settlement does, before refining.
  for (let z = 60; z < 80; z++) for (let x = 60; x < 80; x++) c.heights[x + z * 160] = 30;
  const K = 10, f = refineTerrain(c, K, { seed: 11 });
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const cx = 5 + ((i * 37) % 150), cz = 5 + ((i * 91) % 150);
    const fineTop = f.heightAt(cx * K + 5, cz * K + 5) + 1, coarseTop = (c.heights[cx + cz * 160] + 1) * K;
    worst = Math.max(worst, Math.abs(fineTop - coarseTop));
  }
  ok(worst <= 3 * K, `the fine surface follows the coarse one (worst ${worst} fine voxels at a column centre)`);
  let flat = true;
  for (let z = 640; z < 780; z += 7) for (let x = 640; x < 780; x += 7) if (f.heightAt(x, z) !== 31 * K - 1) flat = false;
  ok(flat, "a levelled pad stays exactly flat");
  const cells = new Uint8Array(512);
  let outside = 0, water = 0, blades = 0, filled = 0;
  for (let bz = 0; bz < 40; bz++)
    for (let bx = 0; bx < 40; bx++) {
      const [y0, y1] = f.columnSpan(bx * 8, bz * 8);
      for (let by = Math.max(0, Math.floor((y0 - 64) / 8)); by <= Math.floor((y1 + 64) / 8); by++) {
        cells.fill(0);
        if (!f.fillBrick(cells, bx * 8, by * 8, bz * 8, 1)) continue;
        filled++;
        for (let i = 0; i < 512; i++) {
          if (!cells[i]) continue;
          const y = by * 8 + ((i >> 3) & 7);
          if (y < y0 || y > y1) outside++;
          if (cells[i] === ROLE.WATER) water++;
          if ((cells[i] === ROLE.GRASS || cells[i] === ROLE.GRASS_LIGHT) && y > f.heightAt(bx * 8 + (i & 7), bz * 8 + (i >> 6))) blades++;
        }
      }
    }
  ok(outside === 0, `nothing is written outside a column's span (${outside})`);
  ok(filled > 0 && blades > 0, `grassy ground grows blades (${blades} blade voxels)`);
  const wx = [...Array(160 * 160).keys()].find((i) => c.waterAt(i % 160, Math.floor(i / 160)));
  if (wx !== undefined) {
    const x = (wx % 160) * K + 5, z = Math.floor(wx / 160) * K + 5;
    ok(f.waterAt(x, z) && f.waterTop === (c.waterLevel) * K - 1, "flooded columns carry water to the refined water level");
  }
  const a = new Uint8Array(512), b = new Uint8Array(512);
  f.fillBrick(a, 400, f.heightAt(400, 400) & ~7, 400, 1);
  refineTerrain(c, K, { seed: 11 }).fillBrick(b, 400, f.heightAt(400, 400) & ~7, 400, 1);
  ok(a.every((v, i) => v === b[i]), "deterministic");
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
