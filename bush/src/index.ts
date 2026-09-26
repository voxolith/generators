/**
 * @voxolith/gen-bush: procedural voxel shrubs.
 *
 * Shares the branching, clump placement and canopy shaping in
 * @voxolith/gen-kit with the tree generator; what differs is the base. A
 * bush has no trunk: several stems leave the ground together and lean outward,
 * and a thicket scatters more clumps of them around the centre.
 *
 * @packageDocumentation
 */

import {
  buildHull,
  carveCanopy,
  fitHeight,
  growBranches,
  hash01,
  makeNoise,
  placeClusters,
  shadeByExposure,
  skyOcclusion,
  spotsAlong,
  Volume,
  type ClusterResult,
  type ClusterSpot,
} from "@voxolith/gen-kit";
import { refinement, registerGenerator, type Entity, type EntityGenerator, type GenerateContext, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { fineBush } from "./fine";
import { buildRoles, isLeaf, isWood, ROLE } from "./roles";
import { cloneParams, REFERENCE_HEIGHT, type BushParams } from "./params";
import { PRESETS, skinFor } from "./presets";
import { bushSeeds, paintStems, voxelizeStems } from "./stems";

/** Counts and timing from one {@link generateBush} call, for tuning. Voxel counts are coarse. */
export interface BushStats {
  /** Stem, twig and thorn voxels. */
  wood: number;
  /** Leaf, blossom and berry voxels. */
  foliage: number;
  total: number;
  /** Stems in the skeleton, ground stems included. */
  stems: number;
  segments: number;
  /** Leaf clumps placed. */
  clusters: number;
  /** Leaves removed by the shell hollow and the sky-hole carve. */
  shellCarved: number;
  macroCarved: number;
  /** Voxels dropped because they were not connected to the ground. */
  pruned: number;
  /** Model size in voxels (at a finer scale, the refined size). */
  size: { x: number; y: number; z: number };
  /** Wall-clock generation time. */
  ms: number;
}

/** What {@link generateBush} returns: the entity and its stats. */
export interface BushResult {
  entity: Entity;
  stats: BushStats;
}

// Season changes the palette behind these roles, not the roles themselves.
const TONES: [number, number, number] = [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO];

/**
 * Generate a bush: several stems leave the ground together and lean outward (plus satellite
 * clumps for a thicket), branch, carry carved and shaded leaf clumps, thorns, berries or blossom,
 * then anything not connected to the ground is dropped, so the result is one piece. Pure and
 * deterministic in its params and rng.
 *
 * With `ctx.voxelsPerMetre` above the native 10 (50 or 100), the same design comes back refined:
 * a sparse model k times the size, stems redrawn from the skeleton.
 *
 * @param params - The bush; not mutated. Start from a {@link PRESETS} entry.
 * @param rng - Source of all randomness, returning 0..1 (e.g. `seededRandom(seed)`).
 * @param id - The entity id.
 * @param ctx - Optional scale; omitted or 10 voxels per metre gives the coarse model.
 * @returns The entity (kind `bush`, anchored at the centre of its base) and stats.
 * @example
 * ```ts
 * import { seededRandom } from "@voxolith/renderer/core";
 * import { cloneParams, generateBush, PRESETS } from "@voxolith/gen-bush";
 *
 * const p = cloneParams(PRESETS.bramble);
 * p.look.berryFraction = 0.3;
 * const { entity } = generateBush(p, seededRandom(3));
 * ```
 */
export function generateBush(params: BushParams, rng: () => number, id = "bush", ctx?: GenerateContext): BushResult {
  const t0 = performance.now();
  const p = cloneParams(params);
  const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const vs = p.shape.height / REFERENCE_HEIGHT;
  // Deciduous shrubs drop their leaves; evergreens like the hedge keep them.
  const bare = p.look.season === "winter" && p.species !== "hedge";
  const foliageOn = p.foliage.enabled && !bare;

  const skel = growBranches(
    {
      seeds: bushSeeds(p.shape, rng),
      base: {
        taperExp: p.shape.taperExp,
        sweepDeg: p.shape.sweepDeg,
        curl: p.shape.curl,
        segLen: p.shape.segLen,
        gravity: 0.002,
        photo: 0.004,
      },
      childStart: p.shape.childStart,
      childEnd: p.shape.childEnd,
      envelope: "mid",
      azimuthJitterDeg: p.shape.azimuthJitterDeg,
      whorl: 0,
      whorlSpacing: 0,
      pipeExp: p.shape.pipeExp,
      branchTaper: p.shape.branchTaper,
      minRadius: p.shape.minRadius,
      levels: p.shape.levels,
      unit: vs,
    },
    rng,
    noise,
  );

  const headroom = foliageOn ? p.foliage.clusterRadius * vs * 1.6 : 2;
  fitHeight(skel, Math.max(6, p.shape.height - headroom));

  const pad = Math.ceil(4 + (foliageOn ? p.foliage.clusterRadius * vs * 1.6 : 2));
  const half = Math.ceil(skel.spread + pad);
  const sx = half * 2 + 2;
  const sy = Math.ceil(skel.topY + pad) + 2;
  const vol = new Volume(sx, sy, sx);
  const origin: Vec3 = [sx / 2, 0, sx / 2];

  const wood = voxelizeStems(vol, skel, origin);
  paintStems(vol, skel, wood.segId, origin, p.look, noise, rng);

  let cluster: ClusterResult = { clusterId: new Uint16Array(0), clusters: 0, placed: 0 };
  let carve = { shell: 0, macro: 0 };
  if (foliageOn) {
    const spacing = Math.max(1, p.foliage.spacing * vs);
    const baseR = p.foliage.clusterRadius * vs;
    const minLevel = Math.max(1, p.shape.levels.length - 1);
    const spots: ClusterSpot[] = [];
    for (const stem of skel.stems) {
      if (stem.level < minLevel) continue;
      spotsAlong(stem.points, stem.arc, spacing, baseR, spots);
    }
    for (const tip of skel.tips) {
      spots.push({ p: [tip.p[0], tip.p[1], tip.p[2]], dir: tip.dir, radius: baseR * p.foliage.tipBoost });
    }
    // Stem points are still in skeleton space; shift the spots into the volume.
    for (const s of spots) {
      s.p[0] += origin[0];
      s.p[1] += origin[1];
      s.p[2] += origin[2];
    }
    cluster = placeClusters(
      vol,
      spots,
      ROLE.LEAF_MID,
      {
        flatten: p.foliage.clusterFlatten,
        offset: 1,
        sizeVar: 0.3,
        fillCore: p.foliage.fillCore,
        fillRim: p.foliage.fillRim,
        scale: 0.6 / vs,
        density: p.foliage.density * (0.55 + 0.45 * Math.max(0, Math.min(1, p.look.health))),
      },
      noise,
      rng,
    );
    const hull = buildHull(vol, origin[0], origin[2], isLeaf);
    carve = carveCanopy(
      vol,
      hull,
      isLeaf,
      {
        shellDepth: p.foliage.shellDepth * vs,
        macroScale: p.foliage.macroScale / vs,
        macroThreshold: p.foliage.macroThreshold,
      },
      noise,
    );
    shadeByExposure(vol, {
      isTarget: isLeaf,
      hull,
      sky: skyOcclusion(vol),
      clusterId: cluster.clusterId,
      noise,
      tones: TONES,
      edge: ROLE.LEAF_EDGE,
      accent: ROLE.LEAF_ACCENT,
      accentFraction: p.look.accentFraction,
      dead: ROLE.LEAF_DEAD,
      deadFraction: (1 - p.look.health) * 0.35,
      ditherScale: 0.12 / vs,
    });
    // Flowers and fruit are chosen per clump, never per voxel, or they read as
    // confetti sprinkled over the shrub.
    decorate(vol, cluster.clusterId, p.look.season === "spring" ? p.look.blossom : 0, p.look.berryFraction);
  }
  if (p.look.season === "winter") applySnow(vol, p.look.snow, noise);

  const { visited } = vol.flood6((_x, y) => y <= 1);
  let pruned = 0;
  for (let i = 0; i < vol.data.length; i++) {
    if (vol.data[i] !== 0 && visited[i] === 0) {
      vol.data[i] = 0;
      pruned++;
    }
  }

  let model = vol.crop(origin, buildRoles(skinFor(p.species, p.look.season)));
  const k = refinement(ctx);
  if (k > 1) model = fineBush(model, skel, origin, k, Math.floor(rng() * 0x7fffffff));
  let woodFinal = 0;
  let leafFinal = 0;
  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (v === 0) continue;
    if (isWood(v)) woodFinal++;
    else leafFinal++;
  }

  return {
    entity: {
      id,
      kind: "bush",
      model,
      meta: { species: p.species, season: p.look.season, height: p.shape.height, generator: "voxolith/gen-bush", ...(k > 1 ? { voxelsPerMetre: k * 10 } : {}) },
    },
    stats: {
      wood: woodFinal,
      foliage: leafFinal,
      total: woodFinal + leafFinal,
      stems: skel.stems.length,
      segments: skel.segments.length,
      clusters: cluster.clusters,
      shellCarved: carve.shell,
      macroCarved: carve.macro,
      pruned,
      size: model.size,
      ms: performance.now() - t0,
    },
  };
}

