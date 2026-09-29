// A fine terrain as plain data, so a worker can rebuild it and fill bricks
// off the main thread. The coarse heights (levelling included) travel as
// they are; the settlement's surface override travels as one palette slot
// per coarse column instead of a closure.

import { generateTerrain, terrainInit, topOverrideData, type TerrainInit, type TopOverride } from "./index";
import { refineTerrain, type FineTerrain, type FineTerrainOptions } from "./fine";

/**
 * Everything a {@link FineTerrain} is rebuilt from, as structured-clonable data: the coarse
 * terrain, the factor and the options, with the top override as data. From
 * {@link fineTerrainInit}, rebuilt by {@link fineTerrainFrom}. Transfer `terrain.heights.buffer`
 * and `options.top.buffer` to skip the copies; the init holds copies of its own.
 */
export interface FineTerrainInit {
  /** The coarse terrain: params, seed and levelled heights. */
  terrain: TerrainInit;
  /** Fine voxels per coarse voxel. */
  k: number;
  /** The refinement's options, `top` as a palette slot per coarse column (`x + z * width`). */
  options: Omit<FineTerrainOptions, "top"> & { top?: Uint8Array };
}

/**
 * Describe a fine terrain as data for a worker. `top` (default: the fine terrain's `options.top`)
 * is evaluated on every coarse column once, so a closure over app state (a settlement's paths
 * and yards) becomes a `Uint8Array`. Heights are copied as they are now: level before calling.
 *
 * @param fine - The fine terrain, from {@link refineTerrain}.
 * @param top - The override its bricks are filled with, when the app passes it per call instead
 * of in the options.
 * @returns Structured-clonable data; {@link fineTerrainFrom} rebuilds a fine terrain whose
 * `fillBrick` (with no `top` argument) writes the same cells.
 */
export function fineTerrainInit(fine: FineTerrain, top: TopOverride | undefined = fine.options.top): FineTerrainInit {
  const { top: _, ...rest } = fine.options;
  const options: FineTerrainInit["options"] = { ...rest };
  if (top) options.top = topOverrideData(fine.coarse, top);
  return { terrain: terrainInit(fine.coarse), k: fine.k, options };
}

/**
 * Rebuild a fine terrain from {@link fineTerrainInit} data, on a worker or anywhere: the coarse
 * terrain from its heights (nothing is resampled) and the refinement over it. Cheap (the cost is
 * one pass over the heights for `maxY`); every brick then fills byte-identically to the original.
 *
 * @param init - The description, as received.
 * @returns The fine terrain; its `fillBrick` applies `init.options.top` when a call passes none.
 * @example
 * ```ts
 * // worker
 * let fill: (cells: Uint8Array, ox: number, oy: number, oz: number) => boolean;
 * onmessage = ({ data }) => {
 *   const fine = fineTerrainFrom(data.fine);
 *   fill = (cells, ox, oy, oz) => fine.fillBrick(cells, ox, oy, oz, data.base);
 * };
 * ```
 */
export function fineTerrainFrom(init: FineTerrainInit): FineTerrain {
  const t = init.terrain;
  const coarse = generateTerrain(t.params, t.seed, { heights: t.heights });
  return refineTerrain(coarse, init.k, init.options);
}
