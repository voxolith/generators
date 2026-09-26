<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# Voxolith generators

Pluggable entity generators for [Voxolith](https://github.com/voxolith/engine). Each folder is its
own package; they live together because they share an authoring toolkit, [`kit/`](kit), and are
almost always changed together. Generators *bake* models; the engine only places and streams them
and the renderer draws them. A generator is pure and deterministic: everything random comes from
an injected rng, so the same parameters and seed always rebuild the same voxels, which is what
lets a model be described by a short share code (try one in the
[viewer](https://voxolith.github.io/viewer/)). Parameters are written in 10 voxels per metre, and
every entity generator also builds the same design at 50 and 100.

| folder | package | what it makes |
|---|---|---|
| [`kit/`](kit) | `@voxolith/gen-kit` | the shared toolkit and the headless preview renderer |
| [`tree/`](tree) | `@voxolith/gen-tree` | broadleaf and conifer trees |
| [`bush/`](bush) | `@voxolith/gen-bush` | shrubs, thickets, brambles, hedges |
| [`grass/`](grass) | `@voxolith/gen-grass` | grass, meadow, reeds, ferns |
| [`rock/`](rock) | `@voxolith/gen-rock` | boulders, outcrops, pebbles |
| [`building/`](building) | `@voxolith/gen-building` | cottages, farmhouses, townhouses, towers, barns |
| [`creature/`](creature) | `@voxolith/gen-creature` | rigged, animated rats with layered internals |
| [`terrain/`](terrain) | `@voxolith/gen-terrain` | hills, a meandering river and lakes, streamed a brick at a time |

## Install

The packages are **not on npm yet**. Until they are, clone this repo next to `voxolith/renderer`
and `voxolith/engine` and link them from a bun workspace that lists `generators/*`; the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published, add the ones you use:

```sh
bun add @voxolith/gen-tree @voxolith/gen-terrain
```

## Quick start

```ts
import { generateTree, PRESETS } from "@voxolith/gen-tree";
import { seededRandom } from "@voxolith/renderer/core";

const { entity } = generateTree(PRESETS.oak, seededRandom(42));
// The same design at 100 voxels per metre, as a sparse model for renderer.addModel / setInstances:
const fine = generateTree(PRESETS.oak, seededRandom(42), "oak", { voxelsPerMetre: 100 }).entity;
```

## Documentation

The long-form material lives on the documentation site, in the
[generators section](https://voxolith.github.io/docs/generators/), with a page per generator:

- [Using generators](https://voxolith.github.io/docs/generators/using-generators/): direct calls, the registry, presets, workers, variant pools
- [Scales and refinement](https://voxolith.github.io/docs/generators/scales-and-refinement/): how a 10 vox/m design becomes a sparse model at 50 or 100
- [The contract](https://voxolith.github.io/docs/generators/the-contract/): what every registered generator is checked against
- [Share codes](https://voxolith.github.io/docs/generators/share-codes/)
- [The toolkit](https://voxolith.github.io/docs/generators/gen-kit/) and [Writing a generator](https://voxolith.github.io/docs/generators/gen-kit/writing-a-generator/)
- API reference per package: [gen-kit](https://voxolith.github.io/docs/generators/api/gen-kit/),
  [gen-tree](https://voxolith.github.io/docs/generators/api/gen-tree/),
  [gen-bush](https://voxolith.github.io/docs/generators/api/gen-bush/),
  [gen-grass](https://voxolith.github.io/docs/generators/api/gen-grass/),
  [gen-rock](https://voxolith.github.io/docs/generators/api/gen-rock/),
  [gen-building](https://voxolith.github.io/docs/generators/api/gen-building/),
  [gen-creature](https://voxolith.github.io/docs/generators/api/gen-creature/),
  [gen-terrain](https://voxolith.github.io/docs/generators/api/gen-terrain/)

## Working on them

Clone alongside `voxolith/renderer` and `voxolith/engine` and run `bun install` from a workspace
root that lists all three — or use the [workspace layout](https://github.com/voxolith) that links
them for you.

```sh
bun run typecheck        # every package
bun run verify           # headless checks: connectivity, determinism, share codes
bun run --cwd tree preview species   # contact sheets into tree/previews/
```

[`contract/`](contract) (private, not published) checks every registered entity generator against
what the engine relies on; `gen-terrain` describes a region, not a model, and has its own checks.

```sh
bun run --cwd contract verify    # quick: defaults only (part of `bun run check`)
bun run --cwd contract full      # every parameter extreme and every finer scale (CI)
bun run --cwd contract fine      # defaults at the finer scales only
```

## Releasing

Tags are per package: `tree-v0.2.0` publishes `@voxolith/gen-tree`, `kit-v0.1.0` publishes
`@voxolith/gen-kit`. The version in the tag must match that package's `package.json`. Separate
cadences, rather than one shared version that would force a release of every package whenever one
changed. Publish `kit` before a generator release that needs a new kit.

## Licence

MIT.
