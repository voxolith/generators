// The same terrain, k times finer.
//
// A region cannot be refined like a model (it is too big to exist at once),
// so this wraps the coarse terrain and answers per brick, as the coarse one
// does. The coarse heightfield stays the source of truth: a settlement that
// levelled pads into `coarse.heights` gets flat pads here too, and the river,
// lakes, banks and slopes are exactly where they were. What the finer grid
// adds:
//   - a smooth surface: bicubic (Catmull-Rom) through the coarse column tops,
//     so terraces of 10 cm steps become slopes, with a little micro relief;
//   - organic boundaries between surface roles (grass, sand, rock, paths),
//     looked up a little off each column by noise;
//   - grass blades, 1 voxel across and a few to fifteen tall, in clumps
//     with bare patches, on grassy ground;
//   - pebbles on beds, banks and paths;
//   - only a skin of ground (the view is from above), so a 128 m valley at
//     1 cm voxels costs its surface, not its volume.

import { makeNoise } from "@voxolith/gen-kit";
import type { Terrain } from "./index";
import { ROLE } from "./roles";

type Vec3 = [number, number, number];

/** Tuning for {@link refineTerrain}. */
export interface FineTerrainOptions {
  /** Grass blades per grassy column, 0..1 (default 0.22). */
  grass?: number;
  /** Tallest blade, in fine voxels (default 1.4k). */
  bladeHeight?: number;
  /** Ground kept below the lowest neighbouring surface, in fine voxels (default 6). */
  skin?: number;
  /** Seeds the blade, pebble and boundary noise. */
  seed?: number;
}

/**
 * A terrain `k` times finer, from {@link refineTerrain}: the same queries as {@link Terrain}, in
 * fine voxels, answered per brick from the coarse heightfield.
 */
