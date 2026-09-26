<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-building

Procedural voxel buildings for [Voxolith](https://github.com/voxolith/engine). A small shape
grammar lays out the mass (plinth, hollow storeys with floor slabs, a gable, hip or flat roof),
then detail passes work over it: walls in brick, ashlar, plaster or timber frame with real relief,
trim, set-back windows with real glass, doors, roofs in tile, slate, shingle or thatch, chimneys
and weathering. Presets `cottage`, `farmhouse`, `townhouse`, `tower` and `barn`. The wall styles
and roofings are separate from the geometry, and colours come from 32 roles, so a house restyles
by palette.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-building": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-building
```

## Quick start

```ts
import { generateBuilding, PRESETS } from "@voxolith/gen-building";
import { seededRandom } from "@voxolith/renderer/core";

const { entity } = generateBuilding(PRESETS.farmhouse, seededRandom(42));
```

## Documentation

- [Building](https://voxolith.github.io/docs/generators/building/): presets, parameters, how it works, finer scales
- [Using generators](https://voxolith.github.io/docs/generators/using-generators/): direct calls, the registry, workers, variant pools
- [Scales and refinement](https://voxolith.github.io/docs/generators/scales-and-refinement/): masonry, tiles and boards at real size at 50 or 100 voxels per metre
- [The contract](https://voxolith.github.io/docs/generators/the-contract/): what every generator is checked against
- [API reference](https://voxolith.github.io/docs/generators/api/gen-building/)

## Development

```sh
bun install
bun run verify              # connectivity, hollowness, openings, determinism, share codes
bun run preview species     # contact sheets into previews/: species|roofs|walls|seeds|closeup
bun run gen                 # bake .vox files into out/
```

## License

MIT
