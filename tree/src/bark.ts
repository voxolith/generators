// Bark, as a surface-only pass.
//
// Only the surface is ever seen, so shading the interior would cost three to
// four times as much for nothing, and a volumetric noise field cut by an
// arbitrary trunk surface gives blotches with no axial orientation — and axial
// orientation is exactly what reads as bark. Keeping the interior a single
// heartwood role also means a cut or a broken branch exposes clean inner wood.
//
// The furrow frequency is scaled by the local radius so wavelength stays
// constant in voxels as the trunk tapers. That single detail is what makes
// bark read as texture at this resolution rather than as noise.

import { segmentFrames, type Noise, type Skeleton, type Volume } from "@voxolith/gen-kit";
import type { Vec3 } from "@voxolith/engine";
import { isWood, ROLE } from "./roles";
import type { LookParams, ShapeParams } from "./params";

export function paintBark(
  vol: Volume,
  skel: Skeleton,
  segId: Uint16Array,
  shape: ShapeParams,
  look: LookParams,
  origin: Vec3,
  noise: Noise,
): void {
  const segs = skel.segments;
  const { frames: fx, lengths: segLen } = segmentFrames(segs);

  const wavelength = Math.max(2, look.furrowWavelength);
  const axialFreq = 1 / (wavelength * 8); // ~8:1 anisotropy: furrows run up, not around
  const contrast = look.furrowContrast;
  const lo = 0.5 - contrast * 0.5;
  const hi = 0.5 + contrast * 0.5;
  const mossDir = (look.mossAzimuthDeg * Math.PI) / 180;
  const mossX = Math.cos(mossDir), mossZ = Math.sin(mossDir);
  const mossMaxY = origin[1] + shape.height * 0.35;
  const mossCut = 1 - look.moss;

  const sx = vol.sx, sy = vol.sy, sxy = sx * sy;
  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (v === 0 || !isWood(v)) continue;
    const x = i % sx;
    const y = ((i / sx) | 0) % sy;
    const z = (i / sxy) | 0;
    if (!vol.isSurface(x, y, z)) continue;

    const si = segId[i] - 1;
    if (si < 0 || si >= segs.length) {
      vol.data[i] = ROLE.BARK_MID;
      continue;
    }
    const s = segs[si];
    const o = si * 9;
    const rx = x + 0.5 - (s.a[0] + origin[0]);
    const ry = y + 0.5 - (s.a[1] + origin[1]);
    const rz = z + 0.5 - (s.a[2] + origin[2]);
    const axial = rx * fx[o] + ry * fx[o + 1] + rz * fx[o + 2];
    const t = Math.max(0, Math.min(1, axial / segLen[si]));
    const r = s.ra + (s.rb - s.ra) * t;

    if (r < look.minRadiusForPattern) {
      // Thin branches take a flat colour chosen per stem. Dithering a two-voxel
      // twig is the main source of bark that looks like noise soup.
      vol.data[i] = hash01(s.stem) < 0.42 ? ROLE.TWIG_DARK : ROLE.TWIG;
      continue;
    }

    const u = s.u + axial;
    const theta = Math.atan2(
      rx * fx[o + 6] + ry * fx[o + 7] + rz * fx[o + 8],
      rx * fx[o + 3] + ry * fx[o + 4] + rz * fx[o + 5],
    );
    // Arc length around the trunk keeps furrow spacing constant in voxels.
    const around = (theta * r) / wavelength;
    const warp = look.plateWarp * (noise.fbm2(theta * 1.7, u * 0.1, 2) - 0.5);
    let b = noise.fbm2(around + warp, u * axialFreq, 3);
    b += 0.3 * noise.fbm3(x * 0.28, y * 0.28, z * 0.28, 2) - 0.15;

    let role: number = b < lo ? ROLE.BARK_DARK : b > hi ? ROLE.BARK_LIGHT : ROLE.BARK_MID;

    if (look.moss > 0 && y < mossMaxY) {
      const n = vol.surfaceNormal(x, y, z);
      if (n[0] * mossX + n[2] * mossZ > 0.35 && noise.fbm3(x * 0.06, y * 0.06, z * 0.06, 2) > mossCut) {
        role = ROLE.MOSS;
      }
    }
    if (look.creviceAo && vol.neighbourhood27(x, y, z) >= 21) role = ROLE.CREVICE;

    vol.data[i] = role;
  }
}

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
