// A dense working grid for generators.
//
// Generators allocate a volume a little larger than they expect the result to
// be, draw into it, and crop at the end. Dense beats sparse here: occupancy
// tests and the 6-neighbour queries that surface, flood and snow passes need
// are O(1), and at a few hundred thousand live voxels a Map costs about ten
// times the memory.

import type { EntityModel, Role, Vec3 } from "@voxolith/engine";

/** An inclusive, axis-aligned voxel box: both corners are occupied cells. */
export interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/**
 * A dense `sx` by `sy` by `sz` grid of 8-bit voxel values, 0 for empty.
 *
 * The working surface of every generator: draw into it with the shape rasterisers, run the
 * surface, flood and shading passes over it, then {@link Volume.crop | crop} it to an
 * `EntityModel`. Values are role indices, never colours. Reads outside
 * the grid return 0 and writes outside it are ignored, so passes need no bounds checks.
 *
 * @example
 * ```ts
 * const WOOD = 1; // role index: roles[WOOD - 1] describes it
 * const vol = new Volume(32, 48, 32);
 * capsule(vol, [16, 0, 16], [16, 40, 16], 4, 2, WOOD);
 * const { reached } = vol.flood6((x, y, z) => y === 0); // reached === vol.count(): one piece
 * const model = vol.crop([16, 0, 16], [{ id: "wood", name: "Wood", color: [0.4, 0.3, 0.2] }]);
 * ```
 */
export class Volume {
  /** Voxel values, x fastest, then y, then z: see {@link Volume.index}. */
  readonly data: Uint8Array;

