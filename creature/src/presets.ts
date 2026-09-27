import { ROLE, type ColorSet } from "./roles";
import type { Coat, CreatureParams } from "./params";

const coats: Record<Coat, { fur: [number, number, number]; dark: [number, number, number]; light: [number, number, number]; belly: [number, number, number] }> = {
  brown: { fur: [0.42, 0.33, 0.25], dark: [0.3, 0.23, 0.17], light: [0.52, 0.42, 0.32], belly: [0.72, 0.66, 0.56] },
  grey: { fur: [0.46, 0.45, 0.43], dark: [0.33, 0.32, 0.31], light: [0.57, 0.56, 0.53], belly: [0.76, 0.74, 0.7] },
  white: { fur: [0.9, 0.89, 0.86], dark: [0.8, 0.78, 0.74], light: [0.96, 0.95, 0.93], belly: [0.93, 0.92, 0.9] },
  black: { fur: [0.16, 0.15, 0.15], dark: [0.1, 0.1, 0.1], light: [0.24, 0.23, 0.22], belly: [0.3, 0.28, 0.27] },
};

/**
 * Default role colours for a coat: fur tones and a belly mixed towards the coat's light belly
 * colour by `belly` (0..1), eyes red when `redEyes`, and shared skin, claw and interior colours.
 */
export function skinFor(coat: Coat, redEyes: boolean, belly: number): ColorSet {
  const c = coats[coat] ?? coats.brown;
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
  return {
    [ROLE.FUR]: c.fur, [ROLE.FUR_DARK]: c.dark, [ROLE.FUR_LIGHT]: c.light,
    [ROLE.BELLY]: mix(c.fur, c.belly, Math.max(0, Math.min(1, belly))),
    [ROLE.SKIN]: [0.86, 0.62, 0.6], [ROLE.SKIN_DARK]: [0.68, 0.46, 0.45], [ROLE.CLAW]: [0.85, 0.82, 0.74],
    [ROLE.EYE]: redEyes ? [0.75, 0.12, 0.16] : [0.05, 0.04, 0.05], [ROLE.EYE_SHINE]: [0.95, 0.95, 0.95],
    [ROLE.NOSE]: [0.78, 0.5, 0.52], [ROLE.TOOTH]: [0.93, 0.8, 0.45],
    [ROLE.FAT]: [0.93, 0.86, 0.62], [ROLE.FLESH]: [0.72, 0.26, 0.26], [ROLE.MUSCLE]: [0.55, 0.16, 0.17],
    [ROLE.BONE]: [0.92, 0.9, 0.82], [ROLE.MARROW]: [0.62, 0.2, 0.22], [ROLE.ORGAN]: [0.62, 0.28, 0.36],
    [ROLE.ORGAN_DARK]: [0.42, 0.12, 0.16], [ROLE.BLOOD]: [0.45, 0.04, 0.05],
  };
}

export const RAT: CreatureParams = {
  species: "rat",
  shape: { size: 1.2, bodyLength: 1, girth: 1, headLength: 1, snout: 0.6, ears: 1, legLength: 1.5, legThickness: 1, tailLength: 1, tailThickness: 1 },
  look: { coat: "brown", belly: 0.7, mottle: 0.5, redEyes: false },
  gait: { stride: 1, pace: 1.4, bounce: 1, tailSway: 1 },
};

const derive = (species: string, patch: (p: CreatureParams) => void): CreatureParams => {
  const p: CreatureParams = JSON.parse(JSON.stringify(RAT));
  p.species = species;
  patch(p);
  return p;
};

/**
 * Tuned creatures by name: `rat`, `grey rat`, `lab rat`, `black rat` and `fat rat`. Stylised and
 * larger than life; size one for a fixed-scale world with {@link atScale}.
 */
export const PRESETS: Record<string, CreatureParams> = {
  rat: RAT,
  "grey rat": derive("grey rat", (p) => { p.look.coat = "grey"; }),
  "lab rat": derive("lab rat", (p) => { p.look.coat = "white"; p.look.redEyes = true; p.look.mottle = 0.15; }),
  "black rat": derive("black rat", (p) => { p.look.coat = "black"; p.shape.tailLength = 1.2; p.shape.girth = 0.9; p.shape.ears = 1.2; }),
  "fat rat": derive("fat rat", (p) => { p.shape.girth = 1.3; p.shape.size = 1.15; p.gait.pace = 1.1; p.gait.bounce = 1.3; }),
};
/** The keys of {@link PRESETS}, in declaration order. */
export const PRESET_NAMES = Object.keys(PRESETS);

