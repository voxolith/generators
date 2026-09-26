/**
 * @voxolith/gen-tree: procedural voxel trees.
 *
 * One pipeline, two species families: grow a branch skeleton, rasterise it as
 * wood, paint bark on the surface only, hang foliage off the twigs, carve the
 * canopy so it has gaps and a ragged outline, colour the leaves, then prune
 * anything that ended up disconnected so the result is always a single piece.
 *
 * The generic parts — branch growth, clump placement, canopy carving and
 * exposure shading — live in @voxolith/gen-kit and are shared with the
 * other vegetation generators.
 *
 * @packageDocumentation
 */

import {
  buildHull,
  carveCanopy,
  fitHeight,
  growBranches,
  makeNoise,
  shadeByExposure,
  skyOcclusion,
  Volume,
  type BranchParams,
  type ClusterResult,
} from "@voxolith/gen-kit";
import { refinement, registerGenerator, type Entity, type EntityGenerator, type GenerateContext, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { fineTree } from "./fine";
import { paintBark } from "./bark";
import { placeBroadleafClusters } from "./foliage/broadleaf";
import { placeConiferNeedles } from "./foliage/conifer";
import { applyAgeAndHealth, applyBlossom, applySnow, planSeason } from "./season";
import { buildRoles, isLeaf, isWood, ROLE } from "./roles";
import { cloneParams, REFERENCE_HEIGHT, type ShapeParams, type TreeParams } from "./params";
import { PRESETS, skinFor } from "./presets";
import { voxelizeWood } from "./voxelize";

/** Counts and timing from one {@link generateTree} call, for tuning. Voxel counts are coarse. */
export interface TreeStats {
  /** Wood voxels (heartwood, bark, moss, twigs). */
  wood: number;
  /** Leaf, blossom and cone voxels. */
  foliage: number;
  total: number;
  /** Stems in the skeleton, trunk included. */
  stems: number;
  segments: number;
  /** Leaf clusters placed. */
  clusters: number;
  /** Leaves removed by the shell hollow and the sky-hole carve. */
  shellCarved: number;
  macroCarved: number;
  /** Voxels dropped because they were not connected to the base. */
  pruned: number;
  /** Model size in voxels (at a finer scale, the refined size). */
  size: { x: number; y: number; z: number };
  /** Wall-clock generation time. */
  ms: number;
}

/** What {@link generateTree} returns: the entity and its stats. */
export interface TreeResult {
  entity: Entity;
  stats: TreeStats;
}

/** Translate the tree's ratio-based parameters into absolute branch growth. */
function branchParamsFor(shape: ShapeParams, rng: () => number): BranchParams {
  const deg = (d: number) => (d * Math.PI) / 180;
  const leanAz = rng() * Math.PI * 2;
  const lean = deg(shape.trunk.leanDeg) * rng();
  const dir: Vec3 = [Math.sin(lean) * Math.cos(leanAz), Math.cos(lean), Math.sin(lean) * Math.sin(leanAz)];
  return {
    seeds: [
      {
        origin: [0, 0, 0],
        dir,
        length: shape.height * shape.trunk.lengthRatio,
        radius: shape.height * shape.trunk.radiusRatio,
      },
    ],
    base: {
      taperExp: shape.trunk.taperExp,
      sweepDeg: shape.trunk.sweepDeg,
      curl: shape.trunk.curl,
      segLen: shape.trunk.segLen,
    },
    childStart: shape.crownStartRatio,
    childEnd: shape.crownEndRatio,
    envelope: shape.envelope,
    azimuthJitterDeg: shape.azimuthJitterDeg,
    whorl: shape.whorl,
    whorlSpacing: shape.height * shape.whorlSpacingRatio,
    pipeExp: shape.pipeExp,
    branchTaper: shape.branchTaper,
    minRadius: shape.minRadius,
    levels: shape.levels,
    unit: shape.height / REFERENCE_HEIGHT,
  };
}

/**
 * Generate a tree: grow the skeleton, voxelise and bark the wood, hang and carve the foliage,
 * shade it, apply the season, then drop anything not connected to the base, so the result is
 * always one piece. Pure and deterministic: the same params and rng sequence give the same tree.
 *
 * With `ctx.voxelsPerMetre` above the native 10 (50 or 100), the same design comes back refined:
 * a sparse model k times the size, its wood redrawn from the skeleton at real thickness.
 *
 * @param params - The tree; not mutated. Start from a {@link PRESETS} entry.
 * @param rng - Source of all randomness, returning 0..1 (e.g. `seededRandom(seed)`).
 * @param id - The entity id.
 * @param ctx - Optional scale; omitted or 10 voxels per metre gives the coarse model.
 * @returns The entity (kind `tree.broadleaf` or `tree.conifer`, anchored at the foot of the
 * trunk) and stats.
 * @example
 * ```ts
 * import { seededRandom } from "@voxolith/renderer/core";
 * import { cloneParams, generateTree, PRESETS } from "@voxolith/gen-tree";
 *
 * const p = cloneParams(PRESETS.oak);
 * p.look.season = "autumn";
 * const { entity, stats } = generateTree(p, seededRandom(7));
 * const fine = generateTree(p, seededRandom(7), "oak", { voxelsPerMetre: 100 }).entity; // sparse
 * ```
 */
export function generateTree(params: TreeParams, rng: () => number, id = "tree", ctx?: GenerateContext): TreeResult {
  const t0 = performance.now();
  const p = cloneParams(params);
  applyAgeAndHealth(p.shape, p.look);

  const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const vs = p.shape.height / REFERENCE_HEIGHT;
  const plan = planSeason(p.look, p.shape.kind);
  const foliageOn = p.foliage.enabled && !plan.bare;

  const skel = growBranches(branchParamsFor(p.shape, rng), rng, noise);
  // Foliage sits above the topmost twig, so leave it headroom before fitting.
  const headroom = foliageOn
    ? p.shape.kind === "broadleaf"
      ? p.foliage.clusterRadius * vs * 1.8
      : 4 * vs
    : 2;
  fitHeight(skel, Math.max(8, p.shape.height - headroom));

  const pad = Math.ceil(6 + (foliageOn ? p.foliage.clusterRadius * vs * 1.6 : 2));
  const half = Math.ceil(skel.spread + pad);
  const sx = half * 2 + 2;
  const sy = Math.ceil(skel.topY + pad) + 2;
  const vol = new Volume(sx, sy, sx);
  const origin: Vec3 = [sx / 2, 0, sx / 2];

  const wood = voxelizeWood(vol, skel, p.shape, origin, rng);
  paintBark(vol, skel, wood.segId, p.shape, p.look, origin, noise);

  let cluster: ClusterResult = { clusterId: new Uint16Array(0), clusters: 0, placed: 0 };
  let carve = { shell: 0, macro: 0 };
  if (foliageOn) {
    const density = plan.density * (0.5 + 0.5 * Math.max(0, Math.min(1, p.look.health)));
    cluster =
      p.shape.kind === "broadleaf"
        ? placeBroadleafClusters(vol, skel, p.shape, p.foliage, origin, noise, rng, vs, density)
        : placeConiferNeedles(vol, skel, p.shape, p.foliage, origin, noise, rng, vs, density);
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
      tones: plan.tones,
      edge: plan.edge,
      accent: plan.accent,
      accentFraction: p.look.accentFraction,
      dead: ROLE.LEAF_DEAD,
      deadFraction: (1 - p.look.health) * 0.3,
      ditherScale: 0.08 / vs,
    });
    if (p.look.season === "spring") applyBlossom(vol, cluster.clusterId, p.look.blossom);
  }
  if (p.look.season === "winter") applySnow(vol, p.look.snow, noise);

  // One piece, always: carving can strand leaf fragments, and a tree that falls
  // apart under a connectivity check looks broken and breaks physics gameplay.
  const seedR = Math.max(4, p.shape.height * p.shape.trunk.radiusRatio * 3);
  const { visited } = vol.flood6(
    (x, y, z) => y <= 1 && Math.hypot(x + 0.5 - origin[0], z + 0.5 - origin[2]) <= seedR,
  );
  let pruned = 0;
  for (let i = 0; i < vol.data.length; i++) {
    if (vol.data[i] !== 0 && visited[i] === 0) {
      vol.data[i] = 0;
      pruned++;
    }
  }

  let model = vol.crop(origin, buildRoles(skinFor(p.species, p.look.season)));
  const k = refinement(ctx);
  if (k > 1) {
    const cropOffset: Vec3 = [origin[0] - model.anchor[0], origin[1] - model.anchor[1], origin[2] - model.anchor[2]];
    model = fineTree({ coarse: model, skel, wood, kind: p.shape.kind, origin, cropOffset, k, seed: Math.floor(rng() * 0x7fffffff) }).model;
  }
  let woodFinal = 0;
  let leafFinal = 0;
  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (v === 0) continue;
    if (isWood(v)) woodFinal++;
    else leafFinal++;
  }

  const entity: Entity = {
    id,
    kind: `tree.${p.shape.kind}`,
    model,
    meta: {
      species: p.species,
      season: p.look.season,
      height: p.shape.height,
      generator: "voxolith/gen-tree",
      ...(k > 1 ? { voxelsPerMetre: k * 10 } : {}),
    },
  };

  return {
    entity,
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

// --- generator registration ------------------------------------------------

const SHARED_PARAMS: ParamSpec[] = [
  { path: "shape.height", label: "Height", kind: "int", min: 32, max: 240, group: "Shape", help: "overall height in voxels (10 per metre); the whole tree scales with it" },
  { path: "shape.trunk.radiusRatio", label: "Trunk radius", kind: "number", min: 0.012, max: 0.05, step: 0.001, group: "Shape", help: "trunk base radius as a fraction of height; higher is a stouter bole" },
  { path: "shape.trunk.taperExp", label: "Taper", kind: "number", min: 0.3, max: 1.4, step: 0.05, group: "Shape", help: "how the trunk narrows: 1 is a straight cone, lower keeps it thick higher up" },
  { path: "shape.trunk.leanDeg", label: "Lean", kind: "number", min: 0, max: 12, step: 0.5, group: "Shape", help: "most the trunk may lean from vertical, in degrees; the actual lean is random up to this" },
  { path: "shape.trunk.sweepDeg", label: "Sweep", kind: "number", min: 0, max: 20, step: 0.5, group: "Shape", help: "total sideways bend of the trunk from base to top, in degrees" },
  { path: "shape.trunk.flareGain", label: "Root flare", kind: "number", min: 0, max: 1.6, step: 0.05, group: "Shape", help: "extra radius at the foot as a fraction of the base radius; 0 is a straight stem" },
  { path: "shape.crownStartRatio", label: "Crown start", kind: "number", min: 0.05, max: 0.8, step: 0.01, group: "Shape", help: "where the lowest branches leave the trunk, as a fraction of its length; higher is a longer bare bole" },
  { path: "shape.pipeExp", label: "Fork mass", kind: "number", min: 1.8, max: 3, step: 0.05, group: "Shape", help: "pipe-model exponent; higher keeps child branches thicker where they fork" },
  { path: "foliage.enabled", label: "Foliage", kind: "bool", group: "Foliage", help: "grow leaves or needles; off gives the bare wood skeleton" },
  { path: "foliage.clusterRadius", label: "Cluster radius", kind: "number", min: 2, max: 9, step: 0.1, group: "Foliage", help: "broadleaf leaf clump radius in voxels at height 192; larger clumps give a fuller, lumpier crown" },
  { path: "foliage.spacing", label: "Cluster spacing", kind: "number", min: 1, max: 8, step: 0.1, group: "Foliage", help: "broadleaf gap between clumps along a twig in voxels at height 192; lower packs them closer" },
  { path: "foliage.shellDepth", label: "Shell depth", kind: "number", min: 0, max: 40, step: 1, group: "Foliage", help: "leaves deeper than this below the canopy surface are dropped, in voxels at height 192; 0 keeps a solid crown" },
  { path: "foliage.macroThreshold", label: "Sky holes", kind: "number", min: 0, max: 0.6, step: 0.01, group: "Foliage", help: "size of the sky holes carved through the canopy; 0 carves none" },
  { path: "look.season", label: "Season", kind: "enum", options: ["spring", "summer", "autumn", "winter"], group: "Look", help: "leaf colours and density; a winter broadleaf is bare with snow on its upper faces" },
  { path: "look.age", label: "Age", kind: "number", min: 0, max: 1, step: 0.05, group: "Look", help: "0 young and slender, 1 old: fatter trunk, more gnarl, a higher crown base, drooping limbs" },
  { path: "look.health", label: "Health", kind: "number", min: 0, max: 1, step: 0.05, group: "Look", help: "1 healthy; lower thins the foliage and turns more of it dead brown" },
  { path: "look.furrowWavelength", label: "Bark furrows", kind: "number", min: 2, max: 10, step: 0.5, group: "Look", help: "spacing of bark furrows around the trunk in voxels; higher gives broader plates" },
  { path: "look.moss", label: "Moss", kind: "number", min: 0, max: 1, step: 0.05, group: "Look", help: "moss cover on one side of the lower trunk; 0 is none" },
];

function makeTreeGenerator(kind: "broadleaf" | "conifer", defaults: TreeParams): EntityGenerator<TreeParams> {
  return {
    id: `voxolith/tree.${kind}`,
    name: kind === "broadleaf" ? "Broadleaf tree" : "Conifer tree",
    version: "0.1.0",
    description:
      kind === "broadleaf"
        ? "Oak-like tree: flared trunk, recursive limbs, leaf clusters with sky holes."
        : "Spruce-like tree: straight leader, whorled branches, needle sheaths in a conical crown.",
    roles: buildRoles(skinFor(defaults.species, defaults.look.season)),
    looseRoles: [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO, ROLE.LEAF_EDGE, ROLE.LEAF_ACCENT, ROLE.LEAF_DEAD, ROLE.BLOSSOM, ROLE.SNOW, ROLE.CONE].map((v) => buildRoles(skinFor(defaults.species, defaults.look.season))[v - 1].id),
    defaults,
    params: SHARED_PARAMS,
    generate: (params, rng, ctx) => generateTree(params, rng, undefined, ctx).entity,
    scales: [50, 100],
  };
}

/** The `voxolith/tree.broadleaf` generator: oak-like trees, defaults {@link PRESETS}.oak. */
export const broadleafGenerator = makeTreeGenerator("broadleaf", PRESETS.oak);
/** The `voxolith/tree.conifer` generator: spruce-like trees, defaults {@link PRESETS}.spruce. */
export const coniferGenerator = makeTreeGenerator("conifer", PRESETS.spruce);

/** Register both generators with the engine registry. */
export function registerTreeGenerators(): void {
  registerGenerator(broadleafGenerator);
  registerGenerator(coniferGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor } from "./presets";
export { ROLE, buildRoles } from "./roles";
export type { TreeParams, ShapeParams, TrunkParams, FoliageParams, LookParams, Season, SpeciesKind, BranchLevel } from "./params";
export type { ColorSet } from "./roles";
export { cloneParams } from "./params";