  /** An empty volume `sx` wide (x), `sy` tall (y) and `sz` deep (z). */
  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.data = new Uint8Array(sx * sy * sz);
  }

  /** Volume sized to hold a shape `w` wide, `h` tall and `d` deep, plus margin. */
  static forShape(w: number, h: number, d: number, margin = 4): Volume {
    return new Volume(Math.ceil(w) + margin * 2, Math.ceil(h) + margin * 2, Math.ceil(d) + margin * 2);
  }

  /** Linear index of a cell in {@link Volume.data}; no bounds check. */
  index(x: number, y: number, z: number): number {
    return x + y * this.sx + z * this.sx * this.sy;
  }

  /** Whether the cell lies within the grid. */
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  /** Value at a cell, 0 outside the grid. */
  get(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return 0;
    return this.data[x + y * this.sx + z * this.sx * this.sy];
  }

  /** Write a value; ignored outside the grid. */
  set(x: number, y: number, z: number, v: number): void {
    if (!this.inside(x, y, z)) return;
    this.data[x + y * this.sx + z * this.sx * this.sy] = v;
  }

  /** Write only into empty space. Used so foliage never eats branches. */
  setIfEmpty(x: number, y: number, z: number, v: number): boolean {
    if (!this.inside(x, y, z)) return false;
    const i = x + y * this.sx + z * this.sx * this.sy;
    if (this.data[i] !== 0) return false;
    this.data[i] = v;
    return true;
  }

  /** Number of solid (non-zero) voxels. */
  count(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== 0) n++;
    return n;
  }

  /** Decompose a linear index back to coordinates. */
  coords(i: number): Vec3 {
    const x = i % this.sx;
    const y = ((i / this.sx) | 0) % this.sy;
    const z = (i / (this.sx * this.sy)) | 0;
    return [x, y, z];
  }

  /** Tightest box around every solid voxel, or null when the volume is empty. */
  bounds(): Box | null {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++) {
        const row = y * this.sx + z * this.sx * this.sy;
        for (let x = 0; x < this.sx; x++) {
          if (this.data[row + x] === 0) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (z < z0) z0 = z;
          if (z > z1) z1 = z;
        }
      }
    return x1 >= x0 ? { x0, y0, z0, x1, y1, z1 } : null;
  }

  /** True when the voxel is solid and at least one 6-neighbour is empty. */
  isSurface(x: number, y: number, z: number): boolean {
    if (this.get(x, y, z) === 0) return false;
    return (
      this.get(x - 1, y, z) === 0 ||
      this.get(x + 1, y, z) === 0 ||
      this.get(x, y - 1, z) === 0 ||
      this.get(x, y + 1, z) === 0 ||
      this.get(x, y, z - 1) === 0 ||
      this.get(x, y, z + 1) === 0
    );
  }

  /** Outward normal from which 6-neighbours are empty; [0,0,0] when enclosed. */
  surfaceNormal(x: number, y: number, z: number): Vec3 {
    let nx = 0, ny = 0, nz = 0;
    if (this.get(x - 1, y, z) === 0) nx -= 1;
    if (this.get(x + 1, y, z) === 0) nx += 1;
    if (this.get(x, y - 1, z) === 0) ny -= 1;
    if (this.get(x, y + 1, z) === 0) ny += 1;
    if (this.get(x, y, z - 1) === 0) nz -= 1;
    if (this.get(x, y, z + 1) === 0) nz += 1;
    const l = Math.hypot(nx, ny, nz);
    return l > 0 ? [nx / l, ny / l, nz / l] : [0, 0, 0];
  }

  /** Solid count in the 3×3×3 neighbourhood, for cheap baked occlusion. */
  neighbourhood27(x: number, y: number, z: number): number {
    let n = 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (this.get(x + dx, y + dy, z + dz) !== 0) n++;
    return n;
  }

  /**
   * 6-connected flood from every solid voxel in the seed plane/predicate.
   * Returns the visited mask and how many voxels it reached — this is the
   * check that a generated model is one piece, matching the connectivity rule
   * the demolition game uses.
   */
  flood6(seed: (x: number, y: number, z: number) => boolean): { visited: Uint8Array; reached: number } {
    const visited = new Uint8Array(this.data.length);
    const queue = new Int32Array(this.data.length);
    let head = 0, tail = 0, reached = 0;
    const sxy = this.sx * this.sy;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === 0) continue;
      const [x, y, z] = this.coords(i);
      if (!seed(x, y, z)) continue;
      visited[i] = 1;
      queue[tail++] = i;
    }
    const push = (i: number) => {
      if (this.data[i] !== 0 && !visited[i]) {
        visited[i] = 1;
        queue[tail++] = i;
      }
    };
    while (head < tail) {
      const i = queue[head++];
      reached++;
      const x = i % this.sx;
      const y = ((i / this.sx) | 0) % this.sy;
      const z = (i / sxy) | 0;
      if (x > 0) push(i - 1);
      if (x < this.sx - 1) push(i + 1);
      if (y > 0) push(i - this.sx);
      if (y < this.sy - 1) push(i + this.sx);
      if (z > 0) push(i - sxy);
      if (z < this.sz - 1) push(i + sxy);
    }
    return { visited, reached };
  }

  /** Crop to the occupied box and emit an entity model. `anchor` is in volume space. */
  crop(anchor: Vec3, roles: Role[]): EntityModel {
    const b = this.bounds();
    if (!b) {
      return { size: { x: 1, y: 1, z: 1 }, data: new Uint8Array(1), anchor: [0, 0, 0], roles };
    }
    const size = { x: b.x1 - b.x0 + 1, y: b.y1 - b.y0 + 1, z: b.z1 - b.z0 + 1 };
    const out = new Uint8Array(size.x * size.y * size.z);
    for (let z = 0; z < size.z; z++)
      for (let y = 0; y < size.y; y++) {
        const src = (b.x0 + (b.y0 + y) * this.sx + (b.z0 + z) * this.sx * this.sy);
        const dst = y * size.x + z * size.x * size.y;
        out.set(this.data.subarray(src, src + size.x), dst);
      }
    return {
      size,
      data: out,
      anchor: [anchor[0] - b.x0, anchor[1] - b.y0, anchor[2] - b.z0],
      roles,
    };
  }
}