/** Recolour the outer rim of whole clumps as blossom or berries. */
function decorate(vol: Volume, clusterId: Uint16Array, blossom: number, berry: number): void {
  if (blossom <= 0 && berry <= 0) return;
  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (v !== ROLE.LEAF_EDGE && v !== ROLE.LEAF_HI) continue;
    const cid = clusterId[i];
    if (cid === 0) continue;
    const h = hash01(cid * 40503);
    if (h < blossom) vol.data[i] = ROLE.BLOSSOM;
    else if (h > 1 - berry) vol.data[i] = ROLE.BERRY;
  }
}

/** Snow only where there is a clear column of sky above. */
function applySnow(vol: Volume, amount: number, noise: { value3: (x: number, y: number, z: number, s?: number) => number }): void {
  if (amount <= 0) return;
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  for (let i = 0; i < vol.data.length; i++) {
    if (vol.data[i] === 0) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;
    if (vol.get(x, y + 1, z) !== 0) continue;
    let clear = true;
    for (let k = 2; k <= 4; k++)
      if (vol.get(x, y + k, z) !== 0) {
        clear = false;
        break;
      }
    if (clear && noise.value3(x * 0.4, y * 0.4, z * 0.4, 9) < amount) vol.data[i] = ROLE.SNOW;
  }
}

