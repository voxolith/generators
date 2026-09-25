// @voxolith/gen-rock — procedural voxel rocks and boulders.
//
// A rock is a noise-displaced superellipsoid (`blob` from the engine's
// authoring toolkit), optionally with smaller rocks tumbled against it, and a
// surface pass that hands out roles: mottled base tones, sedimentary strata on
// a tilted bedding plane, cracks where a noise field crosses zero, moss on the
// upward faces, lichen patches anywhere, a damp band at the base, snow on top.
//
// Interior voxels are left as the mid tone; the renderer never sees them, but a
// game that breaks a rock open will.

import { blob, facet, makeNoise, Volume, type Noise } from "@voxolith/gen-kit";
import { refinement, registerGenerator, type GenerateContext, type Entity, type EntityGenerator, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { fineRock } from "./fine";
import { buildRoles, ROLE } from "./roles";
import { cloneParams, type RockParams } from "./params";
import { PRESETS, skinFor } from "./presets";

export interface RockStats {
  total: number;
  surface: number;
  rocks: number;
  moss: number;
  cracks: number;
  size: { x: number; y: number; z: number };
  ms: number;
}

export interface RockResult {
  entity: Entity;
  stats: RockStats;
}

/** A finer `ctx.voxelsPerMetre` refines the result (see fine.ts). */
export function generateRock(params: RockParams, rng: () => number, id = "rock", ctx?: GenerateContext): RockResult {
  const t0 = performance.now();
  const p = cloneParams(params);
  const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const s = p.shape;

  // Main mass. Radii from size/aspect/elongation; the volume is padded for the
  // displacement and for any tumbled extras.
  const rx = s.size / 2;
  const ry = Math.max(2, (s.size * s.aspect) / 2);
  const rz = Math.max(2, (s.size * s.elongation) / 2);
  const reach = Math.max(rx, rz) * (1 + s.roughness) * (s.cluster > 0 ? 1.9 : 1.15) + 2;
  const sx = Math.ceil(reach * 2);
  const sy = Math.ceil(ry * 2 * (1 + s.roughness) * 1.3) + 2;
  const vol = new Volume(sx, sy, sx);
  const cx = sx / 2, cz = sx / 2;
  // The rock's bottom sits at the volume floor; `sink` then moves the anchor up.
  const cy = ry * (1 + s.roughness);

  // Each rock is shaped in its own scratch volume, then unioned in, so one rock's
  // fracture planes never slice through its neighbour.
  const faceId = new Uint16Array(vol.data.length);
  const rockAt = (centre: Vec3, radii: Vec3, seed: number) => {
    const tmp = new Volume(sx, sy, sx);
    blob(tmp, { centre, radii, exponent: s.exponent, noise, roughness: s.roughness, detail: s.detail, grit: s.grit, seed }, ROLE.ROCK_MID);
    if (s.facets > 0) {
      const { planes } = facet(tmp, { centre, radii, count: Math.round(s.facets), depth: [0.06, Math.max(0.08, s.facetDepth)], rng });
      // Tag the voxels lying on each fracture face, so the paint pass can give
      // every break its own even tone and the planes read as planes.
      for (let i = 0; i < tmp.data.length; i++) {
        if (!tmp.data[i]) continue;
        const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / (sx * sy)) | 0;
        const px = x + 0.5 - centre[0], py = y + 0.5 - centre[1], pz = z + 0.5 - centre[2];
        for (let k = 0; k < planes.length; k++) {
          const pl = planes[k];
          if (pl.d - (px * pl.nx + py * pl.ny + pz * pl.nz) < 1.3) { faceId[i] = (seed * 32 + k + 1) & 0xffff; break; }
        }
      }
    }
    for (let i = 0; i < tmp.data.length; i++) if (tmp.data[i]) vol.data[i] = tmp.data[i];
  };
  rockAt([cx, cy, cz], [rx, ry, rz], 1);
  let rocks = 1;

  // Extras: placed touching the main mass, radius scaled down, sitting on the
  // same floor so the group reads as fallen together. Overlap keeps it one piece.
  for (let i = 0; i < s.cluster; i++) {
    const k = Math.max(0.15, s.clusterScale * (1 + (rng() * 2 - 1) * s.clusterScaleVar));
    const crx = rx * k, cry = ry * k, crz = rz * k;
    const az = rng() * Math.PI * 2;
    const dist = (rx * Math.abs(Math.cos(az)) + rz * Math.abs(Math.sin(az))) * 0.8 + Math.max(crx, crz) * 0.45;
    const ex = cx + Math.cos(az) * dist, ez = cz + Math.sin(az) * dist;
    rockAt([ex, cry * (1 + s.roughness), ez], [crx, cry, crz], 2 + i);
    rocks++;
  }

  const stats = paintSurface(vol, p, noise, faceId);

  // Anchor: bottom centre, raised by `sink` so the rock sits in the ground.
  // Measured from the rock's real bottom: noise can lift it off the volume
  // floor, and an anchor below the model would place it floating.
  const bottom = vol.bounds()?.y0 ?? 0;
  const anchor: Vec3 = [cx, bottom + Math.floor(ry * 2 * s.sink), cz];
  let model = vol.crop(anchor, buildRoles(skinFor(p.species)));
  const k = refinement(ctx);
  if (k > 1) model = fineRock(model, k, Math.floor(rng() * 0x7fffffff));

  let total = 0;
  for (let i = 0; i < vol.data.length; i++) if (vol.data[i] !== 0) total++;

  return {
    entity: {
      id,
      kind: "rock",
      model,
      meta: { species: p.species, size: s.size, generator: "voxolith/gen-rock", ...(k > 1 ? { voxelsPerMetre: k * 10 } : {}) },
    },
    stats: { total, surface: stats.surface, rocks, moss: stats.moss, cracks: stats.cracks, size: model.size, ms: performance.now() - t0 },
  };
}

