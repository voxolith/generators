// @voxolith/gen-building — procedural voxel buildings.
//
// A small shape grammar followed by detail passes, in this order:
//
//   1. mass     plinth, hollow storeys with floor slabs, the roof shell, gables
//   2. layout   where every window and the door go, decided before any
//               texture so timber framing can frame them
//   3. walls    brick bond, ashlar courses, plaster with spalling, or a timber
//               frame; joints are recessed so masonry has relief
//   4. trim     quoins, string courses, cornice, water table
//   5. openings windows with reveals, frames, glazing bars, sills, lintels,
//               shutters and flower boxes; a panelled or boarded door with a
//               transom, handle, hood, lamp and steps
//   6. roof     courses of tile, slate or shingle with staggered joints, or
//               thatch with ragged eaves and a ligger ridge; ridge cap, barge
//               boards, rafter tails, gutters and downpipes
//   7. chimneys brick stacks with a corbelled cap and hollow pots
//   8. weather  streaks under sills, rising damp, roof and plinth moss
//
// Walls are addressed in face-local coordinates: `u` runs along the face, `y`
// is height, and `d` is depth into the wall from its outer skin (d = 0), with
// negative d standing proud of it. Everything random comes from the injected
// rng or from hashes of positions, so the same seed rebuilds the same house.

import { hash01, makeNoise, Volume } from "@voxolith/gen-kit";
import { refinement, registerGenerator, type Entity, type EntityGenerator, type GenerateContext, type ParamSpec, type Vec3 } from "@voxolith/engine";
import { fineBuilding } from "./fine";
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

type FaceId = "z1" | "z0" | "x0" | "x1";

interface Face {
  id: FaceId;
  len: number;
  /** Distinguishes faces in hashes. */
  salt: number;
  at(u: number, y: number, d: number): Vec3;
}

interface Opening {
  face: Face;
  /** First column along the face. */
  a: number;
  /** First row. */
  y: number;
  w: number;
  h: number;
  storey: number;
  gable: boolean;
  lit: boolean;
  shutters: boolean;
  box: boolean;
}

const h2 = (a: number, b: number, c = 0) => hash01((Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) | 0);

/**
 * Generate a building. A finer `ctx.voxelsPerMetre` builds the same design
 * without its coarse relief and refines it with masonry and joinery at their
 * real size (see fine.ts).
 */
