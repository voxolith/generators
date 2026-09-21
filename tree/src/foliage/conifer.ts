// Conifer foliage: needle sheaths along whorl branches.
//
// No blobs here. Needles wrap the branch axes, the whole crown is clamped by a
// jittered cone, and the gaps between whorls are protected. Those gaps are the
// spruce read — let the plates merge and you get a green traffic cone.

import { capsule, type Noise, type Volume } from "@voxolith/engine/build";
import type { Vec3 } from "@voxolith/engine";
import { ROLE } from "../roles";
import type { FoliageParams, ShapeParams } from "../params";
import type { Skeleton } from "../skeleton";
import type { ClusterResult } from "./broadleaf";

export function placeConiferNeedles(
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
  const sheath = foliage.sheathRadius * vs;
  const crownR = shape.height * foliage.crownRadiusRatio;
  const gap = foliage.whorlGap * vs;
  const nf = 0.7 / vs;
  const topY = origin[1] + skel.topY;
  const crownBase = origin[1] + skel.whorlY.length > 0 ? origin[1] + skel.whorlY[0] : origin[1];
  const span = Math.max(1, topY - crownBase);
  const whorlPlanes = skel.whorlY.map((y) => y + origin[1]);

  // Conical envelope with a noisy edge, so the outline is not machined.
  const envelope = (x: number, y: number, z: number): number => {
    const h = Math.max(0, Math.min(1, (y - crownBase) / span));
    const theta = Math.atan2(z - origin[2], x - origin[0]);
    const jitterAmt = 1 + 0.12 * (noise.fbm2(theta * 1.4, y * 0.08, 2) * 2 - 1);
    return (crownR * Math.pow(1 - h, foliage.coneExp) + 3 * vs) * jitterAmt;
  };

  const keep = (x: number, y: number, z: number): boolean => {
    const dx = x + 0.5 - origin[0], dz = z + 0.5 - origin[2];
    if (Math.hypot(dx, dz) > envelope(x + 0.5, y + 0.5, z + 0.5)) return false;
    // Leave the inter-whorl gaps clear.
    for (const wy of whorlPlanes) {
      if (y + 0.5 > wy && y + 0.5 < wy + gap) return false;
    }
    return noise.fbm3(x * nf, y * nf, z * nf, 2) > foliage.sheathFill;
  };

  let clusters = 0;
  let placed = 0;
  for (const stem of skel.stems) {
    if (stem.level < 1) continue;
    if (densityScale < 1 && rng() > densityScale) continue;
    const cid = ++clusters;
    for (let i = 1; i < stem.points.length; i++) {
      const a = stem.points[i - 1], b = stem.points[i];
      // Needles thin out toward the branch tip, and fresh growth sits outside.
      const t = i / (stem.points.length - 1);
      const r = sheath * (0.75 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
      placed += capsule(
        vol,
        [a[0] + origin[0], a[1] + origin[1], a[2] + origin[2]],
        [b[0] + origin[0], b[1] + origin[1], b[2] + origin[2]],
        r,
        r * 0.85,
        ROLE.LEAF_MID,
        {
          overwrite: false,
          onFill: (idx, x, y, z) => {
            if (!keep(x, y, z)) {
              vol.data[idx] = 0;
              return;
            }
            clusterId[idx] = cid;
          },
        },
      );
    }
  }

  // The onFill filter above may have cleared voxels it already counted.
  placed = 0;
  for (let i = 0; i < vol.data.length; i++) if (clusterId[i] !== 0 && vol.data[i] !== 0) placed++;

  return { clusterId, clusters, placed };
}
