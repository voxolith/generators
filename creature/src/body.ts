// The rat's body: skeleton, masses, interior, surface.
//
// Creature space is x across (left +x), y up with the ground at 0, z forward
// (nose towards +z). Every fill names its bone; later fills own what they
// overwrite, so each leg and each tail bone owns its joint ball and turns
// about its own head without opening a gap.
//
// Order matters and is the whole method:
//   1. torso, neck, head, ears, tail, legs as masses (placeholders FUR / SKIN)
//   2. layerInterior: fur, fat, flesh, muscle by depth below the surface
//   3. bone cores, skull, ribs, organs — only below the surface
//   4. surface paint: belly, back stripe, mottling, eyes, nose, teeth, claws

import { makeNoise, RiggedVolume, Volume, type Noise } from "@voxolith/gen-kit";
import type { EntityModel, Rig, Vec3 } from "@voxolith/engine";
import { buildRoles, ROLE } from "./roles";
import { skinFor } from "./presets";
import type { CreatureParams } from "./params";

export interface Body {
  model: EntityModel;
  rig: Rig;
  /** Bone index by name, for the clips. */
  bone: Record<string, number>;
}

export const LEGS = ["FL", "FR", "HL", "HR"] as const;
export type Leg = (typeof LEGS)[number];
const TAIL_BONES = 7;
// Resolution floors, in voxels of radius: below them a limb bent by a clip
// comes apart. Below every preset's own sizes, so they only act on small rats.
const MIN_LIMB = 1.2;
const MIN_FOOT = 1.05;
const MIN_TAIL = 0.8;

