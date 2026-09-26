// Tunables for shrubs.
//
// A bush is not a small tree: it has no single trunk. Several stems leave the
// ground together and lean outward, which is what gives a shrub its vase
// silhouette and what makes a thicket read as a thicket rather than as a row of
// little trees.
//
// Split as elsewhere: `shape` and `foliage` decide which voxels exist, `look`
// only decides which role each one gets. Voxel-space values are tuned for a
// 64-tall bush and scale with `height`.

import type { BranchLevel } from "@voxolith/gen-kit";

export type { BranchLevel };

/**
 * Season: leaf colours, blossom in spring, bare stems and snow in winter (a hedge keeps its
 * leaves).
 */
export type Season = "spring" | "summer" | "autumn" | "winter";

/**
 * Which wood exists: the stems leaving the ground, how they lean and branch, and any extra
 * clumps for a thicket. Together with {@link FoliageParams} this decides the geometry.
 */
export interface ShapeParams {
  /** Overall height in voxels; the skeleton is scaled to hit this exactly. */
  height: number;
  /** Stems rising from the ground, inclusive range. */
  stems: [number, number];
  /** Radius of the basal cluster of stems, as a fraction of height. */
  baseSpreadRatio: number;
  /** How far the stems lean outward from vertical. */
  leanDeg: number;
  /** Random spread on that lean, in degrees either way. */
  leanVarDeg: number;
  /** Stem length as a fraction of height, and its spread. */
  lengthRatio: number;
  lengthVar: number;
  /** Stem base radius as a fraction of height. */
  radiusRatio: number;
  /** How the stems narrow: 1 is a straight cone, lower keeps them thick higher up. */
  taperExp: number;
  /** Amplitude of the coherent wobble along a stem. */
  curl: number;
  /** Total sideways bend of a stem over its length, in degrees. */
  sweepDeg: number;
  /** Polyline step along a stem, in voxels at height 64. */
  segLen: number;
  /** First and last child position along a stem. */
  childStart: number;
  childEnd: number;
  /** Random twist added to each child's golden-angle position, in degrees. */
  azimuthJitterDeg: number;
  /** Pipe-model exponent; higher keeps child branches thicker at forks. */
  pipeExp: number;
  /** Taper exponent for branches (the stems have their own). */
  branchTaper: number;
  /** Thinnest any branch gets, in voxels. */
  minRadius: number;
  /** Growth rules per level of branches; index 0 is the side shoots off the stems. */
  levels: BranchLevel[];
  /**
   * Extra clumps of stems scattered around the centre, for a thicket. 0 makes a
   * single shrub; each extra clump is offset and independently sized.
   */
  clumps: number;
  /** How far the extra clumps sit from the centre, as a fraction of height. */
  clumpSpreadRatio: number;
}

/** Which leaves exist: clumps along the twigs, carved into a shell with sky holes. */
export interface FoliageParams {
  /** Grow leaves at all; off leaves the bare stems. */
  enabled: boolean;
  /** Leaf clump radius in voxels at height 64. */
  clusterRadius: number;
  /** Vertical squash of a clump. */
  clusterFlatten: number;
  /** Distance between clumps along a twig, in voxels at height 64. */
  spacing: number;
  /** Radius multiplier for the clump on each twig tip. */
  tipBoost: number;
  /** Noise threshold at the clump core and rim; higher removes more. */
  fillCore: number;
  fillRim: number;
  /** Drop leaves deeper than this below the outer surface, in voxels at height 64. 0 disables. */
  shellDepth: number;
  /** Frequency and threshold of the sky-hole carve. */
  macroScale: number;
  macroThreshold: number;
  /** Fraction of leaf clumps kept; lower makes a sparse, twiggy shrub. */
  density: number;
}

/** Which role each voxel gets: season, health, accents, berries, blossom, snow and thorns. */
export interface LookParams {
  season: Season;
  /** 1 healthy, 0 sparse and dying. */
  health: number;
  /** Fraction of clumps that take the accent colour. */
  accentFraction: number;
  /** Fraction of clumps that carry berries or flowers. */
  berryFraction: number;
  /** Spring only: fraction of clumps whose rim flowers. */
  blossom: number;
  /** Winter only: share of sky-facing tops that carry snow, 0..1. */
  snow: number;
  /** Thorns on a fraction of twig voxels; 0 for a smooth shrub. */
  thorns: number;
  /** Stems thinner than this take a flat twig colour. */
  minRadiusForPattern: number;
}

/**
 * Everything a bush is made from. Presets in {@link PRESETS}; the generators expose a subset as
 * ParamSpecs.
 */
export interface BushParams {
  /** Species name: picks the colour skin, and `hedge` stays in leaf in winter. */
  species: string;
  shape: ShapeParams;
  foliage: FoliageParams;
  look: LookParams;
}

export const REFERENCE_HEIGHT = 64;

/** Deep clone, so presets are never mutated by a caller. */
export function cloneParams(p: BushParams): BushParams {
  return {
    species: p.species,
    shape: { ...p.shape, stems: [p.shape.stems[0], p.shape.stems[1]], levels: p.shape.levels.map((l) => ({ ...l, count: [l.count[0], l.count[1]] })) },
    foliage: { ...p.foliage },
    look: { ...p.look },
  };
}
