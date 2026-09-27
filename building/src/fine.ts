// A building at a finer scale (see gen-kit refine).
//
// Buildings stay crisp: walls flat, corners sharp. What the finer grid adds
// is the masonry and joinery at its real size, which the coarse building can
// only suggest (its bricks are 80 cm long and its mortar joints 10 cm wide):
//   - brick: 22 x 7 courses in running bond, 1-voxel joints set back a voxel;
//   - stone: ashlar courses 25..45 tall of blocks 30..70 long, joints set back;
//   - plaster: fine mottling between the three wall tones;
//   - timber frames: grain along the posts and rails;
//   - roofs: tile, slate or shingle courses with a shadowed lower edge, or
//     streaky, ragged thatch;
//   - doors and shutters: boards and slats; floors: planks. Door panels and
//     handles are joined to the leaf behind the scenes (attachDoorParts).
// The coarse building is generated without its relief (recessed joints),
// since here the joints are drawn at their own scale. At 20 voxels per metre
// (5 cm) a brick course or a slate is under two voxels, so there the courses,
// tiles and boards are drawn at about twice their real size instead.

import { hash4, refine, SparseWriter, type RefineCell, type RoleRule } from "@voxolith/gen-kit";
import type { EntityModel } from "@voxolith/engine";
import { ROLE } from "./roles";
import type { LookParams } from "./params";

/** Face coordinates of a cell: u along the face, v up it (or across a top face). */
function faceUV(c: RefineCell): [number, number, number] {
  if (c.ny !== 0) return [c.x, c.z, c.y];
  return c.nx !== 0 ? [c.z, c.y, c.x] : [c.x, c.y, c.z];
}