// --- generator registration ------------------------------------------------

const PARAMS: ParamSpec[] = [
  { path: "shape.height", label: "Height", kind: "int", min: 12, max: 120, group: "Shape", help: "overall height in voxels (10 per metre); the whole shrub scales with it" },
  { path: "shape.leanDeg", label: "Stem lean", kind: "number", min: 0, max: 50, step: 1, group: "Shape", help: "how far the stems lean outward from vertical, in degrees; higher opens the vase wider" },
  { path: "shape.lengthRatio", label: "Stem length", kind: "number", min: 0.4, max: 1.3, step: 0.02, group: "Shape", help: "stem length as a fraction of height before the shrub is fitted to its height; longer stems give a leggier, more open shrub" },
  { path: "shape.radiusRatio", label: "Stem radius", kind: "number", min: 0.008, max: 0.05, step: 0.001, group: "Shape", help: "stem base radius as a fraction of height; higher gives thicker, woodier stems" },
  { path: "shape.clumps", label: "Extra clumps", kind: "int", min: 0, max: 8, group: "Shape", help: "extra, smaller clumps of stems scattered around the centre; 0 is a single shrub" },
  { path: "foliage.clusterRadius", label: "Clump radius", kind: "number", min: 1.5, max: 8, step: 0.1, group: "Foliage", help: "leaf clump radius in voxels at height 64; larger clumps give a fuller, rounder mass" },
  { path: "foliage.density", label: "Leaf density", kind: "number", min: 0.1, max: 1, step: 0.02, group: "Foliage", help: "fraction of leaf clumps kept; lower shows more of the twigs" },
  { path: "foliage.macroThreshold", label: "Sky holes", kind: "number", min: 0, max: 0.6, step: 0.01, group: "Foliage", help: "size of the sky holes carved through the leaves; 0 carves none" },
  { path: "look.season", label: "Season", kind: "enum", options: ["spring", "summer", "autumn", "winter"], group: "Look", help: "leaf colours and density; in winter every species but the hedge is bare, with snow on its upper faces" },
  { path: "look.health", label: "Health", kind: "number", min: 0, max: 1, step: 0.05, group: "Look", help: "1 healthy; lower thins the leaves and turns more of them dead brown" },
  { path: "look.thorns", label: "Thorns", kind: "number", min: 0, max: 0.5, step: 0.01, group: "Look", help: "thorn spikes on a fraction of the stem surface; 0 is a smooth shrub" },
  { path: "look.berryFraction", label: "Berries", kind: "number", min: 0, max: 0.5, step: 0.01, group: "Look", help: "fraction of leaf clumps whose outer rim carries berries" },
];

/** The `voxolith/bush` generator: a single multi-stemmed shrub, defaults {@link PRESETS}.bush. */
export const bushGenerator: EntityGenerator<BushParams> = {
  id: "voxolith/bush",
  name: "Bush",
  version: "0.1.0",
  description: "Multi-stemmed shrub: stems leaning out of the ground, leaf clumps, optional thorns and berries.",
  roles: buildRoles(skinFor("bush", "summer")),
  looseRoles: [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO, ROLE.LEAF_EDGE, ROLE.LEAF_ACCENT, ROLE.LEAF_DEAD, ROLE.BLOSSOM, ROLE.BERRY, ROLE.SNOW, ROLE.THORN].map((v) => buildRoles(skinFor("bush", "summer"))[v - 1].id),
  defaults: PRESETS.bush,
  params: PARAMS,
  generate: (params, rng, ctx) => generateBush(params, rng, undefined, ctx).entity,
  scales: [50, 100],
};

/** The `voxolith/thicket` generator: several clumps, defaults {@link PRESETS}.thicket. */
export const thicketGenerator: EntityGenerator<BushParams> = {
  ...bushGenerator,
  id: "voxolith/thicket",
  name: "Thicket",
  description: "Several clumps of shrub stems, staggered and unequal, for undergrowth.",
  defaults: PRESETS.thicket,
};

/** Register both generators with the engine registry. */
export function registerBushGenerators(): void {
  registerGenerator(bushGenerator);
  registerGenerator(thicketGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor } from "./presets";
export { ROLE, buildRoles } from "./roles";
export { cloneParams } from "./params";
export type { BushParams, ShapeParams, FoliageParams, LookParams, Season, BranchLevel } from "./params";
export type { ColorSet } from "./roles";
