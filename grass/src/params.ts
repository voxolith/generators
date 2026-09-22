// Tunables for ground cover.
//
// Grass is not a small bush: a patch is many independent blades, each a single
// arcing stem one voxel thick. The look comes almost entirely from three
// things — how far the blades splay from vertical, how hard they arc over, and
// the dark-to-light gradient from base to tip.
//
// Voxel-space values are tuned for a 24-tall patch and scale with `height`.

import type { BranchLevel } from "@voxolith/engine/build";

export type { BranchLevel };

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface ShapeParams {
  /** Height of the tallest blade, in voxels. */
  height: number;
  /** Radius of the patch. */
  footprint: number;
  /** Tufts scattered over the patch, inclusive range. */
  tufts: [number, number];
  /** Blades per tuft, inclusive range. */
  bladesPerTuft: [number, number];
  /** Radius of a tuft's own base. */
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
  taperExp: number;
  /** Downward bend per voxel: 0 stands straight up, high values arch right over. */
  arc: number;
  curl: number;
  segLen: number;
  /** Usually empty. A fern puts one level of leaflets here. */
  levels: BranchLevel[];
}

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
  seedLength: number;
  snow: number;
}

export interface GrassParams {
  species: string;
  shape: ShapeParams;
  look: LookParams;
}

export const REFERENCE_HEIGHT = 24;

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
