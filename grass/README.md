<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-grass

Procedural voxel ground cover for [Voxolith](https://github.com/voxolith/engine).

```ts
import { seededRandom } from "@voxolith/renderer/core";
import { generateGrass, PRESETS } from "@voxolith/gen-grass";

const { entity, stats } = generateGrass(PRESETS.meadow, seededRandom(42));
```

A patch is many independent blades, not one connected object. Tufts scatter
over a disc, each tuft fans a handful of blades out of the ground, and every
blade is a single stem one voxel thick that bends under its own weight. The
look comes almost entirely from three things: how far blades splay from
vertical, how hard they arc over, and the dark-to-tip gradient along each
blade. Whole blades dry off rather than individual voxels, because speckling
reads as noise instead of as a dry season.

Presets: `grass`, `meadow` (taller, with flower heads), `reeds` (upright, with
seed heads), `fern` (arching fronds carrying leaflets), `dry`.

Unlike a tree, the result is deliberately many pieces; the guarantee is that
every blade reaches the ground.

Branch growth, clump placement, canopy carving and exposure shading come from
[`@voxolith/gen-kit`](../kit), shared with the
tree and grass generators. Generation is pure and deterministic, touches no
filesystem, and returns an `Entity` whose voxels are colour role indices.

## Development

```sh
bun install
bun run verify           # every blade reaches the ground, budget, determinism
bun run preview species  # contact sheets into previews/ (also: seeds, seasons)
bun run gen              # bake .vox files into out/
```

## License

MIT
