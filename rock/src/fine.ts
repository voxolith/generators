// A rock at a finer scale (see gen-kit refine): the coarse mass rounds off
// its voxel steps and takes a rough, grainy surface; the coarse tones break
// up into speckle; hairline cracks run across the faces; moss and lichen
// become ragged patches.

import { refine, type RefineCell, type RoleRule } from "@voxolith/gen-kit";
import type { EntityModel } from "@voxolith/engine";
import { ROLE } from "./roles";

export function rockRules(k: number): Record<number, RoleRule> {
  const stone = (c: RefineCell): number => {
    const n = c.noise;
    // Hairline cracks: where a ridged noise crosses zero, a voxel deep.
    const r = Math.abs(n.value3(c.x / (4 * k), c.y / (4 * k), c.z / (4 * k), 5) - 0.5);
    if (r < 0.012) return c.depth === 0 ? 0 : ROLE.CRACK;
    if (r < 0.02) return ROLE.CRACK;
    const g = n.value3(c.x / (0.25 * k), c.y / (0.25 * k), c.z / (0.25 * k), 7);
    if (c.role === ROLE.ROCK_MID) return g > 0.8 ? ROLE.ROCK_LIGHT : g < 0.15 ? ROLE.ROCK_DARK : c.role;
    return c.role;
  };
  const rough: RoleRule = { mode: "smooth", roughness: 0.18, roughScale: 0.9 * k, detail: stone };
  const growth = (c: RefineCell): number => {
    const g = c.noise.value3(c.x / (0.3 * k), c.y / (0.3 * k), c.z / (0.3 * k), 11);
    if (c.depth === 0 && g < 0.25) return 0;
    return c.role;
  };
  return {
    [ROLE.ROCK_LIGHT]: rough,
    [ROLE.ROCK_MID]: rough,
    [ROLE.ROCK_DARK]: rough,
    [ROLE.STRATA]: rough,
    [ROLE.CRACK]: { mode: "smooth", roughness: 0.18, roughScale: 0.9 * k },
    [ROLE.WET]: rough,
    [ROLE.MOSS]: { mode: "smooth", roughness: 0.28, roughScale: 0.5 * k, detail: growth },
    [ROLE.MOSS_DARK]: { mode: "smooth", roughness: 0.28, roughScale: 0.5 * k, detail: growth },
    [ROLE.LICHEN]: { mode: "smooth", roughness: 0.2, roughScale: 0.5 * k, detail: growth },
    [ROLE.SNOW]: { mode: "smooth", roughness: 0.06 },
  };
}

export function fineRock(coarse: EntityModel, k: number, seed: number): EntityModel {
  return refine(coarse, { k, rules: rockRules(k), seed }).model;
}
