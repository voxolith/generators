// Refinement: a coarse model, re-voxelised k times finer with new detail.
//
// Generating a 1 cm-voxel tree directly means running every whole-volume
// pass (hull, carving, sky occlusion, flood fill) over a gigabyte grid. A
// finer copy of the same design does not need that: the coarse model already
// decides the shape, the shading and which voxel is bark and which is leaf.
// What the finer grid adds is surface: a rounded silhouette instead of 10 cm
// steps, and detail that only exists at the small scale (single leaves,
// bark furrows, mortar joints, roof tiles). So this visits only the coarse
// voxels on the surface and writes their fine blocks into a sparse model,
// keeping a shell a few fine voxels deep: cost and memory follow the surface,
// not the volume.
//
// Each role picks how its voxels are refined (`RoleRule`):
//   - "smooth": organic masses (bark, stone). The fine surface is the 0.5
//     level of the trilinearly interpolated coarse occupancy, which rounds
//     every step and corner and fills concave notches, displaced by noise;
//   - "crisp": built things (walls, frames, glass). Exact cubes, so edges stay
//     sharp; detail comes from the role's own pattern function;
//   - "leaves": foliage. Small discs (single leaves) at random places and
//     angles inside each coarse leaf voxel, in the coarse voxel's role, so the
//     coarse model's light and dark shading survives;
//   - "blades": grass. Thin leaning columns, continuous up a stack of coarse
//     voxels, cut at a random height in the top one;
//   - "skip": nothing is written; the generator redraws these itself at the
//     finer scale from what it knows analytically (a tree's limbs from its
//     skeleton), which beats smoothing a staircase of coarse voxels. They
//     still count as solid for their neighbours.
//
// A rule's `detail` function then decides the final role of each fine voxel
// (or 0 to carve it): the place a generator puts its small-scale patterns.
//
// The result is a sparse EntityModel (`sparse`, with empty `data`), k times
// the coarse size, anchor scaled with it.

import type { EntityModel } from "@voxolith/engine";
import { makeSparse, sparseDims, type SparseVoxels } from "@voxolith/renderer/core";
import { makeNoise, type Noise } from "./noise";

export type RefineMode = "smooth" | "crisp" | "leaves" | "blades" | "skip";

/** What a detail function knows about one fine voxel. */
export interface RefineCell {
  /** Fine voxel, in the refined model's space. */
  x: number;
  y: number;
  z: number;
  /** The coarse voxel it came from (its own, or the solid neighbour a smooth surface grew from). */
  cx: number;
  cy: number;
  cz: number;
  role: number;
  /** Outward axis of the coarse voxel's nearest open face; 0,0,0 when it has none. */
  nx: number;
  ny: number;
  nz: number;
  /** Fine voxels in from that face (0 is the outermost layer). */
  depth: number;
  k: number;
  noise: Noise;
}

export interface RoleRule {
  mode: RefineMode;
  /** Final role of a fine voxel, or 0 to carve it. Default: the coarse role. */
  detail?: (c: RefineCell) => number;
  /** smooth: noise displacement of the surface, in coarse voxels (default 0.12). */
  roughness?: number;
  /** smooth: noise feature size, in fine voxels (default 2.5k). */
  roughScale?: number;
  /** leaves: discs per coarse voxel (default 3), radius in fine voxels (default 0.35k). */
  leaves?: {
    count?: number;
    radius?: number;
    /** Coarse voxels this many steps from open air get leaves (default 1: the outer layer). */
    depth?: number;
    /** "disc" (broad leaves, default) or "needle" (short 1-voxel lines, radius is their half-length). */
    shape?: "disc" | "needle";
    /** Tone swap: roles a leaf may take instead, and how often. */
    tones?: number[];
    toneChance?: number;
  };
  /** blades: blades per coarse column (default 2), width in fine voxels (default 1). */
  blades?: { count?: number; width?: number; lean?: number };
}

export interface RefineOptions {
  /** Fine voxels per coarse voxel. */
  k: number;
  /** Rule per role value; roles without one use `fallback`. */
  rules: Record<number, RoleRule>;
  /** Default { mode: "smooth" }. */
  fallback?: RoleRule;
  /** Fine voxels kept below the surface (default: enough to hide the hollow inside). */
  shell?: number;
  /** Seeds the leaf, blade and roughness noise. */
  seed?: number;
  /**
   * "outside": refine only faces that open to air reachable from outside the
   * model (a building's rooms, sealed by its walls and glass, are skipped;
   * from outside they are seen at most through a window). Default "any".
   */
  faces?: "any" | "outside";
}

