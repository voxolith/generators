// Colour roles a rock can emit. Voxel values are these indices, never final
// colours, so the same boulder becomes granite, sandstone or basalt by swapping
// palette entries rather than regenerating it.

import type { RGB, Role } from "@voxolith/engine";

export const ROLE = {
  ROCK_LIGHT: 1,
  ROCK_MID: 2,
  ROCK_DARK: 3,
  /** Contrasting sedimentary band. */
  STRATA: 4,
  CRACK: 5,
  MOSS: 6,
  MOSS_DARK: 7,
  LICHEN: 8,
  /** Damp, darkened band at ground contact. */
  WET: 9,
  SNOW: 10,
} as const;

export const ROLE_COUNT = 10;

const ID = ["rock.light", "rock.mid", "rock.dark", "strata", "crack", "moss", "moss.dark", "lichen", "wet", "snow"];
const NAME = ["Rock light", "Rock mid", "Rock dark", "Strata", "Crack", "Moss", "Moss dark", "Lichen", "Wet base", "Snow"];

export type ColorSet = Record<number, RGB>;

export function buildRoles(colors: ColorSet): Role[] {
  const out: Role[] = [];
  for (let v = 1; v <= ROLE_COUNT; v++) out.push({ id: ID[v - 1], name: NAME[v - 1], color: colors[v] ?? [1, 0, 1] });
  return out;
}

export const hex = (h: string): RGB => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
];