export function buildingRules(look: LookParams, k: number): Record<number, RoleRule> {
  const s = k / 10; // patterns are drawn for 1 cm voxels and scale with k
  // Below 50 voxels per metre a pattern at its real size would be finer than
  // a voxel can show: noise features keep their 50 vox/m size in voxels, and
  // courses, tiles and boards keep a floor (at 20 vox/m they come out about
  // twice their real size, which reads; a 1-voxel course would not).
  const sn = Math.max(s, 0.5);
  const jointBack = (c: RefineCell, joint: boolean, role: number) => (joint ? (c.depth === 0 ? 0 : ROLE.MORTAR) : role);

  const brick = (c: RefineCell, base: number): number => {
    const [u, v] = faceUV(c);
    const H = Math.max(3, Math.round(7 * s)), L = Math.max(7, Math.round(23 * s));
    const course = Math.floor(v / H);
    const uu = u + (course & 1 ? Math.floor(L / 2) : 0);
    const joint = v % H === H - 1 || uu % L === L - 1;
    const h = hash4(Math.floor(uu / L), course, c.nx * 3 + c.nz * 5 + c.ny * 7);
    const tone = h < 0.18 ? ROLE.WALL_DARK : h > 0.85 ? ROLE.WALL_LIGHT : base === ROLE.BRICK_EXPOSED ? ROLE.BRICK_EXPOSED : ROLE.WALL;
    return jointBack(c, joint, tone);
  };
  const stone = (c: RefineCell): number => {
    const [u, v, w] = faceUV(c);
    const salt = (w >> 4) * 13 + c.nx * 3 + c.nz * 5;
    // Course boundaries: walk up in courses of varying height.
    const C = Math.round(34 * s);
    const course = Math.floor(v / C);
    const ch = Math.round(C * (0.75 + 0.5 * hash4(course, salt, 1)));
    const inCourse = v - course * C;
    const top = inCourse >= ch - Math.max(1, Math.round(1.5 * s));
    const off = Math.floor(hash4(course, salt, 2) * 40 * s);
    const B = Math.round(50 * s);
    const bi = Math.floor((u + off) / B);
    const bl = Math.round(B * (0.6 + 0.8 * hash4(bi, course, salt)));
    const inBlock = (u + off) - bi * B;
    const joint = top || inBlock >= Math.min(B, bl) - Math.max(1, Math.round(1.5 * s)) || inCourse >= C - 1;
    const h = hash4(bi, course, salt, 9);
    return jointBack(c, joint, h < 0.25 ? ROLE.WALL_DARK : h > 0.75 ? ROLE.WALL_LIGHT : ROLE.WALL);
  };
  const plaster = (c: RefineCell): number => {
    const n = c.noise.value3(c.x / (3 * sn), c.y / (3 * sn), c.z / (3 * sn));
    if (c.role !== ROLE.WALL) return c.role;
    return n > 0.8 ? ROLE.WALL_LIGHT : n < 0.18 ? ROLE.WALL_DARK : ROLE.WALL;
  };
  const wall = (c: RefineCell): number =>
    look.wall === "brick" ? brick(c, c.role) : look.wall === "stone" ? stone(c) : plaster(c);

  const grain = (dark: number) => (c: RefineCell): number => {
    // Grain runs along the member: vertical on posts, horizontal on rails.
    const n = c.noise.value3(c.x / (2 * sn), c.y / (12 * sn), c.z / (2 * sn));
    return n < 0.3 ? dark : c.role;
  };
  const roof = (c: RefineCell): number => {
    const [u, v] = faceUV(c);
    const y = c.y;
    if (look.roofStyle === "thatch") {
      const n = c.noise.value3(c.x / (1.5 * sn), y / (6 * sn), c.z / (1.5 * sn));
      if (c.depth === 0 && n > 0.72) return 0;
      return n < 0.3 ? ROLE.ROOF_DARK : n > 0.62 ? ROLE.ROOF_LIGHT : ROLE.ROOF;
    }
    const rowH = Math.max(3, Math.round((look.roofStyle === "slate" ? 7 : look.roofStyle === "shingle" ? 8 : 10) * s));
    const w = Math.max(4, Math.round((look.roofStyle === "slate" ? 16 : look.roofStyle === "shingle" ? 11 : 18) * s));
    const row = Math.floor(y / rowH);
    const col = Math.floor((u + (row & 1 ? Math.floor(w / 2) : 0)) / w);
    const edge = y % rowH === 0;
    const gap = (u + (row & 1 ? Math.floor(w / 2) : 0)) % w === 0;
    if (gap && c.depth === 0) return 0;
    if (edge) return ROLE.ROOF_DARK;
    const h = hash4(col, row, 17);
    void v;
    return h < 0.2 ? ROLE.ROOF_DARK : h > 0.82 ? ROLE.ROOF_LIGHT : ROLE.ROOF;
  };
  const boards = (dark: number, across: number, horizontal: boolean) => (c: RefineCell): number => {
    const [u, v] = faceUV(c);
    const t = horizontal ? v : u;
    const seam = t % Math.max(3, Math.round(across * s)) === 0;
    return seam ? (c.depth === 0 ? 0 : dark) : c.role;
  };
  const crisp = (detail?: (c: RefineCell) => number): RoleRule => ({ mode: "crisp", detail });

  const rules: Record<number, RoleRule> = {
    [ROLE.WALL]: crisp(wall),
    [ROLE.WALL_DARK]: crisp(wall),
    [ROLE.WALL_LIGHT]: crisp(wall),
    [ROLE.MORTAR]: crisp(wall),
    [ROLE.BRICK_EXPOSED]: crisp((c) => brick(c, ROLE.BRICK_EXPOSED)),
    [ROLE.BEAM]: crisp(grain(ROLE.DOOR_DARK)),
    [ROLE.ROOF]: crisp(roof),
    [ROLE.ROOF_DARK]: crisp(roof),
    [ROLE.ROOF_LIGHT]: crisp(roof),
    [ROLE.DOOR]: crisp(boards(ROLE.DOOR_DARK, 12, false)),
    [ROLE.SHUTTER]: crisp(boards(ROLE.SHUTTER_DARK, 5, true)),
    [ROLE.FLOOR]: crisp(boards(ROLE.BEAM, 14, false)),
    [ROLE.CHIMNEY]: crisp((c) => {
      const r = brick(c, ROLE.WALL);
      return r === ROLE.MORTAR || r === 0 ? r : r === ROLE.WALL_DARK ? ROLE.CHIMNEY_DARK : ROLE.CHIMNEY;
    }),
    [ROLE.FOUNDATION]: crisp((c) => {
      const r = stone(c);
      return r === ROLE.MORTAR || r === 0 ? r : r === ROLE.WALL_DARK ? ROLE.FOUNDATION_DARK : ROLE.FOUNDATION;
    }),
    [ROLE.MOSS]: { mode: "smooth", roughness: 0.2, roughScale: 0.8 * k },
    [ROLE.FLOWER_A]: { mode: "leaves", leaves: { count: 3, radius: 0.22 * k } },
    [ROLE.FLOWER_B]: { mode: "leaves", leaves: { count: 3, radius: 0.22 * k } },
    [ROLE.LEAF]: { mode: "leaves", leaves: { count: 3, radius: 0.3 * k } },
  };
  return rules;
}

const AXES: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Join the door's loose parts to the leaf at the finer scale. The coarse door
 * is only held together by edges: a recessed panel sits a voxel behind the
 * stiles and rails that frame it, and a handle stands a voxel proud of the
 * recess. Refining outside faces alone keeps that gap, so both would float.
 * Like real joinery, each panel is extended as a tongue into the groove
 * behind its stiles and rails (hidden from outside by the leaf), and a handle
 * gets a spindle back to the panel or leaf behind it (for one already touching
 * the leaf, a single fine voxel into it, since a board seam cut under the
 * handle would leave it hanging). Only empty fine voxels are written; from
 * outside, the spindles are all that change. The 10 vox/m door is untouched.
 */
