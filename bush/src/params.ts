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

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface ShapeParams {
  /** Overall height in voxels; the skeleton is scaled to hit this exactly. */
  height: number;
  /** Stems rising from the ground, inclusive range. */
  stems: [number, number];
  /** Radius of the basal cluster of stems, as a fraction of height. */
  baseSpreadRatio: number;
  /** How far the stems lean outward from vertical. */
  leanDeg: number;
  leanVarDeg: number;
  /** Stem length as a fraction of height, and its spread. */
  lengthRatio: number;
  lengthVar: number;
  /** Stem base radius as a fraction of height. */
  radiusRatio: number;
  taperExp: number;
  curl: number;
  sweepDeg: number;
  segLen: number;
  /** First and last child position along a stem. */
  childStart: number;
  childEnd: number;
  azimuthJitterDeg: number;
  pipeExp: number;
  branchTaper: number;
  minRadius: number;
  levels: BranchLevel[];
  /**
   * Extra clumps of stems scattered around the centre, for a thicket. 0 makes a
   * single shrub; each extra clump is offset and independently sized.
   */
  clumps: number;
  clumpSpreadRatio: number;
}

export interface FoliageParams {
  enabled: boolean;
  clusterRadius: number;
  clusterFlatten: number;
  spacing: number;
  tipBoost: number;
  fillCore: number;
  fillRim: number;
  shellDepth: number;
  macroScale: number;
  macroThreshold: number;
  /** Fraction of leaf clumps kept; lower makes a sparse, twiggy shrub. */
  density: number;
}

export interface LookParams {
  season: Season;
  /** 1 healthy, 0 sparse and dying. */
  health: number;
  /** Fraction of clumps that take the accent colour. */
  accentFraction: number;
  /** Fraction of clumps that carry berries or flowers. */
  berryFraction: number;
  blossom: number;
  snow: number;
  /** Thorns on a fraction of twig voxels; 0 for a smooth shrub. */
  thorns: number;
  /** Stems thinner than this take a flat twig colour. */
  minRadiusForPattern: number;
}

export interface BushParams {
  species: string;
  shape: ShapeParams;
  foliage: FoliageParams;
  look: LookParams;
}

export const REFERENCE_HEIGHT = 64;

export function cloneParams(p: BushParams): BushParams {
  return {
    species: p.species,
    shape: { ...p.shape, stems: [p.shape.stems[0], p.shape.stems[1]], levels: p.shape.levels.map((l) => ({ ...l, count: [l.count[0], l.count[1]] })) },
    foliage: { ...p.foliage },
    look: { ...p.look },
  };
}
