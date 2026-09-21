// Colour roles for ground cover. Voxel values are these indices, never final
// colours, so one patch restyles from lush to parched by swapping the palette.

import type { RGB, Role } from "@voxolith/engine";

export const ROLE = {
  /** Blade shading, dark at the base to light at the tip. */
  BLADE_LO: 1,
  BLADE_MID: 2,
  BLADE_HI: 3,
  /** Whole blades that have dried off. */
  BLADE_DRY: 4,
  /** Thicker upright stalks, for reeds and flower stems. */
  STALK: 5,
  SEED: 6,
  FLOWER_A: 7,
  FLOWER_B: 8,
  FLOWER_C: 9,
  SNOW: 10,
} as const;

export const ROLE_COUNT = 10;

const ID = ["blade.lo", "blade.mid", "blade.hi", "blade.dry", "stalk", "seed", "flower.a", "flower.b", "flower.c", "snow"];
const NAME = [
  "Blade base", "Blade mid", "Blade tip", "Dry blade", "Stalk", "Seed head",
  "Flower A", "Flower B", "Flower C", "Snow",
];

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