export interface RefineStats {
  coarseSurface: number;
  voxels: number;
  bricks: number;
  ms: number;
}

/** Writes into a SparseVoxels with the last brick cached (writes come in runs). */
export class SparseWriter {
  readonly s: SparseVoxels;
  private readonly dx: number;
  private readonly dxy: number;
  private key = -1;
  private brick: Uint8Array | null = null;
  /** Voxels this writer added (minus those it cleared). */
  voxels = 0;

  constructor(sizeOrExisting: { x: number; y: number; z: number } | SparseVoxels) {
    const size = "bricks" in sizeOrExisting ? sizeOrExisting.size : sizeOrExisting;
    this.s = "bricks" in sizeOrExisting ? sizeOrExisting : makeSparse(size);
    const [dx, dy] = sparseDims(size);
    this.dx = dx;
    this.dxy = dx * dy;
  }

  private at(x: number, y: number, z: number, create: boolean): Uint8Array | null {
    const key = (x >> 3) + (y >> 3) * this.dx + (z >> 3) * this.dxy;
    if (key === this.key) return this.brick;
    let b = this.s.bricks.get(key) ?? null;
    if (!b && create) {
      b = new Uint8Array(512);
      this.s.bricks.set(key, b);
    }
    if (b) {
      this.key = key;
      this.brick = b;
    }
    return b;
  }

  set(x: number, y: number, z: number, v: number): void {
    const { x: sx, y: sy, z: sz } = this.s.size;
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return;
    const b = this.at(x, y, z, v !== 0);
    if (!b) return;
    const i = (x & 7) + (y & 7) * 8 + (z & 7) * 64;
    if (!b[i] && v) this.voxels++;
    else if (b[i] && !v) this.voxels--;
    b[i] = v;
  }

  get(x: number, y: number, z: number): number {
    const { x: sx, y: sy, z: sz } = this.s.size;
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return 0;
    const b = this.at(x, y, z, false);
    return b ? b[(x & 7) + (y & 7) * 8 + (z & 7) * 64] : 0;
  }
}

/** Integer hash of up to four ints to [0, 1). */
export function hash4(a: number, b: number, c: number, d = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The 26 neighbour offsets. */
const N26: [number, number, number][] = [];
for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y || z) N26.push([x, y, z]);
const edgeOpen = new Int8Array(26);

const FACES = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
] as const;

