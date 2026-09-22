// Building presets and colour skins.

import { hex, ROLE, type ColorSet } from "./roles";
import type { BuildingParams, RoofStyle, WallStyle } from "./params";

const WALLS: Record<WallStyle, { wall: string; dark: string; trim: string; beam: string }> = {
  plaster: { wall: "e8dcc3", dark: "cbbc9d", trim: "d9c9a8", beam: "5a3e28" },
  brick:   { wall: "9d4f3a", dark: "7a3a2b", trim: "cfc4ad", beam: "4a3222" },
  stone:   { wall: "8d8a80", dark: "6b685f", trim: "aaa79c", beam: "4a3a2c" },
  timber:  { wall: "efe4cc", dark: "d6c8ab", trim: "efe4cc", beam: "4a3222" },
};
const ROOFS: Record<RoofStyle, { roof: string; dark: string; ridge: string }> = {
  tile:    { roof: "b0503a", dark: "7f3727", ridge: "c9694f" },
  slate:   { roof: "4f5865", dark: "363d47", ridge: "6a7482" },
  thatch:  { roof: "b9975a", dark: "8a6d3d", ridge: "d1af6e" },
  shingle: { roof: "6e5540", dark: "4b3a2c", ridge: "846851" },
};

export function skinFor(wall: WallStyle, roof: RoofStyle): ColorSet {
  const w = WALLS[wall] ?? WALLS.plaster;
  const r = ROOFS[roof] ?? ROOFS.tile;
  return {
    [ROLE.WALL]: hex(w.wall),
    [ROLE.WALL_DARK]: hex(w.dark),
    [ROLE.TRIM]: hex(w.trim),
    [ROLE.BEAM]: hex(w.beam),
    [ROLE.GLASS]: hex("8fb4c8"),
    [ROLE.GLASS_LIT]: hex("ffd27a"),
    [ROLE.FRAME]: hex("f4efe4"),
    [ROLE.DOOR]: hex("5b3a22"),
    [ROLE.ROOF]: hex(r.roof),
    [ROLE.ROOF_DARK]: hex(r.dark),
    [ROLE.RIDGE]: hex(r.ridge),
    [ROLE.CHIMNEY]: hex("8a6a5a"),
    [ROLE.SOOT]: hex("2a2624"),
    [ROLE.FOUNDATION]: hex("6f6d66"),
    [ROLE.FLOOR]: hex("8c6b48"),
    [ROLE.MOSS]: hex("5f8a3a"),
  };
}

export const COTTAGE: BuildingParams = {
  species: "cottage",
  shape: { width: 44, depth: 30, storeys: 1, storeyHeight: 14, wallThickness: 2, plinth: 2, roof: "gable", roofPitch: 1, overhang: 2, chimneys: 1 },
  openings: { windowWidth: 5, windowHeight: 6, windowSpacing: 12, sillHeight: 4, windowFraction: 0.9, doorWidth: 5, doorHeight: 9 },
  look: { wall: "plaster", roofStyle: "thatch", lit: 0.3, weathering: 0.4, moss: 0.25, quoins: false, beamSpacing: 9 },
};

const derive = (base: BuildingParams, species: string, patch: (p: BuildingParams) => void): BuildingParams => {
  const p: BuildingParams = JSON.parse(JSON.stringify(base));
  p.species = species;
  patch(p);
  return p;
};

export const FARMHOUSE: BuildingParams = derive(COTTAGE, "farmhouse", (p) => {
  p.shape.width = 56; p.shape.depth = 34; p.shape.storeys = 2; p.shape.roof = "gable"; p.shape.roofPitch = 1.1; p.shape.chimneys = 2;
  p.look.wall = "timber"; p.look.roofStyle = "tile"; p.look.beamSpacing = 8; p.look.weathering = 0.3;
});

export const TOWNHOUSE: BuildingParams = derive(COTTAGE, "townhouse", (p) => {
  p.shape.width = 36; p.shape.depth = 40; p.shape.storeys = 3; p.shape.storeyHeight = 13; p.shape.roof = "flat"; p.shape.overhang = 0; p.shape.plinth = 3; p.shape.chimneys = 1;
  p.openings.windowWidth = 5; p.openings.windowHeight = 7; p.openings.windowSpacing = 10;
  p.look.wall = "brick"; p.look.roofStyle = "slate"; p.look.quoins = true; p.look.lit = 0.45; p.look.moss = 0;
});

export const TOWER: BuildingParams = derive(COTTAGE, "tower", (p) => {
  p.shape.width = 22; p.shape.depth = 22; p.shape.storeys = 4; p.shape.storeyHeight = 12; p.shape.roof = "hip"; p.shape.roofPitch = 0.7; p.shape.overhang = 1; p.shape.chimneys = 0;
  p.openings.windowWidth = 3; p.openings.windowHeight = 6; p.openings.windowSpacing = 11; p.openings.windowFraction = 0.75;
  p.look.wall = "stone"; p.look.roofStyle = "slate"; p.look.quoins = true; p.look.weathering = 0.6; p.look.moss = 0.35; p.look.lit = 0.2;
});

export const BARN: BuildingParams = derive(COTTAGE, "barn", (p) => {
  p.shape.width = 70; p.shape.depth = 40; p.shape.storeys = 2; p.shape.storeyHeight = 12; p.shape.roof = "gable"; p.shape.roofPitch = 0.8; p.shape.overhang = 1; p.shape.chimneys = 0; p.shape.plinth = 1;
  p.openings.windowWidth = 4; p.openings.windowHeight = 4; p.openings.windowSpacing = 16; p.openings.windowFraction = 0.6; p.openings.doorWidth = 9; p.openings.doorHeight = 11;
  p.look.wall = "timber"; p.look.roofStyle = "shingle"; p.look.beamSpacing = 7; p.look.lit = 0; p.look.weathering = 0.5;
});

export const PRESETS: Record<string, BuildingParams> = { cottage: COTTAGE, farmhouse: FARMHOUSE, townhouse: TOWNHOUSE, tower: TOWER, barn: BARN };
export const PRESET_NAMES = Object.keys(PRESETS);