export function buildBody(p: CreatureParams, rng: () => number): Body {
  const noise: Noise = makeNoise(Math.floor(rng() * 0x7fffffff) || 1);
  const sh = p.shape;
  const S = Math.max(0.4, sh.size);
  const bl = sh.bodyLength * S, g = sh.girth * S, hl = sh.headLength * S, ll = sh.legLength * S;
  const lt = sh.legThickness * S, tl = sh.tailLength * S, tt = sh.tailThickness * S, ea = sh.ears * S;

  // Key heights and lengths.
  const bodyY = 4.2 * ll + 3 * g;
  const headZ = 19.5 * bl;
  const noseZ = headZ + 10.5 * hl;
  const tailLen = 28 * tl;
  const tailZ = -3 * bl;

  // Volume big enough for everything, with room for the bones' motion to be
  // baked later; creature space origin sits at `O` in the volume.
  const halfW = Math.ceil(7.5 * Math.max(g, lt, 1) + 3);
  const back = Math.ceil(-tailZ + tailLen + 3), front = Math.ceil(noseZ + 3);
  const sx = 2 * halfW, sy = Math.ceil(bodyY + 8 * Math.max(g, ea) + 4), sz = back + front;
  const r = new RiggedVolume(sx, sy, sz);
  const O: Vec3 = [halfW, 0, back];
  const at = (x: number, y: number, z: number): Vec3 => [O[0] + x, O[1] + y, O[2] + z];

  // --- 1. skeleton ----------------------------------------------------------
  const B: Record<string, number> = {};
  const add = (id: string, parent: string | null, h: Vec3, t: Vec3) => (B[id] = r.bone(id, parent, at(...h), at(...t)));
  add("pelvis", null, [0, bodyY, 0], [0, bodyY, 6 * bl]);
  add("spine", "pelvis", [0, bodyY, 6 * bl], [0, bodyY + 0.3, 12 * bl]);
  add("chest", "spine", [0, bodyY + 0.3, 12 * bl], [0, bodyY + 0.5, 17 * bl]);
  add("neck", "chest", [0, bodyY + 0.5, 17 * bl], [0, bodyY + 1, headZ]);
  add("head", "neck", [0, bodyY + 1, headZ], [0, bodyY - 0.5, noseZ]);
  for (const s of [1, -1]) {
    const n = s > 0 ? "L" : "R";
    add(`ear.${n}`, "head", [s * 2.2 * g, bodyY + 3.1 * g, headZ + 2.4 * hl], [s * 2.9 * g, bodyY + 3.1 * g + 3.2 * ea, headZ + 2 * hl]);
  }
  // Tail: droops from the rump to the ground, then trails along it.
  const tailPts: Vec3[] = [];
  for (let k = 0; k <= TAIL_BONES; k++) {
    const f = k / TAIL_BONES;
    const y = Math.max(1.1 * tt + 0.2, bodyY - 0.5 - (bodyY - 1.6) * Math.min(1, f * 2.2));
    tailPts.push([0, y, tailZ - f * tailLen]);
  }
  for (let k = 0; k < TAIL_BONES; k++) add(`tail${k}`, k === 0 ? "pelvis" : `tail${k - 1}`, tailPts[k], tailPts[k + 1]);
  // Legs: upper, lower, foot per leg. Knees point forward, elbows back.
  const legPts: Record<Leg, [Vec3, Vec3, Vec3, Vec3]> = {} as never;
  for (const leg of LEGS) {
    const s = leg[1] === "L" ? 1 : -1;
    const fore = leg[0] === "F";
    legPts[leg] = fore
      ? [[s * 3.3 * g, bodyY - 1.8 * g, 14.5 * bl], [s * 3.6 * g, 3.2 * ll, 13.6 * bl], [s * 3.6 * g, 1.1 * S, 15 * bl], [s * 3.6 * g, 0.6 * S, 17 * bl]]
      : [[s * 3.7 * g, bodyY - 1.6 * g, 1.6 * bl], [s * 4.1 * g, 3.6 * ll, 4.3 * bl], [s * 4.1 * g, 1.3 * S, 0.2 * bl], [s * 4.1 * g, 0.6 * S, 4.8 * bl]];
    const [a, b, c, d] = legPts[leg];
    add(`${leg}.upper`, fore ? "chest" : "pelvis", a, b);
    add(`${leg}.lower`, `${leg}.upper`, b, c);
    add(`${leg}.foot`, `${leg}.lower`, c, d);
  }

  // --- 2. masses ----------------------------------------------------------------
  const F = ROLE.FUR, K = ROLE.SKIN;
  r.ellipsoid(B.pelvis, at(0, bodyY + 0.6, 1.2 * bl), [4.3 * g, 4.4 * g, 5.6 * bl], F);
  r.ellipsoid(B.spine, at(0, bodyY + 0.3, 7.5 * bl), [5.2 * g, 4.8 * g, 6.2 * bl], F);
  r.ellipsoid(B.chest, at(0, bodyY + 0.3, 13 * bl), [4.6 * g, 4.4 * g, 5 * bl], F);
  r.capsule(B.neck, at(0, bodyY + 0.5, 16.8 * bl), at(0, bodyY + 1.2, headZ + 0.8), 3.7 * g, 3.4 * g, F);
  r.ellipsoid(B.head, at(0, bodyY + 1.3, headZ + 3 * hl), [3.4 * g, 3.3 * g, 4 * hl], F);
  const tipR = Math.max(1, 2.7 * g * (1 - sh.snout * 0.6));
  r.capsule(B.head, at(0, bodyY + 0.8, headZ + 5 * hl), at(0, bodyY - 0.4, noseZ - 0.8), 2.7 * g, tipR, F);
  for (const s of [1, -1]) {
    const n = s > 0 ? "L" : "R";
    const b = B[`ear.${n}`];
    const [hx, hy, hz] = r.bones[b].head, [tx, ty, tz] = r.bones[b].tail;
    r.ellipsoid(b, [(hx + tx) / 2, (hy + ty) / 2 + 0.4, (hz + tz) / 2], [1.9 * ea, 2.1 * ea, 0.9 * Math.max(1, ea)], K);
  }
  for (let k = 0; k < TAIL_BONES; k++) {
    const f0 = k / TAIL_BONES, f1 = (k + 1) / TAIL_BONES;
    // The first part of the tail never thins below 1.5 voxels across, however
    // small the rat; only the tip goes down to a line.
    const rad = (f: number) => Math.max(f < 0.6 ? MIN_TAIL : 0, (1.8 - 1.45 * f) * tt);
    r.capsule(B[`tail${k}`], at(...tailPts[k]), at(...tailPts[k + 1]), rad(f0), rad(f1), K);
  }
  for (const leg of LEGS) {
    const fore = leg[0] === "F";
    const [a, b, c, d] = legPts[leg];
    const up = fore ? [1.9, 1.45] : [2.5, 1.6];
    r.capsule(B[`${leg}.upper`], at(...a), at(...b), up[0] * lt, up[1] * lt, F);
    if (!fore) r.ellipsoid(B[`${leg}.upper`], at(a[0] * 0.95, a[1] - 0.8, a[2] + 0.6), [2.3 * lt, 2.8 * lt, 3 * lt], F); // haunch
    r.capsule(B[`${leg}.lower`], at(...b), at(...c), Math.max(MIN_LIMB, 1.4 * lt), Math.max(MIN_LIMB, 1.15 * lt), F);
    r.capsule(B[`${leg}.foot`], at(...c), at(...d), Math.max(MIN_LIMB, 1.15 * lt), Math.max(MIN_FOOT, 1.0 * lt), K);
  }
  // Nose pad, before layering so it stays whole.
  r.ellipsoid(B.head, at(0, bodyY - 0.4, noseZ - 0.2), [1.2 * g, 1.1 * g, 1], ROLE.NOSE);

  // --- 3. inside ------------------------------------------------------------------
  // A small rat has too few voxels below the fur for every layer: drop the
  // fat and one flesh step and let bone and organs sit one voxel shallower,
  // so a wound still shows what is inside.
  const thin = S < 1;
  const md = (k: number) => (thin ? Math.max(1, k - 1) : k);
  const depth = r.layerInterior(thin ? [F, ROLE.FLESH, ROLE.MUSCLE] : [F, ROLE.FAT, ROLE.FLESH, ROLE.FLESH, ROLE.MUSCLE], (v) => v === F);
  r.layerInterior([K, ROLE.FLESH, ROLE.MUSCLE], (v) => v === K);
  // Deep structures only replace voxels at least `minDepth` below the surface.
  const scratch = new Volume(sx, sy, sz);
  const inner = (minDepth: number, value: number, bone: number | null, draw: (v: Volume) => void) => {
    scratch.data.fill(0);
    draw(scratch);
    for (let i = 0; i < scratch.data.length; i++) {
      if (!scratch.data[i] || !r.vol.data[i] || depth[i] < minDepth) continue;
      // Packed tight, organs would erase a small rat's one-voxel spine.
      if (thin && value !== ROLE.BONE && r.vol.data[i] === ROLE.BONE) continue;
      r.vol.data[i] = value;
      if (bone !== null) r.owner[i] = bone;
    }
  };
  const bonesOf = (ids: string[], radius: number, minDepth = 1) => {
    for (const id of ids) {
      const b = r.bones[B[id]];
      inner(minDepth, ROLE.BONE, B[id], (v) => {
        if (radius < 1) lineIn(v, b.head, b.tail);
        else capsuleIn(v, b.head, b.tail, radius, radius);
      });
    }
  };
  bonesOf(["pelvis", "spine", "chest", "neck"], Math.max(1, 1.1 * g), md(2));
  bonesOf(LEGS.flatMap((l) => [`${l}.upper`, `${l}.lower`]), 0.8 * lt);
  bonesOf(Array.from({ length: TAIL_BONES }, (_, k) => `tail${k}`), 0.5);
  // Marrow down the spine (a spine too thin to hold marrow is all bone).
  if (!thin) for (const id of ["pelvis", "spine", "chest"]) {
    const b = r.bones[B[id]];
    inner(md(3), ROLE.MARROW, B[id], (v) => lineIn(v, b.head, b.tail));
  }
  // Skull shell with the brain inside; ribs; lungs, heart, gut.
  inner(md(1), ROLE.BONE, B.head, (v) => ellipsoidIn(v, at(0, bodyY + 1.3, headZ + 3 * hl), [2.8 * g, 2.7 * g, 3.4 * hl], (d) => d > 0.72));
  inner(md(2), ROLE.ORGAN, B.head, (v) => ellipsoidIn(v, at(0, bodyY + 1.5, headZ + 2.6 * hl), [Math.max(1.8, 2 * g), Math.max(1.8, 1.9 * g), Math.max(2, 2.3 * hl)]));
  inner(md(1), ROLE.BONE, B.chest, (v) => ellipsoidIn(v, at(0, bodyY + 0.3, 12.5 * bl), [4.1 * g, 3.9 * g, 5 * bl], (d, z) => d > 0.8 && Math.round(z) % 3 === 0));
  inner(md(2), ROLE.ORGAN, B.chest, (v) => ellipsoidIn(v, at(0, bodyY + 0.6, 12.8 * bl), [3 * g, 2.8 * g, 3.4 * bl]));
  inner(md(2), ROLE.ORGAN_DARK, B.chest, (v) => ellipsoidIn(v, at(0.6 * g, bodyY - 0.5, 13.4 * bl), [1.6 * g, 1.7 * g, 1.7 * bl]));
  inner(md(2), ROLE.ORGAN, B.spine, (v) => ellipsoidIn(v, at(0, bodyY - 0.6, 7.2 * bl), [3.6 * g, 2.8 * g, 4.4 * bl]));
  inner(md(3), ROLE.ORGAN_DARK, B.spine, (v) => ellipsoidIn(v, at(0, bodyY - 0.6, 7.2 * bl), [3 * g, 2.2 * g, 3.8 * bl], (_d, z, x, y) => noise.value3(x * 0.5, y * 0.5, z * 0.5) > 0.55));

  // --- 4. surface ------------------------------------------------------------------
  const vol = r.vol;
  const lk = p.look;
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const v = vol.get(x, y, z);
        const cx = x + 0.5 - O[0], cz = z + 0.5 - O[2];
        if (v === F) {
          const n = vol.surfaceNormal(x, y, z);
          const onTorso = cz > -4 * bl && cz < headZ;
          if ((n[1] < -0.3 && onTorso) || (onTorso && y < bodyY - 2.6 * g && Math.abs(cx) < 3.2 * g)) {
            vol.set(x, y, z, ROLE.BELLY);
            continue;
          }
          const m = noise.value3(x * 0.35, y * 0.35, z * 0.35);
          if (n[1] > 0.5 && Math.abs(cx) < 1.8 * g && m > 0.35) vol.set(x, y, z, ROLE.FUR_DARK);
          else if (m > 1 - 0.28 * lk.mottle) vol.set(x, y, z, ROLE.FUR_DARK);
          else if (m < 0.22 * lk.mottle) vol.set(x, y, z, ROLE.FUR_LIGHT);
        } else if (v === K) {
          // Tail scales: faint rings; darker soles.
          if (cz < tailZ + 0.5 && Math.round(-cz) % 2 === 0) vol.set(x, y, z, ROLE.SKIN_DARK);
          else if (y <= 0.6 * S + 0.5 && cz > tailZ) vol.set(x, y, z, ROLE.SKIN_DARK);
        }
      }
  // Eyes: the outermost head voxel on each side at eye height, two tall, with a glint.
  for (const s of [1, -1]) {
    const ey = Math.round(bodyY + 2.1 * g), ez = Math.round(O[2] + headZ + 5 * hl);
    for (let xo = halfW - 1; xo >= 0; xo--) {
      const x = O[0] + s * xo - (s < 0 ? 1 : 0);
      if (vol.get(x, ey, ez)) {
        r.set(B.head, x, ey, ez, ROLE.EYE);
        r.set(B.head, x, ey + 1, ez, ROLE.EYE);
        r.set(B.head, x, ey + 1, ez + 1, vol.get(x, ey + 1, ez + 1) ? ROLE.EYE_SHINE : 0);
        break;
      }
    }
  }
  // Incisors below the nose; claws at the tip of each foot.
  for (const xo of [-1, 0]) {
    const tz = Math.round(O[2] + noseZ - 1.2), ty = Math.round(bodyY - 0.4 - tipR);
    for (let dy = 0; dy < 2; dy++) r.set(B.head, O[0] + xo, ty - dy, tz, ROLE.TOOTH);
  }
  for (const leg of LEGS) {
    const d = legPts[leg][3];
    const [x, , z] = at(...d);
    for (const dx of [-1, 0, 1]) r.set(B[`${leg}.foot`], Math.round(x) + dx, 0, Math.round(z + 0.6 * lt), ROLE.CLAW);
  }

  const roles = buildRoles(skinFor(lk.coat, lk.redEyes, lk.belly));
  const anchor = at(0, 0, 7 * bl);
  const { model, rig } = r.crop(anchor, roles);
  // Anchor at the ground under the body; the crop may have moved y.
  return { model, rig, bone: B };
}

