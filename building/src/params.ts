// Tunables for buildings.
//
// A building is a small shape grammar rather than a branching structure: a
// plinth, a stack of storeys as hollow shells with floor slabs, openings cut on
// a rhythm, a roof from one of three families, and then several detail passes —
// wall texture with relief, window and door furniture, roof courses, rainwater
// goods, chimneys and weathering. As elsewhere, `shape` and `openings` decide
// which voxels exist and `look` mostly decides which role each one gets.
//
// Voxel dimensions assume roughly 2.5 voxels per foot, so a storey is ~24
// voxels and a cottage sits in proportion next to a ~190-voxel tree.

/** Roof form: two slopes with gable ends, four slopes, or flat behind a parapet. */
export type RoofKind = "gable" | "hip" | "flat";
/** Wall material, which decides the wall texture pass and the wall colours. */
export type WallStyle = "plaster" | "brick" | "stone" | "timber";
/** Roof covering: coursed tile, slate or shingle, or thatch. */
export type RoofStyle = "tile" | "slate" | "thatch" | "shingle";

/** The mass: footprint, storeys, walls, plinth, roof form and chimneys. Lengths in voxels. */
export interface ShapeParams {
  /** Length of the front wall; the ridge runs along the longer side. */
  width: number;
  /** Length of the side walls, front to back. */
  depth: number;
  /** Floors below the roof. */
  storeys: number;
  /** Floor-to-floor height in voxels, including the slab. */
  storeyHeight: number;
  /** Outer wall thickness. */
  wallThickness: number;
  /** Stone plinth the walls stand on; the front door is reached by steps. */
  plinth: number;
  /** Roof form. */
  roof: RoofKind;
  /** Run per unit rise: 1 is 45°, 2 is a shallow roof, 0.6 steep. */
  roofPitch: number;
  /** How far the eaves stand out past the walls (none on a flat roof). */
  overhang: number;
  /** Brick chimney stacks, 0 to 3. */
  chimneys: number;
}

/** Windows and the door: sizes, rhythm and furniture. Lengths in voxels. */
export interface OpeningParams {
  /** Window opening size. */
  windowWidth: number;
  windowHeight: number;
  /** Distance between neighbouring windows along a wall. */
  windowSpacing: number;
  /** Height of the sill above each floor. */
  sillHeight: number;
  /** Fraction of window positions actually cut; the rest stay wall. */
  windowFraction: number;
  /** Divide windows into panes. */
  glazingBars: boolean;
  /** Fraction of windows with shutters. */
  shutters: number;
  /** Fraction of windows with a flower box under the sill. */
  flowerBoxes: number;
  /** Door opening size; a width of 14 or more gives a pair of boarded barn doors. */
  doorWidth: number;
  doorHeight: number;
  /** A small hood on brackets over the door. */
  doorHood: boolean;
  /** Windows in the gable ends of the attic. */
  gableWindows: boolean;
}

/** Materials, detail and weathering. */
export interface LookParams {
  wall: WallStyle;
  roofStyle: RoofStyle;
  /** Fraction of windows glowing (emissive), as at dusk. */
  lit: number;
  /** Recess mortar joints so masonry has relief. */
  relief: boolean;
  /** Plaster fallen away to show brick, 0..1 (plaster walls only). */
  spalling: number;
  /** Rain streaks, rising damp and tonal variation, 0..1. */
  weathering: number;
  /** Moss on the roof, 0..1, heavier on the shaded slope. */
  moss: number;
  /** Corner quoins and storey bands in dressed stone. */
  quoins: boolean;
  /** Gutters and downpipes. */
  gutters: boolean;
  /** Timber style only: spacing of posts. */
  beamSpacing: number;
}

/**
 * Everything a building is made from. Presets in {@link PRESETS}; the generators expose a subset
 * as ParamSpecs.
 */
export interface BuildingParams {
  /** Label only, e.g. "cottage". */
  species: string;
  shape: ShapeParams;
  openings: OpeningParams;
  look: LookParams;
}

/** Copy of the params, so presets are never mutated by a caller. */
export function cloneParams(p: BuildingParams): BuildingParams {
  return { species: p.species, shape: { ...p.shape }, openings: { ...p.openings }, look: { ...p.look } };
}