export interface FineTerrain {
  /** The terrain it refines; its `heights` stay the source of truth. */
  readonly coarse: Terrain;
  /** Fine voxels per coarse voxel. */
  readonly k: number;
  /** Extent in fine columns: the coarse extent times `k`. */
  readonly width: number;
  readonly depth: number;
  /** Top fine voxel of the water, when a column is flooded. */
  readonly waterTop: number;
  /** Ground height (top solid voxel) of a fine column, before blades. */
  heightAt(x: number, z: number): number;
  /** Is this fine column under water? */
  waterAt(x: number, z: number): boolean;
  /** Highest Y anything is written at, blades included. */
  maxY(): number;
  /** Lowest and highest Y written within a fine-voxel footprint, for sizing edits. */
  spanOf(x0: number, z0: number, x1: number, z1: number): [number, number];
  /** The same for one 8x8 brick column at (ox, oz). Edit a box per column for speed. */
  columnSpan(ox: number, oz: number): [number, number];
  /**
   * Write one 8^3 brick, as Terrain.fillBrick. `top` is looked up on coarse
   * columns (the settlement's paths and yards) and applies to the top two
   * fine voxels, with no blades.
   */
  fillBrick(cells: Uint8Array, ox: number, oy: number, oz: number, base: number, top?: (cx: number, cz: number) => number): boolean;
  /** First point where a ray meets the ground (or, with `water`, the water), as Terrain.pick. */
  pick(origin: Vec3, dir: Vec3, opts?: { water?: boolean; maxT?: number }): Vec3 | null;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Integer hash of a fine column to [0, 1). */
function h2(x: number, z: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The same terrain `k` times finer, for a world at 50 or 100 voxels per metre. Nothing is built
 * up front: the result wraps `coarse` and fills any brick on demand, with a bicubic surface
 * through the coarse column tops, organic boundaries between surface roles, grass blades on grassy
 * ground and pebbles on beds and paths. Only a skin of ground is written, so cost follows the
 * surface. Edits to `coarse.heights` (levelled pads) carry through.
 *
 * @param coarse - The terrain at 10 voxels per metre.
 * @param k - Fine voxels per coarse voxel (5 or 10).
 * @param opts - Blade density and height, skin depth and seed.
 * @returns The fine terrain; stream it brick by brick, editing a box per brick column
 * (`columnSpan`).
 */
export function refineTerrain(coarse: Terrain, k: number, opts: FineTerrainOptions = {}): FineTerrain {
  const K = Math.max(1, Math.round(k));
  const W = coarse.width * K, D = coarse.depth * K;
  const CW = coarse.width, CD = coarse.depth;
  const noise = makeNoise(((opts.seed ?? 1) ^ 0x9e37) | 1);
  const grass = opts.grass ?? 0.22;
  const bladeMax = opts.bladeHeight ?? Math.round(1.4 * K);
  const skin = opts.skin ?? 6;
  // Coarse water: a column is flooded below S; its top water voxel is S.
  const S = coarse.waterLevel - 1;
  const waterTop = (S + 1) * K - 1;

  /** Coarse column top surface (in fine voxels above 0), clamped at the edges. */
  const top = (cx: number, cz: number) => (coarse.heights[clamp(cx, 0, CW - 1) + clamp(cz, 0, CD - 1) * CW] + 1) * K;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  /** Smooth ground surface at a fine column (fractional; the top voxel is floor(this) - 1). */
  const surface = (x: number, z: number): number => {
    // Coarse column centres sit at (c + 0.5) * K.
    const u = (x + 0.5) / K - 0.5, v = (z + 0.5) / K - 0.5;
    const cx = Math.floor(u), cz = Math.floor(v);
    const tx = u - cx, tz = v - cz;
    const row = (dz: number) => cr(top(cx - 1, cz + dz), top(cx, cz + dz), top(cx + 1, cz + dz), top(cx + 2, cz + dz), tx);
    let h = cr(row(-1), row(0), row(1), row(2), tz);
    // A flat coarse area (a levelled pad) stays flat: micro relief only
    // where the ground was already uneven.
    const flat = top(cx, cz) === top(cx + 1, cz) && top(cx, cz) === top(cx, cz + 1) && top(cx, cz) === top(cx + 1, cz + 1);
    if (!flat) h += (noise.value2(x / (0.6 * K), z / (0.6 * K)) - 0.5) * 2.2;
    return h;
  };
  const groundAt = (x: number, z: number) => Math.floor(surface(x, z)) - 1;

  /** Coarse column a fine column takes its surface role from, jittered for organic edges. */
  const jf = 1 / (1.2 * K);
  const coarseOf = (x: number, z: number): [number, number] => [
    clamp(Math.floor((x + (noise.value2(x * jf, z * jf, 1) - 0.5) * 0.9 * K) / K), 0, CW - 1),
    clamp(Math.floor((z + (noise.value2(x * jf, z * jf, 2) - 0.5) * 0.9 * K) / K), 0, CD - 1),
  ];
  const clumps = (x: number, z: number) => noise.value2(x / (0.9 * K), z / (0.9 * K), 3);

  const waterAt = (x: number, z: number) => coarse.waterAt(clamp(Math.floor(x / K), 0, CW - 1), clamp(Math.floor(z / K), 0, CD - 1));

  const spanOf = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
    let lo = Infinity, hi = -Infinity;
    for (let cz = Math.floor(z0 / K) - 1; cz <= Math.floor(z1 / K) + 1; cz++)
      for (let cx = Math.floor(x0 / K) - 1; cx <= Math.floor(x1 / K) + 1; cx++) {
        const t = top(cx, cz);
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    // Cubic overshoot, micro relief, skin below, blades and water above.
    return [Math.max(0, lo - K - skin - 4), Math.max(hi + K + bladeMax + 4, waterTop + 1)];
  };

  const soilDepth = Math.round(0.4 * K);
  // Per 8x8 block of fine columns, everything fillBrick needs, computed once
  // for the whole stack of bricks above it (edits visit a column's bricks in
  // a run when given a box per column, as a chunked world does).
  interface Columns {
    key: number;
    override: unknown;
    live: Uint8Array; g: Int32Array; floor: Int32Array; yTop: Int32Array; blade: Int32Array; water: Int32Array;
    t: Uint8Array; over: Int32Array; pebble: Uint8Array; pebbleRock: Uint8Array;
  }
  const make = (): Columns => ({
    key: -1, override: null, live: new Uint8Array(64), g: new Int32Array(64), floor: new Int32Array(64), yTop: new Int32Array(64), blade: new Int32Array(64),
    water: new Int32Array(64), t: new Uint8Array(64), over: new Int32Array(64), pebble: new Uint8Array(64), pebbleRock: new Uint8Array(64),
  });
  const cache = [make(), make(), make(), make()];
  let nextSlot = 0;
  const ring = new Float64Array(100);
  const columns = (ox: number, oz: number, override?: (cx: number, cz: number) => number): Columns => {
    const key = (ox >> 3) + (oz >> 3) * 1e6;
    for (const c of cache) if (c.key === key && c.override === (override ?? null)) return c;
    const c = cache[nextSlot];
    nextSlot = (nextSlot + 1) % cache.length;
    c.key = key;
    c.override = override ?? null;
    // Ground over a 10x10 ring (a column and its neighbours).
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) ring[i + j * 10] = groundAt(clamp(ox + i - 1, 0, W - 1), clamp(oz + j - 1, 0, D - 1));
    for (let q = 0; q < 64; q++) {
      const lx = q & 7, lz = q >> 3, x = ox + lx, z = oz + lz;
      if (x >= W || z >= D) { c.live[q] = 0; continue; }
      c.live[q] = 1;
      const r = lx + 1 + (lz + 1) * 10;
      const g = ring[r];
      c.g[q] = g;
      c.floor[q] = Math.min(g, ring[r - 1], ring[r + 1], ring[r - 10], ring[r + 10]) - skin;
      const [cx, cz] = coarseOf(x, z);
      const wet = coarse.waterAt(Math.floor(x / K), Math.floor(z / K));
      c.water[q] = wet ? waterTop : -1;
      const over = override ? override(cx, cz) : 0;
      const t = coarse.topRole(cx, cz);
      c.t[q] = t;
      c.over[q] = over;
      let blade = 0;
      if (!wet && !over && (t === ROLE.GRASS || t === ROLE.GRASS_LIGHT || t === ROLE.GRASS_DRY)) {
        const cl = clumps(x, z);
        const p = grass * clamp((cl - 0.25) * 2.2, 0, 1.6);
        if (h2(x, z, 11) < p) blade = 2 + Math.floor(h2(x, z, 12) * (bladeMax - 2) * (0.4 + 0.6 * cl));
      }
      c.blade[q] = blade;
      const pebble = (t === ROLE.GRAVEL || t === ROLE.SAND || t === ROLE.MUD || over !== 0) && h2(x, z, 21) < 0.06;
      c.pebble[q] = pebble ? 1 : 0;
      c.pebbleRock[q] = h2(x, z, 22) < 0.5 ? 1 : 0;
      c.yTop[q] = Math.max(g + Math.max(blade, c.pebble[q]), c.water[q]);
    }
    return c;
  };

  return {
    coarse,
    k: K,
    width: W,
    depth: D,
    waterTop,
    heightAt: (x, z) => groundAt(clamp(Math.round(x), 0, W - 1), clamp(Math.round(z), 0, D - 1)),
    waterAt,
    maxY: () => (coarse.maxY() + 2) * K + bladeMax,
    spanOf,
    columnSpan(ox, oz) {
      return spanOf(ox, oz, ox + 7, oz + 7);
    },
    fillBrick(cells, ox, oy, oz, base, override) {
      const c = columns(ox, oz, override);
      const b = base - 1;
      let touched = false;
      for (let q = 0; q < 64; q++) {
        if (!c.live[q]) continue;
        const floor = c.floor[q], yTop = c.yTop[q];
        if (oy > yTop || oy + 7 < floor) continue;
        const g = c.g[q], blade = c.blade[q], water = c.water[q], t = c.t[q], over = c.over[q], pebble = c.pebble[q];
        const lx = q & 7, lz = q >> 3;
        const y0 = Math.max(oy, floor), y1 = Math.min(oy + 7, yTop);
        for (let y = y0; y <= y1; y++) {
          let v: number;
          if (y > g + pebble) {
            if (y <= g + blade) v = (y > g + blade * 0.6 ? (t === ROLE.GRASS_DRY ? ROLE.GRASS_DRY : ROLE.GRASS_LIGHT) : t === ROLE.GRASS_DRY ? ROLE.GRASS_DRY : ROLE.GRASS) + b;
            else if (y <= water) v = ROLE.WATER + b;
            else continue;
          } else {
            const d = g - y;
            if (over && d < 2) v = over;
            else if (pebble && d < 0) v = (c.pebbleRock[q] ? ROLE.ROCK : ROLE.GRAVEL) + b;
            else if (d < 2) v = t + b;
            else if (d < soilDepth) v = (t === ROLE.SAND ? ROLE.SAND : t === ROLE.GRAVEL || t === ROLE.MUD ? ROLE.GRAVEL : t === ROLE.ROCK || t === ROLE.ROCK_DARK ? t : ROLE.SOIL) + b;
            else v = (t === ROLE.ROCK_DARK ? ROLE.ROCK_DARK : ROLE.ROCK) + b;
          }
          cells[lx + (y - oy) * 8 + lz * 64] = v;
          touched = true;
        }
      }
      return touched;
    },
    pick(origin, dir, o = {}) {
      const hit = coarse.pick([origin[0] / K, origin[1] / K, origin[2] / K], dir, { water: o.water, maxT: o.maxT !== undefined ? o.maxT / K : undefined });
      if (!hit) return null;
      const x = hit[0] * K, z = hit[2] * K;
      const g = groundAt(clamp(Math.round(x), 0, W - 1), clamp(Math.round(z), 0, D - 1)) + 1;
      return [x, o.water && waterAt(x, z) ? waterTop + 1 : g, z];
    },
  };
}
