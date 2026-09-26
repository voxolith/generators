<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-grass

Procedural voxel ground cover for [Voxolith](https://github.com/voxolith/engine). A patch is many
independent blades, not one connected object: tufts scatter over a disc, each fans a handful of
one-voxel blades out of the ground, and the look comes from how far they splay, how hard they arc
and the dark-to-tip gradient along each. Presets `grass`, `meadow`, `reeds`, `fern` and `dry`; the
guarantee is that every blade reaches the ground. Branch growth, clump placement, canopy carving
and exposure shading come from [`@voxolith/gen-kit`](../kit), shared with the tree and bush
generators. Generation is pure and deterministic, touches no filesystem, and returns an `Entity`
whose voxels are colour role indices.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-grass": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-grass
```

## Quick start

```ts
import { seededRandom } from "@voxolith/renderer/core";
import { generateGrass, PRESETS } from "@voxolith/gen-grass";

const { entity, stats } = generateGrass(PRESETS.meadow, seededRandom(42));
```

## Documentation

- [Grass](https://voxolith.github.io/docs/generators/grass/): presets, parameters, how it works, finer scales
- [Using generators](https://voxolith.github.io/docs/generators/using-generators/): direct calls, the registry, workers, variant pools
- [Scales and refinement](https://voxolith.github.io/docs/generators/scales-and-refinement/): the same patch at 50 or 100 voxels per metre
- [The contract](https://voxolith.github.io/docs/generators/the-contract/): what every generator is checked against
- [API reference](https://voxolith.github.io/docs/generators/api/gen-grass/)

## Development

```sh
bun install
bun run verify           # every blade reaches the ground, budget, determinism
bun run preview species  # contact sheets into previews/ (also: seeds, seasons)
bun run gen              # bake .vox files into out/
```

## License

MIT
