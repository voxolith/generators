// Tunables for creatures. `shape` decides the body and its rig, `look` the
// colours, `gait` how the generated clips move. Lengths are multipliers on the
// species' proportions, with `size` scaling everything.
//
// Resolution rules (see the package README): nothing animated thinner than 2
// voxels bar the last third of the tail, at least 4 voxels between joints,
// the detail budget spent on the head.

/** Fur colour. */
export type Coat = "brown" | "grey" | "white" | "black";

/**
 * Everything a creature is made from: `shape` the body and its rig, `look` the colours, `gait` how
 * the generated clips move. Shape lengths are multipliers on the species' proportions (1 is the
 * default rat), with `size` scaling everything. Presets in {@link PRESETS}.
 */
export interface CreatureParams {
  /** Label only, e.g. "rat". */
  species: string;
  shape: {
    /** Scales everything; below about 0.7 legs get thinner than 2 voxels. */
    size: number;
    /** Torso length. */
    bodyLength: number;
    /** Body width and depth. */
    girth: number;
    /** Neck to nose. */
    headLength: number;
    /** How far the snout narrows, 0 blunt .. 1 pointed. */
    snout: number;
    /** Ear size. */
    ears: number;
    /** Leg length; longer legs carry the body higher. */
    legLength: number;
    legThickness: number;
    tailLength: number;
    tailThickness: number;
  };
  look: {
    coat: Coat;
    /** How much lighter the belly is, 0..1. */
    belly: number;
    /** Tonal mottling of the fur, 0..1. */
    mottle: number;
    /** Albino eyes. */
    redEyes: boolean;
  };
  gait: {
    /** Leg swing, 1 = natural. */
    stride: number;
    /** Walk cycles per second. */
    pace: number;
    /** Body bob. */
    bounce: number;
    /** Tail swing. */
    tailSway: number;
  };
}

/** Copy of the params, so presets are never mutated by a caller. */
export function cloneParams(p: CreatureParams): CreatureParams {
  return { species: p.species, shape: { ...p.shape }, look: { ...p.look }, gait: { ...p.gait } };
}
