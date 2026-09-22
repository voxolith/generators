// Tunables for buildings.
//
// A building here is a small shape grammar rather than a branching structure:
// a plinth, a stack of storeys as hollow shells with floor slabs, openings cut
// into the walls on a rhythm, and a roof from one of three families. Like the
// vegetation generators, `shape` and `openings` decide which voxels exist and
// `look` only decides which role each one gets.

export type RoofKind = "gable" | "hip" | "flat";
export type WallStyle = "plaster" | "brick" | "stone" | "timber";
export type RoofStyle = "tile" | "slate" | "thatch" | "shingle";

export interface ShapeParams {
  /** Footprint in voxels, along x and z. */
  width: number;
  depth: number;
  storeys: number;
  /** Floor-to-floor height in voxels, including the slab. */
  storeyHeight: number;
  /** Wall thickness in voxels. */
  wallThickness: number;
  /** Height of the stone plinth the walls stand on; 0 for none. */
  plinth: number;
  roof: RoofKind;
  /** Run per unit rise: 1 is 45°, 2 is a shallow roof, 0.6 steep. */
  roofPitch: number;
  /** How far the eaves project past the walls. */
  overhang: number;
  chimneys: number;
}

export interface OpeningParams {
  windowWidth: number;
  windowHeight: number;
  /** Centre-to-centre spacing along a wall. */
  windowSpacing: number;
  /** Window sill above the storey floor. */
  sillHeight: number;
  /** Fraction of window positions actually cut; the rest stay wall. */
  windowFraction: number;
  doorWidth: number;
  doorHeight: number;
}

export interface LookParams {
  wall: WallStyle;
  roofStyle: RoofStyle;
  /** Fraction of windows glowing (emissive), as at dusk. */
  lit: number;
  /** Dirt and tonal variation on the walls, 0..1. */
  weathering: number;
  /** Moss on the roof, 0..1. */
  moss: number;
  /** Corner quoins and storey bands in the trim colour. */
  quoins: boolean;
  /** For the timber style: spacing of vertical posts in voxels. */
  beamSpacing: number;
}

export interface BuildingParams {
  species: string;
  shape: ShapeParams;
  openings: OpeningParams;
  look: LookParams;
}

export function cloneParams(p: BuildingParams): BuildingParams {
  return { species: p.species, shape: { ...p.shape }, openings: { ...p.openings }, look: { ...p.look } };
}
