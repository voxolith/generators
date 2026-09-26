/**
 * @voxolith/gen-terrain: procedural voxel terrain.
 *
 * Rolling hills from layered noise, a river that meanders along a noise
 * contour and carves its own valley, lakes wherever the ground dips below the
 * water level, and a surface chosen per column: grass (drier up high), rock on
 * steep slopes, sand on the banks, gravel and mud on the beds. Water fills
 * every column below the water level with a "water" material the renderer
 * animates.
 *
 * Unlike the entity generators this describes a region, not a model, so it
 * hands back a heightfield rather than an EntityModel: `heights` is sampled
 * once (it is also yours to edit — a settlement levels pads into it) and
 * `fillBrick` writes any 8³ brick on demand, which is what a chunked world
 * wants. Everything is a pure function of (params, seed, position).
 *
 * @packageDocumentation
 */

import { makeNoise } from "@voxolith/gen-kit";
import type { Role } from "@voxolith/engine";
import { buildRoles, ROLE, SUMMER, type ColorSet } from "./roles";

/** The river: a channel along a slow noise contour, carving its own valley. Lengths in voxels. */
export interface RiverParams {
  /** Carve a river at all. */
  enabled: boolean;
  /** Channel width in voxels. */
  width: number;
  /** Depth below the water level at the centre of the channel. */
  depth: number;
  /** Width of the sloping banks either side. */
  banks: number;
  /** Distance over which the river swings from one side to the other. */
  meander: number;
  /**
   * How much the width varies along the river, 0 (constant) .. 1 (from a
   * trickle to about twice as wide). Wide stretches are deeper too.
   */
  widthVariation?: number;
  /** Distance over which the width changes, in voxels. */
  widthScale?: number;
}

/**
 * Everything a terrain is made from. Lengths and heights are in voxels (10 per metre); every
 * field has a default in {@link DEFAULT_TERRAIN}.
 */
export interface TerrainParams {
  /** Extent along x, in columns. */
  width: number;
  /** Extent along z, in columns. */
  depth: number;
  /** Grid height; the ground stays well below it so trees fit. */
  height: number;
  /** Mean ground level. */
  baseY: number;
  /** Hill amplitude: ground ranges about baseY ± relief. */
  relief: number;
  /** Typical hill size in voxels. */
  featureSize: number;
  /** Small bumps, in voxels. */
  detail: number;
  /** Absolute Y of the water surface; columns below it are flooded. */
  waterLevel: number;
  /** The river; merged field by field over the default. */
  river: RiverParams;
  /** Height step to a neighbour at which ground turns to rock. */
  rockSlope: number;
  /** Voxels above the water that are sand, near water. */
  sandBand: number;
  /** Ground this far above baseY turns to dry grass. */
  dryAbove: number;
  /** Role colours; default {@link SUMMER}. */
  colors?: ColorSet;
}

/** The default region: 320 by 320 columns (32 m) of low hills around a meandering river. */
export const DEFAULT_TERRAIN: TerrainParams = {
  width: 320,
  depth: 320,
  height: 176,
  baseY: 18,
  relief: 11,
  featureSize: 110,
  detail: 1.5,
  waterLevel: 13,
  river: { enabled: true, width: 16, depth: 5, banks: 18, meander: 380, widthVariation: 0.6, widthScale: 120 },
  rockSlope: 3,
  sandBand: 2,
  dryAbove: 5,
};

type Vec3 = [number, number, number];

/**
 * A generated region, from {@link generateTerrain}. Everything reads the editable `heights` map,
 * so levelling a pad into it changes the surface, the roles, `fillBrick` and `pick` together.
 * Coordinates are voxels; columns outside the map clamp to its edge.
 */
