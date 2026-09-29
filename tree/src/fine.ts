// A tree at a finer scale: the coarse design refined, with its wood redrawn.
//
// Leaves, snow and cones refine from the coarse voxels (see refine.ts). The
// wood does not: a limb at 10 voxels per metre is a staircase of cubes, and
// smoothing a staircase gives a lumpy rod. The skeleton that drew it is still
// here, so every segment (and root) is drawn again k times larger as a thin
// shell of an exact tapered capsule, flared at the base like the coarse one,
// and thinner above the trunk than the coarse tree could draw it. Each fine
// bark voxel takes the role of the coarse voxel it falls in (so moss,
// crevices and the bark's light and dark keep their places), then gets the
// fine furrows.

import { coarseRoleAt, drawSkeletonFine, makeNoise, refine, shellCapsule, SparseWriter, type RefineCell, type Skeleton } from "@voxolith/gen-kit";
import type { EntityModel, Vec3 } from "@voxolith/engine";
import { ROLE, WOOD_ROLES } from "./roles";
import { treeRules } from "./refine";
import type { WoodResult } from "./voxelize";

const BARK = new Set(WOOD_ROLES.filter((r) => r !== ROLE.HEART));

export interface FineTreeInput {
  coarse: EntityModel;
  skel: Skeleton;
  wood: WoodResult;
  kind: "broadleaf" | "conifer";
  /** Where the skeleton's origin is in the coarse volume, and the crop's offset. */
  origin: Vec3;
  cropOffset: Vec3;
  k: number;
  seed: number;
}