/** Give every surface voxel a role. Interior stays ROCK_MID. */
function paintSurface(vol: Volume, p: RockParams, noise: Noise, faceId: Uint16Array): { surface: number; moss: number; cracks: number } {
  const { sx, sy, sz } = vol;
  const look = p.look;
  const sxy = sx * sy;
  // Height span of the rock, for strata and the wet band.
  let yLo = Infinity, yHi = -Infinity;
  for (let i = 0; i < vol.data.length; i++) {
    if (!vol.data[i]) continue;
    const y = ((i / sx) | 0) % sy;
    if (y < yLo) yLo = y;
    if (y > yHi) yHi = y;
  }
  const h = Math.max(1, yHi - yLo);
  const tilt = (look.strataTiltDeg * Math.PI) / 180;
  const tsin = Math.sin(tilt), tcos = Math.cos(tilt);
  // Noise frequencies in 1/voxel, chosen so features are a few voxels wide
  // whatever the rock's size.
  const fMottle = 0.09, fCrack = 0.11, fMoss = 0.07, fLichen = 0.16;

  // Roles are decided from a snapshot so a decision never reads a neighbour
  // already repainted this pass.
  const out = new Uint8Array(vol.data);
  let surface = 0, moss = 0, cracks = 0;

  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const i = x + y * sx + z * sxy;
        if (!vol.data[i] || !vol.isSurface(x, y, z)) continue;
        surface++;
        const n = vol.surfaceNormal(x, y, z);
        const up = n[1];
        const yn = (y - yLo) / h;

        // Base tone: two scales of value noise, which spreads roughly evenly over
        // -1..1 — fbm bunches around its mean and would leave almost every
        // voxel in the mid tone. `mottle` sets how much of the range is used.
        const m =
          (noise.value3(x * fMottle, y * fMottle, z * fMottle, 1) * 0.6 +
            noise.value3(x * fMottle * 2.7, y * fMottle * 2.7, z * fMottle * 2.7, 2) * 0.4 -
            0.5) * 2 * look.mottle;
        let role: number = m > 0.16 ? ROLE.ROCK_LIGHT : m < -0.16 ? ROLE.ROCK_DARK : ROLE.ROCK_MID;
        // A fracture face is a fresh break: one even tone per face, a notch
        // lighter than weathered stone, so each plane reads as flat.
        const fid = faceId[i];
        if (fid) {
          const fh = Math.abs(Math.sin(fid * 78.233) * 43758.5453) % 1;
          role = fh < 0.55 ? ROLE.ROCK_LIGHT : fh < 0.85 ? ROLE.ROCK_MID : ROLE.ROCK_DARK;
        }
        // Undersides and crevices read darker: faces pointing down or enclosed.
        if (up < -0.4 || vol.neighbourhood27(x, y, z) > 21) role = ROLE.ROCK_DARK;

        // Strata: bands along a tilted bedding plane, a few of them contrasting.
        if (look.strata > 0) {
          const along = (y * tcos + x * tsin) / h;
          const band = Math.floor(along * look.strata + noise.value2(z * 0.05, band0(along), 3) * 0.6);
          const bh = Math.abs(Math.sin(band * 12.9898) * 43758.5453) % 1;
          if (bh < look.strataContrast) role = ROLE.STRATA;
          else if (bh > 0.85) role = ROLE.ROCK_DARK;
        }

        // Cracks: thin where a signed field crosses zero; density widens them.
        if (look.cracks > 0) {
          const c = noise.signed3(x * fCrack, y * fCrack, z * fCrack, 7);
          if (Math.abs(c) < 0.035 + look.cracks * 0.06) { role = ROLE.CRACK; cracks++; }
        }

        // Damp band at ground contact.
        if (look.wet > 0 && yn < look.wet && role !== ROLE.CRACK) role = ROLE.WET;

        // Lichen: patches on any face, more on the shaded side.
        if (look.lichen > 0 && role !== ROLE.CRACK) {
          const l = noise.fbm3(x * fLichen + 40, y * fLichen, z * fLichen, 2);
          if (l > 1 - look.lichen * 0.45) role = ROLE.LICHEN;
        }

        // Moss: upward faces, patchy, denser lower where it stays damp.
        if (look.moss > 0 && up > 0.25) {
          const mv = noise.fbm3(x * fMoss + 90, y * fMoss, z * fMoss, 3) + up * 0.25 + (1 - yn) * 0.15;
          const cut = 1.15 - look.moss * 0.75;
          if (mv > cut) { role = mv > cut + 0.22 ? ROLE.MOSS : ROLE.MOSS_DARK; moss++; }
        }

        // Snow: top faces with clear sky above.
        if (look.snow > 0 && up > 0.5) {
          let clear = true;
          for (let k = 1; k <= 3; k++) if (vol.get(x, y + k, z)) { clear = false; break; }
          if (clear && noise.value3(x * 0.3, y * 0.3, z * 0.3, 9) < look.snow) role = ROLE.SNOW;
        }
        out[i] = role;
      }
  vol.data.set(out);
  return { surface, moss, cracks };
}

