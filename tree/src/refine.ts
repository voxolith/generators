// How a tree refines to a finer world (see gen-kit `refine`).
//
// The coarse tree decides everything that has a shape: the limbs, which
// voxels are leaves and how they are shaded. At k times the resolution:
//   - bark rounds off and gets furrows running up the stem, darker in the
//     grooves and lighter on the ridges; moss and crevices keep their places;
//   - twigs round into thin rods;
//   - every coarse leaf voxel becomes a few single leaves (needles on a
//     conifer) in its own shade, sometimes a neighbouring one, so the coarse
//     light and dark of the crown survives;
//   - snow and cones round off like bark.

import type { RoleRule, RefineCell } from "@voxolith/gen-kit";
import { ROLE } from "./roles";

export function treeRules(kind: "broadleaf" | "conifer", k: number): Record<number, RoleRule> {
  const bark = (c: RefineCell): number => {
    // Furrows: noise stretched along y, so grooves run up the stem.
    const f = c.noise.value3(c.x / (0.45 * k), c.y / (2.5 * k), c.z / (0.45 * k));
    if (c.role === ROLE.MOSS || c.role === ROLE.CREVICE) return c.role;
    if (f < 0.28) return ROLE.CREVICE;
    if (f < 0.42) return ROLE.BARK_DARK;
    if (f > 0.74) return ROLE.BARK_LIGHT;
    return c.role;
  };
  const smoothBark: RoleRule = { mode: "smooth", roughness: 0.1, roughScale: 1.2 * k, detail: bark };
  const twig: RoleRule = { mode: "smooth", roughness: 0 };
  const tones = [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO];
  const leaf: RoleRule =
    kind === "conifer"
      ? { mode: "leaves", leaves: { shape: "needle", count: 16, radius: 0.4 * k, depth: 2, tones, toneChance: 0.12 } }
      : { mode: "leaves", leaves: { count: 3, radius: 0.34 * k, tones, toneChance: 0.15 } };
  const rules: Record<number, RoleRule> = {
    [ROLE.HEART]: smoothBark,
    [ROLE.BARK_DARK]: smoothBark,
    [ROLE.BARK_MID]: smoothBark,
    [ROLE.BARK_LIGHT]: smoothBark,
    [ROLE.MOSS]: smoothBark,
    [ROLE.CREVICE]: smoothBark,
    [ROLE.TWIG]: twig,
    [ROLE.TWIG_DARK]: twig,
    [ROLE.SNOW]: { mode: "smooth", roughness: 0.05 },
    [ROLE.CONE]: { mode: "smooth", roughness: 0.05 },
    [ROLE.BLOSSOM]: { mode: "leaves", leaves: { count: 2, radius: 0.22 * k } },
  };
  for (const r of [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO, ROLE.LEAF_EDGE, ROLE.LEAF_ACCENT, ROLE.LEAF_DEAD]) rules[r] = leaf;
  return rules;
}