function attachDoorParts(coarse: EntityModel, out: SparseWriter, k: number): void {
  const { x: sx, y: sy, z: sz } = coarse.size;
  const d = coarse.data;
  const occ = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : d[x + y * sx + z * sx * sy];
  // Air reachable from outside the model's box: a panel's recess is, the
  // groove behind its stiles (on the room side) is not.
  const outside = new Uint8Array(sx * sy * sz);
  {
    const q: number[] = [];
    const push = (i: number) => { if (!outside[i] && !d[i]) { outside[i] = 1; q.push(i); } };
    for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++)
      if (x === 0 || y === 0 || z === 0 || x === sx - 1 || y === sy - 1 || z === sz - 1) push(x + y * sx + z * sx * sy);
    while (q.length) {
      const i = q.pop()!;
      const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / (sx * sy)) | 0;
      if (x > 0) push(i - 1); if (x < sx - 1) push(i + 1);
      if (y > 0) push(i - sx); if (y < sy - 1) push(i + sx);
      if (z > 0) push(i - sx * sy); if (z < sz - 1) push(i + sx * sy);
    }
  }
  const open = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz || outside[x + y * sx + z * sx * sy] === 1;
  const w = Math.min(k, 3); // as deep as refine's crisp shell
  const fill = (bx: number, by: number, bz: number, keep: (l: [number, number, number]) => boolean, v: number) => {
    const l: [number, number, number] = [0, 0, 0];
    for (l[2] = 0; l[2] < k; l[2]++)
      for (l[1] = 0; l[1] < k; l[1]++)
        for (l[0] = 0; l[0] < k; l[0]++) {
          if (!keep(l)) continue;
          const x = bx * k + l[0], y = by * k + l[1], z = bz * k + l[2];
          if (!out.get(x, y, z)) out.set(x, y, z, v);
        }
  };
  // Fine index i along an axis lies within w of the block's side facing `dir`.
  const toward = (i: number, dir: number) => (dir > 0 ? i >= k - w : i < w);
  const axis = (a: [number, number, number]) => (a[0] ? 0 : a[1] ? 1 : 2);

  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const v = d[x + y * sx + z * sx * sy];
        if (v === ROLE.DOOR_DARK) {
          // A recessed panel: outside air in front (n), room-side air beside
          // it (m), the leaf at m + n.
          for (const n of AXES) {
            if (!open(x + n[0], y + n[1], z + n[2])) continue;
            const an = axis(n), sn = n[an];
            for (const m of AXES) {
              const am = axis(m), sm = m[am];
              if (am === an) continue;
              if (occ(x + m[0], y + m[1], z + m[2]) || open(x + m[0], y + m[1], z + m[2])) continue;
              if (occ(x + m[0] + n[0], y + m[1] + n[1], z + m[2] + n[2]) !== ROLE.DOOR) continue;
              fill(x + m[0], y + m[1], z + m[2], (l) => toward(l[am], -sm) && toward(l[an], sn), ROLE.DOOR_DARK);
            }
          }
        } else if (v === ROLE.HANDLE) {
          // The nearest solid within three voxels, straight out from the handle
          // (usually the one behind it).
          let best: [number, number, number] | null = null, dist = 4;
          for (const e of AXES)
            for (let j = 1; j < dist; j++)
              if (occ(x + e[0] * j, y + e[1] * j, z + e[2] * j)) { best = e; dist = j; break; }
          if (!best) continue;
          const ae = axis(best), se = best[ae];
          const sw = Math.max(1, Math.round(0.3 * k)), o = Math.floor((k - sw) / 2);
          const core = (l: [number, number, number]) => [0, 1, 2].every((a) => a === ae || (l[a] >= o && l[a] < o + sw));
          for (let j = 1; j < dist; j++) fill(x + best[0] * j, y + best[1] * j, z + best[2] * j, core, ROLE.HANDLE);
          // One voxel into the solid: the seam refine cuts in a board's
          // surface can fall right under the handle.
          fill(x + best[0] * dist, y + best[1] * dist, z + best[2] * dist, (l) => core(l) && (se > 0 ? l[ae] === 0 : l[ae] === k - 1), ROLE.HANDLE);
        }
      }
}

export function fineBuilding(coarse: EntityModel, look: LookParams, k: number, seed: number): EntityModel {
  // Rooms are sealed by walls and glass: only the outside is refined.
  const model = refine(coarse, { k, rules: buildingRules(look, k), fallback: { mode: "crisp" }, seed, faces: "outside" }).model;
  attachDoorParts(coarse, new SparseWriter(model.sparse!), k);
  return model;
}
