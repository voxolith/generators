// @voxolith/gen-creature — rigged, animated voxel creatures. A rat first.
//
// The entity is a rest-pose model whose voxels know their bone, a rig and a
// set of generated clips (walk, run, idle, sniff, turns, death). Under the fur
// there is fat, flesh, muscle, a skeleton, a skull with a brain and organs in
// the chest and belly, all out of sight until damage exposes them (see
// @voxolith/engine/animation `wound` and `sever`).

import { registerGenerator, type Entity, type EntityGenerator, type ParamSpec } from "@voxolith/engine";
import { buildBody } from "./body";
import { buildClips } from "./clips";
import { cloneParams, type CreatureParams } from "./params";
import { PRESETS, skinFor } from "./presets";
import { buildRoles, INTERIOR, ROLE, ROLE_COUNT } from "./roles";

export interface CreatureStats {
  voxels: number;
  bones: number;
  clips: number;
  size: { x: number; y: number; z: number };
  ms: number;
}

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
  { path: "shape.size", label: "Size", kind: "number", min: 0.7, max: 2, step: 0.05, group: "Shape" },
  { path: "shape.bodyLength", label: "Body length", kind: "number", min: 0.7, max: 1.5, step: 0.05, group: "Shape" },
  { path: "shape.girth", label: "Girth", kind: "number", min: 0.7, max: 1.5, step: 0.05, group: "Shape" },
  { path: "shape.headLength", label: "Head length", kind: "number", min: 0.7, max: 1.4, step: 0.05, group: "Shape" },
  { path: "shape.snout", label: "Snout taper", kind: "number", min: 0, max: 1, step: 0.05, group: "Shape" },
  { path: "shape.ears", label: "Ears", kind: "number", min: 0.6, max: 1.6, step: 0.05, group: "Shape" },
  { path: "shape.legLength", label: "Leg length", kind: "number", min: 0.8, max: 2, step: 0.05, group: "Shape" },
  { path: "shape.legThickness", label: "Leg thickness", kind: "number", min: 0.8, max: 1.5, step: 0.05, group: "Shape" },
  { path: "shape.tailLength", label: "Tail length", kind: "number", min: 0.4, max: 1.5, step: 0.05, group: "Shape" },
  { path: "shape.tailThickness", label: "Tail thickness", kind: "number", min: 0.7, max: 1.5, step: 0.05, group: "Shape" },
  { path: "look.coat", label: "Coat", kind: "enum", options: ["brown", "grey", "white", "black"], group: "Look" },
  { path: "look.belly", label: "Belly", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.mottle", label: "Mottle", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.redEyes", label: "Red eyes", kind: "bool", group: "Look" },
  { path: "gait.stride", label: "Stride", kind: "number", min: 0.5, max: 1.5, step: 0.05, group: "Gait" },
  { path: "gait.pace", label: "Pace", kind: "number", min: 0.6, max: 2.5, step: 0.05, group: "Gait" },
  { path: "gait.bounce", label: "Bounce", kind: "number", min: 0, max: 2, step: 0.05, group: "Gait" },
  { path: "gait.tailSway", label: "Tail sway", kind: "number", min: 0, max: 2, step: 0.05, group: "Gait" },
];

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

export function registerCreatureGenerators(): void {
  registerGenerator(creatureGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor, atScale } from "./presets";
export { ROLE, ROLE_COUNT, INTERIOR, buildRoles } from "./roles";
export { LEGS } from "./body";
export { cloneParams } from "./params";
export type { CreatureParams, Coat } from "./params";
