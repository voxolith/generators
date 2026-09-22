// @voxolith/gen-bush — procedural voxel shrubs.
//
// Shares the branching, clump placement and canopy shaping in
// @voxolith/gen-kit with the tree generator; what differs is the base. A
// bush has no trunk: several stems leave the ground together and lean outward,
// and a thicket scatters more clumps of them around the centre.

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
import { registerGenerator, type Entity, type EntityGenerator, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { buildRoles, isLeaf, isWood, ROLE } from "./roles";
import { cloneParams, REFERENCE_HEIGHT, type BushParams } from "./params";
import { PRESETS, skinFor } from "./presets";
import { bushSeeds, paintStems, voxelizeStems } from "./stems";

export interface BushStats {
  wood: number;
  foliage: number;
  total: number;
  stems: number;
  segments: number;
  clusters: number;
  shellCarved: number;
  macroCarved: number;
  pruned: number;
  size: { x: number; y: number; z: number };
  ms: number;
}

export interface BushResult {
  entity: Entity;
  stats: BushStats;
}

// Season changes the palette behind these roles, not the roles themselves.
const TONES: [number, number, number] = [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO];

export function generateBush(params: BushParams, rng: () => number, id = "bush"): BushResult {
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

  const model = vol.crop(origin, buildRoles(skinFor(p.species, p.look.season)));
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
      meta: { species: p.species, season: p.look.season, height: p.shape.height, generator: "voxolith/gen-bush" },
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
  { path: "shape.height", label: "Height", kind: "int", min: 12, max: 120, group: "Shape" },
  { path: "shape.leanDeg", label: "Stem lean", kind: "number", min: 0, max: 50, step: 1, group: "Shape" },
  { path: "shape.lengthRatio", label: "Stem length", kind: "number", min: 0.4, max: 1.3, step: 0.02, group: "Shape" },
  { path: "shape.radiusRatio", label: "Stem radius", kind: "number", min: 0.008, max: 0.05, step: 0.001, group: "Shape" },
  { path: "shape.clumps", label: "Extra clumps", kind: "int", min: 0, max: 8, group: "Shape" },
  { path: "foliage.clusterRadius", label: "Clump radius", kind: "number", min: 1.5, max: 8, step: 0.1, group: "Foliage" },
  { path: "foliage.density", label: "Leaf density", kind: "number", min: 0.1, max: 1, step: 0.02, group: "Foliage" },
  { path: "foliage.macroThreshold", label: "Sky holes", kind: "number", min: 0, max: 0.6, step: 0.01, group: "Foliage" },
  { path: "look.season", label: "Season", kind: "enum", options: ["spring", "summer", "autumn", "winter"], group: "Look" },
  { path: "look.health", label: "Health", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.thorns", label: "Thorns", kind: "number", min: 0, max: 0.5, step: 0.01, group: "Look" },
  { path: "look.berryFraction", label: "Berries", kind: "number", min: 0, max: 0.5, step: 0.01, group: "Look" },
];

export const bushGenerator: EntityGenerator<BushParams> = {
  id: "voxolith/bush",
  name: "Bush",
  version: "0.1.0",
  description: "Multi-stemmed shrub: stems leaning out of the ground, leaf clumps, optional thorns and berries.",
  roles: buildRoles(skinFor("bush", "summer")),
  defaults: PRESETS.bush,
  params: PARAMS,
  generate: (params, rng) => generateBush(params, rng).entity,
};

export const thicketGenerator: EntityGenerator<BushParams> = {
  ...bushGenerator,
  id: "voxolith/thicket",
  name: "Thicket",
  description: "Several clumps of shrub stems, staggered and unequal, for undergrowth.",
  defaults: PRESETS.thicket,
};

export function registerBushGenerators(): void {
  registerGenerator(bushGenerator);
  registerGenerator(thicketGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor } from "./presets";
export { ROLE, buildRoles } from "./roles";
export { cloneParams } from "./params";
export type { BushParams, ShapeParams, FoliageParams, LookParams, Season } from "./params";
