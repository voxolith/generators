// Canopy shaping and leaf colouring, shared by both foliage strategies.
//
// Placement alone does not give a good crown: clusters hung on every twig merge
// into one green mass. Three passes fix that, in order of how much they matter.
// Shell hollowing throws away leaves buried deep inside the crown, which halves
// the voxel count and lets you see branches through the canopy. The macro carve
// removes whole pockets, which is what puts sky holes in the silhouette. Then
// colour is scored from how far out, how high and how exposed a leaf is, with
// accents chosen per cluster — per-voxel randomisation looks like television
// static, not leaves.

import { clamp, mix, type Noise, type Volume } from "@voxolith/engine/build";
import { LEAF_ROLES, ROLE } from "./roles";
import type { FoliageParams, LookParams } from "./params";

const THETA_BINS = 36;
const Y_BINS = 28;

const isLeafMask = (() => {
  const m = new Uint8Array(32);
  for (const r of LEAF_ROLES) m[r] = 1;
  return m;
})();
export const isLeaf = (v: number): boolean => v < 32 && isLeafMask[v] === 1;

export interface Hull {
  /** Max radius per (theta, y) bin, in voxels from the trunk axis. */
  radius: Float32Array;
  y0: number;
  y1: number;
  cx: number;
  cz: number;
}

