<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-tree

Procedural voxel trees for [Voxolith](https://github.com/voxolith/engine). Broadleaf and conifer
families (`oak`, `maple`, `birch`, `spruce`, `pine`) from one pipeline, tuned for tall detailed
models (around 192 voxels) where bark texture and individual twigs are visible. Generation is pure
and deterministic: the same parameters and seed always give the same tree. Nothing touches the
filesystem, and the result is a plain `Entity` whose voxels are colour role indices, which the host
can place, restyle for a season or biome, or bake to `.vox`.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-tree": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-tree
```

## Quick start

```ts
import { seededRandom } from "@voxolith/renderer/core";
import { generateTree, PRESETS } from "@voxolith/gen-tree";

const { entity, stats } = generateTree(PRESETS.oak, seededRandom(42));
// entity.model is a dense Y-up grid of role indices, anchored at the trunk base
```

## Documentation

- [Tree](https://voxolith.github.io/docs/generators/tree/): presets, parameters, how it works, finer scales
- [Using generators](https://voxolith.github.io/docs/generators/using-generators/): direct calls, the registry, workers, variant pools
- [Scales and refinement](https://voxolith.github.io/docs/generators/scales-and-refinement/): the same tree at 50 or 100 voxels per metre
- [The contract](https://voxolith.github.io/docs/generators/the-contract/): what every generator is checked against
- [API reference](https://voxolith.github.io/docs/generators/api/gen-tree/)

## Development

```sh
bun install
bun run verify                  # headless checks: connectivity, budget, determinism
bun run preview skeleton        # contact sheets in previews/
bun run preview foliage         # also: bark, shell, resolution, species, seasons
bun run gen                     # bake .vox files into out/
bun tools/debug.ts oak 100      # per-level skeleton report for tuning
```

## License

MIT