// Plain rasterisers into the scratch volume (no ownership).
function capsuleIn(v: Volume, a: Vec3, b: Vec3, ra: number, rb: number): void {
  const x0 = Math.floor(Math.min(a[0], b[0]) - Math.max(ra, rb) - 1), x1 = Math.ceil(Math.max(a[0], b[0]) + Math.max(ra, rb) + 1);
  const y0 = Math.floor(Math.min(a[1], b[1]) - Math.max(ra, rb) - 1), y1 = Math.ceil(Math.max(a[1], b[1]) + Math.max(ra, rb) + 1);
  const z0 = Math.floor(Math.min(a[2], b[2]) - Math.max(ra, rb) - 1), z1 = Math.ceil(Math.max(a[2], b[2]) + Math.max(ra, rb) + 1);
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5 - a[0], py = y + 0.5 - a[1], pz = z + 0.5 - a[2];
    const t = Math.max(0, Math.min(1, (px * d[0] + py * d[1] + pz * d[2]) / l2));
    const qx = px - d[0] * t, qy = py - d[1] * t, qz = pz - d[2] * t;
    const rr = ra + (rb - ra) * t;
    if (qx * qx + qy * qy + qz * qz <= rr * rr) v.set(x, y, z, 1);
  }
}

function lineIn(v: Volume, a: Vec3, b: Vec3): void {
  const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    v.set(Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[1] + (b[1] - a[1]) * t), Math.floor(a[2] + (b[2] - a[2]) * t), 1);
  }
}

function ellipsoidIn(v: Volume, c: Vec3, rad: Vec3, keep?: (d: number, z: number, x: number, y: number) => boolean): void {
  for (let z = Math.floor(c[2] - rad[2]); z <= Math.ceil(c[2] + rad[2]); z++)
    for (let y = Math.floor(c[1] - rad[1]); y <= Math.ceil(c[1] + rad[1]); y++)
      for (let x = Math.floor(c[0] - rad[0]); x <= Math.ceil(c[0] + rad[0]); x++) {
        const ux = (x + 0.5 - c[0]) / rad[0], uy = (y + 0.5 - c[1]) / rad[1], uz = (z + 0.5 - c[2]) / rad[2];
        const d = Math.sqrt(ux * ux + uy * uy + uz * uz);
        if (d > 1) continue;
        if (keep && !keep(d, z, x, y)) continue;
        v.set(x, y, z, 1);
      }
}
