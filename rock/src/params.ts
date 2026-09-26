// Tunables for rocks.
//
// A rock is a displaced superellipsoid — see @voxolith/gen-kit blob — and
// almost everything about how it reads comes from three numbers: how boxy the
// mass is, how rough its surface is, and how it is banded. Everything else is
// dressing applied to the surface afterwards.
//
// Split as elsewhere: `shape` decides which voxels exist, `look` only decides
// which role each surface voxel gets.

/** Which voxels exist: the main mass, its surface, its fractures and any extra rocks. */
export interface ShapeParams {
  /** Longest horizontal extent, in voxels. */
  size: number;
  /** Height as a fraction of size: 1 is as tall as wide, 0.4 is a slab. */
  aspect: number;
  /** Depth as a fraction of size, so the footprint need not be round. */
  elongation: number;
  /** Superellipsoid exponent: 2 round, 4 a rounded box, 8 nearly a block. */
  exponent: number;
  /** Surface displacement as a fraction of radius. */
  roughness: number;
  /** Bumps per radius. Low is a few great lumps; high is finer lumps. */
  detail: number;
  /** Fine surface grit in voxels; breaks the contour terraces on shallow slopes. */
  grit: number;
  /**
   * Fracture planes cut into each rock. 0 leaves a water-worn cobble; 6-12 gives
   * the flat facets and hard edges of broken stone.
   */
  facets: number;
  /** Fraction of the rock each fracture removes, at most. */
  facetDepth: number;
  /**
   * Extra smaller rocks nestled against the main one. Each overlaps its parent
   * so the whole stays one connected piece.
   */
  cluster: number;
  /** Size of the extras as a fraction of the main rock, and its spread. */
  clusterScale: number;
  clusterScaleVar: number;
  /** Fraction of the height buried: the anchor sits this far up the rock. */
  sink: number;
}

/** Which role each surface voxel gets; interior voxels stay the mid tone. */
export interface LookParams {
  /** Contrast between the light and dark tones, 0..1. */
  mottle: number;
  /** Strata bands per rock height; 0 disables banding. */
  strata: number;
  /** Tilt of the bedding plane in degrees. */
  strataTiltDeg: number;
  /** Fraction of bands that take the contrasting colour. */
  strataContrast: number;
  /** Crack density; 0 for none. */
  cracks: number;
  /** Moss cover on upward faces, 0..1. */
  moss: number;
  /** Lichen patches on any face, 0..1. */
  lichen: number;
  /** Height of the damp band at the base, as a fraction of height. */
  wet: number;
  /** Snow on upward faces, 0..1. */
  snow: number;
}

/**
 * Everything a rock is made from. Presets in {@link PRESETS}; the generators expose every field
 * as a ParamSpec except the extras' size spread.
 */
export interface RockParams {
  /** Stone name, which picks the colour skin: granite, sandstone, basalt, limestone or slate. */
  species: string;
  shape: ShapeParams;
  look: LookParams;
}

/** Copy of the params, so presets are never mutated by a caller. */
export function cloneParams(p: RockParams): RockParams {
  return { species: p.species, shape: { ...p.shape }, look: { ...p.look } };
}
