<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-rock

Procedural voxel rocks and boulders for [Voxolith](https://github.com/voxolith/engine). A rock is a
noise-displaced superellipsoid — round, blocky or slab-like — with a surface pass that hands out
mottled tones, strata, cracks, moss, lichen, a damp band at the base and optional snow; `outcrop`
tumbles smaller rocks against a main mass, kept as one connected piece. Presets `boulder`,
`sandstone`, `basalt`, `limestone`, `mossy`, `outcrop` and `pebbles`. Stone skins swap by palette,
so the same shape restyles without regenerating.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-rock": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-rock
```

## Quick start

```ts
import { generateRock, PRESETS } from "@voxolith/gen-rock";
import { seededRandom } from "@voxolith/renderer/core";

const { entity } = generateRock(PRESETS.boulder, seededRandom(42));
```

## Documentation

- [Rock](https://voxolith.github.io/docs/generators/rock/): presets, parameters, how it works, finer scales
- [Using generators](https://voxolith.github.io/docs/generators/using-generators/): direct calls, the registry, workers, variant pools
- [Scales and refinement](https://voxolith.github.io/docs/generators/scales-and-refinement/): the same rock at 50 or 100 voxels per metre
- [The contract](https://voxolith.github.io/docs/generators/the-contract/): what every generator is checked against
- [API reference](https://voxolith.github.io/docs/generators/api/gen-rock/)

## Development

```sh
bun install
bun run verify              # connectivity, determinism, knobs, share codes
bun run preview species     # contact sheets into previews/
bun run gen                 # bake .vox files into out/
```

## License

MIT