const band0 = (a: number) => Math.floor(a * 3) * 0.37;

// --- generator registration ------------------------------------------------

const PARAMS: ParamSpec[] = [
  { path: "shape.size", label: "Size", kind: "int", min: 8, max: 160, group: "Shape" },
  { path: "shape.aspect", label: "Height ratio", kind: "number", min: 0.2, max: 1.4, step: 0.05, group: "Shape" },
  { path: "shape.elongation", label: "Depth ratio", kind: "number", min: 0.4, max: 1.4, step: 0.05, group: "Shape" },
  { path: "shape.exponent", label: "Angularity", kind: "number", min: 1.6, max: 9, step: 0.1, group: "Shape", help: "2 is round, 4 a rounded block, 8 nearly cubic" },
  { path: "shape.roughness", label: "Roughness", kind: "number", min: 0, max: 0.4, step: 0.01, group: "Shape" },
  { path: "shape.detail", label: "Bump size", kind: "number", min: 0.5, max: 5, step: 0.1, group: "Shape" },
  { path: "shape.facets", label: "Fractures", kind: "int", min: 0, max: 20, group: "Shape", help: "flat broken faces; 0 is a water-worn cobble" },
  { path: "shape.facetDepth", label: "Fracture depth", kind: "number", min: 0.08, max: 0.5, step: 0.01, group: "Shape" },
  { path: "shape.grit", label: "Grit", kind: "number", min: 0, max: 2.5, step: 0.1, group: "Shape", help: "fine surface texture; breaks up terracing" },
  { path: "shape.cluster", label: "Extra rocks", kind: "int", min: 0, max: 10, group: "Shape" },
  { path: "shape.clusterScale", label: "Extra size", kind: "number", min: 0.15, max: 0.9, step: 0.01, group: "Shape" },
  { path: "shape.sink", label: "Sink", kind: "number", min: 0, max: 0.5, step: 0.01, group: "Shape" },
  { path: "species", label: "Stone", kind: "enum", options: ["granite", "sandstone", "basalt", "limestone", "slate"], group: "Look" },
  { path: "look.mottle", label: "Mottle", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.strata", label: "Strata bands", kind: "number", min: 0, max: 12, step: 0.5, group: "Look" },
  { path: "look.strataTiltDeg", label: "Strata tilt", kind: "number", min: -45, max: 45, step: 1, group: "Look" },
  { path: "look.cracks", label: "Cracks", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.moss", label: "Moss", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.lichen", label: "Lichen", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.wet", label: "Wet base", kind: "number", min: 0, max: 0.5, step: 0.01, group: "Look" },
  { path: "look.snow", label: "Snow", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
];

export const rockGenerator: EntityGenerator<RockParams> = {
  id: "voxolith/rock",
  name: "Rock",
  version: "0.2.1",
  description: "Boulder from a displaced superellipsoid: mottling, strata, cracks, moss and lichen on the surface.",
  roles: buildRoles(skinFor("granite")),
  defaults: PRESETS.boulder,
  params: PARAMS,
  generate: (params, rng, ctx) => generateRock(params, rng, undefined, ctx).entity,
  scales: [50, 100],
};

export const outcropGenerator: EntityGenerator<RockParams> = {
  ...rockGenerator,
  id: "voxolith/outcrop",
  name: "Outcrop",
  description: "A main mass with smaller rocks tumbled against it, on a tilted bedding plane.",
  defaults: PRESETS.outcrop,
};

export function registerRockGenerators(): void {
  registerGenerator(rockGenerator);
  registerGenerator(outcropGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor } from "./presets";
export { ROLE, buildRoles } from "./roles";
export { cloneParams } from "./params";
export type { RockParams, ShapeParams, LookParams } from "./params";
