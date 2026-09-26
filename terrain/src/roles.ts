// Colour roles the terrain emits. As with entities, voxel values are role
// indices: a host maps role r to palette slot base + r - 1, so the ground can
// be restyled (season, biome) without regenerating it.

import type { RGB, Role } from "@voxolith/engine";

/**
 * Voxel value of every colour role the terrain writes. Fixed and ordered: role `r` is described by
 * `buildRoles(colors)[r - 1]` and maps to palette slot `base + r - 1`.
 */
export const ROLE = {
  GRASS: 1,
  GRASS_LIGHT: 2,
  /** High, exposed ground. */
  GRASS_DRY: 3,
  SOIL: 4,
  ROCK: 5,
  ROCK_DARK: 6,
  /** Beaches and banks just above the water. */
  SAND: 7,
  /** River and lake beds. */
  GRAVEL: 8,
  MUD: 9,
  WATER: 10,
} as const;

/**
 * Number of roles; voxel values run from 1 to this, so a host allocates this many palette slots.
 */
export const ROLE_COUNT = 10;

/** Colour for every role, keyed by voxel value (a {@link ROLE} value). */
export type ColorSet = Record<number, RGB>;

/** The default colours: summer grass, soil, rock, sand, beds and water. */
export const SUMMER: ColorSet = {
  [ROLE.GRASS]: [0.29, 0.42, 0.21],
  [ROLE.GRASS_LIGHT]: [0.35, 0.48, 0.24],
  [ROLE.GRASS_DRY]: [0.47, 0.5, 0.29],
  [ROLE.SOIL]: [0.31, 0.24, 0.17],
  [ROLE.ROCK]: [0.47, 0.46, 0.43],
  [ROLE.ROCK_DARK]: [0.36, 0.35, 0.33],
  [ROLE.SAND]: [0.72, 0.66, 0.49],
  [ROLE.GRAVEL]: [0.45, 0.41, 0.34],
  [ROLE.MUD]: [0.28, 0.25, 0.2],
  [ROLE.WATER]: [0.16, 0.36, 0.42],
};

const ID = ["grass", "grass.light", "grass.dry", "soil", "rock", "rock.dark", "sand", "gravel", "mud", "water"];
const NAME = ["Grass", "Grass light", "Dry grass", "Soil", "Rock", "Rock dark", "Sand", "Gravel", "Mud", "Water"];

/**
 * The terrain's role table in voxel-value order, coloured from `colors`; `WATER` carries the
 * `water` material, which the renderer animates. A role `colors` leaves out shows magenta.
 */
export function buildRoles(colors: ColorSet = SUMMER): Role[] {
  return ID.map((id, i): Role => {
    const v = i + 1;
    const role: Role = { id: `terrain.${id}`, name: NAME[i], color: colors[v] ?? [1, 0, 1] };
    if (v === ROLE.WATER) role.material = { kind: "water", alpha: 0.35, att: 0.18, rough: 0.2, spec: 0.8 };
    return role;
  });
}
