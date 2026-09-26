/**
 * @voxolith/gen-creature: rigged, animated voxel creatures. A rat first.
 *
 * The entity is a rest-pose model whose voxels know their bone, a rig and a
 * set of generated clips (walk, run, idle, sniff, turns, death). Under the fur
 * there is fat, flesh, muscle, a skeleton, a skull with a brain and organs in
 * the chest and belly, all out of sight until damage exposes them (see
 * @voxolith/engine/animation `wound` and `sever`).
 *
 * @packageDocumentation
 */

import { registerGenerator, type Entity, type EntityGenerator, type ParamSpec } from "@voxolith/engine";
import { buildBody } from "./body";
import { buildClips } from "./clips";
import { cloneParams, type CreatureParams } from "./params";
import { PRESETS, skinFor } from "./presets";
import { buildRoles, INTERIOR, ROLE, ROLE_COUNT } from "./roles";

/** Counts and timing from one {@link generateCreature} call. */
export interface CreatureStats {
  /** Solid voxels in the rest-pose model, inside included. */
  voxels: number;
  bones: number;
  clips: number;
  /** Model size in voxels. */
  size: { x: number; y: number; z: number };
  /** Wall-clock generation time. */
  ms: number;
}

/**
 * Generate a rigged, animated creature: the rest-pose body built bone by bone, layered inside by
 * depth (fur, fat, flesh, muscle) with bones and organs below the surface, painted, bound to a
 * 26-bone rig, and given walk, turn, run, idle, sniff and death clips at 12 fps. The rig's
 * `cover` table draws flesh a pose uncovers as fur, so only damage shows the inside. Pure and
 * deterministic in its params and rng.
 *
 * Coarse only: there is no finer-scale context. For a world at a fixed voxels-per-metre, size the
 * params with {@link atScale} first.
 *
 * @param params - The creature; not mutated. Start from a {@link PRESETS} entry.
 * @param rng - Source of all randomness, returning 0..1 (e.g. `seededRandom(seed)`).
 * @param id - The entity id.
 * @returns The entity (kind `creature`, with `rig` and `clips`, nose towards +z, anchored on the
 * ground under the middle of the body) and stats.
 * @example
 * ```ts
 * import { seededRandom } from "@voxolith/renderer/core";
 * import { makeAnimator } from "@voxolith/engine/animation";
 * import { generateCreature, PRESETS } from "@voxolith/gen-creature";
 *
 * const { entity } = generateCreature(PRESETS["grey rat"], seededRandom(9));
 * const anim = makeAnimator(entity, "walk");
 * for (const e of anim.update(dt)) if (e.name.startsWith("foot.")) footstep();
 * ```
 */
export function generateCreature(params: CreatureParams, rng: () => number, id = "creature"): { entity: Entity; stats: CreatureStats } {
  const t0 = performance.now();
  const p = cloneParams(params);
  const { model, rig, bone } = buildBody(p, rng);
  // When a pose uncovers flesh that was buried at rest (under a swinging
  // haunch, at a bending neck), draw it as fur; wounds still show inside.
  const cover = new Array<number>(ROLE_COUNT + 1).fill(0);
  for (const v of INTERIOR) cover[v] = ROLE.FUR;
  rig.cover = cover;
  const clips = buildClips(p, bone);
  let voxels = 0;
  for (const v of model.data) if (v) voxels++;
  return {
    entity: {
      id,
      kind: "creature",
      model,
      rig,
      clips,
      meta: { species: p.species, generator: "voxolith/gen-creature" },
    },
    stats: { voxels, bones: rig.bones.length, clips: clips.length, size: model.size, ms: performance.now() - t0 },
  };
}