export interface Terrain {
  /** The params it was made from, defaults filled in. */
  readonly params: TerrainParams;
  readonly width: number;
  readonly depth: number;
  /** Water surface Y, rounded; columns whose ground is below it are flooded. */
  readonly waterLevel: number;
  /** Ground height per column, x + z * width. Editable (levelling), then read by everything below. */
  readonly heights: Int16Array;
  /** Colour roles; role 10 (WATER) carries the "water" material hint. */
  readonly roles: Role[];
  /** Ground height (top solid voxel) of the nearest column. */
  heightAt(x: number, z: number): number;
  /** Is this column under water? */
  waterAt(x: number, z: number): boolean;
  /** Water depth above the ground in this column (0 on land). */
  waterDepth(x: number, z: number): number;
  /** Role of the top voxel of a column. */
  topRole(x: number, z: number): number;
  /** Role at a voxel, or 0 for air. */
  roleAt(x: number, y: number, z: number): number;
  /** Highest Y anything is written at (ground or water). */
  maxY(): number;
  /**
   * Write one 8³ brick at (ox, oy, oz) into `cells` (x + y*8 + z*64), mapping
   * role r to `base + r - 1`. `top` may override the top voxel of a column
   * with an absolute palette slot (a path, a yard); return 0 to keep it.
   * Returns whether anything was written.
   */
  fillBrick(cells: Uint8Array, ox: number, oy: number, oz: number, base: number, top?: (x: number, z: number) => number): boolean;
  /**
   * First point where a ray meets the ground (or, with `water`, the water
   * surface). `dir` need not be normalised. Null if it never does.
   */
  pick(origin: Vec3, dir: Vec3, opts?: { water?: boolean; maxT?: number }): Vec3 | null;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The height function on its own: pure in (x, z), for a world that streams
 * columns without ever sampling the whole map. Gives exactly the values
 * {@link generateTerrain} samples into `heights`, before any editing.
 *
 * @param params - Complete params (fill defaults from {@link DEFAULT_TERRAIN}).
 * @param seed - The same seed as the terrain it should match.
 * @returns Ground height (top solid voxel) of a column, rounded.
 */
export function terrainHeight(params: TerrainParams, seed: number): (x: number, z: number) => number {
  const p = params;
  const noise = makeNoise(seed || 1);
  const f = 1 / Math.max(8, p.featureSize);
  const fr = 1 / Math.max(16, p.river.meander);
  const riverNoise = (x: number, z: number) => noise.fbm2(x * fr + 101.3, z * fr + 57.7, 3);
  const halfW = p.river.width / 2;
  const vary = Math.max(0, Math.min(1, p.river.widthVariation ?? 0));
  const fw = 1 / Math.max(16, p.river.widthScale ?? 120);
  /** Width factor at a point: a slow field, so pools and narrows alternate along the river. */
  const widthAt = (x: number, z: number) => {
    if (vary <= 0) return 1;
    // fbm mostly stays within 0.5 ± 0.15; stretch that to -1..1 so the full
    // range is used: pools up to ~2.2× the base width, narrows ~0.6×.
    const t = Math.max(-1, Math.min(1, (noise.fbm2(x * fw - 43.1, z * fw + 88.9, 2) - 0.5) / 0.15));
    return 1 + vary * t * (t > 0 ? 2 : 0.65);
  };
  return (x: number, z: number) => {
    let h = p.baseY + (noise.fbm2(x * f, z * f, 4) - 0.5) * 2.4 * p.relief;
    h += (noise.fbm2(x * f * 7 + 31, z * f * 7 - 17, 2) - 0.5) * 2 * p.detail;
    if (p.river.enabled) {
      // The river follows the 0.5 contour of a slow noise field. Distance to
      // it is the contour offset over the local gradient, which is what keeps
      // the channel a steady width however steep the field is.
      const r = riverNoise(x, z);
      const gx = (riverNoise(x + 1, z) - riverNoise(x - 1, z)) / 2;
      const gz = (riverNoise(x, z + 1) - riverNoise(x, z - 1)) / 2;
      const d = Math.abs(r - 0.5) / Math.max(1e-5, Math.hypot(gx, gz));
      // Width, depth and banks all follow the local width factor: a pool is
      // wide, deep and gently shelving; a narrows is shallow with steep sides.
      const wk = widthAt(x, z);
      const hw = halfW * wk;
      const banks = p.river.banks * (0.6 + 0.4 * wk);
      const depth = p.river.depth * (0.55 + 0.45 * Math.min(wk, 1.8));
      if (d < hw) {
        const k = d / hw;
        h = Math.min(h, p.waterLevel - depth * (1 - k * k) - 0.5);
      } else if (d < hw + banks) {
        const s = smooth((d - hw) / banks);
        h = Math.min(h, p.waterLevel + 0.6 + (h - p.waterLevel - 0.6) * s);
      }
    }
    return clamp(Math.round(h), 2, p.height - 48);
  };
}

/**
 * Generate a region of ground and water: layered-noise hills, a meandering river carving its
 * valley, lakes wherever the ground dips below the water level, and a surface role per column by
 * slope, height and nearness to water (grass, dry grass, rock, sand, gravel, mud). The height
 * map is sampled once into `heights`; everything else is answered on demand, so a chunked world
 * fills bricks as it streams them. Pure in (params, seed, position).
 *
 * @param params - Overrides of {@link DEFAULT_TERRAIN}; `river` merges field by field.
 * @param seed - Seeds the height and tone noise; the same seed gives the same region.
 * @returns The region: heights, roles, per-column queries, `fillBrick` and `pick`.
 * @example
 * ```ts
 * import { generateTerrain } from "@voxolith/gen-terrain";
 *
 * const terrain = generateTerrain({ width: 256, depth: 256, relief: 14 }, 42);
 * const { base } = palette.allocate(terrain.roles, "terrain"); // the world's PaletteAllocator
 * const cells = new Uint8Array(512);
 * if (terrain.fillBrick(cells, 0, 8, 0, base)) {
 *   // write `cells` as the 8^3 brick at (0, 8, 0)
 * }
 * const hit = terrain.pick(eye, dir, { water: true });
 * ```
 */
export function generateTerrain(params: Partial<TerrainParams> = {}, seed = 1): Terrain {
  const p: TerrainParams = { ...DEFAULT_TERRAIN, ...params, river: { ...DEFAULT_TERRAIN.river, ...params.river } };
  const W = Math.max(8, Math.round(p.width));
  const D = Math.max(8, Math.round(p.depth));
  const heightFn = terrainHeight(p, seed);
  const heights = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) heights[x + z * W] = heightFn(x, z);
  const tone = makeNoise((seed ^ 0x5bd1e995) || 2);
  const wl = Math.round(p.waterLevel);
  /** Y of the top water voxel; a column is flooded when its ground is below it. */
  const S = wl - 1;

