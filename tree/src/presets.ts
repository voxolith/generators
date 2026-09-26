// Species presets: parameters and colour skins.
//
// Numbers are tuned for a 192-voxel tree. Anything measured in voxels is
// scaled by height/192 at generation time, so a preset works at other sizes.

import { hex, ROLE, type ColorSet } from "./roles";
import type { Season, TreeParams } from "./params";

// --- colour ---------------------------------------------------------------

interface Skin {
  heart: string;
  barkDark: string;
  barkMid: string;
  barkLight: string;
  moss: string;
  crevice: string;
  twig: string;
  twigDark: string;
  leaves: Record<Season, { hi: string; mid: string; lo: string; edge: string; accent: string }>;
  dead: string;
  blossom: string;
  cone: string;
}

const GREEN = {
  spring: { hi: "a5d16a", mid: "8cc04f", lo: "63933a", edge: "c3e08a", accent: "e2eea4" },
  summer: { hi: "7cb342", mid: "5a9130", lo: "3d6b22", edge: "9ccc55", accent: "8bc34a" },
  autumn: { hi: "e0902b", mid: "c2651e", lo: "8e4116", edge: "f0b452", accent: "d94f2a" },
  winter: { hi: "6b7a55", mid: "515f3f", lo: "3a452c", edge: "7d8c63", accent: "6b7a55" },
};

const SKINS: Record<string, Skin> = {
  oak: {
    heart: "c9a86f", barkDark: "3c2f22", barkMid: "5b4632", barkLight: "7d6448",
    moss: "5c7a3f", crevice: "2a2018", twig: "6b5236", twigDark: "4a3826",
    leaves: GREEN, dead: "8a7a3a", blossom: "f5e6c8", cone: "4a3826",
  },
  maple: {
    heart: "d6b982", barkDark: "43342a", barkMid: "63503f", barkLight: "88705a",
    moss: "5c7a3f", crevice: "2e231c", twig: "725a3e", twigDark: "503d2a",
    leaves: {
      ...GREEN,
      autumn: { hi: "f05a2a", mid: "cf2f1f", lo: "8f1d16", edge: "ff8a3d", accent: "ffc23d" },
    },
    dead: "8a6a32", blossom: "f0d0d8", cone: "503d2a",
  },
  birch: {
    heart: "e8dcc0", barkDark: "2a2a28", barkMid: "d8d4c8", barkLight: "f4f1e8",
    moss: "6a7a4a", crevice: "6a665c", twig: "8a7d62", twigDark: "5f5542",
    leaves: {
      ...GREEN,
      summer: { hi: "9ccc55", mid: "7cb342", lo: "55832c", edge: "bde07a", accent: "a8d65e" },
      autumn: { hi: "f2c744", mid: "d9a12b", lo: "9c6e1c", edge: "ffe27a", accent: "e8b93a" },
    },
    dead: "a08a48", blossom: "eef0d8", cone: "5f5542",
  },
  spruce: {
    heart: "c49a72", barkDark: "3a2620", barkMid: "5a3a2c", barkLight: "7a5240",
    moss: "4e7040", crevice: "26190f", twig: "5a4030", twigDark: "3e2c20",
    leaves: {
      spring: { hi: "6fa06a", mid: "4e7d50", lo: "31593a", edge: "8fbb84", accent: "a3c98f" },
      summer: { hi: "4e7d5a", mid: "36613f", lo: "24452c", edge: "6d9a70", accent: "7fb08a" },
      autumn: { hi: "4a7452", mid: "33593a", lo: "223f28", edge: "68906a", accent: "769f7e" },
      winter: { hi: "3f6a4c", mid: "2b5034", lo: "1c3a24", edge: "5c8460", accent: "6a9074" },
    },
    dead: "6a5a3a", blossom: "e8eef0", cone: "4a3020",
  },
  pine: {
    heart: "d9ab74", barkDark: "5a3320", barkMid: "8a5330", barkLight: "b07a4a",
    moss: "5c7a3f", crevice: "3a2014", twig: "6e4a2e", twigDark: "4e3420",
    leaves: {
      spring: { hi: "94b555", mid: "6f9240", lo: "4c6b28", edge: "b2ce74", accent: "c4da88" },
      summer: { hi: "7d9c4a", mid: "5e7d35", lo: "415a22", edge: "9cb861", accent: "aac66e" },
      autumn: { hi: "78944a", mid: "5a7736", lo: "3e5624", edge: "96b060", accent: "a4bd6b" },
      winter: { hi: "62834a", mid: "466433", lo: "2f4722", edge: "7d9a5e", accent: "88a468" },
    },
    dead: "7a6636", blossom: "eaddc0", cone: "43301e",
  },
};

