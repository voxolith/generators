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

## Finer scales

Parameters are written in 10 voxels per metre. Every entity generator also builds at 50 and 100
(`generate(params, rng, { voxelsPerMetre: 100 })`, listed in its `scales`): the same design,
built at its native scale and then refined by gen-kit's `refine` with the generator's own
rules. Trees, bushes and grass redraw their limbs and blades from their skeletons, thinner than
a coarse voxel allows, with single leaves or needles in the coarse shading; buildings get bricks,
stone courses, tiles, slates, thatch, boards and planks at real size (their rooms are skipped);
rocks round off with grain and hairline cracks. The creature is already authored near that
scale; `atScale` sizes it. Results are sparse models of a few to a few tens of MB of GPU bricks,
in 0.1 to 3 seconds each.

```ts
const oak = generateTree(PRESETS.oak, seededRandom(42), "oak", { voxelsPerMetre: 100 }).entity;
oak.model.sparse; // 8^3 bricks; draw with renderer.addModel / setInstances
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
same model, and every parameter at its min, max and each enum option still generating. At each
finer scale a generator lists, the model must be sparse, exactly k times the native size,
deterministic, within its roles, with the anchor scaled, its structure grounded (the
`looseRoles`, single leaves and petals, may float), within 20 s and 96 MB of GPU bricks.

```sh
bun run --cwd contract verify    # quick: defaults only (part of `bun run check`)
bun run --cwd contract full      # every parameter extreme and every finer scale (CI)
bun run --cwd contract fine      # defaults at the finer scales only
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
