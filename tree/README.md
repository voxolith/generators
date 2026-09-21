<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-tree

Procedural voxel trees for [Voxolith](https://github.com/voxolith/engine). Broadleaf and conifer
families from one pipeline, tuned for tall detailed models (around 192 voxels) where bark texture
and individual twigs are visible.

```ts
import { seededRandom } from "@voxolith/renderer/core";
import { generateTree, PRESETS } from "@voxolith/gen-tree";

const { entity, stats } = generateTree(PRESETS.oak, seededRandom(42));
// entity.model is a dense Y-up grid of role indices, anchored at the trunk base
```

Generation is pure and deterministic: the same parameters and seed always give the same tree.
Nothing touches the filesystem, and the result is a plain `Entity` the host can place, restyle or
bake to `.vox`.

## How it works

1. **Skeleton.** Branch polylines with radii, grown before any voxel exists. Children start on the
   parent's axis so the tree is one connected piece; child radius follows a pipe model so forks
   conserve visual mass; direction wobble is coherent noise sampled in space, which reads as
   character rather than as a wiggly noodle.
2. **Wood.** Limbs of at least one voxel radius are rasterised as exact tapered capsules. Thinner
   twigs walk their axis with a 3D DDA, which crosses voxel faces and so is 6-connected by
   construction — sphere-stamping thin segments produces twigs that a connectivity check treats as
   detached.
3. **Bark**, surface only. Furrow frequency scales with the local radius, so wavelength stays
   constant in voxels as the trunk tapers. Branches below a radius threshold take a flat colour;
   dithering a two-voxel twig is what makes bark look like noise.
4. **Foliage.** Clusters hang off real twigs, never a global envelope, so the crown inherits the
   irregularity of the branching instead of reading as a lollipop. A shell hollow throws away buried
   leaves and a macro carve punches sky holes.
5. **Colour**, scored from how far out, how high and how exposed each leaf is, with accents chosen
   per cluster.
6. **Prune**, so the result is always a single 6-connected component.

## Roles, not colours

Voxel values are role indices (`bark.dark`, `leaf.edge`, `snow`, …), and a host maps them to palette
slots. That lets one tree be restyled for a season or a biome without regenerating it, and lets many
entities share the renderer's 256-slot palette.

## Presets and parameters

`oak`, `maple`, `birch`, `spruce`, `pine`. Parameters split into `shape` and `foliage` (which voxels
exist) and `look` (which role each voxel gets), so a UI can re-run the cheap colour pass while
caching the geometry. Everything measured in voxels is tuned for a 192-tall tree and scales with
`shape.height`.

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
