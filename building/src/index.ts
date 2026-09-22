// @voxolith/gen-building — procedural voxel buildings.
//
// A small shape grammar. In order: a plinth; a stack of storeys as hollow wall
// shells with a floor slab each; windows on a rhythm and a door on the front;
// quoins, storey bands and (for timber framing) posts and braces; a roof from
// one of three families with eaves, a ridge and chimneys; then a surface pass
// for weathering and moss. Everything random — which window positions are
// skipped, which glow, where the door sits — comes from the injected rng.

import { boxFill, makeNoise, Volume, type Noise } from "@voxolith/engine/build";
import { registerGenerator, type Entity, type EntityGenerator, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { buildRoles, ROLE } from "./roles";
import { cloneParams, type BuildingParams } from "./params";
import { PRESETS, skinFor } from "./presets";

export interface BuildingStats {
  total: number;
  windows: number;
  lit: number;
  doors: number;
  storeys: number;
  size: { x: number; y: number; z: number };
  ms: number;
}

export interface BuildingResult {
  entity: Entity;
  stats: BuildingStats;
}

export function generateBuilding(params: BuildingParams, rng: () => number, id = "building"): BuildingResult {
  const t0 = performance.now();
  const p = cloneParams(params);
  const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const s = p.shape, o = p.openings, look = p.look;

  const W = Math.max(8, Math.round(s.width));
  const D = Math.max(8, Math.round(s.depth));
  const t = Math.max(1, Math.round(s.wallThickness));
  const H = Math.max(6, Math.round(s.storeyHeight));
  const N = Math.max(1, Math.round(s.storeys));
  const ov = Math.max(0, Math.round(s.overhang));
  const plinth = Math.max(0, Math.round(s.plinth));
  const wallTop = plinth + N * H; // first y above the walls

  // Roof height from pitch and the shorter span it has to close over.
  const span = s.roof === "gable" ? Math.min(W, D) : s.roof === "hip" ? Math.min(W, D) : 0;
  const roofH = s.roof === "flat" ? 3 : Math.ceil((span / 2 + ov) / Math.max(0.3, s.roofPitch)) + 1;
  const chimneyH = s.chimneys > 0 ? 6 : 0;

  const pad = 2;
  const sx = W + 2 * (ov + pad);
  const sz = D + 2 * (ov + pad);
  const sy = wallTop + roofH + chimneyH + pad + 2;
  const vol = new Volume(sx, sy, sz);
  const x0 = ov + pad, x1 = x0 + W - 1;
  const z0 = ov + pad, z1 = z0 + D - 1;

  // --- plinth and walls -----------------------------------------------------
  if (plinth > 0) boxFill(vol, [x0, 0, z0], [x1, plinth - 1, z1], ROLE.FOUNDATION);
  boxFill(vol, [x0, plinth, z0], [x1, wallTop - 1, z1], ROLE.WALL);
  // Hollow each storey, leaving a one-voxel floor slab at its base.
  for (let k = 0; k < N; k++) {
    const yb = plinth + k * H;
    boxFill(vol, [x0 + t, yb, z0 + t], [x1 - t, yb, z1 - t], ROLE.FLOOR);
    boxFill(vol, [x0 + t, yb + 1, z0 + t], [x1 - t, yb + H - 1, z1 - t], 0);
  }

  // --- openings -------------------------------------------------------------
  let windows = 0, lit = 0, doors = 0;
  const ww = Math.max(1, Math.round(o.windowWidth)), wh = Math.max(1, Math.round(o.windowHeight));
  const sill = Math.max(1, Math.round(o.sillHeight));
  const spacing = Math.max(ww + 2, Math.round(o.windowSpacing));
  const dw = Math.max(2, Math.round(o.doorWidth)), dh = Math.max(4, Math.round(o.doorHeight));

  /** Positions along a wall of length `len`, centred, leaving room at corners. */
  const rhythm = (len: number): number[] => {
    const margin = 3 + ww;
    const usable = len - 2 * margin;
    if (usable < ww) return [Math.floor(len / 2)];
    const n = Math.max(1, Math.floor(usable / spacing) + 1);
    const total = (n - 1) * spacing;
    const start = Math.floor((len - total) / 2);
    return Array.from({ length: n }, (_, i) => start + i * spacing);
  };

  // A window is glass set into the wall thickness with a one-voxel frame.
  const window = (face: "x0" | "x1" | "z0" | "z1", along: number, yb: number, glow: boolean) => {
    const glass = glow ? ROLE.GLASS_LIT : ROLE.GLASS;
    const y = yb + sill;
    const put = (a: number, b: number, c: number, v: number) => vol.set(a, b, c, v);
    for (let dy = -1; dy <= wh; dy++)
      for (let da = -1; da <= ww; da++) {
        const edge = dy === -1 || dy === wh || da === -1 || da === ww;
        const v = edge ? ROLE.FRAME : glass;
        for (let d = 0; d < t; d++) {
          if (face === "x0") put(x0 + d, y + dy, z0 + along + da, v);
          else if (face === "x1") put(x1 - d, y + dy, z0 + along + da, v);
          else if (face === "z0") put(x0 + along + da, y + dy, z0 + d, v);
          else put(x0 + along + da, y + dy, z1 - d, v);
        }
      }
    windows++;
    if (glow) lit++;
  };

  const doorAlong = Math.floor(W / 2) + Math.round((rng() * 2 - 1) * Math.max(0, W / 2 - dw - 4));
  for (let k = 0; k < N; k++) {
    const yb = plinth + k * H;
    for (const [face, len] of [["z1", W], ["z0", W], ["x0", D], ["x1", D]] as const) {
      for (const a of rhythm(len)) {
        // Ground floor, front wall: the door claims its span.
        if (k === 0 && face === "z1" && Math.abs(a + ww / 2 - doorAlong - dw / 2) < dw / 2 + ww / 2 + 2) continue;
        if (rng() > o.windowFraction) continue;
        window(face, a, yb, rng() < look.lit);
      }
    }
  }
  // Door: front face (+z), ground storey, framed.
  for (let dy = -1; dy <= dh; dy++)
    for (let dx = -1; dx <= dw; dx++) {
      const edge = dy === dh || dx === -1 || dx === dw;
      if (dy === -1) continue;
      for (let d = 0; d < t; d++) vol.set(x0 + doorAlong + dx, plinth + dy, z1 - d, edge ? ROLE.FRAME : ROLE.DOOR);
    }
  doors = 1;

  // --- trim: quoins, storey bands, timber framing ---------------------------
  const paintWall = (x: number, y: number, z: number, v: number) => {
    const c = vol.get(x, y, z);
    if (c === ROLE.WALL || c === ROLE.WALL_DARK) vol.set(x, y, z, v);
  };
  if (look.quoins) {
    for (let y = plinth; y < wallTop; y++)
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const)
        for (let d = 0; d < 2; d++) {
          paintWall(cx + (cx === x0 ? d : -d), y, cz, ROLE.TRIM);
          paintWall(cx, y, cz + (cz === z0 ? d : -d), ROLE.TRIM);
        }
    for (let k = 1; k < N; k++) {
      const y = plinth + k * H;
      for (let x = x0; x <= x1; x++) { paintWall(x, y, z0, ROLE.TRIM); paintWall(x, y, z1, ROLE.TRIM); }
      for (let z = z0; z <= z1; z++) { paintWall(x0, y, z, ROLE.TRIM); paintWall(x1, y, z, ROLE.TRIM); }
    }
  }
  if (look.wall === "timber") {
    const bs = Math.max(4, Math.round(look.beamSpacing));
    // Horizontal rails at every storey line and the top, corner posts, then
    // posts on a rhythm and a diagonal brace in each bay's end panels.
    for (let k = 0; k <= N; k++) {
      const y = plinth + k * H - (k === N ? 1 : 0);
      for (let x = x0; x <= x1; x++) { paintWall(x, y, z0, ROLE.BEAM); paintWall(x, y, z1, ROLE.BEAM); }
      for (let z = z0; z <= z1; z++) { paintWall(x0, y, z, ROLE.BEAM); paintWall(x1, y, z, ROLE.BEAM); }
    }
    const post = (x: number, z: number) => { for (let y = plinth; y < wallTop; y++) paintWall(x, y, z, ROLE.BEAM); };
    for (let x = x0; x <= x1; x += bs) { post(x, z0); post(x, z1); }
    for (let z = z0; z <= z1; z += bs) { post(x0, z); post(x1, z); }
    post(x1, z0); post(x1, z1); post(x0, z1);
    for (let k = 0; k < N; k++) {
      const yb = plinth + k * H + 1, yt = plinth + (k + 1) * H - 2;
      const brace = (a: Vec3, b: Vec3) => {
        // Paint along the line only where wall exists.
        const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]));
        for (let i = 0; i <= n; i++) {
          const f = n ? i / n : 0;
          paintWall(Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), ROLE.BEAM);
        }
      };
      const run = Math.min(bs - 1, H - 3);
      brace([x0, yb, z0], [x0 + run, yt, z0]); brace([x1, yb, z0], [x1 - run, yt, z0]);
      brace([x0, yb, z1], [x0 + run, yt, z1]); brace([x1, yb, z1], [x1 - run, yt, z1]);
      brace([x0, yb, z0], [x0, yt, z0 + run]); brace([x0, yb, z1], [x0, yt, z1 - run]);
      brace([x1, yb, z0], [x1, yt, z0 + run]); brace([x1, yb, z1], [x1, yt, z1 - run]);
    }
  }

  // --- roof -----------------------------------------------------------------
  const run = Math.max(0.3, s.roofPitch);
  const ridgeAlongX = W >= D;
  if (s.roof === "flat") {
    boxFill(vol, [x0 - ov, wallTop, z0 - ov], [x1 + ov, wallTop, z1 + ov], ROLE.ROOF);
    // Parapet.
    boxFill(vol, [x0, wallTop + 1, z0], [x1, wallTop + 2, z1], ROLE.TRIM);
    boxFill(vol, [x0 + 1, wallTop + 1, z0 + 1], [x1 - 1, wallTop + 2, z1 - 1], 0);
    boxFill(vol, [x0 + 1, wallTop + 1, z0 + 1], [x1 - 1, wallTop + 1, z1 - 1], ROLE.ROOF_DARK);
  } else {
    for (let k = 0; k < roofH; k++) {
      const inset = Math.round(k * run);
      const y = wallTop + k;
      let ax = x0 - ov, bx = x1 + ov, az = z0 - ov, bz = z1 + ov;
      if (s.roof === "hip" || !ridgeAlongX) { ax += inset; bx -= inset; }
      if (s.roof === "hip" || ridgeAlongX) { az += inset; bz -= inset; }
      if (bx < ax || bz < az) break;
      const isRidge = (bx - ax <= 1 && (s.roof === "hip" || !ridgeAlongX)) || (bz - az <= 1 && (s.roof === "hip" || ridgeAlongX));
      const v = k < 2 ? ROLE.ROOF_DARK : isRidge ? ROLE.RIDGE : ROLE.ROOF;
      boxFill(vol, [ax, y, az], [bx, y, bz], v);
      // Hollow the attic, but only where the next slab up will have interior:
      // every voxel of slab k+1 must rest on solid slab k, or the roof becomes
      // a staircase of rings that touch only at corners and floats free.
      if (!isRidge) {
        const ni = Math.round((k + 1) * run);
        let nx0 = x0 - ov, nx1 = x1 + ov, nz0 = z0 - ov, nz1 = z1 + ov;
        if (s.roof === "hip" || !ridgeAlongX) { nx0 += ni; nx1 -= ni; }
        if (s.roof === "hip" || ridgeAlongX) { nz0 += ni; nz1 -= ni; }
        const hx0 = Math.max(nx0 + 1, x0 + t), hx1 = Math.min(nx1 - 1, x1 - t);
        const hz0 = Math.max(nz0 + 1, z0 + t), hz1 = Math.min(nz1 - 1, z1 - t);
        if (k > 0 && hx1 >= hx0 && hz1 >= hz0) boxFill(vol, [hx0, y, hz0], [hx1, y, hz1], 0);
      }
      if (isRidge) break;
    }
    // Gable ends: walls rise to the ridge under the roof skin.
    if (s.roof === "gable") {
      for (let k = 0; k < roofH; k++) {
        const inset = Math.round(k * run);
        const y = wallTop + k;
        if (ridgeAlongX) {
          if (z1 - inset < z0 + inset) break;
          for (let d = 0; d < t; d++) {
            for (let z = z0 + inset; z <= z1 - inset; z++) { if (!vol.get(x0 + d, y, z)) vol.set(x0 + d, y, z, ROLE.WALL); if (!vol.get(x1 - d, y, z)) vol.set(x1 - d, y, z, ROLE.WALL); }
          }
        } else {
          if (x1 - inset < x0 + inset) break;
          for (let d = 0; d < t; d++) {
            for (let x = x0 + inset; x <= x1 - inset; x++) { if (!vol.get(x, y, z0 + d)) vol.set(x, y, z0 + d, ROLE.WALL); if (!vol.get(x, y, z1 - d)) vol.set(x, y, z1 - d, ROLE.WALL); }
          }
        }
      }
    }
  }

  // --- chimneys ---------------------------------------------------------------
  for (let c = 0; c < Math.round(s.chimneys); c++) {
    const side = c % 2 === 0 ? 1 : -1;
    const cw = 3;
    let cx: number, cz: number;
    if (s.roof === "flat") { cx = side > 0 ? x1 - 3 - cw : x0 + 3; cz = z0 + 3; }
    else if (ridgeAlongX) { cx = side > 0 ? x1 - 4 - cw : x0 + 4; cz = Math.floor((z0 + z1) / 2) - 1; }
    else { cx = Math.floor((x0 + x1) / 2) - 1; cz = side > 0 ? z1 - 4 - cw : z0 + 4; }
    const top = wallTop + roofH + chimneyH - 2;
    boxFill(vol, [cx, wallTop - 2, cz], [cx + cw - 1, top, cz + cw - 1], ROLE.CHIMNEY);
    boxFill(vol, [cx, top, cz], [cx + cw - 1, top, cz + cw - 1], ROLE.SOOT);
    boxFill(vol, [cx + 1, top - 1, cz + 1], [cx + cw - 2, top, cz + cw - 2], 0);
  }

  weather(vol, look, noise, plinth, wallTop);

  const anchor: Vec3 = [(x0 + x1 + 1) / 2, 0, (z0 + z1 + 1) / 2];
  const model = vol.crop(anchor, buildRoles(skinFor(look.wall, look.roofStyle)));
  let total = 0;
  for (let i = 0; i < vol.data.length; i++) if (vol.data[i] !== 0) total++;

  return {
    entity: {
      id,
      kind: "building",
      model,
      meta: { species: p.species, storeys: N, roof: s.roof, generator: "voxolith/gen-building" },
    },
    stats: { total, windows, lit, doors, storeys: N, size: model.size, ms: performance.now() - t0 },
  };
}