export function generateBuilding(params: BuildingParams, rng: () => number, id = "building", ctx?: GenerateContext): BuildingResult {
  const t0 = performance.now();
  const p = cloneParams(params);
  const k = refinement(ctx);
  if (k > 1) p.look.relief = false;
  const noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const s = p.shape, o = p.openings, look = p.look;

  const W = Math.max(16, Math.round(s.width));
  const D = Math.max(16, Math.round(s.depth));
  const t = Math.max(2, Math.round(s.wallThickness));
  const H = Math.max(12, Math.round(s.storeyHeight));
  const N = Math.max(1, Math.round(s.storeys));
  const flat = s.roof === "flat";
  const ov = flat ? 0 : Math.max(0, Math.round(s.overhang));
  const plinth = Math.max(0, Math.round(s.plinth));
  const wallTop = plinth + N * H;
  const run = Math.max(0.4, s.roofPitch);
  const thatch = look.roofStyle === "thatch";

  const ridgeAlongX = W >= D;
  const span = Math.min(W, D);
  const roofH = flat ? 5 : Math.ceil((span / 2 + ov) / run) + 3;
  const chimneyH = s.chimneys > 0 ? 12 : 0;

  // Room around the footprint for everything that stands proud of the walls:
  // eaves, gutters, sills, shutters, flower boxes, and in front, the steps.
  const pad = 5;
  const front = Math.max(pad, 2 * plinth + 4);
  const x0 = ov + pad, x1 = x0 + W - 1;
  const z0 = ov + pad, z1 = z0 + D - 1;
  const sx = x1 + ov + pad + 1;
  const sz = z1 + Math.max(ov + pad, front) + 1;
  const sy = wallTop + roofH + chimneyH + pad;
  const vol = new Volume(sx, sy, sz);
  const at = (x: number, y: number, z: number) => vol.get(x, y, z);
  const put = (x: number, y: number, z: number, v: number) => vol.set(x, y, z, v);
  const fill = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, v: number) => {
    for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++)
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++)
        for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) put(x, y, z, v);
  };

  const faces: Face[] = [
    { id: "z1", len: W, salt: 11, at: (u, y, d) => [x0 + u, y, z1 - d] },
    { id: "z0", len: W, salt: 23, at: (u, y, d) => [x1 - u, y, z0 + d] },
    { id: "x0", len: D, salt: 37, at: (u, y, d) => [x0 + d, y, z0 + u] },
    { id: "x1", len: D, salt: 53, at: (u, y, d) => [x1 - d, y, z1 - u] },
  ];
  const fget = (f: Face, u: number, y: number, d: number) => { const [x, yy, z] = f.at(u, y, d); return at(x, yy, z); };
  const fset = (f: Face, u: number, y: number, d: number, v: number) => { const [x, yy, z] = f.at(u, y, d); put(x, yy, z, v); };
  const front1 = faces[0];

  // --- 1. mass ----------------------------------------------------------------
  // The plinth stands one voxel proud of the walls all round.
  if (plinth > 0) fill(x0 - 1, 0, z0 - 1, x1 + 1, plinth - 1, z1 + 1, ROLE.FOUNDATION);
  fill(x0, plinth, z0, x1, wallTop - 1, z1, ROLE.WALL);
  for (let k = 0; k < N; k++) {
    const yb = plinth + k * H;
    fill(x0 + t, yb, z0 + t, x1 - t, yb, z1 - t, ROLE.FLOOR);
    fill(x0 + t, yb + 1, z0 + t, x1 - t, yb + H - 1, z1 - t, 0);
  }

  // Roof shell. A stack of slabs, each inset by the pitch; the attic is
  // hollowed only where the next slab up has interior, so every voxel of a
  // slab rests on the one below and the roof cannot float free.
  let ridgeY = wallTop;
  const slabAt = (k: number) => {
    const inset = Math.round(k * run);
    let ax = x0 - ov, bx = x1 + ov, az = z0 - ov, bz = z1 + ov;
    if (s.roof === "hip" || !ridgeAlongX) { ax += inset; bx -= inset; }
    if (s.roof === "hip" || ridgeAlongX) { az += inset; bz -= inset; }
    return { ax, bx, az, bz };
  };
  if (flat) {
    // A parapet continues the walls; the roof deck sits inside it.
    fill(x0, wallTop, z0, x1, wallTop + 3, z1, ROLE.WALL);
    fill(x0 + t, wallTop + 1, z0 + t, x1 - t, wallTop + 3, z1 - t, 0);
    fill(x0 + t, wallTop, z0 + t, x1 - t, wallTop, z1 - t, ROLE.ROOF_DARK);
    ridgeY = wallTop + 4;
  } else {
    for (let k = 0; k < roofH; k++) {
      const { ax, bx, az, bz } = slabAt(k);
      if (bx < ax || bz < az) break;
      const y = wallTop + k;
      fill(ax, y, az, bx, y, bz, ROLE.ROOF);
      ridgeY = y;
      const last = (s.roof === "hip" || !ridgeAlongX ? bx - ax <= 1 : false) || (s.roof === "hip" || ridgeAlongX ? bz - az <= 1 : false);
      if (last) break;
      const n = slabAt(k + 1);
      // Along a gable ridge the hollow runs out under the verge, so the gable
      // walls below are real walls and the overhang is a skin, not a block.
      const alongX = s.roof === "gable" && ridgeAlongX, alongZ = s.roof === "gable" && !ridgeAlongX;
      const hx0 = alongX ? n.ax : Math.max(n.ax + 1, x0 + t), hx1 = alongX ? n.bx : Math.min(n.bx - 1, x1 - t);
      const hz0 = alongZ ? n.az : Math.max(n.az + 1, z0 + t), hz1 = alongZ ? n.bz : Math.min(n.bz - 1, z1 - t);
      if (k > 0 && hx1 >= hx0 && hz1 >= hz0) fill(hx0, y, hz0, hx1, y, hz1, 0);
    }
    // Gable walls rise inside the roof to the ridge.
    if (s.roof === "gable") {
      // The base slab is a ceiling inside the walls; out under the verge it
      // would read as a shelf, so only its edges stay.
      const n1 = slabAt(1);
      if (ridgeAlongX) {
        const za = Math.max(n1.az + 1, z0 + t), zb = Math.min(n1.bz - 1, z1 - t);
        fill(x0 - ov, wallTop, za, x0 - 1, wallTop, zb, 0);
        fill(x1 + 1, wallTop, za, x1 + ov, wallTop, zb, 0);
      } else {
        const xa = Math.max(n1.ax + 1, x0 + t), xb = Math.min(n1.bx - 1, x1 - t);
        fill(xa, wallTop, z0 - ov, xb, wallTop, z0 - 1, 0);
        fill(xa, wallTop, z1 + 1, xb, wallTop, z1 + ov, 0);
      }
      for (let k = 0; wallTop + k <= ridgeY; k++) {
        const { ax, bx, az, bz } = slabAt(k + 1);
        const y = wallTop + k;
        for (let d = 0; d < t; d++) {
          if (ridgeAlongX) {
            for (let z = Math.max(az, z0); z <= Math.min(bz, z1); z++)
              for (const x of [x0 + d, x1 - d]) if (!at(x, y, z)) put(x, y, z, ROLE.WALL);
          } else {
            for (let x = Math.max(ax, x0); x <= Math.min(bx, x1); x++)
              for (const z of [z0 + d, z1 - d]) if (!at(x, y, z)) put(x, y, z, ROLE.WALL);
          }
        }
      }
    }
  }

  // --- 2. layout ---------------------------------------------------------------
  const ww = Math.max(3, Math.round(o.windowWidth)), wh = Math.max(4, Math.round(o.windowHeight));
  const sill = Math.max(2, Math.round(o.sillHeight));
  const sw = o.shutters > 0 ? Math.max(2, Math.floor(ww / 2)) : 0;
  const spacing = Math.max(ww + 2 * sw + 4, Math.round(o.windowSpacing));
  const dw = Math.max(5, Math.round(o.doorWidth));
  const dh = Math.min(H - 4, Math.max(8, Math.round(o.doorHeight)));
  const barnDoor = dw >= 14;

  /** Window positions (first column) along a face, centred, clear of corners. */
  const rhythm = (len: number): number[] => {
    const margin = 6 + sw;
    const usable = len - 2 * margin - ww;
    if (usable < 0) return len >= ww + 8 ? [Math.floor((len - ww) / 2)] : [];
    const n = Math.floor(usable / spacing) + 1;
    const start = Math.floor((len - ww - (n - 1) * spacing) / 2);
    return Array.from({ length: n }, (_, i) => start + i * spacing);
  };

  // The door takes a window slot on the ground floor at the front, so the
  // facade stays regular; with an odd number of slots it is the middle one.
  const frontSlots = rhythm(W);
  let doorSlot = -1;
  if (frontSlots.length) {
    const mid = (frontSlots.length - 1) / 2;
    doorSlot = Number.isInteger(mid) ? mid : Math.floor(mid) + (rng() < 0.5 ? 0 : 1);
  }
  const doorA = doorSlot >= 0 ? Math.round(frontSlots[doorSlot] + ww / 2 - dw / 2) : Math.floor((W - dw) / 2);
  const doorKeep = dw / 2 + (barnDoor ? 2 : sw + 5);

  const openings: Opening[] = [];
  for (let k = 0; k < N; k++) {
    const yb = plinth + k * H;
    for (const f of faces) {
      for (const a of rhythm(f.len)) {
        if (k === 0 && f === front1 && Math.abs(a + ww / 2 - (doorA + dw / 2)) < doorKeep + ww / 2) continue;
        if (rng() > o.windowFraction) continue;
        openings.push({
          face: f, a, y: yb + sill, w: ww, h: wh, storey: k, gable: false,
          lit: rng() < look.lit, shutters: rng() < o.shutters, box: rng() < o.flowerBoxes,
        });
      }
    }
  }
  if (o.gableWindows && s.roof === "gable") {
    for (const f of faces.filter((f) => (ridgeAlongX ? f.id === "x0" || f.id === "x1" : f.id === "z0" || f.id === "z1"))) {
      const gw = Math.max(3, ww - 2 - ((ww - 2) % 2 === 0 ? 1 : 0)), gh = Math.max(4, wh - 3);
      const y = wallTop + 3;
      const inset = Math.round((y + gh + 2 - wallTop) * run);
      if (f.len - 2 * (inset - ov) < gw + 8) continue;
      openings.push({ face: f, a: Math.floor((f.len - gw) / 2), y, w: gw, h: gh, storey: N, gable: true, lit: rng() < look.lit, shutters: false, box: false });
    }
  }

  // --- 3. walls ------------------------------------------------------------------
  const wallRoles = new Set<number>([ROLE.WALL, ROLE.WALL_DARK, ROLE.WALL_LIGHT]);
  const tone = (h: number, dark: number, light: number) => (h < dark ? ROLE.WALL_DARK : h > 1 - light ? ROLE.WALL_LIGHT : ROLE.WALL);

  // Stone: ashlar courses of 3..5 rows; blocks 5..11 long, laid per course.
  const courseOf = new Int16Array(sy);
  const rowInCourse = new Int8Array(sy);
  const courseH = new Int8Array(sy);
  {
    let y = plinth, c = 0;
    while (y < sy) {
      const hc = look.wall === "stone" ? 3 + Math.floor(h2(c, 7) * 3) : 3;
      for (let r = 0; r < hc && y < sy; r++, y++) { courseOf[y] = c; rowInCourse[y] = r; courseH[y] = hc; }
      c++;
    }
  }
  const blockCache = new Map<number, Int16Array>();
  /** Block id per column for one course on one face; -1 marks a joint. */
  const blocks = (f: Face, c: number): Int16Array => {
    const key = f.salt * 4096 + c;
    let row = blockCache.get(key);
    if (row) return row;
    row = new Int16Array(f.len);
    let u = -Math.floor(h2(c, f.salt, 1) * 8), b = 0;
    while (u < f.len) {
      const L = 5 + Math.floor(h2(c, b, f.salt) * 7);
      for (let i = 0; i < L && u < f.len; i++, u++) if (u >= 0) row[u] = i === L - 1 ? -1 : b;
      b++;
    }
    blockCache.set(key, row);
    return row;
  };

  /** Brick in running bond: 2-row bricks 7 long, joints between. */
  const brick = (f: Face, u: number, y: number, exposed: boolean): { role: number; joint: boolean } => {
    const yy = y - plinth;
    const c = Math.floor(yy / 3);
    if (yy % 3 === 2) return { role: ROLE.MORTAR, joint: true };
    const uu = u + (c % 2 ? 4 : 0) + f.salt;
    if (uu % 8 === 7) return { role: ROLE.MORTAR, joint: true };
    const hb = h2(Math.floor(uu / 8), c, f.salt);
    if (exposed) return { role: hb < 0.3 ? ROLE.WALL_DARK : ROLE.BRICK_EXPOSED, joint: false };
    return { role: tone(hb, 0.2, 0.15), joint: false };
  };

  // Timber framing, per face: sole plate, storey rails, sill and lintel rails,
  // posts at every jamb and corner, and a brace in the end bays.
  const frames = new Map<Face, Uint8Array>();
  if (look.wall === "timber") {
    const bs = Math.max(6, Math.round(look.beamSpacing));
    for (const f of faces) {
      const m = new Uint8Array(f.len * sy);
      const set = (u: number, y: number) => { if (u >= 0 && u < f.len && y >= 0 && y < sy) m[u + y * f.len] = 1; };
      for (let k = 0; k < N; k++) {
        const yb = plinth + k * H, yt = yb + H - 1;
        for (let u = 0; u < f.len; u++) {
          set(u, yb); set(u, yb + 1); set(u, yt);
          set(u, yb + sill - 1); set(u, yb + sill + wh);
        }
        const posts = [0, 1, f.len - 2, f.len - 1];
        for (const op of openings) if (op.face === f && op.storey === k) posts.push(op.a - 2, op.a - 1, op.a + op.w, op.a + op.w + 1);
        if (k === 0 && f === front1) posts.push(doorA - 2, doorA - 1, doorA + dw, doorA + dw + 1);
        posts.sort((a, b) => a - b);
        // Studs in wide bays.
        const extra: number[] = [];
        for (let i = 0; i + 1 < posts.length; i++) {
          const gap = posts[i + 1] - posts[i];
          if (gap > bs * 1.5) {
            const n = Math.round(gap / bs);
            for (let j = 1; j < n; j++) extra.push(Math.round(posts[i] + (gap * j) / n));
          }
        }
        for (const u of [...posts, ...extra]) for (let y = yb; y <= yt; y++) set(u, y);
        // Braces in the two end bays, rising towards the corners.
        const inner = [...posts, ...extra].filter((u) => u > 1 && u < f.len - 2).sort((a, b) => a - b);
        if (inner.length) {
          const bays: [number, number][] = [[2, inner[0] - 1], [inner[inner.length - 1] + 1, f.len - 3]];
          for (const [ua, ub] of bays) {
            if (ub - ua < 3) continue;
            const ya = yb + 2, yz = yt - 1;
            const toCorner = ua === 2;
            const n = Math.max(ub - ua, yz - ya);
            for (let i = 0; i <= n; i++) {
              const fu = i / n;
              const u = Math.round(toCorner ? ub - (ub - ua) * fu : ua + (ub - ua) * fu);
              const y = Math.round(ya + (yz - ya) * fu);
              set(u, y); set(u + (toCorner ? -1 : 1), y);
            }
          }
        }
      }
      // Gable: tie beam at the wall head, king post up the middle.
      for (let u = 0; u < f.len; u++) { set(u, wallTop); set(u, wallTop + 1); }
      for (let y = wallTop; y < sy; y++) { set(Math.floor(f.len / 2) - 1, y); set(Math.floor(f.len / 2), y); }
      frames.set(f, m);
    }
  }

  const relief = look.relief;
  const spallT = 0.78 - look.spalling * 0.22;
  for (const f of faces) {
    const frame = frames.get(f);
    for (let y = plinth; y < sy; y++)
      for (let u = 0; u < f.len; u++) {
        const v = fget(f, u, y, 0);
        if (!wallRoles.has(v)) continue;
        const [x, , z] = f.at(u, y, 0);
        const corner = u === 0 || u === f.len - 1;
        let role: number = ROLE.WALL, joint = false;
        if (look.wall === "brick") ({ role, joint } = brick(f, u, y, false));
        else if (look.wall === "stone") {
          const c = courseOf[y];
          const b = blocks(f, c)[u];
          if (rowInCourse[y] === courseH[y] - 1 || b < 0) { role = ROLE.MORTAR; joint = true; }
          else role = tone(h2(b, c, f.salt + 3), 0.25, 0.25);
        } else {
          if (frame && frame[u + y * f.len]) {
            fset(f, u, y, 0, ROLE.BEAM);
            if (relief) fset(f, u, y, -1, ROLE.BEAM);
            continue;
          }
          const n = noise.value3(x * 0.16, y * 0.16, z * 0.16);
          role = n > 0.7 ? ROLE.WALL_LIGHT : n < 0.3 ? ROLE.WALL_DARK : ROLE.WALL;
          if (look.wall === "plaster" && look.spalling > 0 && !corner) {
            const yn = (y - plinth) / Math.max(1, wallTop - plinth);
            const sp = noise.fbm3(x * 0.08 + 31, y * 0.11, z * 0.08 + 7, 3) + (1 - Math.min(1, yn)) * 0.06;
            if (sp > spallT && fget(f, u, y, 1)) {
              // Plaster gone: brick shows, one voxel back.
              const b = brick(f, u, y, true);
              fset(f, u, y, 0, 0);
              fset(f, u, y, 1, b.role);
              continue;
            }
            if (sp > spallT - 0.025) role = ROLE.WALL_DARK;
          }
        }
        if (joint && relief && !corner && fget(f, u, y, 1)) {
          fset(f, u, y, 0, 0);
          fset(f, u, y, 1, ROLE.MORTAR);
        } else fset(f, u, y, 0, role);
      }
  }

  // --- 4. trim --------------------------------------------------------------------
  // Water table: the plinth's proud top edge in dressed stone.
  if (plinth > 0) {
    for (let x = x0 - 1; x <= x1 + 1; x++) { put(x, plinth - 1, z0 - 1, ROLE.TRIM_DARK); put(x, plinth - 1, z1 + 1, ROLE.TRIM_DARK); }
    for (let z = z0 - 1; z <= z1 + 1; z++) { put(x0 - 1, plinth - 1, z, ROLE.TRIM_DARK); put(x1 + 1, plinth - 1, z, ROLE.TRIM_DARK); }
    // Plinth blocks.
    for (let y = 0; y < plinth - 1; y++)
      for (let z = z0 - 1; z <= z1 + 1; z++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          if (at(x, y, z) !== ROLE.FOUNDATION || !vol.isSurface(x, y, z)) continue;
          const along = x + z;
          const c = Math.floor(y / 2);
          const uu = along + (c % 2 ? 3 : 0);
          const joint = uu % 7 === 0 || y % 2 === 1 && h2(uu, c) < 0.15;
          put(x, y, z, joint || h2(Math.floor(uu / 7), c, 5) < 0.35 ? ROLE.FOUNDATION_DARK : ROLE.FOUNDATION);
        }
  }

  // Quoins: alternating long and short dressed blocks at each corner, proud.
  const band = (y: number, d: number, v: number) => {
    for (const f of faces) for (let u = 0; u < f.len; u++) { if (fget(f, u, y, 0) || d >= 0) fset(f, u, y, d, v); }
    // Close the outside corners of a proud band.
    if (d < 0) for (const [cx, cz] of [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x0 - 1, z1 + 1], [x1 + 1, z1 + 1]]) put(cx, y, cz, v);
  };
  if (look.quoins) {
    for (const f of faces) {
      let y = plinth, i = 0;
      while (y < wallTop) {
        const long = i % 2 === 0;
        for (let r = 0; r < 4 && y + r < wallTop; r++) {
          const joint = r === 3;
          for (const [u0, dir] of [[0, 1], [f.len - 1, -1]] as const) {
            const L = long ? 7 : 4;
            for (let j = 0; j < L; j++) {
              const u = u0 + dir * j;
              if (!fget(f, u, y + r, 0)) continue;
              if (joint) { fset(f, u, y + r, 0, ROLE.TRIM_DARK); continue; }
              fset(f, u, y + r, 0, ROLE.TRIM);
              if (relief) fset(f, u, y + r, -1, ROLE.TRIM);
            }
          }
        }
        // Proud quoins meet at the corner diagonal.
        if (relief) for (let r = 0; r < 3 && y + r < wallTop; r++) for (const [cx, cz] of [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x0 - 1, z1 + 1], [x1 + 1, z1 + 1]]) put(cx, y + r, cz, ROLE.TRIM);
        y += 4; i++;
      }
    }
  }
  // String courses at each floor line, for masonry and plaster.
  if (look.wall !== "timber" && (look.quoins || look.wall === "stone")) {
    for (let k = 1; k < N; k++) {
      const y = plinth + k * H;
      band(y, 0, ROLE.TRIM);
      if (relief) band(y, -1, ROLE.TRIM);
      band(y - 1, 0, ROLE.TRIM_DARK);
    }
  }
  // Cornice under a flat roof: a proud moulding with dentils beneath, coping on top.
  if (flat) {
    band(wallTop - 1, 0, ROLE.TRIM);
    band(wallTop - 1, -1, ROLE.TRIM);
    band(wallTop, -1, ROLE.TRIM);
    band(wallTop - 1, -2, ROLE.TRIM_DARK);
    for (const f of faces) for (let u = 0; u < f.len; u += 2) fset(f, u, wallTop - 2, -1, ROLE.TRIM_DARK);
    for (const f of faces) for (let u = 0; u < f.len; u++) for (let d = -1; d < t + 1; d++) fset(f, u, wallTop + 4, d, ROLE.TRIM);
    for (const [cx, cz] of [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x0 - 1, z1 + 1], [x1 + 1, z1 + 1]]) put(cx, wallTop + 4, cz, ROLE.TRIM);
  }

  // --- 5. openings -----------------------------------------------------------------
  let windows = 0, lit = 0;
  const stoneDressing = look.wall !== "timber";

  for (const op of openings) {
    const { face: f, a, y: ys, w, h } = op;
    const glass = op.lit ? ROLE.GLASS_LIT : ROLE.GLASS;
    // Cut the hole through the wall and anything standing proud of it.
    for (let y = ys; y < ys + h; y++) for (let u = a; u < a + w; u++) for (let d = -2; d < t; d++) fset(f, u, y, d, 0);
    // Frame and glass one voxel back from the face, so the reveal casts shadow.
    const midU = a + Math.floor(w / 2);
    const bars = o.glazingBars && !op.gable;
    for (let y = ys; y < ys + h; y++)
      for (let u = a; u < a + w; u++) {
        const edge = u === a || u === a + w - 1 || y === ys || y === ys + h - 1;
        const bar = bars && (u === midU || y === ys + Math.round((h - 1) / 3) || y === ys + Math.round((2 * (h - 1)) / 3));
        const meeting = !bars && !op.gable && h >= 8 && y === ys + Math.floor(h / 2); // sash meeting rail
        fset(f, u, y, 1, edge || bar || meeting ? ROLE.FRAME : glass);
      }
    // Sill: dressed stone (or a timber rail), standing proud.
    for (let u = a - 1; u <= a + w; u++) {
      fset(f, u, ys - 1, 0, stoneDressing ? ROLE.TRIM : ROLE.BEAM);
      fset(f, u, ys - 1, -1, stoneDressing ? ROLE.TRIM : ROLE.BEAM);
    }
    // Lintel: a soldier course for brick, a stone with a keystone otherwise.
    if (stoneDressing) {
      for (let u = a - 1; u <= a + w; u++) {
        const soldier = look.wall === "brick" && !look.quoins;
        fset(f, u, ys + h, 0, soldier ? ((u - a) % 2 ? ROLE.WALL_DARK : ROLE.WALL) : ROLE.TRIM);
        if (soldier) fset(f, u, ys + h + 1, 0, (u - a) % 2 ? ROLE.WALL_DARK : ROLE.WALL);
      }
      if (!(look.wall === "brick" && !look.quoins)) {
        fset(f, midU, ys + h, -1, ROLE.TRIM);
        fset(f, midU, ys + h + 1, 0, ROLE.TRIM);
        if (w % 2 === 0) { fset(f, midU - 1, ys + h, -1, ROLE.TRIM); fset(f, midU - 1, ys + h + 1, 0, ROLE.TRIM); }
      }
    }
    // Shutters either side, slatted, hung against the wall.
    if (op.shutters && sw > 0) {
      for (const side of [-1, 1]) {
        const ua = side < 0 ? a - 1 - sw : a + w + 1;
        for (let y = ys; y < ys + h; y++)
          for (let u = ua; u < ua + sw; u++) {
            const rail = y === ys || y === ys + h - 1 || u === ua || u === ua + sw - 1 || y === ys + Math.floor(h / 2);
            fset(f, u, y, -1, rail || (y - ys) % 2 === 0 ? ROLE.SHUTTER : ROLE.SHUTTER_DARK);
          }
      }
    }
    // Flower box under the sill, with blooms and a trailing leaf or two.
    if (op.box && !op.gable) {
      for (let u = a - 1; u <= a + w; u++) {
        for (let y = ys - 3; y <= ys - 2; y++) for (let d = -2; d <= -1; d++) fset(f, u, y, d, ROLE.SHUTTER_DARK);
        const hb = h2(u, ys, f.salt + 17);
        fset(f, u, ys - 1, -2, hb < 0.35 ? ROLE.LEAF : hb < 0.7 ? ROLE.FLOWER_A : ROLE.FLOWER_B);
        if (h2(u, ys, 91) < 0.45) fset(f, u, ys, -2, hb < 0.5 ? ROLE.FLOWER_A : ROLE.LEAF);
        if (h2(u, ys, 57) < 0.3) { fset(f, u, ys - 4, -2, ROLE.LEAF); if (h2(u, ys, 58) < 0.4) fset(f, u, ys - 5, -2, ROLE.LEAF); }
      }
    }
    windows++;
    if (op.lit) lit++;
  }

  // The door.
  {
    const f = front1, a = doorA, y0 = plinth, top = plinth + dh;
    const doorLit = rng() < look.lit;
    for (let y = y0; y < top; y++) for (let u = a; u < a + dw; u++) for (let d = -2; d < t; d++) fset(f, u, y, d, 0);
    const mid = a + Math.floor(dw / 2);
    if (barnDoor) {
      // Two boarded leaves, each with a Z brace.
      for (let y = y0; y < top; y++)
        for (let u = a; u < a + dw; u++) {
          const edge = u === a || u === a + dw - 1 || u === mid || u === mid - 1 || y === top - 1 || y === y0;
          fset(f, u, y, 1, edge ? ROLE.BEAM : Math.floor((u - a) / 2) % 2 ? ROLE.DOOR_DARK : ROLE.DOOR);
        }
      for (const [ua, ub] of [[a + 1, mid - 2], [mid + 1, a + dw - 2]]) {
        const rails = [y0 + 2, Math.floor((y0 + top) / 2), top - 3];
        for (const y of rails) for (let u = ua; u <= ub; u++) fset(f, u, y, 0, ROLE.BEAM);
        for (let r = 0; r < 2; r++) {
          const ya = rails[r], yb = rails[r + 1];
          const n = Math.max(ub - ua, yb - ya);
          for (let i = 0; i <= n; i++) fset(f, Math.round(ua + ((ub - ua) * i) / n), Math.round(ya + ((yb - ya) * i) / n), 0, ROLE.BEAM);
        }
      }
      fset(f, mid - 2, Math.floor((y0 + top) / 2) + 2, -1, ROLE.HANDLE);
      fset(f, mid + 1, Math.floor((y0 + top) / 2) + 2, -1, ROLE.HANDLE);
    } else {
      // A panelled leaf with a glazed transom above it.
      const transom = dh >= 14 ? 3 : 0;
      const leafTop = top - transom;
      for (let y = y0; y < top; y++)
        for (let u = a; u < a + dw; u++) {
          if (y >= leafTop) {
            const edge = u === a || u === a + dw - 1 || y === leafTop || y === top - 1;
            fset(f, u, y, 1, edge ? ROLE.FRAME : doorLit ? ROLE.GLASS_LIT : ROLE.GLASS);
            continue;
          }
          const lu = u - a, ly = y - y0, lh = leafTop - y0;
          const stile = lu === 0 || lu === dw - 1 || (dw >= 8 && (lu === Math.floor(dw / 2) - (dw % 2 ? 0 : 1) || lu === Math.floor(dw / 2)));
          const rail = ly <= 1 || ly >= lh - 2 || ly === Math.floor(lh * 0.42) || ly === Math.floor(lh * 0.42) + 1;
          if (stile || rail || lu === 1 || lu === dw - 2) fset(f, u, y, 1, ROLE.DOOR);
          else { fset(f, u, y, 1, 0); fset(f, u, y, 2, ROLE.DOOR_DARK); }
        }
      // Handle and a letter plate.
      fset(f, a + dw - 3, y0 + Math.floor(dh * 0.45), 0, ROLE.HANDLE);
      fset(f, mid, y0 + Math.floor(dh * 0.55), 0, ROLE.HANDLE);
    }
    // Door case: a proud surround.
    for (let y = y0; y <= top; y++) {
      for (const u of [a - 1, a + dw]) { fset(f, u, y, 0, stoneDressing ? ROLE.TRIM : ROLE.BEAM); if (relief) fset(f, u, y, -1, stoneDressing ? ROLE.TRIM : ROLE.BEAM); }
    }
    for (let u = a - 1; u <= a + dw; u++) { fset(f, u, top, 0, stoneDressing ? ROLE.TRIM : ROLE.BEAM); fset(f, u, top, -1, stoneDressing ? ROLE.TRIM : ROLE.BEAM); }
    if (stoneDressing) { fset(f, mid, top + 1, 0, ROLE.TRIM); fset(f, mid, top + 1, -1, ROLE.TRIM); }
    // Hood on brackets.
    if (o.doorHood && !barnDoor) {
      const hy = top + 2;
      for (let u = a - 3; u <= a + dw + 2; u++) {
        for (let d = -5; d <= -1; d++) fset(f, u, hy, d, d === -5 ? ROLE.TRIM_DARK : ROLE.ROOF_DARK);
        for (let d = -3; d <= -1; d++) fset(f, u, hy + 1, d, ROLE.ROOF);
        fset(f, u, hy + 2, -1, ROLE.ROOF_LIGHT);
      }
      for (const u of [a - 3, a + dw + 2]) {
        fset(f, u, hy - 1, -1, ROLE.BEAM); fset(f, u, hy - 1, -2, ROLE.BEAM);
        fset(f, u, hy - 2, -1, ROLE.BEAM); fset(f, u, hy - 3, -1, ROLE.BEAM);
      }
    }
    // A lamp on a bracket beside the door, lit at dusk.
    if (!barnDoor && look.lit > 0) {
      const lu = a + dw + (o.doorHood ? 4 : 3), ly = y0 + dh - 4;
      if (fget(f, lu, ly, 0)) {
        fset(f, lu, ly, -1, ROLE.GUTTER);
        fset(f, lu, ly + 1, -1, ROLE.GUTTER);
        fset(f, lu, ly + 1, -2, ROLE.GUTTER);
        fset(f, lu, ly, -2, ROLE.GLASS_LIT);
        fset(f, lu, ly - 1, -2, ROLE.GLASS_LIT);
        fset(f, lu, ly - 2, -2, ROLE.GUTTER);
      }
    }
    // Steps up to the door: one voxel rise, two voxel run, landing at the top.
    const sa = a - 2, sb = a + dw + 1;
    for (let i = 0; i < plinth; i++) {
      const yTop = plinth - 1 - i;
      for (let dz = 0; dz < 2; dz++) {
        const z = z1 + 2 + 2 * i + dz;
        for (let x = x0 + sa; x <= x0 + sb; x++) {
          for (let y = 0; y < yTop; y++) put(x, y, z, h2(x, y, z) < 0.4 ? ROLE.FOUNDATION_DARK : ROLE.FOUNDATION);
          put(x, yTop, z, ROLE.TRIM);
        }
      }
    }
    for (let x = x0 + sa; x <= x0 + sb; x++) put(x, plinth - 1, z1 + 1, ROLE.TRIM);
  }

  // --- 6. roof ---------------------------------------------------------------------
  const roofRole = new Set<number>([ROLE.ROOF, ROLE.ROOF_DARK, ROLE.ROOF_LIGHT, ROLE.RIDGE]);
  const eaveX0 = x0 - ov, eaveX1 = x1 + ov, eaveZ0 = z0 - ov, eaveZ1 = z1 + ov;
  const ridgeK = ridgeY - wallTop;

  if (!flat) {
    // Courses: rows per course, tile length, and how much tone varies.
    const style = look.roofStyle;
    const cH = style === "tile" ? 3 : style === "slate" ? 2 : style === "shingle" ? 2 : 1;
    const tw = style === "tile" ? 5 : style === "slate" ? 4 : 3;

    for (let y = wallTop; y <= ridgeY; y++)
      for (let z = eaveZ0; z <= eaveZ1; z++)
        for (let x = eaveX0; x <= eaveX1; x++) {
          const v = at(x, y, z);
          if (!roofRole.has(v)) continue;
          if (at(x, y + 1, z)) { put(x, y, z, ROLE.ROOF_DARK); continue; }
          const k = y - wallTop;
          const ex = Math.min(x - eaveX0, eaveX1 - x), ez = Math.min(z - eaveZ0, eaveZ1 - z);
          let along: number, side: number;
          if (s.roof === "hip") {
            if (Math.abs(ex - ez) <= 0 && k > 0) { put(x, y, z, ROLE.RIDGE); continue; }
            if (ez <= ex) { along = x; side = z < (z0 + z1) / 2 ? 0 : 1; } else { along = z; side = x < (x0 + x1) / 2 ? 2 : 3; }
          } else if (ridgeAlongX) { along = x; side = z < (z0 + z1) / 2 ? 0 : 1; }
          else { along = z; side = x < (x0 + x1) / 2 ? 2 : 3; }

          let role: number;
          if (thatch) {
            const band = 3 + (Math.floor(along / 5) % 2);
            if (k >= ridgeK - band) {
              // Ridge: a raised band pinned with criss-cross hazel liggers.
              const lig = (along + k) % 6 === 0 || (along - k + 600) % 6 === 0 || k === ridgeK - band;
              role = lig ? ROLE.ROOF_LIGHT : ROLE.RIDGE;
            } else {
              const n = noise.value3(along * 0.5, k * 0.15, side * 17);
              const streak = h2(along, side, 3);
              role = n + (streak - 0.5) * 0.3 < 0.36 ? ROLE.ROOF_DARK : n > 0.64 ? ROLE.ROOF_LIGHT : ROLE.ROOF;
            }
          } else if (k === ridgeK) role = ROLE.RIDGE;
          else {
            const c = Math.floor(k / cH);
            const uu = along + (c % 2 ? Math.floor(tw / 2) : 0) + side * 3;
            const joint = uu % tw === 0;
            const lip = k % cH === cH - 1 && cH > 1;
            const ht = h2(Math.floor(uu / tw), c, side + 9);
            const spread = style === "shingle" ? 0.3 : style === "slate" ? 0.14 : 0.18;
            // Each tile gets a tone; the row under a course's lower edge sits
            // one step darker, which is what makes the courses read.
            let step = ht < spread ? 0 : ht > 1 - spread ? 2 : 1;
            if (lip) step--;
            role = joint || step <= 0 ? ROLE.ROOF_DARK : step === 1 ? ROLE.ROOF : ROLE.ROOF_LIGHT;
          }
          put(x, y, z, role);
        }

    // Ridge roll along the top for hard roofs; thatch gets a thicker crest.
    for (let z = eaveZ0; z <= eaveZ1; z++)
      for (let x = eaveX0; x <= eaveX1; x++) {
        const v = at(x, ridgeY, z);
        if (!v || at(x, ridgeY + 1, z)) continue;
        if (!thatch) put(x, ridgeY + 1, z, (ridgeAlongX ? x : z) % 5 === 0 ? ROLE.ROOF_DARK : ROLE.RIDGE);
        else put(x, ridgeY + 1, z, ROLE.RIDGE);
      }

    // Eaves along the sides the roof slopes down to.
    const eaveSides: FaceId[] = s.roof === "hip" ? ["z1", "z0", "x0", "x1"] : ridgeAlongX ? ["z1", "z0"] : ["x0", "x1"];
    for (const fid of eaveSides) {
      const f = faces.find((q) => q.id === fid)!;
      for (let u = -ov; u < f.len + ov; u++) {
        const yb = wallTop - 1;
        if (thatch) {
          // Thick thatch: fill the eave underside, and let it hang raggedly.
          for (let d = -ov; d < 0; d++) fset(f, u, yb, d, ROLE.ROOF_DARK);
          if (h2(u, f.salt, 77) < 0.55) fset(f, u, yb - 1, -ov, ROLE.ROOF_DARK);
          if (h2(u, f.salt, 78) < 0.2) fset(f, u, yb - 1, -ov + 1, ROLE.ROOF_DARK);
          continue;
        }
        if (ov < 1) continue;
        fset(f, u, yb, -ov, ROLE.BEAM); // fascia
        if (((u % 4) + 4) % 4 === 0 && u >= 0 && u < f.len) for (let d = -ov + 1; d < 0; d++) fset(f, u, yb, d, ROLE.BEAM); // rafter tails
        if (look.gutters && ov >= 2 && u > -ov && u < f.len + ov - 1) fset(f, u, yb, -ov - 1, ROLE.GUTTER);
      }
      // Downpipes near each end of the long eaves, clear of windows.
      if (!thatch && look.gutters && ov >= 2 && (fid === "z1" || fid === "z0" || s.roof !== "hip") && (s.roof !== "hip" || fid === "z1" || fid === "z0")) {
        for (const u of [7, f.len - 8]) {
          let y = wallTop - 2;
          fset(f, u, y + 1, -ov - 1, ROLE.GUTTER);
          fset(f, u, y, -ov - 1, ROLE.GUTTER);
          // Swan neck back to the wall.
          for (let d = -ov - 1; d <= -1; d++) { y--; fset(f, u, y, d, ROLE.GUTTER); fset(f, u, y + 1, d, ROLE.GUTTER); }
          for (; y >= plinth; y--) fset(f, u, y, -1, ROLE.GUTTER);
          fset(f, u, plinth, -2, ROLE.GUTTER); // shoe
          // Brackets where the pipe meets the wall.
          for (let yy = plinth + 6; yy < wallTop - 4; yy += 9) if (!fget(f, u, yy, 0)) fset(f, u, yy, 0, ROLE.GUTTER);
        }
      }
    }

    // Barge boards (or a thick thatch verge) under the gable ends.
    if (s.roof === "gable") {
      const ends = ridgeAlongX ? [eaveX0, eaveX1] : [eaveZ0, eaveZ1];
      for (const e of ends)
        for (let y = wallTop; y <= ridgeY + 1; y++)
          for (let w = ridgeAlongX ? eaveZ0 : eaveX0; w <= (ridgeAlongX ? eaveZ1 : eaveX1); w++) {
            const [x, z] = ridgeAlongX ? [e, w] : [w, e];
            const v = at(x, y, z);
            if (!roofRole.has(v)) continue;
            put(x, y, z, thatch ? ROLE.ROOF_DARK : ROLE.ROOF_DARK);
            if (!at(x, y - 1, z) && y - 1 >= wallTop - 1) put(x, y - 1, z, thatch ? ROLE.ROOF_DARK : ROLE.BEAM);
          }
    }
  }

  // --- 7. chimneys -----------------------------------------------------------------
  const nCh = Math.max(0, Math.min(3, Math.round(s.chimneys)));
  for (let c = 0; c < nCh; c++) {
    const end = c % 2 === 0 ? 1 : -1;
    const cw = 7, cd = 5;
    let cx: number, cz: number, top: number;
    if (flat) {
      cx = end > 0 ? x1 - t - cw : x0 + t;
      cz = z0 + 1;
      top = wallTop + 10;
    } else if (ridgeAlongX) {
      const off = t + 4 + (c >= 2 ? Math.floor(W / 3) : 0);
      cx = end > 0 ? x1 - off - cw + 1 : x0 + off;
      cz = Math.floor((z0 + z1) / 2) - 2;
      top = ridgeY + 6;
    } else {
      const off = t + 4 + (c >= 2 ? Math.floor(D / 3) : 0);
      cz = end > 0 ? z1 - off - cw + 1 : z0 + off;
      cx = Math.floor((x0 + x1) / 2) - 2;
      top = ridgeY + 6;
    }
    const [ex, ez] = !flat && !ridgeAlongX ? [cd, cw] : [cw, cd];
    const bx = cx + ex - 1, bz = cz + ez - 1;
    for (let y = wallTop - 3; y <= top; y++)
      for (let z = cz; z <= bz; z++)
        for (let x = cx; x <= bx; x++) {
          const yy = y - wallTop;
          const joint = ((yy % 3) + 3) % 3 === 2 || ((x + z + (Math.floor(yy / 3) % 2) * 2) % 5 === 0);
          const sooty = y > top - 3 && h2(x, y, z) < 0.5;
          put(x, y, z, sooty ? ROLE.SOOT : joint ? ROLE.CHIMNEY_DARK : ROLE.CHIMNEY);
        }
    // Corbelled cap: two proud courses.
    for (const y of [top - 2, top]) {
      for (let z = cz - 1; z <= bz + 1; z++) for (let x = cx - 1; x <= bx + 1; x++) if (x === cx - 1 || x === bx + 1 || z === cz - 1 || z === bz + 1) put(x, y, z, ROLE.CHIMNEY_DARK);
    }
    for (let z = cz; z <= bz; z++) for (let x = cx; x <= bx; x++) put(x, top, z, ROLE.CHIMNEY_DARK);
    // Pots: hollow, 3x3, one or two.
    const pots = ex >= 7 || ez >= 7 ? (rng() < 0.6 ? 2 : 1) : 1;
    for (let i = 0; i < pots; i++) {
      const long = ex >= ez;
      const px = long ? (pots === 2 ? cx + i * 4 : cx + 2) : cx + 1;
      const pz = long ? cz + 1 : pots === 2 ? cz + i * 4 : cz + 2;
      const ph = 3 + (h2(c, i, 5) < 0.5 ? 1 : 0);
      for (let y = top + 1; y <= top + ph; y++)
        for (let z = pz; z < pz + 3; z++)
          for (let x = px; x < px + 3; x++) {
            const centre = x === px + 1 && z === pz + 1;
            if (centre && y > top + 1) continue;
            put(x, y, z, centre ? ROLE.SOOT : y === top + ph ? ROLE.CHIMNEY_DARK : ROLE.POT);
          }
    }
  }

  // --- 8. weathering -----------------------------------------------------------------
  if (look.weathering > 0) {
    const stain = (f: Face, u: number, y: number) => {
      for (let d = -1; d <= 1; d++) {
        const v = fget(f, u, y, d);
        if (!v) continue;
        if (wallRoles.has(v) || v === ROLE.BRICK_EXPOSED) fset(f, u, y, d, ROLE.WALL_DARK);
        return;
      }
    };
    // Streaks down from each sill.
    for (const op of openings) {
      for (let u = op.a; u < op.a + op.w; u++) {
        if (h2(u, op.y, op.face.salt + 41) > 0.25 + look.weathering * 0.35) continue;
        const L = 2 + Math.floor(h2(u, op.y, 43) * 10 * look.weathering);
        for (let i = 0; i < L; i++) stain(op.face, u, op.y - 2 - i - (op.box ? 3 : 0));
      }
    }
    // Rising damp above the plinth, and mottling up the walls.
    for (const f of faces)
      for (let y = plinth; y < wallTop; y++)
        for (let u = 0; u < f.len; u++) {
          const [x, , z] = f.at(u, y, 0);
          const rise = Math.max(0, 1 - (y - plinth) / 7);
          const n = noise.fbm3(x * 0.13 + 5, y * 0.2, z * 0.13, 3);
          if (n + rise * 0.35 > 1.0 - look.weathering * 0.3) stain(f, u, y);
        }
  }
  // Moss on roofs (heavier low down and on the back slope), and on the plinth.
  if (look.moss > 0) {
    for (let y = 0; y < sy - 1; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) {
          const v = at(x, y, z);
          if (!v || at(x, y + 1, z)) continue;
          const isRoof = v === ROLE.ROOF || v === ROLE.ROOF_DARK || v === ROLE.ROOF_LIGHT;
          const isBase = (v === ROLE.FOUNDATION || v === ROLE.FOUNDATION_DARK || v === ROLE.TRIM_DARK) && y < plinth;
          if (!isRoof && !isBase) continue;
          const k = y - wallTop;
          const low = isRoof ? Math.max(0, 1 - k / Math.max(4, ridgeK)) : 0.3;
          const back = isRoof && z < (z0 + z1) / 2 ? 0.08 : 0;
          const n = noise.fbm3(x * 0.14 + 50, y * 0.14, z * 0.14, 3);
          if (n + low * 0.18 + back > 1.02 - look.moss * 0.42) put(x, y, z, ROLE.MOSS);
        }
  }

  const anchor: Vec3 = [(x0 + x1 + 1) / 2, 0, (z0 + z1 + 1) / 2];
  let model = vol.crop(anchor, buildRoles(skinFor(look.wall, look.roofStyle)));
  if (k > 1) model = fineBuilding(model, look, k, Math.floor(rng() * 0x7fffffff));
  let total = 0;
  for (let i = 0; i < vol.data.length; i++) if (vol.data[i] !== 0) total++;

  return {
    entity: {
      id,
      kind: "building",
      model,
      meta: { species: p.species, storeys: N, roof: s.roof, generator: "voxolith/gen-building", ...(k > 1 ? { voxelsPerMetre: k * 10 } : {}) },
    },
    stats: { total, windows, lit, doors: 1, storeys: N, size: model.size, ms: performance.now() - t0 },
  };
}

