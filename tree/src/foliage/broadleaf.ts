// Broadleaf foliage: clusters hung on the skeleton.
//
// The canopy is the union of tufts on real twigs, never a global envelope
// filled with leaves. That single choice is what stops a tree reading as a
// lollipop: where the branches end, the crown ends, so the outline inherits
// all the irregularity of the branching.

import {
  placeClusters,
  spotsAlong,
  type ClusterResult,
  type ClusterSpot,
  type Noise,
  type Skeleton,
  type Volume,
} from "@voxolith/gen-kit";
import type { Vec3 } from "@voxolith/engine";
import { ROLE } from "../roles";
import type { FoliageParams, ShapeParams } from "../params";

export function placeBroadleafClusters(
  vol: Volume,
  skel: Skeleton,
  shape: ShapeParams,
  foliage: FoliageParams,
  origin: Vec3,
  noise: Noise,
  rng: () => number,
  vs: number,
  densityScale: number,
): ClusterResult {
  const spacing = Math.max(1, foliage.spacing * vs);
  const baseR = foliage.clusterRadius * vs;
  // The last two levels carry leaves; anything thicker is structural.
  const minLevel = Math.max(1, shape.levels.length - 1);
  const spots: ClusterSpot[] = [];

  for (const stem of skel.stems) {
    if (stem.level < minLevel) continue;
    spotsAlong(stem.points, stem.arc, spacing, baseR, spots);
  }
  for (const tip of skel.tips) {
    spots.push({ p: [tip.p[0], tip.p[1], tip.p[2]], dir: tip.dir, radius: baseR * foliage.tipBoost });
  }
  // Skeleton space to volume space.
  for (const s of spots) {
    s.p[0] += origin[0];
    s.p[1] += origin[1];
    s.p[2] += origin[2];
  }

  return placeClusters(
    vol,
    spots,
    ROLE.LEAF_MID,
    {
      flatten: foliage.clusterFlatten,
      offset: 1.5,
      sizeVar: 0.3,
      fillCore: foliage.fillCore,
      fillRim: foliage.fillRim,
      scale: 0.55 / vs,
      density: densityScale,
    },
    noise,
    rng,
  );
}
