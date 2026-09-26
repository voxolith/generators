// Building presets and colour skins.

import { hex, ROLE, type ColorSet } from "./roles";
import type { BuildingParams, RoofStyle, WallStyle } from "./params";

interface WallSkin {
  wall: string; dark: string; light: string; mortar: string;
  trim: string; trimDark: string; beam: string; shutter: string; door: string;
}
const WALLS: Record<WallStyle, WallSkin> = {
  plaster: { wall: "e6dac0", dark: "cdbf9f", light: "f1e8d3", mortar: "b8a98a", trim: "cfc4ad", trimDark: "a99f88", beam: "5a3e28", shutter: "4f6b52", door: "5b3a22" },
  brick:   { wall: "9a4c37", dark: "7a3a2b", light: "b1624a", mortar: "cabfa8", trim: "d6cdb8", trimDark: "b0a792", beam: "4a3222", shutter: "2f3f55", door: "283a4f" },
  stone:   { wall: "908c80", dark: "6f6b61", light: "aba699", mortar: "5a574f", trim: "b3ae9f", trimDark: "8e897b", beam: "4a3a2c", shutter: "6b4a2f", door: "4a3020" },
  timber:  { wall: "ece1c8", dark: "d7c9aa", light: "f4ecda", mortar: "c7b995", trim: "cfc4ad", trimDark: "a99f88", beam: "3f2a1c", shutter: "7a2f2a", door: "4a2c1a" },
};
const ROOFS: Record<RoofStyle, { roof: string; dark: string; light: string; ridge: string }> = {
  tile:    { roof: "a84c37", dark: "7f3727", light: "c0644b", ridge: "8f3f2d" },
  slate:   { roof: "4f5865", dark: "363d47", light: "66707e", ridge: "2e343c" },
  thatch:  { roof: "b39154", dark: "86693a", light: "caa96a", ridge: "7a5f33" },
  shingle: { roof: "6e5a48", dark: "4b3d30", light: "85705b", ridge: "3d3127" },
};

/**
 * Default role colours for a wall style and a roof covering: walls, mortar, trim, timber, shutters
 * and door from the wall style, the roof tones and ridge from the covering, and shared glass,
 * chimney, foundation, moss and flower colours.
 */
export function skinFor(wall: WallStyle, roof: RoofStyle): ColorSet {
  const w = WALLS[wall] ?? WALLS.plaster;
  const r = ROOFS[roof] ?? ROOFS.tile;
  return {
    [ROLE.WALL]: hex(w.wall), [ROLE.WALL_DARK]: hex(w.dark), [ROLE.WALL_LIGHT]: hex(w.light),
    [ROLE.MORTAR]: hex(w.mortar), [ROLE.BRICK_EXPOSED]: hex("9a5440"),
    [ROLE.TRIM]: hex(w.trim), [ROLE.TRIM_DARK]: hex(w.trimDark), [ROLE.BEAM]: hex(w.beam),
    [ROLE.GLASS]: hex("7f9fb4"), [ROLE.GLASS_LIT]: hex("ffd27a"), [ROLE.FRAME]: hex("efe9dc"),
    [ROLE.DOOR]: hex(w.door), [ROLE.DOOR_DARK]: hex(w.door).map((c) => c * 0.72) as [number, number, number],
    [ROLE.HANDLE]: hex("c9a646"),
    [ROLE.SHUTTER]: hex(w.shutter), [ROLE.SHUTTER_DARK]: hex(w.shutter).map((c) => c * 0.75) as [number, number, number],
    [ROLE.ROOF]: hex(r.roof), [ROLE.ROOF_DARK]: hex(r.dark), [ROLE.ROOF_LIGHT]: hex(r.light), [ROLE.RIDGE]: hex(r.ridge),
    [ROLE.CHIMNEY]: hex("8e4a38"), [ROLE.CHIMNEY_DARK]: hex("6c3629"), [ROLE.SOOT]: hex("211d1b"), [ROLE.POT]: hex("b0603f"),
    [ROLE.FOUNDATION]: hex("7a776f"), [ROLE.FOUNDATION_DARK]: hex("5c5a53"),
    [ROLE.FLOOR]: hex("8c6b48"), [ROLE.MOSS]: hex("5f8a3a"), [ROLE.GUTTER]: hex("3a3d40"),
    [ROLE.FLOWER_A]: hex("d8435a"), [ROLE.FLOWER_B]: hex("f2cf4a"), [ROLE.LEAF]: hex("4d7a34"),
  };
}