/**
 * Default role colours for a species in a season: bark, twigs, and that season's leaves,
 * blossom and snow. Unknown species fall back to oak.
 */
export function skinFor(species: string, season: Season): ColorSet {
  const s = SKINS[species] ?? SKINS.oak;
  const l = s.leaves[season];
  return {
    [ROLE.HEART]: hex(s.heart),
    [ROLE.BARK_DARK]: hex(s.barkDark),
    [ROLE.BARK_MID]: hex(s.barkMid),
    [ROLE.BARK_LIGHT]: hex(s.barkLight),
    [ROLE.MOSS]: hex(s.moss),
    [ROLE.CREVICE]: hex(s.crevice),
    [ROLE.TWIG]: hex(s.twig),
    [ROLE.TWIG_DARK]: hex(s.twigDark),
    [ROLE.LEAF_HI]: hex(l.hi),
    [ROLE.LEAF_MID]: hex(l.mid),
    [ROLE.LEAF_LO]: hex(l.lo),
    [ROLE.LEAF_EDGE]: hex(l.edge),
    [ROLE.LEAF_ACCENT]: hex(l.accent),
    [ROLE.LEAF_DEAD]: hex(s.dead),
    [ROLE.BLOSSOM]: hex(s.blossom),
    [ROLE.SNOW]: hex("eef3f7"),
    [ROLE.CONE]: hex(s.cone),
  };
}

// --- parameters -----------------------------------------------------------

export const OAK: TreeParams = {
  species: "oak",
  shape: {
    kind: "broadleaf",
    height: 192,
    trunk: {
      lengthRatio: 0.75,
      radiusRatio: 0.034,
      taperExp: 0.55,
      leanDeg: 3,
      sweepDeg: 7,
      curl: 0.008,
      flareHeightRatio: 0.1,
      flareGain: 0.85,
      flareLobes: 5,
      roots: 5,
      segLen: 4,
    },
    crownStartRatio: 0.38,
    crownEndRatio: 1,
    envelope: "mid",
    azimuthJitterDeg: 22,
    whorl: 0,
    whorlSpacingRatio: 0,
    pipeExp: 2.2,
    branchTaper: 0.7,
    minRadius: 0.22,
    levels: [
      { count: [5, 8], lenRatio: 0.46, lenVar: 0.3, downDeg: 58, downVarDeg: 16, segLen: 3, gravity: 0.003, photo: 0.004, curl: 0.03 },
      { count: [4, 6], lenRatio: 0.58, lenVar: 0.32, downDeg: 52, downVarDeg: 18, segLen: 2.5, gravity: 0.004, photo: 0.008, curl: 0.04 },
      { count: [5, 7], lenRatio: 0.56, lenVar: 0.32, downDeg: 46, downVarDeg: 20, segLen: 2, gravity: 0.005, photo: 0.012, curl: 0.05 },
      { count: [6, 9], lenRatio: 0.55, lenVar: 0.35, downDeg: 42, downVarDeg: 24, segLen: 1.5, gravity: 0.006, photo: 0.016, curl: 0.06 },
    ],
  },
  foliage: {
    enabled: true,
    clusterRadius: 6,
    clusterFlatten: 0.62,
    spacing: 2.5,
    tipBoost: 1.2,
    fillCore: 0.3,
    fillRim: 0.66,
    shellDepth: 14,
    macroScale: 0.045,
    macroThreshold: 0.25,
    sheathRadius: 2.6,
    sheathFill: 0.45,
    coneExp: 1.05,
    crownRadiusRatio: 0.26,
    whorlGap: 2,
  },
  look: {
    season: "summer",
    age: 0.6,
    health: 0.9,
    furrowWavelength: 5,
    furrowContrast: 0.2,
    plateWarp: 0.3,
    minRadiusForPattern: 2,
    moss: 0.25,
    mossAzimuthDeg: 200,
    creviceAo: true,
    accentFraction: 0.06,
    snow: 0.6,
    blossom: 0.18,
  },
};

const derive = (base: TreeParams, species: string, patch: (p: TreeParams) => void): TreeParams => {
  const p: TreeParams = JSON.parse(JSON.stringify(base));
  p.species = species;
  patch(p);
  return p;
};

export const MAPLE: TreeParams = derive(OAK, "maple", (p) => {
  p.shape.trunk.radiusRatio = 0.028;
  p.shape.trunk.taperExp = 0.7;
  p.shape.crownStartRatio = 0.34;
  p.shape.levels[0].downDeg = 48;
  p.shape.levels[0].count = [4, 6];
  p.shape.levels[1].downDeg = 42;
  p.foliage.clusterRadius = 5.6;
  p.foliage.shellDepth = 12;
  p.look.plateWarp = 0.18;
  p.look.furrowWavelength = 4;
});

