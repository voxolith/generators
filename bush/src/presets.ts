// Shrub presets and colour skins.
//
// Numbers are tuned for a 64-voxel bush; anything measured in voxels scales
// with `shape.height`.

import { hex, ROLE, type ColorSet } from "./roles";
import type { BushParams, Season } from "./params";

interface Skin {
  stemDark: string;
  stemMid: string;
  stemLight: string;
  twig: string;
  twigDark: string;
  thorn: string;
  leaves: Record<Season, { hi: string; mid: string; lo: string; edge: string; accent: string }>;
  dead: string;
  blossom: string;
  berry: string;
}

const GREEN = {
  spring: { hi: "9fd063", mid: "7cb342", lo: "4f7d2c", edge: "bade86", accent: "d6e88f" },
  summer: { hi: "6fa83a", mid: "4f8429", lo: "35601c", edge: "8dc352", accent: "7ab846" },
  autumn: { hi: "d4922f", mid: "b06322", lo: "7d3f18", edge: "e8b055", accent: "c4432a" },
  winter: { hi: "5d6b4a", mid: "475338", lo: "313b27", edge: "6e7d58", accent: "5d6b4a" },
};

const SKINS: Record<string, Skin> = {
  bush: {
    stemDark: "3a2c20", stemMid: "56412e", stemLight: "72583f",
    twig: "6b5236", twigDark: "473524", thorn: "8a7052",
    leaves: GREEN, dead: "7d6c34", blossom: "f2e8d0", berry: "9c2b3a",
  },
  thicket: {
    stemDark: "332619", stemMid: "4b3826", stemLight: "664c34",
    twig: "5e472e", twigDark: "3d2d1d", thorn: "7d6446",
    leaves: GREEN, dead: "6f5f2e", blossom: "e9e2c8", berry: "7d2030",
  },
  bramble: {
    stemDark: "2e2a22", stemMid: "46402f", stemLight: "5d5440",
    twig: "5a4a34", twigDark: "382e20", thorn: "c9b48a",
    leaves: {
      ...GREEN,
      summer: { hi: "5f8f36", mid: "436a24", lo: "2c4818", edge: "7fae4c", accent: "6b9c3e" },
    },
    dead: "6a5a2c", blossom: "f0ecdc", berry: "2a1030",
  },
  flowering: {
    stemDark: "3d3226", stemMid: "5a4a36", stemLight: "776248",
    twig: "70573a", twigDark: "4c3b28", thorn: "8a7052",
    leaves: {
      ...GREEN,
      spring: { hi: "8fc257", mid: "6ba13a", lo: "487226", edge: "abd576", accent: "c6e493" },
    },
    dead: "80702f", blossom: "f0a8c8", berry: "d94f74",
  },
  hedge: {
    stemDark: "35291d", stemMid: "4e3c2a", stemLight: "685139",
    twig: "5d4730", twigDark: "3b2c1e", thorn: "7d6446",
    leaves: {
      ...GREEN,
      summer: { hi: "5c9433", mid: "407022", lo: "2a4d16", edge: "77ab48", accent: "68a03c" },
    },
    dead: "6f5f2e", blossom: "e8ecd8", berry: "8a2434",
  },
};

export function skinFor(species: string, season: Season): ColorSet {
  const s = SKINS[species] ?? SKINS.bush;
  const l = s.leaves[season];
  return {
    [ROLE.STEM_DARK]: hex(s.stemDark),
    [ROLE.STEM_MID]: hex(s.stemMid),
    [ROLE.STEM_LIGHT]: hex(s.stemLight),
    [ROLE.TWIG]: hex(s.twig),
    [ROLE.TWIG_DARK]: hex(s.twigDark),
    [ROLE.THORN]: hex(s.thorn),
    [ROLE.LEAF_HI]: hex(l.hi),
    [ROLE.LEAF_MID]: hex(l.mid),
    [ROLE.LEAF_LO]: hex(l.lo),
    [ROLE.LEAF_EDGE]: hex(l.edge),
    [ROLE.LEAF_ACCENT]: hex(l.accent),
    [ROLE.LEAF_DEAD]: hex(s.dead),
    [ROLE.BLOSSOM]: hex(s.blossom),
    [ROLE.BERRY]: hex(s.berry),
    [ROLE.SNOW]: hex("eef3f7"),
  };
}