/** Outer envelope of the placed foliage, sampled in cylindrical bins. */
export function buildHull(vol: Volume, cx: number, cz: number): Hull | null {
  const radius = new Float32Array(THETA_BINS * Y_BINS);
  let y0 = Infinity, y1 = -Infinity;
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  for (let i = 0; i < vol.data.length; i++) {
    if (!isLeaf(vol.data[i])) continue;
    const y = ((i / sx) | 0) % sy;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (y1 < y0) return null;
  const span = Math.max(1, y1 - y0);
  for (let i = 0; i < vol.data.length; i++) {
    if (!isLeaf(vol.data[i])) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    const r = Math.hypot(dx, dz);
    const tb = thetaBin(dx, dz);
    const yb = Math.min(Y_BINS - 1, Math.floor(((y - y0) / span) * Y_BINS));
    const k = tb + yb * THETA_BINS;
    if (r > radius[k]) radius[k] = r;
  }
  return { radius, y0, y1, cx, cz };
}

const thetaBin = (dx: number, dz: number): number => {
  const a = Math.atan2(dz, dx);
  const t = (a + Math.PI) / (Math.PI * 2);
  return Math.min(THETA_BINS - 1, Math.floor(t * THETA_BINS));
};

export function hullRadius(hull: Hull, x: number, y: number, z: number): number {
  const dx = x + 0.5 - hull.cx, dz = z + 0.5 - hull.cz;
  const span = Math.max(1, hull.y1 - hull.y0);
  const yb = Math.max(0, Math.min(Y_BINS - 1, Math.floor(((y - hull.y0) / span) * Y_BINS)));
  const tb = thetaBin(dx, dz);
  // Smooth across neighbouring angular bins so the shell has no facets.
  const a = hull.radius[((tb + THETA_BINS - 1) % THETA_BINS) + yb * THETA_BINS];
  const b = hull.radius[tb + yb * THETA_BINS];
  const c = hull.radius[((tb + 1) % THETA_BINS) + yb * THETA_BINS];
  return (a + b * 2 + c) / 4;
}

export interface CarveStats {
  shell: number;
  macro: number;
}

/**
 * Hollow the crown and punch sky holes. Returns how many leaves each pass
 * removed — if the shell number dwarfs the rest, the canopy was a solid blob.
 */
export function carveCanopy(
  vol: Volume,
  hull: Hull | null,
  foliage: FoliageParams,
  noise: Noise,
  vs: number,
): CarveStats {
  const stats: CarveStats = { shell: 0, macro: 0 };
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  const shellDepth = foliage.shellDepth * vs;
  const macroScale = foliage.macroScale / vs;

  for (let i = 0; i < vol.data.length; i++) {
    if (!isLeaf(vol.data[i])) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;

    if (hull && shellDepth > 0) {
      const dx = x + 0.5 - hull.cx, dz = z + 0.5 - hull.cz;
      const r = Math.hypot(dx, dz);
      if (hullRadius(hull, x, y, z) - r > shellDepth) {
        vol.data[i] = 0;
        stats.shell++;
        continue;
      }
    }
    if (foliage.macroThreshold > 0 && noise.fbm3(x * macroScale, y * macroScale, z * macroScale, 2) < foliage.macroThreshold) {
      vol.data[i] = 0;
      stats.macro++;
    }
  }
  return stats;
}

/** Occluders directly above each voxel, as a cheap stand-in for sky exposure. */
export function skyOcclusion(vol: Volume): Uint8Array {
  const out = new Uint8Array(vol.data.length);
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  for (let z = 0; z < vol.sz; z++)
    for (let x = 0; x < sx; x++) {
      let above = 0;
      for (let y = sy - 1; y >= 0; y--) {
        const i = x + y * sx + z * sxy;
        out[i] = above > 255 ? 255 : above;
        if (vol.data[i] !== 0) above++;
      }
    }
  return out;
}

export interface ShadeContext {
  hull: Hull | null;
  sky: Uint8Array;
  clusterId: Uint16Array;
  noise: Noise;
  look: LookParams;
  vs: number;
  /** Leaf roles for this season, from light to dark. */
  tones: [number, number, number];
  edge: number;
  accent: number;
}

/**
 * Assign a leaf role per voxel. Score combines outerness, height and sky
 * exposure, with a little noise to stop the quantisation banding.
 */
export function shadeLeaves(vol: Volume, ctx: ShadeContext): void {
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  const { hull, sky, clusterId, noise, look } = ctx;
  const nf = 0.08 / ctx.vs;
  const accentCut = look.accentFraction;
  const deadCut = (1 - look.health) * 0.3;

  let yLo = Infinity, yHi = -Infinity;
  for (let i = 0; i < vol.data.length; i++) {
    if (!isLeaf(vol.data[i])) continue;
    const y = ((i / sx) | 0) % sy;
    if (y < yLo) yLo = y;
    if (y > yHi) yHi = y;
  }
  const ySpan = Math.max(1, yHi - yLo);

  for (let i = 0; i < vol.data.length; i++) {
    if (!isLeaf(vol.data[i])) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;

    const cid = clusterId[i];
    const ch = hash01(cid * 2654435761);
    if (cid !== 0 && ch < accentCut) {
      vol.data[i] = ctx.accent;
      continue;
    }
    if (cid !== 0 && ch > 1 - deadCut) {
      vol.data[i] = ROLE.LEAF_DEAD;
      continue;
    }

    let outer = 0.6;
    if (hull) {
      const dx = x + 0.5 - hull.cx, dz = z + 0.5 - hull.cz;
      const r = Math.hypot(dx, dz);
      const hr = hullRadius(hull, x, y, z);
      outer = hr > 0.5 ? clamp(r / hr, 0, 1) : 0.6;
    }
    const yNorm = clamp((y - yLo) / ySpan, 0, 1);
    const exposure = 1 - clamp(sky[i] / 18, 0, 1);
    const n = noise.fbm3(x * nf, y * nf, z * nf, 2);
    const score = 0.45 * outer + 0.25 * yNorm + 0.2 * exposure + 0.1 * n;

    // Outermost rim reads as backlit, so it gets its own lighter tone.
    if (outer > 0.86 && isRim(vol, x, y, z)) {
      vol.data[i] = ctx.edge;
      continue;
    }
    vol.data[i] = score > 0.6 ? ctx.tones[0] : score > 0.42 ? ctx.tones[1] : ctx.tones[2];
  }
}

function isRim(vol: Volume, x: number, y: number, z: number): boolean {
  return (
    vol.get(x - 1, y, z) === 0 ||
    vol.get(x + 1, y, z) === 0 ||
    vol.get(x, y + 1, z) === 0 ||
    vol.get(x, y, z - 1) === 0 ||
    vol.get(x, y, z + 1) === 0
  );
}

export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export { mix };
