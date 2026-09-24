<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# Voxolith generators

Pluggable entity generators for [Voxolith](https://github.com/voxolith/engine). Each folder is its
own npm package; they live together because they share an authoring toolkit,
[`kit/`](kit), and are almost always changed together. Generators *bake* models; the engine only
places and streams them and the renderer draws them.

| folder | package | what it makes |
|---|---|---|
| [`kit/`](kit) | [`@voxolith/gen-kit`](https://www.npmjs.com/package/@voxolith/gen-kit) | the shared toolkit and the headless preview renderer |
| [`tree/`](tree) | [`@voxolith/gen-tree`](https://www.npmjs.com/package/@voxolith/gen-tree) | broadleaf and conifer trees |
| [`bush/`](bush) | [`@voxolith/gen-bush`](https://www.npmjs.com/package/@voxolith/gen-bush) | shrubs, thickets, brambles, hedges |
| [`grass/`](grass) | [`@voxolith/gen-grass`](https://www.npmjs.com/package/@voxolith/gen-grass) | grass, meadow, reeds, ferns |
| [`rock/`](rock) | [`@voxolith/gen-rock`](https://www.npmjs.com/package/@voxolith/gen-rock) | boulders, outcrops, pebbles |
| [`building/`](building) | [`@voxolith/gen-building`](https://www.npmjs.com/package/@voxolith/gen-building) | cottages, farmhouses, townhouses, towers, barns |
| [`creature/`](creature) | [`@voxolith/gen-creature`](https://www.npmjs.com/package/@voxolith/gen-creature) | rigged, animated rats with layered internals |
| [`terrain/`](terrain) | [`@voxolith/gen-terrain`](https://www.npmjs.com/package/@voxolith/gen-terrain) | hills, a meandering river and lakes, streamed a brick at a time |

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
bun run typecheck        # every package
bun run verify           # headless checks: connectivity, determinism, share codes
bun run --cwd tree preview species   # contact sheets into tree/previews/
```

## The contract

[`contract/`](contract) (private, not published) checks every registered generator against
what the engine relies on: namespaced id and semver version, unique roles with colours in
0..1, defaults inside their own ParamSpecs, the same seed giving the same voxels (even after
other calls), params never mutated, voxel values within the declared roles, the anchor inside
the model, nothing floating (every voxel connected to the base), share codes rebuilding the
same model, and every parameter at its min, max and each enum option still generating.

```sh
bun run --cwd contract verify    # quick: defaults only (part of `bun run check`)
bun run --cwd contract full      # every parameter extreme (CI)
```

`gen-terrain` is not an entity generator and is not covered: it describes a region (a
heightfield and water), takes a seed rather than an rng, and has its own checks.

## Releasing

Tags are per package: `tree-v0.2.0` publishes `@voxolith/gen-tree`, `kit-v0.1.0` publishes
`@voxolith/gen-kit`. The version in the tag must match that package's `package.json`. Separate
cadences, rather than one shared version that would force a release of every package whenever one
changed. Publish `kit` before a generator release that needs a new kit.

## Licence

MIT.
