// Tunables for ground cover.
//
// Grass is not a small bush: a patch is many independent blades, each a single
// arcing stem one voxel thick. The look comes almost entirely from three
// things — how far the blades splay from vertical, how hard they arc over, and
// the dark-to-light gradient from base to tip.
//
// Voxel-space values are tuned for a 24-tall patch and scale with `height`.

import type { BranchLevel } from "@voxolith/gen-kit";

export type { BranchLevel };

/** Season: blade colours, and snow on the tips in winter. */
export type Season = "spring" | "summer" | "autumn" | "winter";

/** Which blades exist: how many tufts over how wide a patch, and how each blade grows. */
export interface ShapeParams {
  /** Height of the tallest blade, in voxels. */
  height: number;
  /** Radius of the patch, in voxels. */
  footprint: number;
  /** Tufts scattered over the patch, inclusive range. */
  tufts: [number, number];
  /** Blades per tuft, inclusive range. */
  bladesPerTuft: [number, number];
  /** Radius of a tuft's own base, in voxels. */
  tuftSpread: number;
  /** How far blades splay from vertical, and its spread. */
  fanDeg: number;
  fanVarDeg: number;
  /** Blade length spread, as ±fraction. */
  lengthVar: number;
  /** Shortest blade as a fraction of the tallest. */
  lengthMin: number;
  /** Blade radius in voxels. Below 1 a blade is a clean one-voxel line. */
  radius: number;
  /** How a blade narrows towards its tip: 1 is a straight cone, 0 keeps it even. */
  taperExp: number;
  /** Downward bend per voxel: 0 stands straight up, high values arch right over. */
  arc: number;
  /** Amplitude of the coherent wobble along a blade. */
  curl: number;
  /** Polyline step along a blade, in voxels at height 24. */
  segLen: number;
  /** Usually empty. A fern puts one level of leaflets here. */
  levels: BranchLevel[];
}

/** Which role each voxel gets, plus the heads (flowers, seeds) and snow added on top. */
export interface LookParams {
  season: Season;
  /** Fraction of blades that have dried off. */
  dry: number;
  /** Fraction of blades ending in a flower head. */
  flowers: number;
  /** Flower head radius in voxels. */
  flowerRadius: number;
  /** Fraction of blades ending in a seed head, for reeds and cereals. */
  seedHeads: number;
  /** Seed head length in voxels at height 24. */
  seedLength: number;
  /** Winter only: share of upward faces that carry snow, 0..1. */
  snow: number;
}

/**
 * Everything a grass patch is made from. Presets in {@link PRESETS}; the generators expose a
 * subset as ParamSpecs.
 */
export interface GrassParams {
  /** Species name: picks the colour skin. */
  species: string;
  shape: ShapeParams;
  look: LookParams;
}

export const REFERENCE_HEIGHT = 24;

/** Deep clone, so presets are never mutated by a caller. */
export function cloneParams(p: GrassParams): GrassParams {
  return {
    species: p.species,
    shape: {
      ...p.shape,
      tufts: [p.shape.tufts[0], p.shape.tufts[1]],
      bladesPerTuft: [p.shape.bladesPerTuft[0], p.shape.bladesPerTuft[1]],
      levels: p.shape.levels.map((l) => ({ ...l, count: [l.count[0], l.count[1]] })),
    },
    look: { ...p.look },
  };
}
