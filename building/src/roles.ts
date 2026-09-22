// Colour roles a building can emit. Voxel values are these indices, never
// final colours, so the same house is plaster or brick, tile or thatch, by
// swapping palette entries. Two roles carry material hints: glass windows are
// real glass to the renderer, and lit windows glow.

import type { RGB, Role } from "@voxolith/engine";

export const ROLE = {
  WALL: 1,
  WALL_DARK: 2,
  /** Corner quoins, storey bands, parapets. */
  TRIM: 3,
  /** Exposed timber. */
  BEAM: 4,
  GLASS: 5,
  GLASS_LIT: 6,
  FRAME: 7,
  DOOR: 8,
  ROOF: 9,
  ROOF_DARK: 10,
  RIDGE: 11,
  CHIMNEY: 12,
  SOOT: 13,
  FOUNDATION: 14,
  /** Interior floor slabs; only seen if the building is opened up. */
  FLOOR: 15,
  MOSS: 16,
} as const;

export const ROLE_COUNT = 16;

const ID = [
  "wall", "wall.dark", "trim", "beam", "glass", "glass.lit", "frame", "door",
  "roof", "roof.dark", "ridge", "chimney", "soot", "foundation", "floor", "moss",
];
const NAME = [
  "Wall", "Wall dark", "Trim", "Beam", "Glass", "Lit window", "Frame", "Door",
  "Roof", "Roof shadow", "Ridge", "Chimney", "Soot", "Foundation", "Floor", "Moss",
];

export type ColorSet = Record<number, RGB>;

export function buildRoles(colors: ColorSet): Role[] {
  const out: Role[] = [];
  for (let v = 1; v <= ROLE_COUNT; v++) {
    const role: Role = { id: ID[v - 1], name: NAME[v - 1], color: colors[v] ?? [1, 0, 1] };
    if (v === ROLE.GLASS) role.material = { kind: "glass", alpha: 0.35, ior: 0.25, att: 0.25, rough: 0.05, spec: 0.8 };
    if (v === ROLE.GLASS_LIT) role.material = { kind: "emit", emit: 0.9 };
    out.push(role);
  }
  return out;
}

export const hex = (h: string): RGB => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
];