export function refine(model: EntityModel, opts: RefineOptions): { model: EntityModel; stats: RefineStats } {
  const t0 = performance.now();
  const k = Math.max(1, Math.round(opts.k));
  const { x: sx, y: sy, z: sz } = model.size;
  const sxy = sx * sy;
  const d = model.data;
  const occ = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : d[x + y * sx + z * sxy];
  const fallback = opts.fallback ?? { mode: "smooth" as const };
  const ruleOf = (v: number): RoleRule => opts.rules[v] ?? fallback;
  const opaque = (v: number) => v !== 0 && (ruleOf(v).mode === "smooth" || ruleOf(v).mode === "crisp" || ruleOf(v).mode === "skip");
  // Air reachable from outside the model's box, when only outside faces count.
  let outside: Uint8Array | null = null;
  if (opts.faces === "outside") {
    outside = new Uint8Array(sx * sy * sz);
    const q: number[] = [];
    const push = (i: number) => { if (!outside![i] && !d[i]) { outside![i] = 1; q.push(i); } };
    for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++)
      if (x === 0 || y === 0 || z === 0 || x === sx - 1 || y === sy - 1 || z === sz - 1) push(x + y * sx + z * sxy);
    while (q.length) {
      const i = q.pop()!;
      const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / sxy) | 0;
      if (x > 0) push(i - 1); if (x < sx - 1) push(i + 1);
      if (y > 0) push(i - sx); if (y < sy - 1) push(i + sx);
      if (z > 0) push(i - sxy); if (z < sz - 1) push(i + sxy);
    }
  }
  /** Is the cell at (x, y, z) air that counts as open? */
  const openAir = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return true;
    const v = d[x + y * sx + z * sxy];
    if (outside) return !v && outside[x + y * sx + z * sxy] === 1;
    return !opaque(v);
  };
  const noise = makeNoise((opts.seed ?? 1) | 0 || 1);
  const out = new SparseWriter({ x: sx * k, y: sy * k, z: sz * k });
  const smoothShell = opts.shell ?? Math.ceil(0.35 * k) + 2;
  const crispShell = opts.shell ?? Math.min(k, 3);
  let coarseSurface = 0;

  const cell: RefineCell = { x: 0, y: 0, z: 0, cx: 0, cy: 0, cz: 0, role: 0, nx: 0, ny: 0, nz: 0, depth: 0, k, noise };
  const finish = (rule: RoleRule, role: number) => (rule.detail ? rule.detail(cell) : role);

  // Occupancy of the 3x3x3 neighbourhood, as smooth solids (for the field).
  const nb = new Float32Array(27);
  const loadNeighbourhood = (x: number, y: number, z: number, smoothOnly: boolean) => {
    for (let dz = -1, i = 0; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++, i++) {
          const v = occ(x + dx, y + dy, z + dz);
          nb[i] = smoothOnly ? (opaque(v) ? 1 : 0) : v ? 1 : 0;
        }
  };
  // Trilinear occupancy at a point inside the centre voxel of `nb`, local
  // coordinates u, v, w in [0, 1).
  const field = (u: number, v: number, w: number): number => {
    const fx = u - 0.5, fy = v - 0.5, fz = w - 0.5;
    const ix = fx < 0 ? 0 : 1, iy = fy < 0 ? 0 : 1, iz = fz < 0 ? 0 : 1; // lower sample index in nb (0..1)
    const tx = fx < 0 ? fx + 1 : fx, ty = fy < 0 ? fy + 1 : fy, tz = fz < 0 ? fz + 1 : fz;
    const at = (a: number, b: number, c: number) => nb[a + b * 3 + c * 9];
    const c00 = at(ix, iy, iz) * (1 - tx) + at(ix + 1, iy, iz) * tx;
    const c10 = at(ix, iy + 1, iz) * (1 - tx) + at(ix + 1, iy + 1, iz) * tx;
    const c01 = at(ix, iy, iz + 1) * (1 - tx) + at(ix + 1, iy, iz + 1) * tx;
    const c11 = at(ix, iy + 1, iz + 1) * (1 - tx) + at(ix + 1, iy + 1, iz + 1) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };
  const rough = (rule: RoleRule, fx: number, fy: number, fz: number) => {
    const amp = rule.roughness ?? 0.12;
    if (!amp) return 0;
    const s = 1 / (rule.roughScale ?? 2.5 * k);
    return (noise.value3(fx * s, fy * s, fz * s) - 0.5) * 2 * amp;
  };

  for (let cz = 0; cz < sz; cz++)
    for (let cy = 0; cy < sy; cy++)
      for (let cx = 0; cx < sx; cx++) {
        const v = d[cx + cy * sx + cz * sxy];
        const ox = cx * k, oy = cy * k, oz = cz * k;
        if (!v) {
          if (outside && !outside[cx + cy * sx + cz * sxy]) continue;
          // An empty voxel next to smooth solids: a concave notch fills in, and
          // a rough surface bulges out a little.
          let smoothFace = -1;
          for (let f = 0; f < 6; f++) {
            const n = occ(cx + FACES[f][0], cy + FACES[f][1], cz + FACES[f][2]);
            if (n && ruleOf(n).mode === "smooth") { smoothFace = f; break; }
          }
          if (smoothFace < 0) continue;
          loadNeighbourhood(cx, cy, cz, true);
          for (let lz = 0; lz < k; lz++)
            for (let ly = 0; ly < k; ly++)
              for (let lx = 0; lx < k; lx++) {
                const u = (lx + 0.5) / k, w2 = (ly + 0.5) / k, w3 = (lz + 0.5) / k;
                // Nearest solid face neighbour decides the role.
                let best = -1, bestD = Infinity;
                for (let f = 0; f < 6; f++) {
                  const n = occ(cx + FACES[f][0], cy + FACES[f][1], cz + FACES[f][2]);
                  if (!n || ruleOf(n).mode !== "smooth") continue;
                  const dist = FACES[f][0] > 0 ? 1 - u : FACES[f][0] < 0 ? u : FACES[f][1] > 0 ? 1 - w2 : FACES[f][1] < 0 ? w2 : FACES[f][2] > 0 ? 1 - w3 : w3;
                  if (dist < bestD) { bestD = dist; best = f; }
                }
                if (best < 0 || bestD > 0.45) continue;
                const role = occ(cx + FACES[best][0], cy + FACES[best][1], cz + FACES[best][2]);
                const rule = ruleOf(role);
                const fx = ox + lx, fy = oy + ly, fz = oz + lz;
                if (field(u, w2, w3) + rough(rule, fx, fy, fz) <= 0.5) continue;
                cell.x = fx; cell.y = fy; cell.z = fz;
                cell.cx = cx + FACES[best][0]; cell.cy = cy + FACES[best][1]; cell.cz = cz + FACES[best][2];
                cell.role = role;
                cell.nx = -FACES[best][0]; cell.ny = -FACES[best][1]; cell.nz = -FACES[best][2];
                cell.depth = 0;
                const r = finish(rule, role);
                if (r) out.set(fx, fy, fz, r);
              }
          continue;
        }

        // Which faces are open. Leaves and blades are see-through, so a branch
        // inside foliage still has a surface.
        let open = 0;
        for (let f = 0; f < 6; f++) if (openAir(cx + FACES[f][0], cy + FACES[f][1], cz + FACES[f][2])) open |= 1 << f;
        // Open edge and corner neighbours too: at a concave edge (a wall on a
        // wider plinth) the voxel in the corner has no open face, but its fine
        // cells along the edge are what joins the two faces' shells.
        let nEdge = 0;
        for (let q = 0; q < 26; q++) {
          const [ex, ey, ez] = N26[q];
          if (Math.abs(ex) + Math.abs(ey) + Math.abs(ez) < 2) continue;
          // An edge whose own faces are open is never nearer than they are.
          if ((ex > 0 && open & 1) || (ex < 0 && open & 2) || (ey > 0 && open & 4) || (ey < 0 && open & 8) || (ez > 0 && open & 16) || (ez < 0 && open & 32)) continue;
          if (openAir(cx + ex, cy + ey, cz + ez)) edgeOpen[nEdge++] = q;
        }
        const rule = ruleOf(v);
        if (rule.mode === "skip") continue;
        if (rule.mode === "leaves") {
          // Leaves show through gaps from further in, so any open cell
          // within `depth` counts.
          const reach = rule.leaves?.depth ?? 1;
          let any = open !== 0;
          for (let dz = -reach; dz <= reach && !any; dz++)
            for (let dy = -reach; dy <= reach && !any; dy++)
              for (let dx = -reach; dx <= reach && !any; dx++) if (!occ(cx + dx, cy + dy, cz + dz)) any = true;
          if (!any) continue;
          coarseSurface++;
          placeLeaves(out, rule, v, cx, cy, cz, k, cell, noise);
          continue;
        }
        if (rule.mode === "blades") {
          coarseSurface++;
          placeBlades(out, rule, v, cx, cy, cz, k, occ(cx, cy + 1, cz) !== 0 && ruleOf(occ(cx, cy + 1, cz)).mode === "blades", cell);
          continue;
        }
        if (!open && !nEdge) continue;
        coarseSurface++;
        const smooth = rule.mode === "smooth";
        const shell = smooth ? smoothShell : crispShell;
        if (smooth) loadNeighbourhood(cx, cy, cz, true);
        for (let lz = 0; lz < k; lz++)
          for (let ly = 0; ly < k; ly++)
            for (let lx = 0; lx < k; lx++) {
              // Depth below the nearest open face, edge or corner (for an edge,
              // the larger of the distances to its two faces).
              const px = k - 1 - lx, nx = lx, py = k - 1 - ly, ny = ly, pz = k - 1 - lz, nz = lz;
              let depth = k, face = -1;
              if (open & 1 && px < depth) { depth = px; face = 0; }
              if (open & 2 && nx < depth) { depth = nx; face = 1; }
              if (open & 4 && py < depth) { depth = py; face = 2; }
              if (open & 8 && ny < depth) { depth = ny; face = 3; }
              if (open & 16 && pz < depth) { depth = pz; face = 4; }
              if (open & 32 && nz < depth) { depth = nz; face = 5; }
              for (let e = 0; e < nEdge; e++) {
                const q = N26[edgeOpen[e]];
                const ex = q[0], ey = q[1], ez = q[2];
                const dxx = ex > 0 ? px : ex < 0 ? nx : 0, dyy = ey > 0 ? py : ey < 0 ? ny : 0, dzz = ez > 0 ? pz : ez < 0 ? nz : 0;
                const dd = dxx > dyy ? (dxx > dzz ? dxx : dzz) : dyy > dzz ? dyy : dzz;
                if (dd < depth) { depth = dd; face = ex ? (ex > 0 ? 0 : 1) : ey ? (ey > 0 ? 2 : 3) : ez > 0 ? 4 : 5; }
              }
              if (depth >= shell) continue;
              const fx = ox + lx, fy = oy + ly, fz = oz + lz;
              if (smooth && field((lx + 0.5) / k, (ly + 0.5) / k, (lz + 0.5) / k) + rough(rule, fx, fy, fz) <= 0.5) continue;
              cell.x = fx; cell.y = fy; cell.z = fz;
              cell.cx = cx; cell.cy = cy; cell.cz = cz;
              cell.role = v;
              cell.nx = FACES[face][0]; cell.ny = FACES[face][1]; cell.nz = FACES[face][2];
              cell.depth = depth;
              const r = finish(rule, v);
              if (r) out.set(fx, fy, fz, r);
            }
      }

  return {
    model: {
      size: { ...out.s.size },
      data: new Uint8Array(0),
      sparse: out.s,
      anchor: [model.anchor[0] * k, model.anchor[1] * k, model.anchor[2] * k],
      roles: model.roles,
    },
    stats: { coarseSurface, voxels: out.voxels, bricks: out.s.bricks.size, ms: performance.now() - t0 },
  };
}