  const hAt = (x: number, z: number) => heights[clamp(Math.round(x), 0, W - 1) + clamp(Math.round(z), 0, D - 1) * W];
  const waterNear = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz += r) for (let dx = -r; dx <= r; dx += r) if (hAt(x + dx, z + dz) < S) return true;
    return false;
  };

  const topRole = (x: number, z: number): number => {
    const h = hAt(x, z);
    if (h < S) {
      if (S - h <= 1) return ROLE.SAND;
      return tone.value2(x * 0.21, z * 0.21) > 0.62 ? ROLE.MUD : ROLE.GRAVEL;
    }
    const slope = Math.max(
      Math.abs(h - hAt(x + 1, z)), Math.abs(h - hAt(x - 1, z)),
      Math.abs(h - hAt(x, z + 1)), Math.abs(h - hAt(x, z - 1)),
    );
    if (slope >= p.rockSlope) return slope >= p.rockSlope + 2 ? ROLE.ROCK_DARK : ROLE.ROCK;
    if (h <= wl + p.sandBand && waterNear(x, z, 3)) return ROLE.SAND;
    if (h >= p.baseY + p.dryAbove && tone.value2(x * 0.08 + 9, z * 0.08) > 0.35) return ROLE.GRASS_DRY;
    return tone.value2(x * 0.3, z * 0.3) > 0.5 ? ROLE.GRASS : ROLE.GRASS_LIGHT;
  };

  const below = (top: number, depth: number): number => {
    if (depth >= 3) return depth >= 7 && tone.value2(depth * 0.7, top) > 0.6 ? ROLE.ROCK_DARK : ROLE.ROCK;
    if (top === ROLE.SAND) return ROLE.SAND;
    if (top === ROLE.GRAVEL || top === ROLE.MUD) return ROLE.GRAVEL;
    if (top === ROLE.ROCK || top === ROLE.ROCK_DARK) return ROLE.ROCK;
    return ROLE.SOIL;
  };

  const roleAt = (x: number, y: number, z: number): number => {
    if (x < 0 || z < 0 || x >= W || z >= D || y < 0) return 0;
    const h = heights[x + z * W];
    if (y > h) return y <= S ? ROLE.WATER : 0;
    const top = topRole(x, z);
    return y === h ? top : below(top, h - y);
  };

  let maxH = wl;
  for (let i = 0; i < heights.length; i++) if (heights[i] > maxH) maxH = heights[i];

  return {
    params: p,
    width: W,
    depth: D,
    waterLevel: wl,
    heights,
    roles: buildRoles(p.colors ?? SUMMER),
    heightAt: hAt,
    waterAt: (x, z) => hAt(x, z) < S,
    waterDepth: (x, z) => Math.max(0, S - hAt(x, z)),
    topRole,
    roleAt,
    maxY() {
      maxH = wl;
      for (let i = 0; i < heights.length; i++) if (heights[i] > maxH) maxH = heights[i];
      return maxH;
    },
    fillBrick(cells, ox, oy, oz, base, top) {
      let touched = false;
      const b = base - 1;
      for (let lz = 0; lz < 8; lz++) {
        const z = oz + lz;
        if (z >= D) break;
        for (let lx = 0; lx < 8; lx++) {
          const x = ox + lx;
          if (x >= W) break;
          const h = heights[x + z * W];
          const surface = Math.max(h, S);
          if (oy > surface) continue;
          const t = topRole(x, z);
          const over = top ? top(x, z) : 0;
          const yEnd = Math.min(surface, oy + 7);
          for (let y = oy; y <= yEnd; y++) {
            let v: number;
            if (y > h) v = ROLE.WATER + b;
            else if (y === h) v = over || t + b;
            else v = below(t, h - y) + b;
            cells[lx + (y - oy) * 8 + lz * 64] = v;
            touched = true;
          }
        }
      }
      return touched;
    },
    pick(origin, dir, opts = {}) {
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
      const at = (t: number): Vec3 => [origin[0] + d[0] * t, origin[1] + d[1] * t, origin[2] + d[2] * t];
      const surf = (q: Vec3) => {
        const h = hAt(q[0], q[2]);
        return opts.water ? Math.max(h, S) : h;
      };
      const inside = (q: Vec3) => q[0] >= 0 && q[2] >= 0 && q[0] < W && q[2] < D;
      const under = (q: Vec3) => inside(q) && q[1] <= surf(q) + 0.5;
      const maxT = opts.maxT ?? (W + D) * 3;
      let prev = 0;
      for (let t = 0.5; t < maxT; t += 1.5) {
        if (under(at(t))) {
          let lo = prev, hi = t;
          for (let i = 0; i < 10; i++) {
            const mid = (lo + hi) / 2;
            if (under(at(mid))) hi = mid;
            else lo = mid;
          }
          return at(hi);
        }
        prev = t;
      }
      return null;
    },
  };
}

export { buildRoles, ROLE, ROLE_COUNT, SUMMER } from "./roles";
export type { ColorSet } from "./roles";
export { refineTerrain } from "./fine";
export type { FineTerrain, FineTerrainOptions } from "./fine";
