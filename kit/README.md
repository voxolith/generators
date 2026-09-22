# @voxolith/gen-kit

The authoring toolkit Voxolith generators are written with, plus the headless renderer used to
judge what they make. Generators *bake* models with it; the engine only places and streams those
models, and the renderer draws them. Nothing here is needed at runtime by a host that loads baked
`.vox` files.

| import | contents |
|---|---|
| `@voxolith/gen-kit` | `Volume`, voxel primitives, seeded noise, branch growth, clusters, canopy carving, rock masses |
| `@voxolith/gen-kit/preview` | CPU raymarcher, contact sheets, PNG writer (Node/bun only: uses node:zlib) |

## The toolkit

- **Volume**: a dense working grid with bounds-checked writes, surface queries, normals and
  cropping into an `EntityModel`.
- **Primitives**: `boxFill`, `ellipsoid`, `capsule` for limbs of radius >= 1, `line3` for thinner
  ones (its 3D DDA crosses faces, so thin limbs stay 6-connected).
- **Noise**: `makeNoise(seed)` value noise and fbm; `hash01` for per-feature decisions.
- **Vegetation**: `growBranches` (recursive branch skeletons), `placeClusters` (leaf and needle
  clumps along them), `carveCanopy` (gaps and depth), `shadeByExposure` (sky-occlusion tones).
- **Masses**: `blob`, a noise-displaced superellipsoid, and `facet`, which cleaves it along random
  planes so rock reads as broken stone rather than a pebble.

## The preview renderer

A DDA raymarcher with coarse empty-space skipping, a sun shadow ray, face ambient occlusion and a
ground plane, plus captioned contact sheets. Shadow and occlusion are not decoration: without them
a canopy cannot be judged.

```ts
import { renderEntity, contactSheet, encodePng } from "@voxolith/gen-kit/preview";
```

## Licence

MIT.