/** Leaf discs for one coarse voxel. */
function placeLeaves(out: SparseWriter, rule: RoleRule, role: number, cx: number, cy: number, cz: number, k: number, cell: RefineCell, noise: Noise): void {
  const n = rule.leaves?.count ?? 3;
  const R = rule.leaves?.radius ?? 0.35 * k;
  const tones = rule.leaves?.tones;
  const toneChance = rule.leaves?.toneChance ?? 0.15;
  for (let i = 0; i < n; i++) {
    const h = (j: number) => hash4(cx, cy, cz, i * 8 + j);
    const px = (cx + h(0)) * k, py = (cy + h(1)) * k, pz = (cz + h(2)) * k;
    // Leaves face mostly up and out: a random normal biased to +y.
    let nx = h(3) * 2 - 1, ny = h(4) * 1.4 - 0.2, nz = h(5) * 2 - 1;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const r = R * (0.75 + 0.5 * h(6));
    let leafRole = role;
    if (tones && tones.length && h(7) < toneChance) leafRole = tones[Math.floor(hash4(cx, cy, cz, i + 99) * tones.length)];
    const put = (x: number, y: number, z: number) => {
      if (out.get(x, y, z)) return;
      cell.x = x; cell.y = y; cell.z = z; cell.cx = cx; cell.cy = cy; cell.cz = cz;
      cell.role = leafRole; cell.nx = 0; cell.ny = 1; cell.nz = 0; cell.depth = 0;
      const v = rule.detail ? rule.detail(cell) : leafRole;
      if (v) out.set(x, y, z, v);
    };
    if (rule.leaves?.shape === "needle") {
      // A needle: a line through the point, face-connected like line3, mostly
      // level (needles on a spruce twig spray sideways).
      const ly = (h(4) - 0.5) * 0.8;
      const ll = Math.hypot(nx, ly, nz) || 1;
      const ux = nx / ll, uy = ly / ll, uz = nz / ll;
      let x = Math.floor(px - ux * r), y = Math.floor(py - uy * r), z = Math.floor(pz - uz * r);
      const ex = Math.floor(px + ux * r), ey = Math.floor(py + uy * r), ez = Math.floor(pz + uz * r);
      put(x, y, z);
      for (let guard = 0; guard < 4 * r + 8 && (x !== ex || y !== ey || z !== ez); guard++) {
        // Step the axis furthest from its target, one axis at a time.
        const ax = Math.abs(ex - x), ay = Math.abs(ey - y), az = Math.abs(ez - z);
        if (ax >= ay && ax >= az) x += Math.sign(ex - x);
        else if (ay >= az) y += Math.sign(ey - y);
        else z += Math.sign(ez - z);
        put(x, y, z);
      }
      continue;
    }
    const e = Math.ceil(r + 1);
    const x0 = Math.floor(px - e), y0 = Math.floor(py - e), z0 = Math.floor(pz - e);
    const x1 = Math.ceil(px + e), y1 = Math.ceil(py + e), z1 = Math.ceil(pz + e);
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - px, dy = y + 0.5 - py, dz = z + 0.5 - pz;
          const along = dx * nx + dy * ny + dz * nz;
          if (Math.abs(along) > 0.55) continue;
          const d2 = dx * dx + dy * dy + dz * dz - along * along;
          if (d2 > r * r) continue;
          put(x, y, z);
        }
  }
  void noise;
}

