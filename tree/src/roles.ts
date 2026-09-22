// Colour roles a tree can emit.
//
// The generator writes role indices, never final colours, so a host can restyle
// a tree (season, biome, damage) by swapping palette entries rather than
// regenerating geometry. Values are fixed and ordered, because a baked `.vox`
// carries them.

import type { RGB, Role } from "@voxolith/engine";

export const ROLE = {
  /** Inner wood, only visible where a tree is cut or broken. */
  HEART: 1,
  BARK_DARK: 2,
  BARK_MID: 3,
  BARK_LIGHT: 4,
  MOSS: 5,
  /** Baked occlusion in crotches and under limbs. */
  CREVICE: 6,
  TWIG: 7,
  TWIG_DARK: 8,
  LEAF_HI: 9,
  LEAF_MID: 10,
  LEAF_LO: 11,
  /** Outer rim of a cluster; reads as backlit. */
  LEAF_EDGE: 12,
  LEAF_ACCENT: 13,
  LEAF_DEAD: 14,
  BLOSSOM: 15,
  SNOW: 16,
  CONE: 17,
} as const;

export const ROLE_COUNT = 17;

export const WOOD_ROLES: number[] = [
  ROLE.HEART, ROLE.BARK_DARK, ROLE.BARK_MID, ROLE.BARK_LIGHT, ROLE.MOSS, ROLE.CREVICE, ROLE.TWIG, ROLE.TWIG_DARK,
];
export const LEAF_ROLES: number[] = [
  ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO, ROLE.LEAF_EDGE, ROLE.LEAF_ACCENT, ROLE.LEAF_DEAD, ROLE.BLOSSOM, ROLE.CONE,
];

const isWoodMask = (() => {
  const m = new Uint8Array(ROLE_COUNT + 1);
  for (const r of WOOD_ROLES) m[r] = 1;
  return m;
})();
export const isWood = (v: number): boolean => v <= ROLE_COUNT && isWoodMask[v] === 1;

const isLeafMask = (() => {
  const m = new Uint8Array(ROLE_COUNT + 1);
  for (const r of LEAF_ROLES) m[r] = 1;
  return m;
})();
export const isLeaf = (v: number): boolean => v <= ROLE_COUNT && isLeafMask[v] === 1;

const ID = [
  "wood.heart",
  "bark.dark",
  "bark.mid",
  "bark.light",
  "bark.moss",
  "bark.crevice",
  "twig",
  "twig.dark",
  "leaf.hi",
  "leaf.mid",
  "leaf.lo",
  "leaf.edge",
  "leaf.accent",
  "leaf.dead",
  "blossom",
  "snow",
  "cone",
];
const NAME = [
  "Heartwood",
  "Bark dark",
  "Bark mid",
  "Bark light",
  "Moss",
  "Crevice",
  "Twig",
  "Twig dark",
  "Leaf light",
  "Leaf mid",
  "Leaf dark",
  "Leaf edge",
  "Leaf accent",
  "Dead leaf",
  "Blossom",
  "Snow",
  "Cone",
];

/** Colour for every role, in voxel-value order. */
export type ColorSet = Record<number, RGB>;

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