// --- generator registration ------------------------------------------------

const PARAMS: ParamSpec[] = [
  { path: "shape.width", label: "Width", kind: "int", min: 24, max: 140, group: "Shape" },
  { path: "shape.depth", label: "Depth", kind: "int", min: 24, max: 120, group: "Shape" },
  { path: "shape.storeys", label: "Storeys", kind: "int", min: 1, max: 5, group: "Shape" },
  { path: "shape.storeyHeight", label: "Storey height", kind: "int", min: 18, max: 32, group: "Shape" },
  { path: "shape.wallThickness", label: "Wall thickness", kind: "int", min: 2, max: 4, group: "Shape" },
  { path: "shape.plinth", label: "Plinth", kind: "int", min: 0, max: 8, group: "Shape" },
  { path: "shape.roof", label: "Roof", kind: "enum", options: ["gable", "hip", "flat"], group: "Roof" },
  { path: "shape.roofPitch", label: "Roof pitch", kind: "number", min: 0.5, max: 2.5, step: 0.05, group: "Roof", help: "run per rise: 1 is 45°" },
  { path: "shape.overhang", label: "Eaves", kind: "int", min: 0, max: 6, group: "Roof" },
  { path: "shape.chimneys", label: "Chimneys", kind: "int", min: 0, max: 3, group: "Roof" },
  { path: "openings.windowWidth", label: "Window width", kind: "int", min: 3, max: 13, group: "Openings" },
  { path: "openings.windowHeight", label: "Window height", kind: "int", min: 4, max: 16, group: "Openings" },
  { path: "openings.windowSpacing", label: "Window spacing", kind: "int", min: 10, max: 36, group: "Openings" },
  { path: "openings.windowFraction", label: "Window fill", kind: "number", min: 0, max: 1, step: 0.05, group: "Openings" },
  { path: "openings.glazingBars", label: "Glazing bars", kind: "bool", group: "Openings" },
  { path: "openings.shutters", label: "Shutters", kind: "number", min: 0, max: 1, step: 0.05, group: "Openings" },
  { path: "openings.flowerBoxes", label: "Flower boxes", kind: "number", min: 0, max: 1, step: 0.05, group: "Openings" },
  { path: "openings.doorWidth", label: "Door width", kind: "int", min: 6, max: 22, group: "Openings", help: "14 and over is a pair of boarded barn doors" },
  { path: "openings.doorHood", label: "Door hood", kind: "bool", group: "Openings" },
  { path: "openings.gableWindows", label: "Gable windows", kind: "bool", group: "Openings" },
  { path: "look.wall", label: "Walls", kind: "enum", options: ["plaster", "brick", "stone", "timber"], group: "Look" },
  { path: "look.roofStyle", label: "Roofing", kind: "enum", options: ["tile", "slate", "thatch", "shingle"], group: "Look" },
  { path: "look.relief", label: "Relief", kind: "bool", group: "Look", help: "recessed joints and proud trim" },
  { path: "look.quoins", label: "Quoins", kind: "bool", group: "Look" },
  { path: "look.spalling", label: "Spalling", kind: "number", min: 0, max: 1, step: 0.05, group: "Look", help: "plaster fallen away to show brick" },
  { path: "look.gutters", label: "Gutters", kind: "bool", group: "Look" },
  { path: "look.lit", label: "Lit windows", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.weathering", label: "Weathering", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
  { path: "look.moss", label: "Moss", kind: "number", min: 0, max: 1, step: 0.05, group: "Look" },
];

export const houseGenerator: EntityGenerator<BuildingParams> = {
  id: "voxolith/house",
  name: "House",
  version: "0.2.0",
  description: "Shape-grammar building with textured masonry or timber framing, detailed windows and doors, coursed or thatched roofs, chimneys and weathering.",
  roles: buildRoles(skinFor("plaster", "thatch")),
  looseRoles: [ROLE.FLOWER_A, ROLE.FLOWER_B, ROLE.LEAF].map((v) => buildRoles(skinFor("plaster", "thatch"))[v - 1].id),
  defaults: PRESETS.cottage,
  params: PARAMS,
  generate: (params, rng, ctx) => generateBuilding(params, rng, undefined, ctx).entity,
  scales: [50, 100],
};

export const townhouseGenerator: EntityGenerator<BuildingParams> = {
  ...houseGenerator,
  id: "voxolith/townhouse",
  name: "Townhouse",
  description: "Tall brick terrace house with a corniced parapet roof and quoined corners.",
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