/** Grass blades through one coarse voxel. */
function placeBlades(out: SparseWriter, rule: RoleRule, role: number, cx: number, cy: number, cz: number, k: number, continues: boolean, cell: RefineCell): void {
  const n = rule.blades?.count ?? 2;
  const w = rule.blades?.width ?? 1;
  const leanMax = rule.blades?.lean ?? 0.35;
  for (let i = 0; i < n; i++) {
    // Per column, not per voxel: a blade keeps its place up the stack.
    const h = (j: number) => hash4(cx, 0, cz, i * 8 + j);
    const bx = (cx + h(0)) * k, bz = (cz + h(1)) * k;
    const lx = (h(2) * 2 - 1) * leanMax, lz = (h(3) * 2 - 1) * leanMax;
    // The top voxel of a stack cuts the blade somewhere inside it.
    const top = continues ? k : Math.max(2, Math.round(k * (0.35 + 0.65 * hash4(cx, cy, cz, i + 50))));
    for (let ly = 0; ly < top; ly++) {
      const y = cy * k + ly;
      const x = Math.floor(bx + lx * y * 0.25), z = Math.floor(bz + lz * y * 0.25);
      // The last few voxels of a blade narrow to one.
      const ww = !continues && ly > top - 3 ? 1 : w;
      for (let a = 0; a < ww; a++) {
        const xx = lx > lz ? x : x + a, zz = lx > lz ? z + a : z;
        cell.x = xx; cell.y = y; cell.z = zz; cell.cx = cx; cell.cy = cy; cell.cz = cz;
        cell.role = role; cell.nx = 0; cell.ny = 1; cell.nz = 0; cell.depth = 0;
        const v = rule.detail ? rule.detail(cell) : role;
        if (v) out.set(xx, y, zz, v);
      }
    }
  }
}

