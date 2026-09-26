/**
 * @voxolith/gen-grass: procedural voxel ground cover.
 *
 * A patch is many independent blades, not one connected object: tufts are
 * scattered over a disc, each tuft fans a handful of blades out of the ground,
 * and every blade is a single stem one voxel thick that arcs over under its own
 * weight. Unlike a tree, the result is deliberately many pieces — it is ground
 * cover, and each blade only has to reach the ground.
 *
 * Branch growth, rasterisation and noise come from @voxolith/gen-kit.
 *
 * @packageDocumentation
 */

import {
  capsule,
  growBranches,
  hash01,
  line3,
  makeNoise,
  normalize,
  sphere,
  Volume,
  type Noise,
  type StemSeed,
} from "@voxolith/gen-kit";
import { refinement, registerGenerator, type GenerateContext, type Entity, type EntityGenerator, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { fineGrass } from "./fine";
import { buildRoles, ROLE } from "./roles";
import { cloneParams, REFERENCE_HEIGHT, type GrassParams } from "./params";
import { PRESETS, skinFor } from "./presets";

/** Counts and timing from one {@link generateGrass} call. Voxel counts are coarse. */
export interface GrassStats {
  total: number;
  tufts: number;
  /** Blades grown (a fern's leaflets not counted). */
  blades: number;
  flowers: number;
  seedHeads: number;
  /** Voxels dropped because they did not reach the ground. */
  pruned: number;
  /** Model size in voxels (at a finer scale, the refined size). */
  size: { x: number; y: number; z: number };
  /** Wall-clock generation time. */
  ms: number;
}

/** What {@link generateGrass} returns: the entity and its stats. */
export interface GrassResult {
  entity: Entity;
  stats: GrassStats;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Tuft centres scattered over the patch, then blades fanned out of each. */
function bladeSeeds(p: GrassParams, rng: () => number): { seeds: StemSeed[]; tufts: number } {
  const s = p.shape;
  const seeds: StemSeed[] = [];
  const tufts = Math.max(1, Math.round(s.tufts[0] + rng() * (s.tufts[1] - s.tufts[0])));
  for (let t = 0; t < tufts; t++) {
    // Square-rooted radius keeps the scatter even instead of bunching at the
    // centre, which is what a uniform random radius would do.
    const az = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * s.footprint;
    const cx = Math.cos(az) * r, cz = Math.sin(az) * r;
    const n = Math.max(1, Math.round(s.bladesPerTuft[0] + rng() * (s.bladesPerTuft[1] - s.bladesPerTuft[0])));
    for (let k = 0; k < n; k++) {
      const baz = (k / n) * Math.PI * 2 + rng() * 1.2;
      const tilt = deg(Math.max(0, s.fanDeg + (rng() * 2 - 1) * s.fanVarDeg));
      const spread = s.tuftSpread * rng();
      const len = s.height * (s.lengthMin + (1 - s.lengthMin) * rng()) * (1 + (rng() * 2 - 1) * s.lengthVar);
      seeds.push({
        origin: [cx + Math.cos(baz) * spread, 0, cz + Math.sin(baz) * spread],
        dir: normalize([Math.cos(baz) * Math.sin(tilt), Math.cos(tilt), Math.sin(baz) * Math.sin(tilt)]),
        length: Math.max(2, len),
        radius: s.radius,
      });
    }
  }
  return { seeds, tufts };
}

/**
 * Generate a patch of ground cover: tufts scattered evenly over a disc, each fanning blades out
 * of the ground that arc over under their own weight, shaded dark to light from base to tip, with
 * optional flower or seed heads and snow. Blades are independent pieces; any voxel that does not
 * reach the ground is dropped. Pure and deterministic in its params and rng.
 *
 * With `ctx.voxelsPerMetre` above the native 10 (50 or 100), the same design comes back refined:
 * a sparse model k times the size, blades redrawn from the skeleton.
 *
 * @param params - The patch; not mutated. Start from a {@link PRESETS} entry.
 * @param rng - Source of all randomness, returning 0..1 (e.g. `seededRandom(seed)`).
 * @param id - The entity id.
 * @param ctx - Optional scale; omitted or 10 voxels per metre gives the coarse model.
 * @returns The entity (kind `groundcover`, anchored at the centre of the patch on the ground) and
 * stats.
 * @example
 * ```ts
 * import { seededRandom } from "@voxolith/renderer/core";
 * import { cloneParams, generateGrass, PRESETS } from "@voxolith/gen-grass";
 *
 * const p = cloneParams(PRESETS.meadow);
 * p.shape.footprint = 20;
 * const { entity } = generateGrass(p, seededRandom(11));
 * ```
 */
export function generateGrass(params: GrassParams, rng: () => number, id = "grass", ctx?: GenerateContext): GrassResult {
  const t0 = performance.now();
  const p = cloneParams(params);
  const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const vs = p.shape.height / REFERENCE_HEIGHT;

  const { seeds, tufts } = bladeSeeds(p, rng);
  const skel = growBranches(
    {
      seeds,
      base: {
        taperExp: p.shape.taperExp,
        sweepDeg: 0,
        curl: p.shape.curl,
        segLen: p.shape.segLen,
        // Blades have no trunk rigidity: gravity is the whole silhouette.
        gravity: p.shape.arc,
        photo: 0,
      },
      childStart: 0.15,
      childEnd: 0.92,
      envelope: "mid",
      azimuthJitterDeg: 10,
      whorl: p.shape.levels.length > 0 ? 2 : 0,
      whorlSpacing: Math.max(1.4, 1.6 * vs),
      pipeExp: 2.5,
      branchTaper: 0.8,
      minRadius: 0.2,
      levels: p.shape.levels,
      unit: vs,
      maxStems: 6000,
      maxSegments: 40000,
    },
    rng,
    noise,
  );

  const pad = Math.ceil(3 + p.look.flowerRadius * vs);
  const half = Math.ceil(skel.spread + pad);
  const sx = half * 2 + 2;
  const sy = Math.ceil(skel.topY + pad + p.look.seedLength * vs) + 2;
  const vol = new Volume(sx, sy, sx);
  const origin: Vec3 = [sx / 2, 0, sx / 2];

  // Rasterise, remembering which blade wrote each voxel so the base-to-tip
  // gradient can be per blade rather than per patch.
  const stemOf = new Uint16Array(vol.data.length);
  for (const seg of skel.segments) {
    const a: Vec3 = [seg.a[0] + origin[0], seg.a[1] + origin[1], seg.a[2] + origin[2]];
    const b: Vec3 = [seg.b[0] + origin[0], seg.b[1] + origin[1], seg.b[2] + origin[2]];
    const tag = seg.stem + 1;
    const onFill = (idx: number) => {
      stemOf[idx] = tag;
    };
    if (Math.max(seg.ra, seg.rb) >= 1) capsule(vol, a, b, seg.ra, seg.rb, ROLE.BLADE_MID, { onFill });
    else line3(vol, a, b, ROLE.BLADE_MID, { onFill, pad: Math.max(seg.ra, seg.rb) >= 0.72 });
  }

  // Per-blade vertical range, for the gradient.
  const y0 = new Float32Array(skel.stems.length).fill(Infinity);
  const y1 = new Float32Array(skel.stems.length).fill(-Infinity);
  for (const stem of skel.stems) {
    for (const pt of stem.points) {
      if (pt[1] < y0[stem.id]) y0[stem.id] = pt[1];
      if (pt[1] > y1[stem.id]) y1[stem.id] = pt[1];
    }
  }

  for (let i = 0; i < vol.data.length; i++) {
    if (vol.data[i] === 0) continue;
    const si = stemOf[i] - 1;
    const y = ((i / sx) | 0) % sy;
    if (si < 0 || si >= skel.stems.length) {
      vol.data[i] = ROLE.BLADE_MID;
      continue;
    }
    // Whole blades dry off, never individual voxels: speckled grass reads as
    // noise rather than as a dry season.
    if (hash01(si * 2654435761) < p.look.dry) {
      vol.data[i] = ROLE.BLADE_DRY;
      continue;
    }
    const lo = y0[si] + origin[1];
    const span = Math.max(1, y1[si] - y0[si]);
    const f = Math.max(0, Math.min(1, (y - lo) / span));
    vol.data[i] = f > 0.66 ? ROLE.BLADE_HI : f > 0.33 ? ROLE.BLADE_MID : ROLE.BLADE_LO;
  }

  // Heads on the tips of whole blades.
  let flowers = 0;
  let seedHeads = 0;
  for (const tip of skel.tips) {
    if (tip.level !== 0) continue;
    const h = hash01(tip.stem * 40503 + 7);
    const at: Vec3 = [tip.p[0] + origin[0], tip.p[1] + origin[1], tip.p[2] + origin[2]];
    if (p.look.flowers > 0 && h < p.look.flowers) {
      const c = h < p.look.flowers / 3 ? ROLE.FLOWER_A : h < (p.look.flowers * 2) / 3 ? ROLE.FLOWER_B : ROLE.FLOWER_C;
      sphere(vol, at, Math.max(1, p.look.flowerRadius * vs), c);
      flowers++;
    } else if (p.look.seedHeads > 0 && h > 1 - p.look.seedHeads) {
      const len = p.look.seedLength * vs;
      const end: Vec3 = [at[0] + tip.dir[0] * len, at[1] + tip.dir[1] * len, at[2] + tip.dir[2] * len];
      capsule(vol, at, end, Math.max(0.9, 1.1 * vs), Math.max(0.6, 0.7 * vs), ROLE.SEED);
      seedHeads++;
    }
  }

  if (p.look.season === "winter" && p.look.snow > 0) applySnow(vol, p.look.snow, noise);

  // Every blade must reach the ground, but blades are independent, so this
  // seeds from the whole ground plane rather than from one point.
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
  if (k > 1) model = fineGrass(model, skel, origin, k, Math.floor(rng() * 0x7fffffff));
  let total = 0;
  for (let i = 0; i < vol.data.length; i++) if (vol.data[i] !== 0) total++;

  return {
    entity: {
      id,
      kind: "groundcover",
      model,
      meta: { species: p.species, season: p.look.season, height: p.shape.height, generator: "voxolith/gen-grass", ...(k > 1 ? { voxelsPerMetre: k * 10 } : {}) },
    },
    stats: {
      total,
      tufts,
      blades: seeds.length,
      flowers,
      seedHeads,
      pruned,
      size: model.size,
      ms: performance.now() - t0,
    },
  };
}

function applySnow(vol: Volume, amount: number, noise: Noise): void {
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  for (let i = 0; i < vol.data.length; i++) {
    if (vol.data[i] === 0) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;
    if (vol.get(x, y + 1, z) !== 0) continue;
    if (noise.value3(x * 0.5, y * 0.5, z * 0.5, 9) < amount) vol.data[i] = ROLE.SNOW;
  }
}

// --- generator registration ------------------------------------------------

const PARAMS: ParamSpec[] = [
  { path: "shape.height", label: "Blade length", kind: "int", min: 4, max: 80, group: "Shape", help: "length of the tallest blade in voxels (10 per metre); shorter blades are a fraction of it" },
  { path: "shape.footprint", label: "Patch radius", kind: "number", min: 2, max: 48, step: 1, group: "Shape", help: "radius of the disc the tufts are scattered over, in voxels" },
  { path: "shape.fanDeg", label: "Fan", kind: "number", min: 0, max: 60, step: 1, group: "Shape", help: "how far blades splay from vertical, in degrees; 0 stands them upright" },
  { path: "shape.arc", label: "Arc", kind: "number", min: 0, max: 0.12, step: 0.002, group: "Shape", help: "downward bend per voxel of blade; 0 is straight, high values arch right over" },
  { path: "shape.radius", label: "Blade thickness", kind: "number", min: 0.3, max: 2, step: 0.05, group: "Shape", help: "blade radius in voxels; below 1 a blade is a clean one-voxel line" },
  { path: "look.season", label: "Season", kind: "enum", options: ["spring", "summer", "autumn", "winter"], group: "Look", help: "blade colours; winter also dusts the upper faces with snow" },
  { path: "look.dry", label: "Dry blades", kind: "number", min: 0, max: 1, step: 0.02, group: "Look", help: "fraction of whole blades that have dried off to straw" },
  { path: "look.flowers", label: "Flowers", kind: "number", min: 0, max: 0.6, step: 0.01, group: "Look", help: "fraction of blades ending in a flower head, in three colours" },
  { path: "look.seedHeads", label: "Seed heads", kind: "number", min: 0, max: 1, step: 0.02, group: "Look", help: "fraction of blades ending in a seed head, as on reeds and cereals" },
];

/** The `voxolith/grass` generator: a patch of arcing blades, defaults {@link PRESETS}.grass. */
export const grassGenerator: EntityGenerator<GrassParams> = {
  id: "voxolith/grass",
  name: "Grass patch",
  version: "0.1.0",
  description: "Tufts of arcing blades over a disc, with a base-to-tip gradient and optional flowers.",
  roles: buildRoles(skinFor("grass", "summer")),
  looseRoles: [ROLE.FLOWER_A, ROLE.FLOWER_B, ROLE.FLOWER_C, ROLE.SEED, ROLE.SNOW].map((v) => buildRoles(skinFor("grass", "summer"))[v - 1].id),
  defaults: PRESETS.grass,
  params: PARAMS,
  generate: (params, rng, ctx) => generateGrass(params, rng, undefined, ctx).entity,
  scales: [50, 100],
};

/** The `voxolith/meadow` generator: taller grass with flowers, defaults {@link PRESETS}.meadow. */
export const meadowGenerator: EntityGenerator<GrassParams> = {
  ...grassGenerator,
  id: "voxolith/meadow",
  name: "Meadow",
  description: "Taller mixed grass with scattered flower heads.",
  defaults: PRESETS.meadow,
};

/** The `voxolith/fern` generator: arching fronds with leaflets, defaults {@link PRESETS}.fern. */
export const fernGenerator: EntityGenerator<GrassParams> = {
  ...grassGenerator,
  id: "voxolith/fern",
  name: "Ferns",
  description: "Arching fronds carrying leaflets down both sides of a midrib.",
  defaults: PRESETS.fern,
};

/** Register the grass, meadow and fern generators with the engine registry. */
export function registerGrassGenerators(): void {
  registerGenerator(grassGenerator);
  registerGenerator(meadowGenerator);
  registerGenerator(fernGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor } from "./presets";
export { ROLE, buildRoles } from "./roles";
export { cloneParams } from "./params";
export type { GrassParams, ShapeParams, LookParams, Season, BranchLevel } from "./params";
export type { ColorSet } from "./roles";
