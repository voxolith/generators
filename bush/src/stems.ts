// Stems: where they leave the ground, how they are rasterised, and how their
// surface is coloured.
//
// A shrub's silhouette comes from its base. Several stems rise together and
// lean outward, so the mass is a vase rather than a cone, and a thicket adds
// more clumps offset around the centre instead of making one bigger bush.

import {
  capsule,
  line3,
  normalize,
  segmentFrames,
  type Noise,
  type Skeleton,
  type StemSeed,
  type Volume,
} from "@voxolith/gen-kit";
import type { Vec3 } from "@voxolith/engine";
import { isWood, ROLE } from "./roles";
import type { LookParams, ShapeParams } from "./params";

const deg = (d: number) => (d * Math.PI) / 180;

/** Ground-level stems, in clumps. `clumps` of 0 makes a single shrub. */
export function bushSeeds(shape: ShapeParams, rng: () => number): StemSeed[] {
  const seeds: StemSeed[] = [];
  const clumps = Math.max(1, Math.round(shape.clumps) + 1);
  const baseR = shape.height * shape.baseSpreadRatio;
  for (let c = 0; c < clumps; c++) {
    let cx = 0, cz = 0, size = 1;
    if (c > 0) {
      const az = rng() * Math.PI * 2;
      const r = shape.height * shape.clumpSpreadRatio * (0.4 + 0.6 * rng());
      cx = Math.cos(az) * r;
      cz = Math.sin(az) * r;
      // Satellite clumps are smaller, which keeps a thicket from reading as a
      // ring of identical bushes.
      size = 0.55 + 0.5 * rng();
    }
    const n = Math.max(1, Math.round(shape.stems[0] + rng() * (shape.stems[1] - shape.stems[0])));
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI * 2 + rng() * 0.9;
      const tilt = deg(shape.leanDeg + (rng() * 2 - 1) * shape.leanVarDeg);
      const spread = baseR * size * rng();
      seeds.push({
        origin: [cx + Math.cos(az) * spread, 0, cz + Math.sin(az) * spread],
        dir: normalize([Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)]),
        length: Math.max(4, shape.height * shape.lengthRatio * size * (1 + (rng() * 2 - 1) * shape.lengthVar)),
        radius: Math.max(shape.minRadius, shape.height * shape.radiusRatio * size),
      });
    }
  }
  return seeds;
}

export interface WoodResult {
  segId: Uint16Array;
  filled: number;
}

/** Exact capsules for anything at least a voxel thick, 6-connected DDA below. */
export function voxelizeStems(vol: Volume, skel: Skeleton, origin: Vec3): WoodResult {
  const segId = new Uint16Array(vol.data.length);
  let filled = 0;
  for (let i = 0; i < skel.segments.length; i++) {
    const s = skel.segments[i];
    const a: Vec3 = [s.a[0] + origin[0], s.a[1] + origin[1], s.a[2] + origin[2]];
    const b: Vec3 = [s.b[0] + origin[0], s.b[1] + origin[1], s.b[2] + origin[2]];
    const tag = i + 1;
    const onFill = (idx: number) => {
      segId[idx] = tag;
    };
    if (Math.max(s.ra, s.rb) >= 1) filled += capsule(vol, a, b, s.ra, s.rb, ROLE.STEM_MID, { onFill });
    else filled += line3(vol, a, b, ROLE.STEM_MID, { onFill, pad: Math.max(s.ra, s.rb) >= 0.72 });
  }
  return { segId, filled };
}

/**
 * Colour the stem surface. Shrub stems are thin, so most of the plant takes a
 * flat per-stem twig colour; only the thicker basal wood gets any pattern.
 * Thorns are added outward from the surface, so they break the silhouette
 * instead of just speckling it.
 */
export function paintStems(
  vol: Volume,
  skel: Skeleton,
  segId: Uint16Array,
  origin: Vec3,
  look: LookParams,
  noise: Noise,
  rng: () => number,
): void {
  const segs = skel.segments;
  const { frames: fx, lengths } = segmentFrames(segs);
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  const thorns: Vec3[] = [];

  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (v === 0 || !isWood(v)) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;
    if (!vol.isSurface(x, y, z)) continue;

    const si = segId[i] - 1;
    if (si < 0 || si >= segs.length) {
      vol.data[i] = ROLE.STEM_MID;
      continue;
    }
    const s = segs[si];
    const o = si * 9;
    const rx = x + 0.5 - (s.a[0] + origin[0]);
    const ry = y + 0.5 - (s.a[1] + origin[1]);
    const rz = z + 0.5 - (s.a[2] + origin[2]);
    const axial = rx * fx[o] + ry * fx[o + 1] + rz * fx[o + 2];
    const t = Math.max(0, Math.min(1, axial / lengths[si]));
    const r = s.ra + (s.rb - s.ra) * t;

    if (r < look.minRadiusForPattern) {
      vol.data[i] = hash01(s.stem) < 0.4 ? ROLE.TWIG_DARK : ROLE.TWIG;
      if (look.thorns > 0 && rng() < look.thorns * 0.25) {
        const n = vol.surfaceNormal(x, y, z);
        if (n[0] || n[1] || n[2]) {
          thorns.push([x + Math.round(n[0]), y + Math.round(n[1]), z + Math.round(n[2])]);
        }
      }
      continue;
    }
    const b = noise.fbm3(x * 0.18, y * 0.09, z * 0.18, 3);
    vol.data[i] = b < 0.42 ? ROLE.STEM_DARK : b > 0.62 ? ROLE.STEM_LIGHT : ROLE.STEM_MID;
  }

  for (const t of thorns) vol.setIfEmpty(t[0], t[1], t[2], ROLE.THORN);
}

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
