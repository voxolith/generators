// @voxolith/gen-tree — procedural voxel trees.
//
// One pipeline, two species families: grow a skeleton, rasterise it as wood,
// paint bark on the surface only, hang foliage off the twigs, carve the canopy
// so it has gaps and a ragged outline, colour the leaves, then prune anything
// that ended up disconnected so the result is always a single piece.

import { makeNoise, Volume } from "@voxolith/engine/build";
import { registerGenerator, type Entity, type EntityGenerator, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { buildHull, carveCanopy, shadeLeaves, skyOcclusion } from "./canopy";
import { paintBark } from "./bark";
import { placeBroadleafClusters, type ClusterResult } from "./foliage/broadleaf";
import { placeConiferNeedles } from "./foliage/conifer";
import { applyAgeAndHealth, applyBlossom, applySnow, planSeason } from "./season";
import { buildRoles, isWood } from "./roles";
import { cloneParams, REFERENCE_HEIGHT, type TreeParams } from "./params";
import { PRESETS, skinFor } from "./presets";
import { fitHeight, growSkeleton } from "./skeleton";
import { voxelizeWood } from "./voxelize";

export interface TreeStats {
  wood: number;
  foliage: number;
  total: number;
  stems: number;
  segments: number;
  clusters: number;
  /** Leaves removed by the shell hollow and the sky-hole carve. */
  shellCarved: number;
  macroCarved: number;
  /** Voxels dropped because they were not connected to the base. */
  pruned: number;
  size: { x: number; y: number; z: number };
  ms: number;
}

export interface TreeResult {
  entity: Entity;
  stats: TreeStats;
}

export function generateTree(params: TreeParams, rng: () => number, id = "tree"): TreeResult {
  const t0 = performance.now();
  const p = cloneParams(params);
  applyAgeAndHealth(p.shape, p.look);

  const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const vs = p.shape.height / REFERENCE_HEIGHT;
  const plan = planSeason(p.look, p.shape.kind);
  const foliageOn = p.foliage.enabled && !plan.bare;

  const skel = growSkeleton(p.shape, rng, noise);
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
    const hull = buildHull(vol, origin[0], origin[2]);
    carve = carveCanopy(vol, hull, p.foliage, noise, vs);
    const sky = skyOcclusion(vol);
    shadeLeaves(vol, {
      hull,
      sky,
      clusterId: cluster.clusterId,
      noise,
      look: p.look,
      vs,
      tones: plan.tones,
      edge: plan.edge,
      accent: plan.accent,
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

  const roles = buildRoles(skinFor(p.species, p.look.season));
  const model = vol.crop(origin, roles);
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
  { path: "shape.height", label: "Height", kind: "int", min: 32, max: 240, group: "Shape" },
  { path: "shape.trunk.radiusRatio", label: "Trunk radius", kind: "number", min: 0.012, max: 0.05, step: 0.001, group: "Shape" },
  { path: "shape.trunk.taperExp", label: "Taper", kind: "number", min: 0.3, max: 1.4, step: 0.05, group: "Shape" },
  { path: "shape.trunk.leanDeg", label: "Lean", kind: "number", min: 0, max: 12, step: 0.5, group: "Shape" },
  { path: "shape.trunk.sweepDeg", label: "Sweep", kind: "number", min: 0, max: 20, step: 0.5, group: "Shape" },
  { path: "shape.trunk.flareGain", label: "Root flare", kind: "number", min: 0, max: 1.6, step: 0.05, group: "Shape" },
  { path: "shape.crownStartRatio", label: "Crown start", kind: "number", min: 0.05, max: 0.8, step: 0.01, group: "Shape" },
  { path: "shape.pipeExp", label: "Fork mass", kind: "number", min: 1.8, max: 3, step: 0.05, group: "Shape" },
  { path: "foliage.enabled", label: "Foliage", kind: "bool", group: "Foliage" },
  { path: "foliage.clusterRadius", label: "Cluster radius", kind: "number", min: 2, max: 9, step: 0.1, group: "Foliage" },
  { path: "foliage.spacing", label: "Cluster spacing", kind: "number", min: 1, max: 8, step: 0.1, group: "Foliage" },
  { path: "foliage.shellDepth", label: "Shell depth", kind: "number", min: 0, max: 40, step: 1, group: "Foliage" },
  { path: "foliage.macroThreshold", label: "Sky holes", kind: "number", min: 0, max: 0.6, step: 0.01, group: "Foliage" },
  { path: "look.season", label: "Season", kind: "enum", options: ["spring", "summer", "autumn", "winter"], group: "Look" },
  { path: "look.age", label: "Age", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.health", label: "Health", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.furrowWavelength", label: "Bark furrows", kind: "number", min: 2, max: 10, step: 0.5, group: "Look" },
  { path: "look.moss", label: "Moss", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
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
    defaults,
    params: SHARED_PARAMS,
    generate: (params, rng) => generateTree(params, rng).entity,
  };
}

export const broadleafGenerator = makeTreeGenerator("broadleaf", PRESETS.oak);
export const coniferGenerator = makeTreeGenerator("conifer", PRESETS.spruce);

/** Register both generators with the engine registry. */
export function registerTreeGenerators(): void {
  registerGenerator(broadleafGenerator);
  registerGenerator(coniferGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor } from "./presets";
export { ROLE, buildRoles } from "./roles";
export type { TreeParams, ShapeParams, FoliageParams, LookParams, Season, SpeciesKind } from "./params";
export { cloneParams } from "./params";
