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
  /**
   * Fine voxels of shell to keep under the bark (default min(4, 0.4k), and at least 2: a
   * one-voxel shell of a round limb leaves diagonal gaps a ray can pass through).
   */
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
 * A limb thinner than one fine voxel in radius is widened to one, three voxels across. At a
 * small factor (k < 3, e.g. 20 voxels per metre) that is wider than the coarse voxel it came
 * from, so there such a limb is drawn as a face-connected line one voxel thick instead.
 *
 * @param w - The fine model being written.
 * @param segments - The coarse skeleton's segments, in volume space.
 * @returns The number of voxels written.
 */
export function drawSkeletonFine(w: SparseWriter, segments: readonly FineSegment[], opts: FineSkeletonOptions): number {
  const k = opts.k;
  const shell = opts.shell ?? Math.max(2, Math.min(4, Math.ceil(k * 0.4)));
  const thin = opts.thin ?? ((l: number) => (l === 0 ? 1 : l === 1 ? 0.75 : 0.5));
  let n = 0;
  for (const s of segments) {
    const f = thin(s.level);
    const ra0 = s.ra * k * f, rb0 = s.rb * k * f;
    if (k < 3 && ra0 < 1 && rb0 < 1) {
      n += lineFine(w, opts.toFine(s.a), opts.toFine(s.b), opts.value);
      continue;
    }
    const ra = Math.max(1, ra0), rb = Math.max(1, rb0);
    const trunk = s.level === 0 && opts.flare;
    n += shellCapsule(w, opts.toFine(s.a), opts.toFine(s.b), ra, rb, shell, opts.value, trunk ? opts.flare : undefined, trunk ? opts.maxFlare ?? 1 : 1);
  }
  return n;
}

/**
 * A one-voxel line from `a` to `b` into a sparse writer, stepping through every cell the segment
 * crosses (a face at a time, as gen-kit `line3` does), so it stays 6-connected. `value` picks each
 * voxel's role; returns the voxels written.
 */
function lineFine(w: SparseWriter, a: readonly number[], b: readonly number[], value: (x: number, y: number, z: number) => number): number {
  let x = Math.floor(a[0]), y = Math.floor(a[1]), z = Math.floor(a[2]);
  const ex = Math.floor(b[0]), ey = Math.floor(b[1]), ez = Math.floor(b[2]);
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
  let tmx = sx ? (sx > 0 ? x + 1 - a[0] : a[0] - x) * tdx : Infinity;
  let tmy = sy ? (sy > 0 ? y + 1 - a[1] : a[1] - y) * tdy : Infinity;
  let tmz = sz ? (sz > 0 ? z + 1 - a[2] : a[2] - z) * tdz : Infinity;
  let n = 0;
  const put = () => {
    const v = value(x, y, z);
    if (v) { w.set(x, y, z, v); n++; }
  };
  put();
  const cap = Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z) + 3;
  for (let guard = 0; (x !== ex || y !== ey || z !== ez) && guard < cap; guard++) {
    if (tmx <= tmy && tmx <= tmz) { x += sx; tmx += tdx; }
    else if (tmy <= tmz) { y += sy; tmy += tdy; }
    else { z += sz; tmz += tdz; }
    put();
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
