// Tunables.
//
// Split deliberately: `shape` and `foliage` decide which voxels exist, `look`
// only decides which role each voxel gets (plus snow, which adds a thin skin).
// A UI can therefore re-run the cheap look pass while caching the geometry.
//
// Lengths expressed as a ratio of `height` scale automatically. Lengths given
// in voxels are tuned for a 192-tall tree and are scaled by height/192.

import type { BranchLevel } from "@voxolith/gen-kit";

export type { BranchLevel };

/** The two families the one pipeline grows: a branching crown, or a leader with whorls. */
export type SpeciesKind = "broadleaf" | "conifer";
/** Season: leaf colours and density, blossom in spring, bare boughs and snow in winter. */
export type Season = "spring" | "summer" | "autumn" | "winter";

/** The trunk (level-0 stem): its size, taper, lean and flared foot. */
export interface TrunkParams {
  /** Trunk length as a fraction of tree height. */
  lengthRatio: number;
  /** Base radius as a fraction of tree height. */
  radiusRatio: number;
  /** Taper exponent; 1 is a straight cone, lower keeps mass high up. */
  taperExp: number;
  /** Most the trunk may lean from vertical, in degrees; the actual lean is random up to this. */
  leanDeg: number;
  /** Total lateral turn over the bole. */
  sweepDeg: number;
  /** Amplitude of the coherent wobble along the trunk; grows with `look.age`. */
  curl: number;
  /** Root flare height as a fraction of tree height. */
  flareHeightRatio: number;
  /** Extra radius at the very base, as a fraction of the base radius. */
  flareGain: number;
  /** Buttress lobes around the flare. */
  flareLobes: number;
  /** Surface roots radiating from the base. */
  roots: number;
  /** Polyline step along the trunk, in voxels at height 192. */
  segLen: number;
}

/**
 * Which wood exists: height, trunk, where the crown starts and ends, and how each level of
 * branches grows. Together with {@link FoliageParams} this decides the geometry.
 */
export interface ShapeParams {
  kind: SpeciesKind;
  /** Overall height in voxels; the skeleton is scaled to hit this exactly. */
  height: number;
  trunk: TrunkParams;
  /** First and last child position along the trunk, as fractions of its length. */
  crownStartRatio: number;
  crownEndRatio: number;
  /** "mid" puts the longest limbs mid-crown (broadleaf); "taper" shortens with height (conifer). */
  envelope: "mid" | "taper";
  /** Random twist added to each child's golden-angle position around its parent, in degrees. */
  azimuthJitterDeg: number;
  /** 0 spawns children alternately; >0 spawns whorls of this many at once. */
  whorl: number;
  /** Distance between whorls as a fraction of height. */
  whorlSpacingRatio: number;
  /** Pipe-model exponent; higher keeps child branches thicker at forks. */
  pipeExp: number;
  /** Taper exponent for branches (the trunk has its own). */
  branchTaper: number;
  /** Thinnest any branch gets, in voxels. */
  minRadius: number;
  /** Growth rules per level of branches; index 0 is the limbs off the trunk. */
  levels: BranchLevel[];
}

/**
 * Which leaves exist: broadleaf clumps on the twigs or conifer needle sheaths, and how they are
 * carved.
 */
export interface FoliageParams {
  /** Grow foliage at all; off leaves the bare wood. */
  enabled: boolean;
  /** Broadleaf cluster radius in voxels at height 192. */
  clusterRadius: number;
  /** Vertical squash of a cluster. */
  clusterFlatten: number;
  /** Distance between attachment points along a twig, in voxels. */
  spacing: number;
  /** Radius multiplier for the cluster on each twig tip. */
  tipBoost: number;
  /** Noise threshold at the cluster core and rim; higher removes more. */
  fillCore: number;
  fillRim: number;
  /** Drop leaves deeper than this below the canopy hull. 0 disables. */
  shellDepth: number;
  /** Frequency and threshold of the sky-hole carve. */
  macroScale: number;
  macroThreshold: number;
  /** Conifer: needle sheath radius around a branch axis. */
  sheathRadius: number;
  sheathFill: number;
  /** Conifer: conical envelope exponent and radius as a fraction of height. */
  coneExp: number;
  crownRadiusRatio: number;
  /** Conifer: empty voxels kept above each whorl plane. */
  whorlGap: number;
}

/** Which role each voxel gets: season, age and health, bark pattern, moss, snow and blossom. */
export interface LookParams {
  season: Season;
  /** 0 young and slender, 1 old, fat and gnarled. */
  age: number;
  /** 1 healthy, 0 sparse and dying. */
  health: number;
  /** Bark furrow spacing measured around the trunk, in voxels. */
  furrowWavelength: number;
  /** Spread between the dark and light bark thresholds. */
  furrowContrast: number;
  /** Warps furrows into plates; 0 is a smooth-barked species. */
  plateWarp: number;
  /** Branches thinner than this get flat twig colours instead of bark. */
  minRadiusForPattern: number;
  /** Moss cover on the lower trunk, 0..1. */
  moss: number;
  /** Compass direction the mossy side faces, in degrees. */
  mossAzimuthDeg: number;
  /** Darken crotches and the undersides of limbs with a baked occlusion role. */
  creviceAo: boolean;
  /** Fraction of clusters that take the accent colour. */
  accentFraction: number;
  /** Winter only: share of sky-facing tops that carry snow, 0..1. */
  snow: number;
  /** Spring only: fraction of leaf clusters that flower. */
  blossom: number;
}

/**
 * Everything a tree is made from. Presets in {@link PRESETS}; the generators expose a subset as
 * ParamSpecs.
 */
export interface TreeParams {
  /** Label only, e.g. "oak". */
  species: string;
  shape: ShapeParams;
  foliage: FoliageParams;
  look: LookParams;
}

export const REFERENCE_HEIGHT = 192;

/** Deep clone so presets are never mutated by a caller. */
export function cloneParams(p: TreeParams): TreeParams {
  return {
    species: p.species,
    shape: {
      ...p.shape,
      trunk: { ...p.shape.trunk },
      levels: p.shape.levels.map((l) => ({ ...l, count: [l.count[0], l.count[1]] })),
    },
    foliage: { ...p.foliage },
    look: { ...p.look },
  };
}
