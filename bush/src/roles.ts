// Colour roles a bush can emit. Voxel values are these indices, never final
// colours, so a host restyles a shrub for a season or a biome by swapping
// palette entries rather than regenerating it.

import type { RGB, Role } from "@voxolith/engine";

/**
 * Voxel value of every colour role a bush writes. Fixed and ordered: role `r` is described by
 * `buildRoles(colors)[r - 1]`.
 */
export const ROLE = {
  STEM_DARK: 1,
  STEM_MID: 2,
  STEM_LIGHT: 3,
  TWIG: 4,
  TWIG_DARK: 5,
  THORN: 6,
  LEAF_HI: 7,
  LEAF_MID: 8,
  LEAF_LO: 9,
  /** Outer rim of a clump; reads as backlit. */
  LEAF_EDGE: 10,
  LEAF_ACCENT: 11,
  LEAF_DEAD: 12,
  BLOSSOM: 13,
  BERRY: 14,
  SNOW: 15,
} as const;

export const ROLE_COUNT = 15;

const WOOD = [ROLE.STEM_DARK, ROLE.STEM_MID, ROLE.STEM_LIGHT, ROLE.TWIG, ROLE.TWIG_DARK, ROLE.THORN];
const LEAF = [
  ROLE.LEAF_HI,
  ROLE.LEAF_MID,
  ROLE.LEAF_LO,
  ROLE.LEAF_EDGE,
  ROLE.LEAF_ACCENT,
  ROLE.LEAF_DEAD,
  ROLE.BLOSSOM,
  ROLE.BERRY,
];

const mask = (list: number[]) => {
  const m = new Uint8Array(ROLE_COUNT + 1);
  for (const r of list) m[r] = 1;
  return m;
};
const woodMask = mask(WOOD);
const leafMask = mask(LEAF);
export const isWood = (v: number): boolean => v <= ROLE_COUNT && woodMask[v] === 1;
export const isLeaf = (v: number): boolean => v <= ROLE_COUNT && leafMask[v] === 1;

const ID = [
  "stem.dark", "stem.mid", "stem.light", "twig", "twig.dark", "thorn",
  "leaf.hi", "leaf.mid", "leaf.lo", "leaf.edge", "leaf.accent", "leaf.dead",
  "blossom", "berry", "snow",
];
const NAME = [
  "Stem dark", "Stem mid", "Stem light", "Twig", "Twig dark", "Thorn",
  "Leaf light", "Leaf mid", "Leaf dark", "Leaf edge", "Leaf accent", "Dead leaf",
  "Blossom", "Berry", "Snow",
];

/** Colour for every role, keyed by voxel value (a {@link ROLE} value). */
export type ColorSet = Record<number, RGB>;

/**
 * The bush's role table in voxel-value order, coloured from `colors` (usually {@link skinFor});
 * a role `colors` leaves out shows magenta.
 */
export function buildRoles(colors: ColorSet): Role[] {
  const out: Role[] = [];
  for (let v = 1; v <= ROLE_COUNT; v++) {
    out.push({ id: ID[v - 1], name: NAME[v - 1], color: colors[v] ?? [1, 0, 1] });
  }
  return out;
}

export const hex = (h: string): RGB => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
];
