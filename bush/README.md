<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-bush

Procedural voxel shrubs for [Voxolith](https://github.com/voxolith/engine). A bush is not a small
tree: it has no trunk, several stems leave the ground together and lean outward into a vase
silhouette, and a thicket scatters unequal clumps so undergrowth reads as undergrowth. Presets
`bush`, `thicket`, `bramble`, `flowering` and `hedge`, in four seasons. Branch growth, clump
placement, canopy carving and exposure shading come from [`@voxolith/gen-kit`](../kit), shared with
the tree and grass generators. Generation is pure and deterministic, touches no filesystem, and
returns an `Entity` whose voxels are colour role indices.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-bush": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-bush
```

## Quick start

```ts
import { seededRandom } from "@voxolith/renderer/core";
import { generateBush, PRESETS } from "@voxolith/gen-bush";

const { entity, stats } = generateBush(PRESETS.thicket, seededRandom(42));
```

## Documentation

- [Bush](https://voxolith.github.io/docs/generators/bush/): presets, parameters, how it works, finer scales
- [Using generators](https://voxolith.github.io/docs/generators/using-generators/): direct calls, the registry, workers, variant pools
- [Scales and refinement](https://voxolith.github.io/docs/generators/scales-and-refinement/): the same bush at 50 or 100 voxels per metre
- [The contract](https://voxolith.github.io/docs/generators/the-contract/): what every generator is checked against
- [API reference](https://voxolith.github.io/docs/generators/api/gen-bush/)

## Development

```sh
bun install
bun run verify           # connectivity to the ground, budget, determinism
bun run preview species  # contact sheets into previews/ (also: seeds, seasons)
bun run gen              # bake .vox files into out/
```

## License

MIT
