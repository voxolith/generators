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
//   - doors and shutters: boards and slats; floors: planks.
// The coarse building is generated without its relief (recessed joints),
// since here the joints are drawn at their own scale.

import { hash4, refine, type RefineCell, type RoleRule } from "@voxolith/gen-kit";
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
  const jointBack = (c: RefineCell, joint: boolean, role: number) => (joint ? (c.depth === 0 ? 0 : ROLE.MORTAR) : role);

  const brick = (c: RefineCell, base: number): number => {
    const [u, v] = faceUV(c);
    const H = Math.max(2, Math.round(7 * s)), L = Math.max(4, Math.round(23 * s));
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
    const n = c.noise.value3(c.x / (3 * s), c.y / (3 * s), c.z / (3 * s));
    if (c.role !== ROLE.WALL) return c.role;
    return n > 0.8 ? ROLE.WALL_LIGHT : n < 0.18 ? ROLE.WALL_DARK : ROLE.WALL;
  };
  const wall = (c: RefineCell): number =>
    look.wall === "brick" ? brick(c, c.role) : look.wall === "stone" ? stone(c) : plaster(c);

  const grain = (dark: number) => (c: RefineCell): number => {
    // Grain runs along the member: vertical on posts, horizontal on rails.
    const n = c.noise.value3(c.x / (2 * s), c.y / (12 * s), c.z / (2 * s));
    return n < 0.3 ? dark : c.role;
  };
  const roof = (c: RefineCell): number => {
    const [u, v] = faceUV(c);
    const y = c.y;
    if (look.roofStyle === "thatch") {
      const n = c.noise.value3(c.x / (1.5 * s), y / (6 * s), c.z / (1.5 * s));
      if (c.depth === 0 && n > 0.72) return 0;
      return n < 0.3 ? ROLE.ROOF_DARK : n > 0.62 ? ROLE.ROOF_LIGHT : ROLE.ROOF;
    }
    const rowH = Math.round((look.roofStyle === "slate" ? 7 : look.roofStyle === "shingle" ? 8 : 10) * s);
    const w = Math.round((look.roofStyle === "slate" ? 16 : look.roofStyle === "shingle" ? 11 : 18) * s);
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
    const seam = t % Math.max(2, Math.round(across * s)) === 0;
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

export function fineBuilding(coarse: EntityModel, look: LookParams, k: number, seed: number): EntityModel {
  // Rooms are sealed by walls and glass: only the outside is refined.
  return refine(coarse, { k, rules: buildingRules(look, k), fallback: { mode: "crisp" }, seed, faces: "outside" }).model;
}
