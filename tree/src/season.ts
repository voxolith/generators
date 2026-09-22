// Season, age and health, mapped onto one generator.
//
// Season is mostly a role choice plus a density multiplier: the geometry does
// not change, so a host can regenerate spring and autumn from one cached
// skeleton. Winter is the exception — a bare broadleaf needs finer, denser
// twigs or it reads as a coat rack, and it gains a snow skin.

import { hash01, type Noise, type Volume } from "@voxolith/gen-kit";
import { isLeaf, isWood, ROLE } from "./roles";
import type { LookParams, ShapeParams, SpeciesKind } from "./params";

export interface SeasonPlan {
  /** Leaf roles from light to dark. */
  tones: [number, number, number];
  edge: number;
  accent: number;
  /** Fraction of clusters kept. */
  density: number;
  /** Broadleaf drops its leaves entirely. */
  bare: boolean;
}

export function planSeason(look: LookParams, kind: SpeciesKind): SeasonPlan {
  const base: SeasonPlan = {
    tones: [ROLE.LEAF_HI, ROLE.LEAF_MID, ROLE.LEAF_LO],
    edge: ROLE.LEAF_EDGE,
    accent: ROLE.LEAF_ACCENT,
    density: 1,
    bare: false,
  };
  switch (look.season) {
    case "spring":
      return { ...base, density: 0.82 };
    case "autumn":
      return { ...base, density: 0.86 };
    case "winter":
      return kind === "broadleaf" ? { ...base, bare: true, density: 0 } : { ...base, density: 0.95 };
    default:
      return base;
  }
}

/** Age and health nudge the shape before it is grown. */
export function applyAgeAndHealth(shape: ShapeParams, look: LookParams): void {
  const a = Math.max(0, Math.min(1, look.age));
  shape.trunk.radiusRatio *= 0.75 + 0.5 * a;
  shape.trunk.curl *= 0.5 + 1.2 * a;
  shape.crownStartRatio *= 0.7 + 0.5 * a;
  for (const lv of shape.levels) lv.downDeg += 12 * a * (lv.downDeg > 30 ? 1 : 0.4);
  if (look.season === "winter" && shape.kind === "broadleaf") {
    // Finer twigs so the bare silhouette has detail to read.
    const last = shape.levels[shape.levels.length - 1];
    last.count = [Math.round(last.count[0] * 1.3), Math.round(last.count[1] * 1.3)];
    last.segLen *= 0.8;
  }
}

/** Spring: whole clusters flower, chosen by cluster hash so petals stay in clumps. */
export function applyBlossom(vol: Volume, clusterId: Uint16Array, fraction: number): number {
  if (fraction <= 0) return 0;
  let n = 0;
  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (!isLeaf(v)) continue;
    const cid = clusterId[i];
    if (cid === 0) continue;
    if (hash01(cid * 40503) > fraction) continue;
    // Only the outer shell flowers; blossom buried inside is invisible anyway.
    if (v === ROLE.LEAF_EDGE || v === ROLE.LEAF_HI) {
      vol.data[i] = ROLE.BLOSSOM;
      n++;
    }
  }
  return n;
}

/**
 * Winter: recolour the top face of anything with a clear column of sky above.
 * The clearance test matters — snow scattered on voxels deep inside a crown
 * reads as dandruff.
 */
export function applySnow(vol: Volume, amount: number, noise: Noise): number {
  if (amount <= 0) return 0;
  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  let n = 0;
  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (v === 0) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;
    if (vol.get(x, y + 1, z) !== 0) continue;
    let clear = true;
    for (let k = 2; k <= 5; k++)
      if (vol.get(x, y + k, z) !== 0) {
        clear = false;
        break;
      }
    if (!clear) continue;
    // Flat-ish tops hold more snow than the side of a branch.
    const flat = (vol.get(x - 1, y, z) !== 0 ? 1 : 0) + (vol.get(x + 1, y, z) !== 0 ? 1 : 0) +
      (vol.get(x, y, z - 1) !== 0 ? 1 : 0) + (vol.get(x, y, z + 1) !== 0 ? 1 : 0);
    const p = amount * (0.35 + 0.65 * (flat / 4)) * (isWood(v) ? 1 : 0.8);
    if (noise.value3(x * 0.4, y * 0.4, z * 0.4, 9) < p) {
      vol.data[i] = ROLE.SNOW;
      n++;
    }
  }
  return n;
}
