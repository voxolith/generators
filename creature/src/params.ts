// Tunables for creatures. `shape` decides the body and its rig, `look` the
// colours, `gait` how the generated clips move. Lengths are multipliers on the
// species' proportions, with `size` scaling everything.
//
// Resolution rules (see the package README): nothing animated thinner than 2
// voxels bar the last third of the tail, at least 4 voxels between joints,
// the detail budget spent on the head.

export type Coat = "brown" | "grey" | "white" | "black";

export interface CreatureParams {
  species: string;
  shape: {
    /** Scales everything; below about 0.7 legs get thinner than 2 voxels. */
    size: number;
    bodyLength: number;
    girth: number;
    headLength: number;
    /** How far the snout narrows, 0 blunt .. 1 pointed. */
    snout: number;
    ears: number;
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

export function cloneParams(p: CreatureParams): CreatureParams {
  return { species: p.species, shape: { ...p.shape }, look: { ...p.look }, gait: { ...p.gait } };
}