/**
 * A tapered capsule's outer shell, `shell` voxels deep, into a sparse writer:
 * what a generator uses to redraw a limb at a finer scale without filling
 * (and paying for) its hidden inside. `scale` widens the radius per point (a
 * root flare); `value` picks each voxel's role. Returns voxels written.
 *
 * Rows are clipped to the capsule's analytic x-span before testing cells, so
 * cost follows the shell's volume rather than the capsule's bounding box.
 */
export function shellCapsule(
  w: SparseWriter,
  a: readonly number[],
  b: readonly number[],
  ra: number,
  rb: number,
  shell: number,
  value: (x: number, y: number, z: number) => number,
  scale?: (x: number, y: number, z: number) => number,
  maxScale = 1,
): number {
  const R = Math.max(ra, rb) * maxScale + 1;
  const x0 = Math.floor(Math.min(a[0], b[0]) - R), x1 = Math.ceil(Math.max(a[0], b[0]) + R);
  const y0 = Math.floor(Math.min(a[1], b[1]) - R), y1 = Math.ceil(Math.max(a[1], b[1]) + R);
  const z0 = Math.floor(Math.min(a[2], b[2]) - R), z1 = Math.ceil(Math.max(a[2], b[2]) + R);
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const l2 = dx * dx + dy * dy + dz * dz || 1e-9;
  let n = 0;
  for (let z = z0; z <= z1; z++)
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5 - a[1], pz = z + 0.5 - a[2];
      // The row's x-span within R of the capsule's infinite axis line: a
      // superset of the capsule's own span, from a quadratic in x.
      let xs = x0, xe = x1;
      const A = 1 - (dx * dx) / l2;
      if (A > 1e-6) {
        const m = py * dy + pz * dz;
        const B = (-2 * dx * m) / l2;
        const C = py * py + pz * pz - (m * m) / l2 - R * R;
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        const lo = (-B - sq) / (2 * A) + a[0] - 0.5, hi = (-B + sq) / (2 * A) + a[0] - 0.5;
        xs = Math.max(x0, Math.floor(lo)); xe = Math.min(x1, Math.ceil(hi));
      }
      for (let x = xs; x <= xe; x++) {
        const px = x + 0.5 - a[0];
        const t = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / l2));
        const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
        const d2 = qx * qx + qy * qy + qz * qz;
        let rr = ra + (rb - ra) * t;
        if (scale) rr *= scale(x, y, z);
        if (d2 > rr * rr) continue;
        const inner = rr - shell;
        if (inner > 0 && d2 < inner * inner) continue;
        const v = value(x, y, z);
        if (v) { w.set(x, y, z, v); n++; }
      }
    }
  return n;
}