/** Dirt on the walls, heavier near the ground; moss on upward roof faces. */
function weather(vol: Volume, look: BuildingParams["look"], noise: Noise, plinth: number, wallTop: number): void {
  const { sx, sy, sz } = vol;
  const sxy = sx * sy;
  const h = Math.max(1, wallTop - plinth);
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const v = vol.data[x + y * sx + z * sxy];
        if (v === ROLE.WALL && look.weathering > 0 && vol.isSurface(x, y, z)) {
          const yn = (y - plinth) / h;
          const n = noise.fbm3(x * 0.12, y * 0.12, z * 0.12, 3) + (1 - yn) * 0.25;
          if (n > 1.05 - look.weathering * 0.5) vol.data[x + y * sx + z * sxy] = ROLE.WALL_DARK;
        } else if ((v === ROLE.ROOF || v === ROLE.ROOF_DARK) && look.moss > 0 && !vol.get(x, y + 1, z)) {
          if (noise.fbm3(x * 0.1 + 50, y * 0.1, z * 0.1, 2) > 1.05 - look.moss * 0.55) vol.data[x + y * sx + z * sxy] = ROLE.MOSS;
        }
      }
}

// --- generator registration ------------------------------------------------

const PARAMS: ParamSpec[] = [
  { path: "shape.width", label: "Width", kind: "int", min: 10, max: 120, group: "Shape" },
  { path: "shape.depth", label: "Depth", kind: "int", min: 10, max: 120, group: "Shape" },
  { path: "shape.storeys", label: "Storeys", kind: "int", min: 1, max: 6, group: "Shape" },
  { path: "shape.storeyHeight", label: "Storey height", kind: "int", min: 7, max: 20, group: "Shape" },
  { path: "shape.plinth", label: "Plinth", kind: "int", min: 0, max: 5, group: "Shape" },
  { path: "shape.roof", label: "Roof", kind: "enum", options: ["gable", "hip", "flat"], group: "Roof" },
  { path: "shape.roofPitch", label: "Roof pitch", kind: "number", min: 0.4, max: 2.5, step: 0.1, group: "Roof", help: "run per rise: 1 is 45°" },
  { path: "shape.overhang", label: "Eaves", kind: "int", min: 0, max: 5, group: "Roof" },
  { path: "shape.chimneys", label: "Chimneys", kind: "int", min: 0, max: 3, group: "Roof" },
  { path: "openings.windowWidth", label: "Window width", kind: "int", min: 2, max: 9, group: "Openings" },
  { path: "openings.windowHeight", label: "Window height", kind: "int", min: 2, max: 12, group: "Openings" },
  { path: "openings.windowSpacing", label: "Window spacing", kind: "int", min: 6, max: 24, group: "Openings" },
  { path: "openings.windowFraction", label: "Window fill", kind: "number", min: 0, max: 1, step: 0.05, group: "Openings" },
  { path: "openings.doorWidth", label: "Door width", kind: "int", min: 3, max: 12, group: "Openings" },
  { path: "look.wall", label: "Walls", kind: "enum", options: ["plaster", "brick", "stone", "timber"], group: "Look" },
  { path: "look.roofStyle", label: "Roofing", kind: "enum", options: ["tile", "slate", "thatch", "shingle"], group: "Look" },
  { path: "look.quoins", label: "Quoins", kind: "bool", group: "Look" },
  { path: "look.lit", label: "Lit windows", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.weathering", label: "Weathering", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.moss", label: "Roof moss", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
];

export const houseGenerator: EntityGenerator<BuildingParams> = {
  id: "voxolith/house",
  name: "House",
  version: "0.1.0",
  description: "Shape-grammar building: plinth, hollow storeys, windows on a rhythm, a door, and a gable, hip or flat roof.",
  roles: buildRoles(skinFor("plaster", "thatch")),
  defaults: PRESETS.cottage,
  params: PARAMS,
  generate: (params, rng) => generateBuilding(params, rng).entity,
};

export const townhouseGenerator: EntityGenerator<BuildingParams> = {
  ...houseGenerator,
  id: "voxolith/townhouse",
  name: "Townhouse",
  description: "Tall brick terrace house with a flat parapet roof and quoined corners.",
  roles: buildRoles(skinFor("brick", "slate")),
  defaults: PRESETS.townhouse,
};

export function registerBuildingGenerators(): void {
  registerGenerator(houseGenerator);
  registerGenerator(townhouseGenerator);
}

export { PRESETS, PRESET_NAMES, skinFor } from "./presets";
export { ROLE, buildRoles } from "./roles";
export { cloneParams } from "./params";
export type { BuildingParams, ShapeParams, OpeningParams, LookParams, RoofKind, WallStyle, RoofStyle } from "./params";
