// Ground-cover presets and colour skins.
//
// Numbers are tuned for a 24-voxel patch; anything in voxels scales with
// `shape.height`.

import { hex, ROLE, type ColorSet } from "./roles";
import type { GrassParams, Season } from "./params";

interface Skin {
  blades: Record<Season, { lo: string; mid: string; hi: string }>;
  dry: string;
  stalk: string;
  seed: string;
  flowerA: string;
  flowerB: string;
  flowerC: string;
}

const MEADOW_GREEN = {
  spring: { lo: "3f6b24", mid: "5f9433", hi: "8bc255" },
  summer: { lo: "355a1e", mid: "548a2c", hi: "7cb342" },
  autumn: { lo: "4a5320", mid: "7a7a2c", hi: "b09a42" },
  winter: { lo: "3a4230", mid: "555c3f", hi: "757a5a" },
};

const SKINS: Record<string, Skin> = {
  grass: {
    blades: MEADOW_GREEN,
    dry: "b8a05a", stalk: "6d8a3a", seed: "c8b46a",
    flowerA: "f2e06a", flowerB: "f0f0e2", flowerC: "d86a9a",
  },
  meadow: {
    blades: MEADOW_GREEN,
    dry: "c4ab60", stalk: "6d8a3a", seed: "d2bd74",
    flowerA: "f4d842", flowerB: "f6f2e8", flowerC: "b45ad0",
  },
  reeds: {
    blades: {
      spring: { lo: "44662c", mid: "6a8f3c", hi: "97b85c" },
      summer: { lo: "3d5f28", mid: "628535", hi: "8fae52" },
      autumn: { lo: "6a6330", mid: "9a8c40", hi: "c4b061" },
      winter: { lo: "5a5638", mid: "7c7450", hi: "9c9470" },
    },
    dry: "c2ad70", stalk: "7a8f45", seed: "8a6f42",
    flowerA: "cbb07a", flowerB: "e2d4ae", flowerC: "9a7a4a",
  },
  fern: {
    blades: {
      spring: { lo: "2f5a24", mid: "477f2f", hi: "6aa544" },
      summer: { lo: "27481d", mid: "3c6b28", hi: "5c9140" },
      autumn: { lo: "4f5222", mid: "78762f", hi: "a39547" },
      winter: { lo: "37402c", mid: "4e573a", hi: "6b7355" },
    },
    dry: "a8904e", stalk: "3f6b28", seed: "8a7a4a",
    flowerA: "cfe08a", flowerB: "e8f0c0", flowerC: "9fbf6a",
  },
  dry: {
    blades: {
      spring: { lo: "8a7a3c", mid: "b09a4e", hi: "d2bc6a" },
      summer: { lo: "8f7d3a", mid: "b8a052", hi: "dcc470" },
      autumn: { lo: "7e6c30", mid: "a89246", hi: "cdb460" },
      winter: { lo: "6e6236", mid: "8e8250", hi: "ada070" },
    },
    dry: "d8c684", stalk: "9c8a48", seed: "c2ac66",
    flowerA: "e8dca0", flowerB: "f2ecd0", flowerC: "c8a870",
  },
};

export function skinFor(species: string, season: Season): ColorSet {
  const s = SKINS[species] ?? SKINS.grass;
  const b = s.blades[season];
  return {
    [ROLE.BLADE_LO]: hex(b.lo),
    [ROLE.BLADE_MID]: hex(b.mid),
    [ROLE.BLADE_HI]: hex(b.hi),
    [ROLE.BLADE_DRY]: hex(s.dry),
    [ROLE.STALK]: hex(s.stalk),
    [ROLE.SEED]: hex(s.seed),
    [ROLE.FLOWER_A]: hex(s.flowerA),
    [ROLE.FLOWER_B]: hex(s.flowerB),
    [ROLE.FLOWER_C]: hex(s.flowerC),
    [ROLE.SNOW]: hex("eef3f7"),
  };
}

export const GRASS: GrassParams = {
  species: "grass",
  shape: {
    height: 24,
    footprint: 11,
    tufts: [14, 22],
    bladesPerTuft: [7, 14],
    tuftSpread: 1.6,
    fanDeg: 13,
    fanVarDeg: 9,
    lengthVar: 0.3,
    lengthMin: 0.45,
    radius: 0.6,
    taperExp: 0.9,
    arc: 0.012,
    curl: 0.05,
    segLen: 1.4,
    levels: [],
  },
  look: {
    season: "summer",
    dry: 0.1,
    flowers: 0,
    flowerRadius: 1.4,
    seedHeads: 0,
    seedLength: 4,
    snow: 0.5,
  },
};

const derive = (base: GrassParams, species: string, patch: (p: GrassParams) => void): GrassParams => {
  const p: GrassParams = JSON.parse(JSON.stringify(base));
  p.species = species;
  patch(p);
  return p;
};

export const MEADOW: GrassParams = derive(GRASS, "meadow", (p) => {
  p.shape.height = 30;
  p.shape.footprint = 15;
  p.shape.tufts = [18, 28];
  p.shape.fanDeg = 16;
  p.shape.arc = 0.014;
  p.look.flowers = 0.14;
  p.look.dry = 0.08;
});

export const REEDS: GrassParams = derive(GRASS, "reeds", (p) => {
  // Tall, upright, barely fanned, with seed heads on top.
  p.shape.height = 56;
  p.shape.footprint = 14;
  p.shape.tufts = [10, 16];
  p.shape.tufts = [12, 18];
  p.shape.bladesPerTuft = [8, 14];
  p.shape.fanDeg = 7;
  p.shape.fanVarDeg = 5;
  p.shape.arc = 0.004;
  p.shape.radius = 0.65;
  p.shape.segLen = 2;
  p.look.seedHeads = 0.3;
  p.look.seedLength = 7;
  p.look.dry = 0.18;
});

export const FERN: GrassParams = derive(GRASS, "fern", (p) => {
  // Fronds: a strongly arching midrib carrying leaflets down both sides.
  p.shape.height = 34;
  p.shape.footprint = 12;
  p.shape.tufts = [5, 8];
  p.shape.bladesPerTuft = [5, 9];
  p.shape.fanDeg = 30;
  p.shape.fanVarDeg = 10;
  p.shape.arc = 0.009;
  p.shape.radius = 0.7;
  p.shape.segLen = 1.6;
  p.shape.levels = [
    { count: [14, 20], lenRatio: 0.26, lenVar: 0.25, downDeg: 78, downVarDeg: 8, segLen: 1.1, gravity: 0.006, photo: 0, curl: 0.02 },
  ];
});

export const DRY: GrassParams = derive(GRASS, "dry", (p) => {
  p.shape.height = 22;
  p.shape.arc = 0.032;
  p.shape.fanDeg = 22;
  p.look.dry = 0.75;
  p.look.seedHeads = 0.2;
  p.look.seedLength = 3;
});

export const PRESETS: Record<string, GrassParams> = { grass: GRASS, meadow: MEADOW, reeds: REEDS, fern: FERN, dry: DRY };
export const PRESET_NAMES = Object.keys(PRESETS);
