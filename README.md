<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# Voxolith generators

Pluggable entity generators for [Voxolith](https://github.com/voxolith/engine). Each folder is its
own npm package; they live together because they share a pipeline — `growBranches`,
`placeClusters`, `carveCanopy` and `shadeByExposure` from `@voxolith/engine/build` — and are almost
always changed together.

| folder | package | what it makes |
|---|---|---|
| [`tree/`](tree) | [`@voxolith/gen-tree`](https://www.npmjs.com/package/@voxolith/gen-tree) | broadleaf and conifer trees |
| [`bush/`](bush) | [`@voxolith/gen-bush`](https://www.npmjs.com/package/@voxolith/gen-bush) | shrubs, thickets, brambles, hedges |
| [`grass/`](grass) | [`@voxolith/gen-grass`](https://www.npmjs.com/package/@voxolith/gen-grass) | grass, meadow, reeds, ferns |
| [`rock/`](rock) | [`@voxolith/gen-rock`](https://www.npmjs.com/package/@voxolith/gen-rock) | boulders, outcrops, pebbles |
| [`building/`](building) | [`@voxolith/gen-building`](https://www.npmjs.com/package/@voxolith/gen-building) | cottages, farmhouses, townhouses, towers, barns |

A generator is pure and deterministic: everything random comes from an injected rng, so the same
parameters and seed always rebuild the same voxels. That is what lets a model be described by a
short share code — try one in the [viewer](https://voxolith.github.io/viewer/).

```ts
import { generateTree, PRESETS } from "@voxolith/gen-tree";
import { seededRandom } from "@voxolith/renderer/core";

const { entity } = generateTree(PRESETS.oak, seededRandom(42));
```

## Working on them

Clone alongside `voxolith/renderer` and `voxolith/engine` and run `bun install` from a workspace
root that lists all three — or use the [workspace layout](https://github.com/voxolith) that links
them for you.

```sh
bun run typecheck        # all three
bun run verify           # headless checks: connectivity, determinism, share codes
bun run --cwd tree preview species   # contact sheets into tree/previews/
```

## Releasing

Tags are per package: `tree-v0.2.0` publishes `@voxolith/gen-tree`. The version in the tag must
match that package's `package.json`. Three packages with separate cadences, rather than one shared
version that would force a release of all three whenever one changed.

## Licence

MIT.
