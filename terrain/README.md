<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-terrain

Procedural voxel terrain for [Voxolith](https://github.com/voxolith/engine): rolling hills from
layered noise, a river that meanders along a noise contour and carves its own valley, swelling
into deep pools and pinching into shallow narrows, lakes wherever the ground dips below the water
level, and a surface chosen per column — grass, rock on steep slopes, sand on the banks, gravel and
mud on the beds. Water fills every flooded column with a `water` material the renderer animates.
It describes a region rather than a model, so it returns an editable heightfield, per-brick
filling, per-column queries and `pick`, not an entity; `refineTerrain` gives the same terrain k
times finer, streamed a brick at a time.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-terrain": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-terrain
```

## Quick start

```ts
import { generateTerrain } from "@voxolith/gen-terrain";

const terrain = generateTerrain({ width: 1280, depth: 1280, height: 192 }, seed);
const { base } = palette.allocate(terrain.roles, "terrain");
// in a chunked world's generate(ctx):
ctx.edit({ ...ctx.box, y1: terrain.maxY() }, (cells, ox, oy, oz) => terrain.fillBrick(cells, ox, oy, oz, base));
```

## Documentation

- [Terrain](https://voxolith.github.io/docs/generators/terrain/): parameters, the region (`heights`, `fillBrick`, queries, `pick`), finer terrain
- [Streaming](https://voxolith.github.io/docs/manual/streaming/): chunked worlds and streaming the fine ground
- [Placement and worlds](https://voxolith.github.io/docs/engine/placement-and-worlds/): the engine's chunked worlds
- [API reference](https://voxolith.github.io/docs/generators/api/gen-terrain/)

## Development

```sh
bun install
bun run verify              # shape, river continuity, fillBrick vs roleAt, determinism, picking
bun run preview             # a shaded map into previews/map.png
```

## License

MIT
