<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-kit

The authoring toolkit Voxolith generators are written with, plus the headless renderer used to
judge what they make: dense volumes, capsule and DDA rasterisers, seeded noise, branch growth,
clusters, canopy carving and shading, rock masses, refinement to finer scales and rigged volumes.
Generators *bake* models with it; the engine only places and streams those models, and the
renderer draws them. Nothing here is needed at runtime by a host that loads baked `.vox` files.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-kit": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-kit
```

## Entry points

| import | contents |
|---|---|
| `@voxolith/gen-kit` | `Volume`, voxel primitives, seeded noise, branch growth, clusters, canopy carving, rock masses, refinement |
| `@voxolith/gen-kit/preview` | CPU raymarcher, contact sheets, PNG writer (Node/bun only: uses node:zlib) |

## Quick start

```ts
import { Volume, capsule } from "@voxolith/gen-kit";
import { encodePng, renderModel } from "@voxolith/gen-kit/preview";

const WOOD = 1; // role index: roles[WOOD - 1] describes it
const vol = new Volume(32, 48, 32);
capsule(vol, [16, 0, 16], [16, 40, 16], 4, 2, WOOD); // radius >= 1: capsule; thinner: line3
const model = vol.crop([16, 0, 16], [{ id: "wood", name: "Wood", color: [0.4, 0.3, 0.2] }]);

const { width, height, rgb } = renderModel(model);
await Bun.write("post.png", encodePng(width, height, rgb));
```

A generator starts from an existing one of the same shape (rock for solid masses, bush for
vegetation) rather than from scratch; [Writing a generator](https://voxolith.github.io/docs/generators/gen-kit/writing-a-generator/)
walks through it.

## Documentation

- [The toolkit](https://voxolith.github.io/docs/generators/gen-kit/): volumes, primitives, noise, vegetation, masses, refinement, redrawing
- [Writing a generator](https://voxolith.github.io/docs/generators/gen-kit/writing-a-generator/): a new package, step by step
- [The preview renderer](https://voxolith.github.io/docs/generators/gen-kit/preview/): renders and contact sheets for judging output
- [Scales and refinement](https://voxolith.github.io/docs/generators/scales-and-refinement/): `refine`, role rules, `drawSkeletonFine`
- [API reference](https://voxolith.github.io/docs/generators/api/gen-kit/)

## Development

```sh
bun run typecheck
bun run verify
```

## Licence

MIT.
