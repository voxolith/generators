// Broadleaf foliage: clusters hung on the skeleton.
//
// The canopy is the union of tufts on real twigs, never a global envelope
// filled with leaves. That single choice is what stops a tree reading as a
// lollipop: where the branches end, the crown ends, so the outline inherits
// all the irregularity of the branching. Each cluster is then carved by noise
// offset per cluster, dense in the middle and ragged at the rim.

import { ellipsoid, mix, type Noise, type Volume } from "@voxolith/engine/build";
import type { Vec3 } from "@voxolith/engine";
import { ROLE } from "../roles";
import type { FoliageParams, ShapeParams } from "../params";
import type { Skeleton } from "../skeleton";

export interface ClusterResult {
  clusterId: Uint16Array;
  clusters: number;
  placed: number;
}

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
  const clusterId = new Uint16Array(vol.data.length);
  const spacing = Math.max(1, foliage.spacing * vs);
  const baseR = foliage.clusterRadius * vs;
  const minLevel = Math.max(1, shape.levels.length - 1);

  interface Spot {
    p: Vec3;
    dir: Vec3;
    r: number;
  }
  const spots: Spot[] = [];

  for (const stem of skel.stems) {
    if (stem.level < minLevel) continue;
    let since = spacing; // place one immediately at the start of the twig
    for (let i = 1; i < stem.points.length; i++) {
      since += stem.arc[i] - stem.arc[i - 1];
      if (since < spacing) continue;
      since = 0;
      const a = stem.points[i - 1], b = stem.points[i];
      const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      spots.push({ p: b, dir: [d[0] / l, d[1] / l, d[2] / l], r: baseR });
    }
  }
  for (const tip of skel.tips) spots.push({ p: tip.p, dir: tip.dir, r: baseR * foliage.tipBoost });

  let clusters = 0;
  let placed = 0;
  const nf = 0.55 / vs;

  for (const s of spots) {
    if (densityScale < 1 && rng() > densityScale) continue;
    const cid = ++clusters;
    // Per-cluster size variance drives the silhouette; without it every tuft is
    // the same ball and the crown turns into a single smooth surface.
    const R = s.r * (0.7 + rng() * 0.6);
    const c: Vec3 = [
      s.p[0] + origin[0] + s.dir[0] * 1.5,
      s.p[1] + origin[1] + s.dir[1] * 1.5,
      s.p[2] + origin[2] + s.dir[2] * 1.5,
    ];
    const ox = rng() * 512, oy = rng() * 512, oz = rng() * 512;
    placed += ellipsoid(
      vol,
      c,
      [R, R * foliage.clusterFlatten, R],
      ROLE.LEAF_MID,
      (x, y, z, d) => noise.fbm3(x * nf + ox, y * nf + oy, z * nf + oz, 2) > mix(foliage.fillCore, foliage.fillRim, d),
      {
        overwrite: false,
        onFill: (idx) => {
          clusterId[idx] = cid;
        },
      },
    );
  }

  return { clusterId, clusters, placed };
}
