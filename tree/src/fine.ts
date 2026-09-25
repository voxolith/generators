// A tree at a finer scale: the coarse design refined, with its wood redrawn.
//
// Leaves, snow and cones refine from the coarse voxels (see refine.ts). The
// wood does not: a limb at 10 voxels per metre is a staircase of cubes, and
// smoothing a staircase gives a lumpy rod. The skeleton that drew it is still
// here, so every segment (and root) is drawn again k times larger as a thin
// shell of an exact tapered capsule, flared at the base like the coarse one,
// and thinner above the trunk than the coarse tree could draw it. Each fine
// bark voxel takes the role of the coarse voxel it falls in (so moss,
// crevices and the bark's light and dark keep their places), then gets the
// fine furrows.

import { coarseRoleAt, drawSkeletonFine, makeNoise, refine, shellCapsule, SparseWriter, type RefineCell, type Skeleton } from "@voxolith/gen-kit";
import type { EntityModel, Vec3 } from "@voxolith/engine";
import { ROLE, WOOD_ROLES } from "./roles";
import { treeRules } from "./refine";
import type { WoodResult } from "./voxelize";

const BARK = new Set(WOOD_ROLES.filter((r) => r !== ROLE.HEART));

export interface FineTreeInput {
  coarse: EntityModel;
  skel: Skeleton;
  wood: WoodResult;
  kind: "broadleaf" | "conifer";
  /** Where the skeleton's origin is in the coarse volume, and the crop's offset. */
  origin: Vec3;
  cropOffset: Vec3;
  k: number;
  seed: number;
}

export function fineTree(inp: FineTreeInput): { model: EntityModel; stats: { voxels: number; bricks: number; ms: number } } {
  const t0 = performance.now();
  const { coarse, skel, wood, k, origin, cropOffset } = inp;
  const rules = treeRules(inp.kind, k);
  const bark = rules[ROLE.BARK_MID].detail!;
  for (const r of WOOD_ROLES) rules[r] = { mode: "skip" };
  const { model } = refine(coarse, { k, rules, seed: inp.seed });
  const w = new SparseWriter(model.sparse!);
  const cell: RefineCell = { x: 0, y: 0, z: 0, cx: 0, cy: 0, cz: 0, role: 0, nx: 0, ny: 0, nz: 0, depth: 0, k, noise: makeNoise((inp.seed ^ 0x5bd1) | 1) };
  const roleAt = coarseRoleAt(coarse, k, cell.noise, BARK, ROLE.BARK_MID);
  const value = (x: number, y: number, z: number) => {
    const v = roleAt(x, y, z);
    if (v === ROLE.TWIG || v === ROLE.TWIG_DARK) return v;
    cell.x = x; cell.y = y; cell.z = z; cell.role = v;
    return bark(cell);
  };
  const toFine = (p: readonly number[]): Vec3 => [(p[0] - cropOffset[0]) * k, (p[1] - cropOffset[1]) * k, (p[2] - cropOffset[2]) * k];
  // The flare is defined in volume coordinates; map a fine cell back.
  const flare = (x: number, y: number, z: number) =>
    wood.flare((x + 0.5) / k + cropOffset[0] - 0.5, (y + 0.5) / k + cropOffset[1] - 0.5, (z + 0.5) / k + cropOffset[2] - 0.5);
  const segments = skel.segments.map((s) => ({
    a: [s.a[0] + origin[0], s.a[1] + origin[1], s.a[2] + origin[2]],
    b: [s.b[0] + origin[0], s.b[1] + origin[1], s.b[2] + origin[2]],
    ra: s.ra, rb: s.rb, level: s.level,
  }));
  let voxels = drawSkeletonFine(w, segments, { k, toFine, value, flare, maxFlare: wood.maxFlare });
  const shell = Math.min(4, Math.ceil(k * 0.4));
  for (const r of wood.roots) voxels += shellCapsule(w, toFine(r.a), toFine(r.b), r.ra * k, r.rb * k, shell, value);
  return { model, stats: { voxels, bricks: model.sparse!.bricks.size, ms: performance.now() - t0 } };
}
