// Authoring rigged models: a volume whose voxels know which bone owns them.
//
// A creature is built like any other model — capsules, ellipsoids, lines —
// except every fill names a bone, and the voxel remembers it. Later fills
// take ownership of what they overwrite, which is how joints work: fill the
// parent's mass, then the child's (including a ball at the child's head), so
// the joint belongs to the child and turns with it about its own pivot
// without opening a gap.
//
// `layerInterior` then gives the mass an inside: roles by depth below the
// surface (fur, then fat, then flesh), the bark-over-heartwood idea from the
// tree generator generalised. Bone cores and organs are stamped afterwards,
// so they only ever show where something cuts the model open.

import type { Bone, EntityModel, Rig, Role, Vec3 } from "@voxolith/engine";
import { capsule, ellipsoid, line3, type FillOptions } from "./shapes";
import { Volume } from "./volume";

export class RiggedVolume {
  readonly vol: Volume;
  /** Bone index per voxel, parallel to `vol.data`. */
  readonly owner: Uint8Array;
  readonly bones: Bone[] = [];
  private readonly ids = new Map<string, number>();

  constructor(sx: number, sy: number, sz: number) {
    this.vol = new Volume(sx, sy, sz);
    this.owner = new Uint8Array(this.vol.data.length);
  }

  /** Add a bone; parents must be added before their children. Returns its index. */
  bone(id: string, parent: string | null, head: Vec3, tail: Vec3): number {
    if (this.ids.has(id)) throw new Error(`bone "${id}" already exists`);
    const p = parent === null ? -1 : this.ids.get(parent);
    if (p === undefined) throw new Error(`parent bone "${parent}" does not exist yet`);
    if (this.bones.length >= 255) throw new Error("at most 255 bones");
    const i = this.bones.length;
    this.bones.push({ id, parent: p, head: [...head] as Vec3, tail: [...tail] as Vec3 });
    this.ids.set(id, i);
    return i;
  }

  index(id: string): number {
    const i = this.ids.get(id);
    if (i === undefined) throw new Error(`no bone "${id}"`);
    return i;
  }

  private tag(bone: number, o: FillOptions = {}): FillOptions {
    const own = this.owner;
    return { ...o, onFill: (i, x, y, z) => { own[i] = bone; o.onFill?.(i, x, y, z); } };
  }

  /** Tapered capsule owned by `bone`; thin ones (radius < 1) fall back to a 6-connected line. */
  capsule(bone: number, a: Vec3, b: Vec3, ra: number, rb: number, value: number, o?: FillOptions): number {
    if (Math.max(ra, rb) < 1) return line3(this.vol, a, b, value, this.tag(bone, o));
    return capsule(this.vol, a, b, ra, rb, value, this.tag(bone, o));
  }

  ellipsoid(bone: number, c: Vec3, r: Vec3, value: number, keep?: (x: number, y: number, z: number, d: number) => boolean, o?: FillOptions): number {
    return ellipsoid(this.vol, c, r, value, keep, this.tag(bone, o));
  }

  line(bone: number, a: Vec3, b: Vec3, value: number, o?: FillOptions): number {
    return line3(this.vol, a, b, value, this.tag(bone, o));
  }

  /** Set one voxel, owned by `bone`. */
  set(bone: number, x: number, y: number, z: number, value: number): void {
    if (!this.vol.inside(x, y, z)) return;
    const i = this.vol.index(x, y, z);
    this.vol.data[i] = value;
    this.owner[i] = bone;
  }

  /**
   * Depth of every solid voxel below the surface (0 = touching air), by a
   * 6-connected flood from the outside in. Empty cells get 255.
   */
  depths(): Uint8Array {
    const { sx, sy, sz, data } = this.vol;
    const sxy = sx * sy;
    const depth = new Uint8Array(data.length).fill(255);
    const queue = new Int32Array(data.length);
    let head = 0, tail = 0;
    for (let z = 0; z < sz; z++)
      for (let y = 0; y < sy; y++)
        for (let x = 0; x < sx; x++) {
          const i = x + y * sx + z * sxy;
          if (!data[i]) continue;
          const edge = x === 0 || y === 0 || z === 0 || x === sx - 1 || y === sy - 1 || z === sz - 1;
          if (edge || !data[i - 1] || !data[i + 1] || !data[i - sx] || !data[i + sx] || !data[i - sxy] || !data[i + sxy]) {
            depth[i] = 0;
            queue[tail++] = i;
          }
        }
    while (head < tail) {
      const i = queue[head++];
      const d = depth[i] + 1;
      if (d >= 255) continue;
      const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / sxy) | 0;
      const visit = (j: number) => { if (data[j] && depth[j] > d) { depth[j] = d; queue[tail++] = j; } };
      if (x > 0) visit(i - 1);
      if (x < sx - 1) visit(i + 1);
      if (y > 0) visit(i - sx);
      if (y < sy - 1) visit(i + sx);
      if (z > 0) visit(i - sxy);
      if (z < sz - 1) visit(i + sxy);
    }
    return depth;
  }

  /**
   * Re-role the mass by depth: `layers[d]` for depth d, the last entry for
   * anything deeper. Only voxels for which `replace` is true change, so
   * details already painted (eyes, claws) survive.
   */
  layerInterior(layers: number[], replace: (value: number) => boolean = () => true): Uint8Array {
    const depth = this.depths();
    const data = this.vol.data;
    for (let i = 0; i < data.length; i++) {
      if (!data[i] || !replace(data[i])) continue;
      data[i] = layers[Math.min(depth[i], layers.length - 1)];
    }
    return depth;
  }

  /** Crop to the occupied box: the model (with its bone binding) and the rig, in the same space. */
  crop(anchor: Vec3, roles: Role[]): { model: EntityModel; rig: Rig } {
    const b = this.vol.bounds();
    const base = this.vol.crop(anchor, roles);
    if (!b) return { model: { ...base, bones: new Uint8Array(base.data.length) }, rig: { bones: [] } };
    const { x: cx, y: cy, z: cz } = base.size;
    const bones = new Uint8Array(cx * cy * cz);
    const { sx, sy } = this.vol;
    for (let z = 0; z < cz; z++)
      for (let y = 0; y < cy; y++)
        for (let x = 0; x < cx; x++)
          bones[x + y * cx + z * cx * cy] = this.owner[(b.x0 + x) + (b.y0 + y) * sx + (b.z0 + z) * sx * sy];
    const shift = (v: Vec3): Vec3 => [v[0] - b.x0, v[1] - b.y0, v[2] - b.z0];
    return {
      model: { ...base, bones },
      rig: { bones: this.bones.map((bn) => ({ ...bn, head: shift(bn.head), tail: shift(bn.tail) })) },
    };
  }
}
