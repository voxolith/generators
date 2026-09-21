// Turning the skeleton into wood voxels.
//
// Two rasterisers, picked by radius. At one voxel and above a tapered capsule
// is tested exactly against each candidate voxel centre: no gaps, no over-fill,
// and the cost tracks the volume actually filled. Below one voxel that test
// starts skipping cells, so thin twigs walk their axis with a 3D DDA, which
// crosses voxel faces and is 6-connected by construction. Sphere-stamping thin
// segments at sub-voxel steps is the classic way to end up with twigs that a
// connectivity check treats as detached.

import { capsule, line3, type Volume } from "@voxolith/engine/build";
import type { Vec3 } from "@voxolith/engine";
import { ROLE } from "./roles";
import type { ShapeParams } from "./params";
import type { Skeleton } from "./skeleton";

export interface WoodResult {
  /** Segment index + 1 for every wood voxel, so the bark pass can recover a frame. */
  segId: Uint16Array;
  filled: number;
}

export function voxelizeWood(vol: Volume, skel: Skeleton, shape: ShapeParams, origin: Vec3, rng: () => number): WoodResult {
  const segId = new Uint16Array(vol.data.length);
  const flareH = Math.max(1, shape.height * shape.trunk.flareHeightRatio);
  const lobes = Math.max(1, Math.round(shape.trunk.flareLobes));
  const lobePhase = rng() * Math.PI * 2;
  const gain = shape.trunk.flareGain;

  // A flared, lobed base reads as a tree that grew rather than a pole stuck in
  // the ground, and it widens the footprint the connectivity flood starts from.
  const flare = (x: number, y: number, z: number): number => {
    const yy = y + 0.5 - origin[1];
    if (yy >= flareH || yy < 0) return 1;
    const f = Math.pow((flareH - yy) / flareH, 2);
    const th = Math.atan2(z + 0.5 - origin[2], x + 0.5 - origin[0]);
    const lobe = 1 + 0.45 * Math.max(0, Math.cos(lobes * (th - lobePhase)));
    return 1 + gain * f * lobe;
  };

  let filled = 0;
  for (let i = 0; i < skel.segments.length; i++) {
    const s = skel.segments[i];
    const a: Vec3 = [s.a[0] + origin[0], s.a[1] + origin[1], s.a[2] + origin[2]];
    const b: Vec3 = [s.b[0] + origin[0], s.b[1] + origin[1], s.b[2] + origin[2]];
    const tag = i + 1;
    const onFill = (idx: number) => {
      segId[idx] = tag;
    };
    const rMax = Math.max(s.ra, s.rb);
    if (rMax >= 1) {
      filled += capsule(vol, a, b, s.ra, s.rb, ROLE.HEART, {
        onFill,
        scale: s.level === 0 ? (x, y, z) => flare(x, y, z) : undefined,
      });
    } else {
      filled += line3(vol, a, b, ROLE.HEART, { onFill, pad: rMax >= 0.72 });
    }
  }

  // Surface roots: short capsules radiating from the base, which also broadens
  // the silhouette where the trunk meets the ground.
  const nRoots = Math.round(shape.trunk.roots);
  const baseR = shape.height * shape.trunk.radiusRatio;
  for (let k = 0; k < nRoots; k++) {
    const th = (k / nRoots) * Math.PI * 2 + rng() * 0.6;
    const len = baseR * (1.6 + rng() * 1.4);
    const a: Vec3 = [origin[0], origin[1] + baseR * 0.4, origin[2]];
    const b: Vec3 = [origin[0] + Math.cos(th) * len, origin[1] + 0.5, origin[2] + Math.sin(th) * len];
    filled += capsule(vol, a, b, baseR * 0.45, Math.max(1, baseR * 0.16), ROLE.HEART, {
      onFill: (idx) => {
        if (segId[idx] === 0) segId[idx] = 1;
      },
    });
  }

  return { segId, filled };
}