export const BIRCH: TreeParams = derive(OAK, "birch", (p) => {
  p.shape.trunk.radiusRatio = 0.024;
  p.shape.trunk.lengthRatio = 0.8;
  p.shape.trunk.taperExp = 0.8;
  p.shape.trunk.flareGain = 0.4;
  p.shape.trunk.leanDeg = 5;
  p.shape.trunk.sweepDeg = 10;
  p.shape.crownStartRatio = 0.42;
  p.shape.levels[0].count = [4, 6];
  p.shape.levels[0].downDeg = 42;
  p.shape.levels[1].gravity = 0.016;
  p.shape.levels[2].gravity = 0.022;
  p.shape.levels[3].gravity = 0.03; // drooping outer twigs
  p.foliage.clusterRadius = 4.4;
  p.foliage.shellDepth = 9;
  p.foliage.macroThreshold = 0.22;
  // Birch bark is smooth with dark lenticel marks, not furrowed.
  p.look.plateWarp = 0;
  p.look.furrowWavelength = 3;
  p.look.furrowContrast = 0.5;
  p.look.moss = 0.05;
});

export const SPRUCE: TreeParams = derive(OAK, "spruce", (p) => {
  p.shape.kind = "conifer";
  p.shape.trunk.lengthRatio = 0.98;
  p.shape.trunk.radiusRatio = 0.021;
  p.shape.trunk.taperExp = 1;
  p.shape.trunk.leanDeg = 1.5;
  p.shape.trunk.sweepDeg = 3;
  p.shape.trunk.curl = 0.006;
  p.shape.trunk.flareHeightRatio = 0.08;
  p.shape.trunk.flareGain = 0.55;
  p.shape.trunk.roots = 4;
  p.shape.crownStartRatio = 0.09;
  p.shape.crownEndRatio = 0.97;
  p.shape.envelope = "taper";
  p.shape.whorl = 6;
  p.shape.whorlSpacingRatio = 0.035;
  p.shape.azimuthJitterDeg = 18;
  p.shape.pipeExp = 2.8;
  p.shape.levels = [
    { count: [0, 0], lenRatio: 0.26, lenVar: 0.18, downDeg: 78, downVarDeg: 8, segLen: 2.5, gravity: 0.012, photo: 0.01, curl: 0.02 },
    { count: [4, 7], lenRatio: 0.42, lenVar: 0.3, downDeg: 50, downVarDeg: 18, segLen: 1.8, gravity: 0.016, photo: 0.018, curl: 0.03 },
  ];
  p.foliage.sheathRadius = 2.6;
  p.foliage.sheathFill = 0.45;
  p.foliage.coneExp = 1.05;
  p.foliage.crownRadiusRatio = 0.26;
  p.foliage.whorlGap = 2;
  p.foliage.shellDepth = 0; // the cone envelope already hollows it
  p.foliage.macroThreshold = 0.22;
  p.look.furrowWavelength = 4;
  p.look.plateWarp = 0.12;
  p.look.minRadiusForPattern = 2.2;
});

export const PINE: TreeParams = derive(SPRUCE, "pine", (p) => {
  p.shape.trunk.radiusRatio = 0.03;
  p.shape.trunk.taperExp = 0.8;
  p.shape.trunk.leanDeg = 4;
  p.shape.trunk.sweepDeg = 8;
  p.shape.crownStartRatio = 0.55;
  p.shape.whorl = 5;
  p.shape.whorlSpacingRatio = 0.06;
  p.shape.levels[0].lenRatio = 0.3;
  p.shape.levels[0].downDeg = 68;
  p.shape.levels[0].photo = 0.02;
  p.shape.levels[1].count = [3, 5];
  p.foliage.sheathRadius = 3;
  p.foliage.coneExp = 0.55;
  p.foliage.crownRadiusRatio = 0.3;
  p.foliage.whorlGap = 3;
  p.look.furrowWavelength = 6;
  p.look.plateWarp = 0.35;
});

/**
 * Tuned species by name: broadleaf `oak`, `maple` and `birch`, conifer `spruce` and `pine`. Each is
 * a complete {@link TreeParams}; clone before editing (see {@link cloneParams}).
 */
export const PRESETS: Record<string, TreeParams> = { oak: OAK, maple: MAPLE, birch: BIRCH, spruce: SPRUCE, pine: PINE };
/** The keys of {@link PRESETS}, in declaration order. */
export const PRESET_NAMES = Object.keys(PRESETS);
