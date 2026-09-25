// Grass at a finer scale (see gen-kit refine). Blades are redrawn from the
// grower's skeleton as thin rods a voxel or two across, rooted and arching
// like the coarse ones and shaded base to tip from them; flowers become
// small petal discs and seed heads stay compact.

import { coarseRoleAt, drawSkeletonFine, makeNoise, refine, SparseWriter, type RoleRule, type Skeleton } from "@voxolith/gen-kit";
import type { EntityModel, Vec3 } from "@voxolith/engine";
import { ROLE } from "./roles";

const BLADES = new Set<number>([ROLE.BLADE_LO, ROLE.BLADE_MID, ROLE.BLADE_HI, ROLE.BLADE_DRY, ROLE.STALK]);

export function grassRules(k: number): Record<number, RoleRule> {
  const rules: Record<number, RoleRule> = {
    [ROLE.SEED]: { mode: "smooth", roughness: 0.15, roughScale: 0.5 * k },
    [ROLE.FLOWER_A]: { mode: "leaves", leaves: { count: 3, radius: 0.18 * k } },
    [ROLE.FLOWER_B]: { mode: "leaves", leaves: { count: 3, radius: 0.18 * k } },
    [ROLE.FLOWER_C]: { mode: "leaves", leaves: { count: 3, radius: 0.18 * k } },
    [ROLE.SNOW]: { mode: "smooth", roughness: 0.05 },
  };
  for (const r of BLADES) rules[r] = { mode: "skip" };
  return rules;
}

export function fineGrass(coarse: EntityModel, skel: Skeleton, origin: Vec3, k: number, seed: number): EntityModel {
  const { model } = refine(coarse, { k, rules: grassRules(k), seed });
  const w = new SparseWriter(model.sparse!);
  const roleAt = coarseRoleAt(coarse, k, makeNoise((seed ^ 0x77) | 1), BLADES, ROLE.BLADE_MID);
  const off: Vec3 = [origin[0] - coarse.anchor[0], origin[1] - coarse.anchor[1], origin[2] - coarse.anchor[2]];
  const toFine = (p: readonly number[]): Vec3 => [(p[0] - off[0]) * k, (p[1] - off[1]) * k, (p[2] - off[2]) * k];
  const segments = skel.segments.map((s) => ({
    a: [s.a[0] + origin[0], s.a[1] + origin[1], s.a[2] + origin[2]],
    b: [s.b[0] + origin[0], s.b[1] + origin[1], s.b[2] + origin[2]],
    ra: s.ra, rb: s.rb, level: s.level,
  }));
  drawSkeletonFine(w, segments, { k, toFine, shell: 2, thin: () => 0.25, value: roleAt });
  return model;
}
