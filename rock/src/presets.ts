// Rock presets and colour skins.

import { hex, ROLE, type ColorSet } from "./roles";
import type { RockParams } from "./params";

interface Skin {
  light: string; mid: string; dark: string; strata: string; crack: string;
}

const SKINS: Record<string, Skin> = {
  granite:   { light: "a8a8a0", mid: "7f7f7a", dark: "55554f", strata: "6b6560", crack: "2c2c29" },
  sandstone: { light: "d2a874", mid: "b98c58", dark: "946c40", strata: "c4956a", crack: "5c4126" },
  basalt:    { light: "6a6a70", mid: "434347", dark: "26262a", strata: "4a4a4f", crack: "0f0f12" },
  limestone: { light: "e2ddd0", mid: "bdb6a5", dark: "8f8773", strata: "cfc7b4", crack: "574f43" },
  slate:     { light: "6f7a86", mid: "525b66", dark: "3a414a", strata: "5e6873", crack: "22272d" },
};

export function skinFor(species: string): ColorSet {
  const s = SKINS[species] ?? SKINS.granite;
  return {
    [ROLE.ROCK_LIGHT]: hex(s.light),
    [ROLE.ROCK_MID]: hex(s.mid),
    [ROLE.ROCK_DARK]: hex(s.dark),
    [ROLE.STRATA]: hex(s.strata),
    [ROLE.CRACK]: hex(s.crack),
    [ROLE.MOSS]: hex("5f8a3a"),
    [ROLE.MOSS_DARK]: hex("3f6428"),
    [ROLE.LICHEN]: hex("b9c48a"),
    [ROLE.WET]: hex(s.crack).map((c) => c * 0.6 + hex(s.dark)[0] * 0.4) as [number, number, number],
    [ROLE.SNOW]: hex("eef3f7"),
  };
}

export const BOULDER: RockParams = {
  species: "granite",
  shape: {
    size: 48, aspect: 0.8, elongation: 0.85, exponent: 2.6,
    roughness: 0.08, detail: 1.6, grit: 0.3, facets: 9, facetDepth: 0.32,
    cluster: 0, clusterScale: 0.45, clusterScaleVar: 0.3, sink: 0.12,
  },
  look: {
    mottle: 0.5, strata: 0, strataTiltDeg: 0, strataContrast: 0.4,
    cracks: 0.25, moss: 0.35, lichen: 0.2, wet: 0.12, snow: 0,
  },
};

const derive = (base: RockParams, species: string, patch: (p: RockParams) => void): RockParams => {
  const p: RockParams = JSON.parse(JSON.stringify(base));
  p.species = species;
  patch(p);
  return p;
};

export const SANDSTONE: RockParams = derive(BOULDER, "sandstone", (p) => {
  // Bedded, blocky, weathered flat.
  p.shape.aspect = 0.55; p.shape.exponent = 4; p.shape.facets = 6; p.shape.roughness = 0.06; p.shape.detail = 2.4; p.shape.grit = 0.25;
  p.look.strata = 5; p.look.strataTiltDeg = 8; p.look.strataContrast = 0.5;
  p.look.moss = 0.05; p.look.lichen = 0.1; p.look.cracks = 0.15;
});

export const BASALT: RockParams = derive(BOULDER, "basalt", (p) => {
  // Angular, near-cubic, sharp edges, little life on it.
  p.shape.exponent = 3; p.shape.facets = 14; p.shape.facetDepth = 0.38; p.shape.roughness = 0.04; p.shape.grit = 0.15; p.shape.detail = 3; p.shape.aspect = 0.9;
  p.look.mottle = 0.3; p.look.cracks = 0.4; p.look.moss = 0.08; p.look.lichen = 0.15;
});

export const LIMESTONE: RockParams = derive(BOULDER, "limestone", (p) => {
  // Pale, pitted, heavily cracked.
  p.shape.roughness = 0.14; p.shape.detail = 2.8; p.shape.exponent = 2.2; p.shape.facets = 8; p.shape.grit = 0.6;
  p.look.cracks = 0.55; p.look.mottle = 0.35; p.look.moss = 0.2; p.look.lichen = 0.35;
});

export const MOSSY: RockParams = derive(BOULDER, "granite", (p) => {
  p.shape.aspect = 0.7; p.shape.roughness = 0.1; p.shape.facets = 5; p.shape.facetDepth = 0.22;
  p.look.moss = 0.85; p.look.lichen = 0.3; p.look.wet = 0.25;
});

export const OUTCROP: RockParams = derive(BOULDER, "slate", (p) => {
  // A main mass with several smaller rocks tumbled against it.
  p.shape.size = 64; p.shape.aspect = 0.6; p.shape.elongation = 0.7; p.shape.exponent = 3.2;
  p.shape.cluster = 5; p.shape.clusterScale = 0.42; p.shape.clusterScaleVar = 0.4; p.shape.facets = 11;
  p.look.strata = 7; p.look.strataTiltDeg = 22; p.look.strataContrast = 0.45; p.look.moss = 0.3;
});

export const PEBBLES: RockParams = derive(BOULDER, "granite", (p) => {
  p.shape.size = 22; p.shape.aspect = 0.65; p.shape.cluster = 7; p.shape.clusterScale = 0.7;
  p.shape.clusterScaleVar = 0.4; p.shape.roughness = 0.1; p.shape.sink = 0.2; p.shape.facets = 0; p.shape.grit = 0.5;
  p.look.moss = 0.15; p.look.lichen = 0.1; p.look.cracks = 0.1;
});

export const PRESETS: Record<string, RockParams> = {
  boulder: BOULDER, sandstone: SANDSTONE, basalt: BASALT, limestone: LIMESTONE,
  mossy: MOSSY, outcrop: OUTCROP, pebbles: PEBBLES,
};
export const PRESET_NAMES = Object.keys(PRESETS);