export const BUSH: BushParams = {
  species: "bush",
  shape: {
    height: 64,
    stems: [5, 9],
    baseSpreadRatio: 0.05,
    leanDeg: 22,
    leanVarDeg: 12,
    lengthRatio: 0.82,
    lengthVar: 0.28,
    radiusRatio: 0.022,
    taperExp: 0.65,
    curl: 0.06,
    sweepDeg: 10,
    segLen: 2.2,
    childStart: 0.25,
    childEnd: 0.95,
    azimuthJitterDeg: 28,
    pipeExp: 2.2,
    branchTaper: 0.7,
    minRadius: 0.22,
    clumps: 0,
    clumpSpreadRatio: 0,
    levels: [
      { count: [3, 5], lenRatio: 0.55, lenVar: 0.32, downDeg: 48, downVarDeg: 20, segLen: 1.8, gravity: 0.006, photo: 0.01, curl: 0.06 },
      { count: [3, 6], lenRatio: 0.55, lenVar: 0.35, downDeg: 44, downVarDeg: 24, segLen: 1.4, gravity: 0.008, photo: 0.016, curl: 0.07 },
    ],
  },
  foliage: {
    enabled: true,
    clusterRadius: 3.6,
    clusterFlatten: 0.8,
    spacing: 1.8,
    tipBoost: 1.25,
    fillCore: 0.28,
    fillRim: 0.62,
    shellDepth: 7,
    macroScale: 0.1,
    macroThreshold: 0.2,
    density: 1,
  },
  look: {
    season: "summer",
    health: 0.92,
    accentFraction: 0.06,
    berryFraction: 0,
    blossom: 0.2,
    snow: 0.55,
    thorns: 0,
    minRadiusForPattern: 1.1,
  },
};

const derive = (base: BushParams, species: string, patch: (p: BushParams) => void): BushParams => {
  const p: BushParams = JSON.parse(JSON.stringify(base));
  p.species = species;
  patch(p);
  return p;
};

export const THICKET: BushParams = derive(BUSH, "thicket", (p) => {
  // Several clumps of stems, staggered, so the mass reads as undergrowth
  // rather than as one tidy shrub.
  p.shape.clumps = 4;
  p.shape.clumpSpreadRatio = 0.55;
  p.shape.stems = [4, 7];
  p.shape.height = 56;
  p.shape.leanDeg = 28;
  p.shape.lengthVar = 0.38;
  p.foliage.clusterRadius = 3.2;
  p.foliage.shellDepth = 6;
});

export const BRAMBLE: BushParams = derive(BUSH, "bramble", (p) => {
  // Long arching canes that fall back toward the ground, sparse leaves, thorns.
  p.shape.stems = [6, 11];
  p.shape.leanDeg = 34;
  p.shape.leanVarDeg = 18;
  p.shape.lengthRatio = 1.05;
  p.shape.radiusRatio = 0.013;
  p.shape.curl = 0.1;
  p.shape.levels[0].gravity = 0.026;
  p.shape.levels[0].photo = 0.002;
  p.shape.levels[1].gravity = 0.03;
  p.shape.levels[1].photo = 0.002;
  p.foliage.clusterRadius = 2.6;
  p.foliage.density = 0.62;
  p.foliage.macroThreshold = 0.3;
  p.look.thorns = 0.22;
  p.look.berryFraction = 0.12;
});

export const FLOWERING: BushParams = derive(BUSH, "flowering", (p) => {
  p.shape.stems = [6, 10];
  p.shape.leanDeg = 18;
  p.foliage.clusterRadius = 3.4;
  p.foliage.fillRim = 0.58;
  p.look.blossom = 0.35;
  p.look.season = "spring";
});

export const HEDGE: BushParams = derive(BUSH, "hedge", (p) => {
  // Clipped: dense, low, wide, with almost no visible structure.
  p.shape.height = 48;
  p.shape.stems = [9, 14];
  p.shape.leanDeg = 12;
  p.shape.leanVarDeg = 6;
  p.shape.clumps = 2;
  p.shape.clumpSpreadRatio = 0.5;
  p.foliage.clusterRadius = 3.8;
  p.foliage.fillCore = 0.2;
  p.foliage.fillRim = 0.5;
  p.foliage.shellDepth = 5;
  p.foliage.macroThreshold = 0.08;
  p.look.accentFraction = 0.03;
});

export const PRESETS: Record<string, BushParams> = {
  bush: BUSH,
  thicket: THICKET,
  bramble: BRAMBLE,
  flowering: FLOWERING,
  hedge: HEDGE,
};
export const PRESET_NAMES = Object.keys(PRESETS);
