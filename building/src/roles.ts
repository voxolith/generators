// Colour roles a building can emit. Voxel values are these indices, never
// final colours, so the same house is plaster or brick, tile or thatch, by
// swapping palette entries. Four roles carry material hints: window glass is
// real glass, lit windows glow, and the door handle and rainwater goods are
// metal.

import type { RGB, Role } from "@voxolith/engine";

export const ROLE = {
  WALL: 1,
  WALL_DARK: 2,
  WALL_LIGHT: 3,
  /** Joints between bricks or stones; usually recessed so it reads as shadow. */
  MORTAR: 4,
  /** Brick showing where plaster has fallen away. */
  BRICK_EXPOSED: 5,
  /** Dressed stone: quoins, sills, lintels, string courses, coping. */
  TRIM: 6,
  TRIM_DARK: 7,
  /** Structural timber: frames, bargeboards, rafter tails, brackets. */
  BEAM: 8,
  GLASS: 9,
  GLASS_LIT: 10,
  /** Window frames and glazing bars. */
  FRAME: 11,
  DOOR: 12,
  DOOR_DARK: 13,
  HANDLE: 14,
  SHUTTER: 15,
  SHUTTER_DARK: 16,
  ROOF: 17,
  ROOF_DARK: 18,
  ROOF_LIGHT: 19,
  RIDGE: 20,
  CHIMNEY: 21,
  CHIMNEY_DARK: 22,
  SOOT: 23,
  POT: 24,
  FOUNDATION: 25,
  FOUNDATION_DARK: 26,
  FLOOR: 27,
  MOSS: 28,
  GUTTER: 29,
  FLOWER_A: 30,
  FLOWER_B: 31,
  LEAF: 32,
} as const;

export const ROLE_COUNT = 32;

const ID = [
  "wall", "wall.dark", "wall.light", "mortar", "brick.exposed", "trim", "trim.dark", "beam",
  "glass", "glass.lit", "frame", "door", "door.dark", "handle", "shutter", "shutter.dark",
  "roof", "roof.dark", "roof.light", "ridge", "chimney", "chimney.dark", "soot", "pot",
  "foundation", "foundation.dark", "floor", "moss", "gutter", "flower.a", "flower.b", "leaf",
];
const NAME = [
  "Wall", "Wall dark", "Wall light", "Mortar", "Exposed brick", "Stone trim", "Stone trim dark", "Timber",
  "Glass", "Lit window", "Window frame", "Door", "Door panel", "Door handle", "Shutter", "Shutter slat",
  "Roof", "Roof dark", "Roof light", "Ridge", "Chimney", "Chimney dark", "Soot", "Chimney pot",
  "Foundation", "Foundation dark", "Floor", "Moss", "Gutter", "Flower", "Flower alt", "Leaf",
];

export type ColorSet = Record<number, RGB>;

export function buildRoles(colors: ColorSet): Role[] {
  const out: Role[] = [];
  for (let v = 1; v <= ROLE_COUNT; v++) {
    const role: Role = { id: ID[v - 1], name: NAME[v - 1], color: colors[v] ?? [1, 0, 1] };
    if (v === ROLE.GLASS) role.material = { kind: "glass", alpha: 0.35, ior: 0.25, att: 0.25, rough: 0.05, spec: 0.8 };
    if (v === ROLE.GLASS_LIT) role.material = { kind: "emit", emit: 0.9 };
    if (v === ROLE.HANDLE) role.material = { kind: "metal", metal: 0.9, rough: 0.3 };
    if (v === ROLE.GUTTER) role.material = { kind: "metal", metal: 0.6, rough: 0.6 };
    out.push(role);
  }
  return out;
}

export const hex = (h: string): RGB => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
];
