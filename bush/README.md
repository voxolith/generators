<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-bush

Procedural voxel shrubs for [Voxolith](https://github.com/voxolith/engine).

```ts
import { seededRandom } from "@voxolith/renderer/core";
import { generateBush, PRESETS } from "@voxolith/gen-bush";

const { entity, stats } = generateBush(PRESETS.thicket, seededRandom(42));
```

A bush is not a small tree. It has no trunk: several stems leave the ground
together and lean outward, which is what gives a shrub its vase silhouette. A
thicket scatters more clumps of stems around the centre, at unequal sizes, so
undergrowth reads as undergrowth rather than as a ring of tidy bushes.

Presets: `bush`, `thicket`, `bramble` (long arching canes, thorns, berries),
`flowering`, `hedge` (clipped and dense). Four seasons; deciduous species go
bare in winter and take snow, the hedge stays green.

Branch growth, clump placement, canopy carving and exposure shading come from
[`@voxolith/engine/build`](https://github.com/voxolith/engine), shared with the
tree and grass generators. Generation is pure and deterministic, touches no
filesystem, and returns an `Entity` whose voxels are colour role indices.

## Development

```sh
bun install
bun run verify           # connectivity to the ground, budget, determinism
bun run preview species  # contact sheets into previews/ (also: seeds, seasons)
bun run gen              # bake .vox files into out/
```

## License

MIT