export const COTTAGE: BuildingParams = {
  species: "cottage",
  shape: { width: 78, depth: 50, storeys: 1, storeyHeight: 26, wallThickness: 3, plinth: 4, roof: "gable", roofPitch: 1, overhang: 3, chimneys: 1 },
  openings: {
    windowWidth: 9, windowHeight: 11, windowSpacing: 21, sillHeight: 8, windowFraction: 0.95,
    glazingBars: true, shutters: 0.7, flowerBoxes: 0.5, doorWidth: 10, doorHeight: 18, doorHood: false, gableWindows: true,
  },
  look: { wall: "plaster", roofStyle: "thatch", lit: 0.3, relief: true, spalling: 0.35, weathering: 0.5, moss: 0.35, quoins: false, gutters: false, beamSpacing: 14 },
};

const derive = (base: BuildingParams, species: string, patch: (p: BuildingParams) => void): BuildingParams => {
  const p: BuildingParams = JSON.parse(JSON.stringify(base));
  p.species = species;
  patch(p);
  return p;
};

export const FARMHOUSE: BuildingParams = derive(COTTAGE, "farmhouse", (p) => {
  p.shape.width = 100; p.shape.depth = 56; p.shape.storeys = 2; p.shape.storeyHeight = 24; p.shape.roofPitch = 1; p.shape.chimneys = 2;
  p.openings.shutters = 0.2; p.openings.flowerBoxes = 0.3; p.openings.doorHood = true;
  p.look.wall = "timber"; p.look.roofStyle = "tile"; p.look.gutters = true; p.look.moss = 0.25; p.look.spalling = 0;
});

export const TOWNHOUSE: BuildingParams = derive(COTTAGE, "townhouse", (p) => {
  p.shape.width = 58; p.shape.depth = 62; p.shape.storeys = 3; p.shape.storeyHeight = 23; p.shape.roof = "flat"; p.shape.overhang = 0; p.shape.plinth = 5; p.shape.chimneys = 1;
  p.openings.windowWidth = 8; p.openings.windowHeight = 13; p.openings.windowSpacing = 15; p.openings.sillHeight = 7;
  p.openings.shutters = 0; p.openings.flowerBoxes = 0.25; p.openings.doorHood = true; p.openings.doorHeight = 17; p.openings.gableWindows = false;
  p.look.wall = "brick"; p.look.roofStyle = "slate"; p.look.quoins = true; p.look.lit = 0.45; p.look.moss = 0; p.look.spalling = 0; p.look.gutters = false;
});

export const TOWER: BuildingParams = derive(COTTAGE, "tower", (p) => {
  p.shape.width = 38; p.shape.depth = 38; p.shape.storeys = 4; p.shape.storeyHeight = 22; p.shape.roof = "hip"; p.shape.roofPitch = 0.65; p.shape.overhang = 2; p.shape.chimneys = 0; p.shape.plinth = 3;
  p.openings.windowWidth = 5; p.openings.windowHeight = 10; p.openings.windowSpacing = 14; p.openings.windowFraction = 0.8;
  p.openings.glazingBars = false; p.openings.shutters = 0; p.openings.flowerBoxes = 0;
  p.look.wall = "stone"; p.look.roofStyle = "slate"; p.look.quoins = true; p.look.weathering = 0.7; p.look.moss = 0.45; p.look.lit = 0.2; p.look.spalling = 0;
});

export const BARN: BuildingParams = derive(COTTAGE, "barn", (p) => {
  p.shape.width = 118; p.shape.depth = 66; p.shape.storeys = 2; p.shape.storeyHeight = 22; p.shape.roofPitch = 0.85; p.shape.overhang = 2; p.shape.chimneys = 0; p.shape.plinth = 2;
  p.openings.windowWidth = 6; p.openings.windowHeight = 6; p.openings.windowSpacing = 26; p.openings.windowFraction = 0.6; p.openings.glazingBars = false;
  p.openings.shutters = 0.5; p.openings.flowerBoxes = 0; p.openings.doorWidth = 18; p.openings.doorHeight = 22;
  p.look.wall = "timber"; p.look.roofStyle = "shingle"; p.look.beamSpacing = 12; p.look.lit = 0; p.look.weathering = 0.7; p.look.spalling = 0; p.look.gutters = true;
});

/**
 * Tuned buildings by name: `cottage`, `farmhouse`, `townhouse`, `tower` and `barn`. Each is a
 * complete {@link BuildingParams}; clone before editing (see {@link cloneParams}).
 */
export const PRESETS: Record<string, BuildingParams> = { cottage: COTTAGE, farmhouse: FARMHOUSE, townhouse: TOWNHOUSE, tower: TOWER, barn: BARN };
/** The keys of {@link PRESETS}, in declaration order. */
export const PRESET_NAMES = Object.keys(PRESETS);
