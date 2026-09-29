// How far a finer-scale model reaches beyond its native (10 voxels per metre)
// model, in native voxels.
//
// A renderer drawing a level-of-detail chain covers every finer level with the
// native level's occupancy grown by a little. That only works if no fine voxel
// lies further from the native model than the growth: each occupied fine voxel,
// divided by the factor k, must land within one native voxel (Chebyshev
// distance, so the 26 neighbours count) of an occupied native voxel.

import type { EntityModel } from "@voxolith/engine";

/** Distances at or beyond this are reported as this. */
export const REACH_CAP = 16;

/** How far one fine model reaches beyond its native model. */
export interface Reach {
  /** Largest Chebyshev distance, in native voxels, from a fine voxel's native cell to the native model (capped at {@link REACH_CAP}). */
  max: number;
  /** Fine voxels further than one native voxel from the native model. */
  beyond: number;
  /** Of those, how many have a loose role. */
  beyondLoose: number;
  /** Fine voxels checked. */
  voxels: number;
  /** Where the furthest one is, in fine voxels, and its role. */
  worst?: { x: number; y: number; z: number; role: number };
  /** Count of beyond-1 voxels per role. */
  byRole: Map<number, number>;
}

/**
 * Chebyshev distance transform of a dense model's occupancy, capped: each cell holds its distance
 * to the nearest solid cell (0 inside), or {@link REACH_CAP} when it is at least that far.
 */
export function chebyshevDistance(m: EntityModel): Uint8Array {
  const { x: sx, y: sy, z: sz } = m.size;
  const n = sx * sy * sz, sxy = sx * sy;
  const dist = new Uint8Array(n).fill(REACH_CAP);
  const cur = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (m.data[i]) { cur[i] = 1; dist[i] = 0; }
  const tmp = new Uint8Array(n);
  // Grow by one cell in every direction (a separable 3x3x3 max), REACH_CAP - 1 times.
  for (let d = 1; d < REACH_CAP; d++) {
    for (let i = 0; i < n; i++) {
      const x = i % sx;
      tmp[i] = cur[i] | (x > 0 ? cur[i - 1] : 0) | (x < sx - 1 ? cur[i + 1] : 0);
    }
    for (let i = 0; i < n; i++) {
      const y = ((i / sx) | 0) % sy;
      cur[i] = tmp[i] | (y > 0 ? tmp[i - sx] : 0) | (y < sy - 1 ? tmp[i + sx] : 0);
    }
    let any = false;
    for (let i = 0; i < n; i++) {
      const z = (i / sxy) | 0;
      const v = cur[i] | (z > 0 ? cur[i - sxy] : 0) | (z < sz - 1 ? cur[i + sxy] : 0);
      tmp[i] = v;
      if (v && dist[i] === REACH_CAP) { dist[i] = d; any = true; }
    }
    cur.set(tmp);
    if (!any) break;
  }
  return dist;
}

/**
 * Measure how far the sparse model `fine`, built `k` times finer, reaches beyond the dense
 * `native` model of the same design. `loose` are role values counted separately; `dist` is
 * {@link chebyshevDistance} of `native`, when already computed.
 */
export function measureReach(native: EntityModel, fine: EntityModel, k: number, loose: ReadonlySet<number> = new Set(), dist = chebyshevDistance(native)): Reach {
  const { x: sx, y: sy, z: sz } = native.size;
  const sp = fine.sparse!;
  const dx = Math.ceil(fine.size.x / 8), dy = Math.ceil(fine.size.y / 8);
  const r: Reach = { max: 0, beyond: 0, beyondLoose: 0, voxels: 0, byRole: new Map() };
  for (const [key, b] of sp.bricks) {
    const bx = key % dx, by = Math.floor(key / dx) % dy, bz = Math.floor(key / (dx * dy));
    for (let i = 0; i < 512; i++) {
      const v = b[i];
      if (!v) continue;
      r.voxels++;
      const x = bx * 8 + (i & 7), y = by * 8 + ((i >> 3) & 7), z = bz * 8 + (i >> 6);
      const cx = Math.floor(x / k), cy = Math.floor(y / k), cz = Math.floor(z / k);
      const d = cx < sx && cy < sy && cz < sz ? dist[cx + cy * sx + cz * sx * sy] : REACH_CAP;
      if (d > r.max) { r.max = d; r.worst = { x, y, z, role: v }; }
      if (d > 1) {
        r.beyond++;
        if (loose.has(v)) r.beyondLoose++;
        r.byRole.set(v, (r.byRole.get(v) ?? 0) + 1);
      }
    }
  }
  return r;
}