/**
 * Metres nose to tail tip of the default rat (a large brown rat), and voxels
 * per unit of `shape.size` for the default proportions (measured: 75 voxels
 * at 1.2). Presets are stylised game rats, larger than life; `atScale` sizes
 * one for a world with a fixed voxels-per-metre.
 */
const RAT_LENGTH_M = 0.5;
const VOXELS_PER_SIZE = 62.5;
/** Bounds of `shape.size` that {@link atScale} clamps to (below 0.7 legs thin to one voxel). */
const MIN_SIZE = 0.7;
const MAX_SIZE = 2;

/** `shape.size` for true size at `voxelsPerMetre`, on the 0.05 grid, before any clamping. */
function trueSize(params: CreatureParams, voxelsPerMetre: number): number {
  const factor = (RAT_LENGTH_M * voxelsPerMetre) / (VOXELS_PER_SIZE * RAT.shape.size);
  return Math.round(params.shape.size * factor * 20) / 20;
}

/**
 * The same creature, sized for a world of `voxelsPerMetre` (a rat at 100
 * vox/m comes out at size 0.8, about 50 voxels long). Presets keep their
 * ratios to each other; sizes snap to the 0.05 grid of `shape.size` and never
 * go below 0.7, where legs would thin to one voxel.
 *
 * @param params - Any creature params; not mutated.
 * @param voxelsPerMetre - The world's scale.
 * @returns A copy with only `shape.size` changed.
 * @example
 * ```ts
 * const rat = atScale(PRESETS.rat, 100); // size 0.8
 * const { entity } = generateCreature(rat, seededRandom(1));
 * ```
 */
export function atScale(params: CreatureParams, voxelsPerMetre: number): CreatureParams {
  const p: CreatureParams = JSON.parse(JSON.stringify(params));
  p.shape.size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, trueSize(params, voxelsPerMetre)));
  return p;
}

/**
 * Whether {@link atScale} builds this creature at its real size in a world of
 * `voxelsPerMetre`. Below {@link minVoxelsPerMetre} it cannot: `atScale` keeps
 * `shape.size` at 0.7 so the legs stay two voxels thick, and the creature
 * comes out larger than life (a rat is 0.86 m long at 50 vox/m, 2.15 m at 20).
 * It is also false above about 250 vox/m, where the size is held at its
 * upper bound of 2 and the creature comes out smaller than life. Apps that
 * only show creatures true to size ask this instead of hard-coding a scale.
 *
 * @param params - Any creature params, as {@link atScale} takes them; not mutated.
 * @param voxelsPerMetre - The world's scale.
 * @returns True when `atScale(params, voxelsPerMetre)` needs no clamping.
 * @example
 * ```ts
 * realSizeAt(PRESETS.rat, 100); // true: size 0.8, 0.5 m nose to tail tip
 * realSizeAt(PRESETS.rat, 50);  // false: held at size 0.7, 0.86 m long
 * if (realSizeAt(PRESETS.rat, vpm)) crowd.add(generateCreature(atScale(PRESETS.rat, vpm), rng).entity);
 * ```
 */
export function realSizeAt(params: CreatureParams, voxelsPerMetre: number): boolean {
  const s = trueSize(params, voxelsPerMetre);
  return s >= MIN_SIZE && s <= MAX_SIZE;
}

/**
 * The smallest world scale, in voxels per metre, at which {@link atScale}
 * builds this creature at its real size (see {@link realSizeAt}): about 84
 * for the default rat (size 1.2), 88 for the fat rat (1.15). Scales from here
 * up to about 250 vox/m are real size. The size snaps to a 0.05 grid, so this
 * is where the snapped size first reaches 0.7, a little under the unsnapped
 * 87.5 for the default rat.
 *
 * @param params - Any creature params; not mutated.
 * @returns A scale `v` with `realSizeAt(params, v)` true and false for anything below it.
 * @example
 * ```ts
 * const vpm = 100;
 * const rats = vpm >= minVoxelsPerMetre(PRESETS.rat); // true: 100 >= 84.375
 * ```
 */
export function minVoxelsPerMetre(params: CreatureParams): number {
  // trueSize rounds size * vpm * 20 / 150 (for the default proportions): it
  // reaches MIN_SIZE * 20 once that product is half a step below it.
  const perVpm = (params.shape.size * RAT_LENGTH_M * 20) / (VOXELS_PER_SIZE * RAT.shape.size);
  let v = (MIN_SIZE * 20 - 0.5) / perVpm;
  // Floating point can land a hair either side of the rounding edge.
  while (trueSize(params, v) < MIN_SIZE) v = v * (1 + 1e-12) + 1e-12;
  while (trueSize(params, v * (1 - 1e-12)) >= MIN_SIZE && v > 0) v *= 1 - 1e-12;
  return v;
}
