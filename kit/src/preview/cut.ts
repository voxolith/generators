// Cut a model open for inspection: everything past a plane is removed, so a
// preview shows the cross-section — bone, flesh and organs inside a creature,
// heartwood inside a trunk.

import type { EntityModel } from "@voxolith/engine";

/**
 * A copy of a dense model with everything on one side of an axis plane removed, to show its
 * inside. Voxels exactly at `at` are kept. Sparse models (finer scales) are not supported: they
 * have no dense `data`.
 *
 * @param axis - The axis the cutting plane is perpendicular to.
 * @param at - Plane position in model voxels.
 * @param keep - Which side stays: `"below"` keeps coordinates up to `at`.
 */
export function cutAway(model: EntityModel, axis: "x" | "y" | "z", at: number, keep: "below" | "above" = "below"): EntityModel {
  const { x: sx, y: sy, z: sz } = model.size;
  const data = model.data.slice();
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const v = axis === "x" ? x : axis === "y" ? y : z;
        if (keep === "below" ? v > at : v < at) data[x + y * sx + z * sx * sy] = 0;
      }
  return { ...model, data };
}
