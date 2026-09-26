// Helpers for generators that redraw part of themselves at a finer scale
// (see refine.ts): skeleton limbs as exact capsule shells, and the coarse
// model's roles looked up from fine positions.

import type { EntityModel, Vec3 } from "@voxolith/engine";
import type { Noise } from "./noise";
import { shellCapsule, type SparseWriter } from "./refine";

/** A limb as the branch grower makes it (Skeleton.segments), in volume space. */
export interface FineSegment {
  a: readonly number[];
  b: readonly number[];
  ra: number;
  rb: number;
  level: number;
}

/** How {@link drawSkeletonFine} maps, sizes and colours the segments it redraws. */
export interface FineSkeletonOptions {
  /** Refinement factor: fine voxels per coarse voxel along each axis. */
  k: number;
  /** Volume-space point to fine model space (crop offset removed, times k). */
  toFine: (p: readonly number[]) => Vec3;
  /** Fine voxels of shell to keep under the bark (default min(4, 0.4k)). */
  shell?: number;
  /** Role of a fine voxel. */
  value: (x: number, y: number, z: number) => number;
  /**
   * Radius factor per branch level. A coarse grower draws every limb at least
   * a voxel thick, far thicker than real twigs at a fine scale; default 1,
   * 0.75, 0.5 for levels 0, 1, 2+.
   */
  thin?: (level: number) => number;
  /** Per-point radius factor for the trunk (level 0), e.g. a root flare, and its maximum. */
  flare?: (x: number, y: number, z: number) => number;
  /** Largest value `flare` returns, so the scan box is big enough. Default 1. */
  maxFlare?: number;
}

/**
 * Redraw a coarse skeleton's wood at `k` times the size: every segment becomes a capsule shell
 * (only `shell` voxels thick, since the inside of a limb never shows), thinned per branch level
 * and optionally flared at the trunk base. This is how tree, bush and grass get round, real-size
 * limbs at a finer scale instead of the coarse model's blocks scaled up.
 *
 * @param w - The fine model being written.
 * @param segments - The coarse skeleton's segments, in volume space.
 * @returns The number of voxels written.
 */
export function drawSkeletonFine(w: SparseWriter, segments: readonly FineSegment[], opts: FineSkeletonOptions): number {
  const k = opts.k;
  const shell = opts.shell ?? Math.min(4, Math.ceil(k * 0.4));
  const thin = opts.thin ?? ((l: number) => (l === 0 ? 1 : l === 1 ? 0.75 : 0.5));
  let n = 0;
  for (const s of segments) {
    const f = thin(s.level);
    const ra = Math.max(1, s.ra * k * f), rb = Math.max(1, s.rb * k * f);
    const trunk = s.level === 0 && opts.flare;
    n += shellCapsule(w, opts.toFine(s.a), opts.toFine(s.b), ra, rb, shell, opts.value, trunk ? opts.flare : undefined, trunk ? opts.maxFlare ?? 1 : 1);
  }
  return n;
}

/**
 * The coarse role at a fine point, looked up a little off the point by noise
 * so the coarse model's tone patches come out organic rather than as k-voxel
 * cubes. Only roles in `accept` count; the nearest accepted neighbour is used
 * when the voxel itself is not one, else `fallback`.
 */
export function coarseRoleAt(coarse: EntityModel, k: number, noise: Noise, accept: ReadonlySet<number>, fallback: number): (x: number, y: number, z: number) => number {
  const { x: sx, y: sy, z: sz } = coarse.size;
  const d = coarse.data;
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : d[x + y * sx + z * sx * sy]);
  const j = 0.7 * k, f = 1 / (1.5 * k);
  return (x: number, y: number, z: number): number => {
    const cx = Math.floor((x + (noise.value3(x * f, y * f, z * f, 1) - 0.5) * j) / k);
    const cy = Math.floor((y + (noise.value3(x * f, y * f, z * f, 2) - 0.5) * j) / k);
    const cz = Math.floor((z + (noise.value3(x * f, y * f, z * f, 3) - 0.5) * j) / k);
    const v = at(cx, cy, cz);
    if (accept.has(v)) return v;
    for (let q = 0; q < 27; q++) {
      const n = at(cx + (q % 3) - 1, cy + (Math.floor(q / 3) % 3) - 1, cz + Math.floor(q / 9) - 1);
      if (accept.has(n)) return n;
    }
    return fallback;
  };
}
