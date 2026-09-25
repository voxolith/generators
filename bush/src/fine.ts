// A bush at a finer scale (see gen-kit refine and the tree's fine.ts, which
// this follows): leaves, berries, blossom and snow refine from the coarse
// voxels; stems are redrawn from the skeleton as thin capsule shells, much
// slimmer than the coarse bush could draw them, in the coarse stem's tones.

import { coarseRoleAt, drawSkeletonFine, makeNoise, refine, SparseWriter, type RoleRule, type Skeleton } from "@voxolith/gen-kit";
import type { EntityModel, Vec3 } from "@voxolith/engine";
import { ROLE } from "./roles";

const STEMS = new Set<number>([ROLE.STEM_DARK, ROLE.STEM_MID, ROLE.STEM_LIGHT, ROLE.TWIG, ROLE.TWIG_DARK]);

export function bushRules(k: number): Record<number, RoleRule> {
  const tones = [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO];
  const leaf: RoleRule = { mode: "leaves", leaves: { count: 3, radius: 0.3 * k, tones, toneChance: 0.15 } };
  const rules: Record<number, RoleRule> = {
    // A thorn is a spike, not a 10 cm cube: two short needles.
    [ROLE.THORN]: { mode: "leaves", leaves: { shape: "needle", count: 2, radius: 0.22 * k } },
    [ROLE.BERRY]: { mode: "smooth", roughness: 0 },
    [ROLE.BLOSSOM]: { mode: "leaves", leaves: { count: 2, radius: 0.2 * k } },
    [ROLE.SNOW]: { mode: "smooth", roughness: 0.05 },
  };
  for (const r of STEMS) rules[r] = { mode: "skip" };
  for (const r of [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO, ROLE.LEAF_EDGE, ROLE.LEAF_ACCENT, ROLE.LEAF_DEAD]) rules[r] = leaf;
  return rules;
}

export function fineBush(coarse: EntityModel, skel: Skeleton, origin: Vec3, k: number, seed: number): EntityModel {
  const { model } = refine(coarse, { k, rules: bushRules(k), seed });
  const w = new SparseWriter(model.sparse!);
  const noise = makeNoise((seed ^ 0x2c1b) | 1);
  const roleAt = coarseRoleAt(coarse, k, noise, STEMS, ROLE.STEM_MID);
  const off: Vec3 = [origin[0] - coarse.anchor[0], origin[1] - coarse.anchor[1], origin[2] - coarse.anchor[2]];
  const toFine = (p: readonly number[]): Vec3 => [(p[0] - off[0]) * k, (p[1] - off[1]) * k, (p[2] - off[2]) * k];
  const segments = skel.segments.map((s) => ({
    a: [s.a[0] + origin[0], s.a[1] + origin[1], s.a[2] + origin[2]],
    b: [s.b[0] + origin[0], s.b[1] + origin[1], s.b[2] + origin[2]],
    ra: s.ra, rb: s.rb, level: s.level,
  }));
  drawSkeletonFine(w, segments, {
    k, toFine,
    // Shrub stems are all level 0 and much thinner than the coarse minimum.
    thin: (l) => (l === 0 ? 0.6 : l === 1 ? 0.45 : 0.35),
    value: (x, y, z) => {
      const v = roleAt(x, y, z);
      // Faint bark streaks along the stems.
      const f = noise.value3(x / (0.3 * k), y / (1.5 * k), z / (0.3 * k));
      return v === ROLE.STEM_MID && f < 0.3 ? ROLE.STEM_DARK : v === ROLE.STEM_MID && f > 0.78 ? ROLE.STEM_LIGHT : v;
    },
  });
  return model;
}