export function fineTree(inp: FineTreeInput): { model: EntityModel; stats: { voxels: number; bricks: number; ms: number } } {
  const t0 = performance.now();
  const { coarse, skel, wood, k, origin, cropOffset } = inp;
  const rules = treeRules(inp.kind, k);
  const bark = rules[ROLE.BARK_MID].detail!;
  for (const r of WOOD_ROLES) rules[r] = { mode: "skip" };
  const { model } = refine(coarse, { k, rules, seed: inp.seed });
  const w = new SparseWriter(model.sparse!);
  const cell: RefineCell = { x: 0, y: 0, z: 0, cx: 0, cy: 0, cz: 0, role: 0, nx: 0, ny: 0, nz: 0, depth: 0, k, noise: makeNoise((inp.seed ^ 0x5bd1) | 1) };
  const roleAt = coarseRoleAt(coarse, k, cell.noise, BARK, ROLE.BARK_MID);
  const value = (x: number, y: number, z: number) => {
    const v = roleAt(x, y, z);
    if (v === ROLE.TWIG || v === ROLE.TWIG_DARK) return v;
    cell.x = x; cell.y = y; cell.z = z; cell.role = v;
    return bark(cell);
  };
  const toFine = (p: readonly number[]): Vec3 => [(p[0] - cropOffset[0]) * k, (p[1] - cropOffset[1]) * k, (p[2] - cropOffset[2]) * k];
  const segments = skel.segments.map((s) => ({
    a: [s.a[0] + origin[0], s.a[1] + origin[1], s.a[2] + origin[2]],
    b: [s.b[0] + origin[0], s.b[1] + origin[1], s.b[2] + origin[2]],
    ra: s.ra, rb: s.rb, level: s.level,
  }));
  // The flare is defined in volume coordinates; map a fine cell back. The
  // coarse capsule only tests cells inside the segment's box grown by its
  // unflared radius + 1 (voxelize.ts), so the coarse flare is cut square
  // there. Left alone, the fine lobes reach up to half a metre past the coarse
  // model (and past a level-of-detail chain's cover, which is the coarse model
  // grown by one voxel). So the fine flared radius eases into that same box,
  // its corners rounded: limiting the radius, rather than cutting the shell,
  // keeps the base closed. The coarse box stays as it is: widening it would
  // change every coarse tree, and what its share codes decode to.
  const flareIn = (s: (typeof segments)[number]) => {
    const fa = toFine(s.a), fb = toFine(s.b);
    const dx = fb[0] - fa[0], dy = fb[1] - fa[1], dz = fb[2] - fa[2];
    const l2 = dx * dx + dy * dy + dz * dz || 1e-9;
    const pad = Math.ceil(Math.max(s.ra, s.rb)) + 1;
    // The coarse box's cells, as fine coordinates (lo inclusive, hi exclusive).
    const lo = [0, 1, 2].map((i) => (Math.floor(Math.min(s.a[i], s.b[i]) - pad) - cropOffset[i]) * k);
    const hi = [0, 1, 2].map((i) => (Math.ceil(Math.max(s.a[i], s.b[i]) + pad) + 1 - cropOffset[i]) * k);
    const plain = (x: number, y: number, z: number) =>
      wood.flare((x + 0.5) / k + cropOffset[0] - 0.5, (y + 0.5) / k + cropOffset[1] - 0.5, (z + 0.5) / k + cropOffset[2] - 0.5);
    // Speed, all exact (the voxels written are the same as clamping every
    // point). shellCapsule calls this for every point of a scan box sized for
    // the widest flare, and wood.flare (atan2, cos, pow) is the cost, so first
    // settle on geometry alone the points whose outcome no factor >= 1 can
    // change: further out than the widest flare, or inside the hollow of even
    // the unflared limb (shellCapsule's radius there is ra..rb, each at least
    // one voxel, times this factor). Then the clamp: the limit is never nearer
    // the axis than the box's nearest face (a 6-norm of direction over room is
    // at most 1 over the smallest room), and the smooth minimum only moves a
    // radius above 0.8 of the limit, so a flared radius under that, or a point
    // outside even the unclamped radius (the clamp only shrinks it), keeps the
    // plain factor; and a point more than the shell inside the smallest
    // clamped radius (min(unclamped, nearest face) less the smooth minimum's
    // largest dip, a sixteenth of the unclamped) stays skipped.
    const shellW = Math.max(2, Math.min(4, Math.ceil(k * 0.4))); // drawSkeletonFine's default
    let near = Infinity;
    for (let i = 0; i < 3; i++) near = Math.min(near, hi[i] - Math.max(fa[i], fb[i]), Math.min(fa[i], fb[i]) - lo[i]);
    const nearLim = near - 0.5, free = 0.8 * nearLim;
    const clamp = Math.max(1, Math.max(s.ra, s.rb) * k) * wood.maxFlare > free;
    const ra1 = Math.max(1, s.ra * k), rb1 = Math.max(1, s.rb * k), mf2 = wood.maxFlare * wood.maxFlare;
    // (Past the widest flare at this point's height, too: wood.flareBound.)
    const v = [0, 0, 0];
    return (x: number, y: number, z: number) => {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - fa[0]) * dx + (y + 0.5 - fa[1]) * dy + (z + 0.5 - fa[2]) * dz) / l2));
      v[0] = x + 0.5 - fa[0] - dx * t; v[1] = y + 0.5 - fa[1] - dy * t; v[2] = z + 0.5 - fa[2] - dz * t;
      const d2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      const rs = ra1 + (rb1 - ra1) * t, hollow = rs - shellW;
      if (d2 > rs * rs * mf2 || (hollow > 0 && d2 < hollow * hollow)) return 1;
      const fb = wood.flareBound((y + 0.5) / k + cropOffset[1] - 0.5);
      if (d2 > rs * rs * fb * fb) return 1;
      const f = plain(x, y, z);
      if (f <= 1 || !clamp) return f;
      const r = Math.max(1, (s.ra + (s.rb - s.ra) * t) * k);
      const fr0 = f * r;
      if (fr0 <= free || d2 > fr0 * fr0) return f;
      const deep = Math.min(fr0, nearLim) - 0.0625 * fr0 - shellW;
      if (deep > 0 && d2 < deep * deep) return f;
      const d = Math.hypot(v[0], v[1], v[2]);
      if (d < 1e-6) return f;
      // Distance from the axis to the box along this direction, corners
      // rounded by a 6-norm (never further than the box itself).
      let sum = 0;
      for (let i = 0; i < 3; i++) {
        const u = v[i] / d, p = i === 0 ? fa[0] + dx * t : i === 1 ? fa[1] + dy * t : fa[2] + dz * t;
        const room = (u > 0 ? hi[i] - p : p - lo[i]) - 0.5;
        if (u !== 0) sum += Math.pow(Math.abs(u) / Math.max(room, 1e-3), 6);
      }
      const lim = Math.pow(sum, -1 / 6);
      // Polynomial smooth minimum of the flared radius and the limit (never above either).
      const soft = 0.2 * lim, h = Math.max(0, soft - Math.abs(fr0 - lim)) / soft;
      return Math.max(1, (Math.min(fr0, lim) - (h * h * soft) / 4) / r);
    };
  };
  // Only trunk segments whose scan box dips below the flare's top need it;
  // the rest get no flare function and a box maxFlare times narrower (the
  // flare is 1 there, so the voxels are the same, far fewer are tested).
  const flared = (s: (typeof segments)[number]) =>
    s.level === 0 && Math.min(s.a[1], s.b[1]) - Math.max(s.ra, s.rb) * wood.maxFlare - 2 < wood.flareTop;
  let voxels = 0;
  for (const s of segments) {
    const fl = flared(s);
    voxels += drawSkeletonFine(w, [s], { k, toFine, value, flare: fl ? flareIn(s) : undefined, maxFlare: fl ? wood.maxFlare : 1 });
  }
  const shell = Math.max(2, Math.min(4, Math.ceil(k * 0.4)));
  for (const r of wood.roots) voxels += shellCapsule(w, toFine(r.a), toFine(r.b), r.ra * k, r.rb * k, shell, value);
  return { model, stats: { voxels, bricks: model.sparse!.bricks.size, ms: performance.now() - t0 } };
}