const PARAMS: ParamSpec[] = [
  { path: "shape.size", label: "Size", kind: "number", min: 0.7, max: 2, step: 0.05, group: "Shape", help: "scales the whole creature, about 62 voxels nose to tail per unit; below about 0.7 legs thin under 2 voxels" },
  { path: "shape.bodyLength", label: "Body length", kind: "number", min: 0.7, max: 1.5, step: 0.05, group: "Shape", help: "length of the torso as a multiple of the species' proportions" },
  { path: "shape.girth", label: "Girth", kind: "number", min: 0.7, max: 1.5, step: 0.05, group: "Shape", help: "body width and depth as a multiple; higher is a plumper creature" },
  { path: "shape.headLength", label: "Head length", kind: "number", min: 0.7, max: 1.4, step: 0.05, group: "Shape", help: "head length from neck to nose as a multiple" },
  { path: "shape.snout", label: "Snout taper", kind: "number", min: 0, max: 1, step: 0.05, group: "Shape", help: "how far the snout narrows to the nose: 0 blunt, 1 pointed" },
  { path: "shape.ears", label: "Ears", kind: "number", min: 0.6, max: 1.6, step: 0.05, group: "Shape", help: "ear size as a multiple" },
  { path: "shape.legLength", label: "Leg length", kind: "number", min: 0.8, max: 2, step: 0.05, group: "Shape", help: "leg length as a multiple; longer legs carry the body higher off the ground" },
  { path: "shape.legThickness", label: "Leg thickness", kind: "number", min: 0.8, max: 1.5, step: 0.05, group: "Shape", help: "leg and foot thickness as a multiple" },
  { path: "shape.tailLength", label: "Tail length", kind: "number", min: 0.4, max: 1.5, step: 0.05, group: "Shape", help: "tail length as a multiple" },
  { path: "shape.tailThickness", label: "Tail thickness", kind: "number", min: 0.7, max: 1.5, step: 0.05, group: "Shape", help: "tail thickness as a multiple" },
  { path: "look.coat", label: "Coat", kind: "enum", options: ["brown", "grey", "white", "black"], group: "Look", help: "fur colour: brown, grey, white or black" },
  { path: "look.belly", label: "Belly", kind: "number", min: 0, max: 1, step: 0.05, group: "Look", help: "how much lighter the belly is than the back, 0 the same colour" },
  { path: "look.mottle", label: "Mottle", kind: "number", min: 0, max: 1, step: 0.05, group: "Look", help: "dark and light flecks through the fur; 0 is an even coat" },
  { path: "look.redEyes", label: "Red eyes", kind: "bool", group: "Look", help: "albino red eyes instead of black" },
  { path: "gait.stride", label: "Stride", kind: "number", min: 0.5, max: 1.5, step: 0.05, group: "Gait", help: "how far the legs swing in the walk and run clips, 1 natural" },
  { path: "gait.pace", label: "Pace", kind: "number", min: 0.6, max: 2.5, step: 0.05, group: "Gait", help: "walk cycles per second; the run is about twice as fast" },
  { path: "gait.bounce", label: "Bounce", kind: "number", min: 0, max: 2, step: 0.05, group: "Gait", help: "how much the body bobs as it walks and runs; 0 glides level" },
  { path: "gait.tailSway", label: "Tail sway", kind: "number", min: 0, max: 2, step: 0.05, group: "Gait", help: "how far the tail swings from side to side as it moves" },
];

/** The `voxolith/creature` generator: rigged rats, defaults {@link PRESETS}.rat. */
export const creatureGenerator: EntityGenerator<CreatureParams> = {
  id: "voxolith/creature",
  name: "Creature",
  version: "0.2.0",
  description: "Rigged, animated rat: fur over fat, flesh, bone and organs; generated walk, run, idle, sniff, turn and death clips.",
  roles: buildRoles(skinFor("brown", false, 0.7)),
  defaults: PRESETS.rat,
  params: PARAMS,
  generate: (params, rng) => generateCreature(params, rng).entity,
};

/** Register the creature generator with the engine registry. */
export function registerCreatureGenerators(): void {
  registerGenerator(creatureGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor, atScale } from "./presets";
export { ROLE, ROLE_COUNT, INTERIOR, buildRoles } from "./roles";
export { LEGS } from "./body";
export { cloneParams } from "./params";
export type { CreatureParams, Coat } from "./params";
export type { ColorSet } from "./roles";
