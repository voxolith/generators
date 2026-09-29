// Headless checks for the terrain generator. No GPU.  bun tools/verify.ts

import { makeNoise } from "@voxolith/gen-kit";
import { completeTerrainParams, DEFAULT_TERRAIN, fineTerrainFrom, fineTerrainInit, generateTerrain, refineTerrain, ROLE, terrainHeight, terrainHeightsBand, terrainInit, terrainSize, topOverrideData, type Terrain } from "../src/index";

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

console.log("bands:");
{
  // Odd sizes and a partial river, so rounding, uneven bands and the river merge all count.
  const params = { width: 157.4, depth: 131, river: { width: 9 } };
  const full = generateTerrain(params, 7).heights;
  const { width: W, depth: D } = terrainSize(params);
  ok(full.length === W * D && W === 157 && D === 131, `terrainSize rounds like generateTerrain (${W} x ${D})`);
  for (const n of [1, 2, 4]) {
    const heights = new Int16Array(W * D);
    let sampled = 0;
    for (let i = 0; i < n; i++) {
      const z0 = Math.floor((i * D) / n), z1 = Math.floor(((i + 1) * D) / n);
      const band = terrainHeightsBand(params, 7, z0, z1);
      sampled += band.length;
      heights.set(band, z0 * W);
    }
    ok(sampled === W * D && heights.every((v, i) => v === full[i]), `${n} band${n > 1 ? "s" : ""} stitch to generateTerrain's heights exactly`);
  }
  const p = completeTerrainParams(params);
  ok(JSON.stringify(p) === JSON.stringify(generateTerrain(params, 7).params), "completeTerrainParams is the merge generateTerrain uses");
  ok(p.river.width === 9 && p.river.depth === DEFAULT_TERRAIN.river.depth && p.river !== DEFAULT_TERRAIN.river, "river merges field by field, into a fresh object");
  ok(JSON.stringify(completeTerrainParams(p)) === JSON.stringify(p), "completing complete params changes nothing");
  ok(terrainHeightsBand(params, 7, -5, 3).length === 3 * W && terrainHeightsBand(params, 7, D - 2, D + 9).length === 2 * W
    && terrainHeightsBand(params, 7, 9, 4).length === 0, "band rows clamp to the map");
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

console.log("rebuilt from data (a worker's copy):");
{
  // A valley-like terrain, levelled as the examples' layout does: pads with a
  // blended apron under houses, yards round them, paths between the doors,
  // and the settlement's surface as a closure over its own noise.
  const span = 2, W = 320 * span;
  const c = generateTerrain({
    width: W, depth: W, height: 192, featureSize: 110 + 25 * span,
    river: { enabled: true, width: 14 + 3 * span, depth: 5, banks: 16 + 2 * span, meander: 260 + 70 * span },
  }, 5);
  const noise = makeNoise(5);
  const surface = new Uint8Array(W * W); // 0 terrain, 1 yard, 2 path
  const pads: [number, number, number, number][] = [[100, 120, 170, 170], [260, 300, 330, 350], [420, 180, 480, 230], [150, 420, 210, 470]];
  const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (const [x0, z0, x1, z1] of pads) {
    let sum = 0, n = 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { sum += c.heights[x + z * W]; n++; }
    const pad = Math.round(sum / n);
    for (let z = z0 - 14; z <= z1 + 14; z++)
      for (let x = x0 - 14; x <= x1 + 14; x++) {
        const e = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
        if (e > 14) continue;
        const i = x + z * W, w = 1 - smooth(2, 14, e);
        c.heights[i] = Math.round(pad * w + c.heights[i] * (1 - w));
        if (e > 0 && e < 6 && noise.value2(x * 0.2, z * 0.2) > 0.35) surface[i] = 1;
      }
  }
  const paths: [number, number][] = [];
  for (let i = 1; i < pads.length; i++) {
    const [ax, az] = [pads[i - 1][2] + 3, pads[i - 1][3] + 3], [bx, bz] = [pads[i][0] - 3, pads[i][1] - 3];
    for (let s = 0, n = Math.ceil(Math.hypot(bx - ax, bz - az)); s <= n; s++) {
      const x = Math.round(ax + ((bx - ax) * s) / n), z = Math.round(az + ((bz - az) * s) / n);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++)
        if (dx * dx + dz * dz <= 12 && !c.waterAt(x + dx, z + dz)) surface[x + dx + (z + dz) * W] = 2;
      if (s % 16 === 0) paths.push([x, z]);
    }
  }
  const top = (x: number, z: number) => {
    const s = surface[x + z * W];
    if (s === 2) return noise.value2(x * 0.3, z * 0.3) > 0.55 ? 22 : 21;
    return s === 1 ? 23 : 0;
  };

  // The coarse terrain: rebuilt from its heights, every derived field equal.
  const ci = structuredClone(terrainInit(c));
  const c2: Terrain = generateTerrain(ci.params, ci.seed, { heights: ci.heights });
  let coarseDiff = 0;
  for (let z = 0; z < W; z += 3) for (let x = 0; x < W; x += 3) {
    if (c2.topRole(x, z) !== c.topRole(x, z) || c2.waterAt(x, z) !== c.waterAt(x, z) || c2.waterDepth(x, z) !== c.waterDepth(x, z)) coarseDiff++;
    for (let y = 0; y < 48; y += 5) if (c2.roleAt(x, y, z) !== c.roleAt(x, y, z)) coarseDiff++;
  }
  ok(coarseDiff === 0 && c2.waterLevel === c.waterLevel && c2.maxY() === c.maxY() && c2.width === W
    && JSON.stringify(c2.roles) === JSON.stringify(c.roles) && JSON.stringify(c2.params) === JSON.stringify(c.params),
    "generateTerrain(params, seed, { heights }) rebuilds the levelled terrain: roles, water, per-column queries");
  const topData = topOverrideData(c, top);
  let coarseBricks = 0, coarseCells = 0;
  const ca = new Uint8Array(512), cb = new Uint8Array(512);
  for (let bz = 0; bz < W; bz += 24) for (let bx = 0; bx < W; bx += 24) for (let by = 0; by < 48; by += 8) {
    ca.fill(0); cb.fill(0);
    c.fillBrick(ca, bx, by, bz, 3, top);
    c2.fillBrick(cb, bx, by, bz, 3, topData);
    coarseBricks++;
    for (let i = 0; i < 512; i++) if (ca[i] !== cb[i]) coarseCells++;
  }
  ok(coarseCells === 0, `coarse fillBrick with the override as data matches the closure over ${coarseBricks} bricks`);

  for (const K of [5, 10]) {
    const fine = refineTerrain(c, K, { seed: 5 });
    const t0 = performance.now();
    const init = fineTerrainInit(fine, top);
    const t1 = performance.now();
    const copy = structuredClone(init, { transfer: [init.terrain.heights.buffer, init.options.top!.buffer] });
    const t2 = performance.now();
    const rebuilt = fineTerrainFrom(copy);
    const t3 = performance.now();
    // Brick columns: every one over a pad or a path stop, and a scattered sample elsewhere.
    const cols = new Set<number>();
    const add = (fx: number, fz: number) => { if (fx >= 0 && fz >= 0 && fx < W * K && fz < W * K) cols.add((fx >> 3) + (fz >> 3) * 1e5); };
    for (const [x0, z0, x1, z1] of pads) for (let z = (z0 - 16) * K; z <= (z1 + 16) * K; z += 8 * Math.max(1, K >> 1)) for (let x = (x0 - 16) * K; x <= (x1 + 16) * K; x += 8 * Math.max(1, K >> 1)) add(x, z);
    for (const [x, z] of paths) for (let d = -4 * K; d <= 4 * K; d += 8) { add(x * K + d, z * K); add(x * K, z * K + d); }
    for (let i = 0; i < 600; i++) add(((i * 7919) % W) * K + (i % 8), ((i * 104729) % W) * K + ((i * 3) % 8));
    const a = new Uint8Array(512), b = new Uint8Array(512);
    let bricks = 0, diff = 0, overridden = 0;
    for (const key of cols) {
      const ox = (key % 1e5) * 8, oz = Math.floor(key / 1e5) * 8;
      const [y0, y1] = fine.columnSpan(ox, oz);
      const [r0, r1] = rebuilt.columnSpan(ox, oz);
      if (r0 !== y0 || r1 !== y1) diff++;
      for (let oy = Math.max(0, (y0 & ~7) - 8); oy <= y1 + 8; oy += 8) {
        a.fill(0); b.fill(0);
        const wa = fine.fillBrick(a, ox, oy, oz, 3, top);
        const wb = rebuilt.fillBrick(b, ox, oy, oz, 3);
        bricks++;
        if (wa !== wb) diff++;
        for (let i = 0; i < 512; i++) {
          if (a[i] !== b[i]) diff++;
          if (a[i] >= 21 && a[i] <= 23) overridden++;
        }
      }
    }
    ok(diff === 0 && overridden > 0,
      `k = ${K}: the rebuilt fine terrain fills ${bricks} bricks in ${cols.size} brick columns byte-identically (${overridden} path and yard voxels among them; `
      + `init ${(t1 - t0).toFixed(0)} ms, clone ${(t2 - t1).toFixed(0)} ms, fineTerrainFrom ${(t3 - t2).toFixed(1)} ms for ${W}x${W})`);
    let queries = 0;
    for (let i = 0; i < 2000; i++) {
      const x = (i * 7919) % (W * K), z = (i * 6007) % (W * K);
      if (fine.heightAt(x, z) !== rebuilt.heightAt(x, z) || fine.waterAt(x, z) !== rebuilt.waterAt(x, z)) queries++;
    }
    ok(queries === 0 && fine.maxY() === rebuilt.maxY() && fine.waterTop === rebuilt.waterTop, `k = ${K}: heightAt, waterAt, maxY and waterTop agree`);
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
