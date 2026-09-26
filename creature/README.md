<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# @voxolith/gen-creature

Rigged, animated voxel creatures for [Voxolith](https://github.com/voxolith/engine). A rat first;
other small quadrupeds follow from the same shape and different parameters. The entity is a
rest-pose model whose voxels each know their bone, a 26-bone rig and generated clips (`walk`,
`turn-left`, `turn-right`, `run`, `idle`, `sniff`, `death`), played, blended and baked with
[`@voxolith/engine/animation`](https://voxolith.github.io/docs/engine/animation/). Under the fur
there is fat, flesh, muscle, a skeleton and organs, out of sight until `wound` carves the model or
`sever` takes a limb off. The presets are stylised game rats; `atScale(params, voxelsPerMetre)`
sizes one for a world with a fixed unit.

## Install

The package is **not on npm yet**. Until it is, clone
[voxolith/generators](https://github.com/voxolith/generators) next to `voxolith/renderer` and
`voxolith/engine` and link them from a bun workspace (`"@voxolith/gen-creature": "workspace:*"`); the
[installation guide](https://voxolith.github.io/docs/getting-started/installation/) has the
layout. Once published:

```sh
bun add @voxolith/gen-creature
```

## Quick start

```ts
import { seededRandom } from "@voxolith/renderer/core";
import { generateCreature, PRESETS } from "@voxolith/gen-creature";
import { bakePose, makeAnimator, poseMatrices } from "@voxolith/engine/animation";

const { entity } = generateCreature(PRESETS.rat, seededRandom(1));
const anim = makeAnimator(entity, "walk");
anim.update(dt);
const posed = bakePose(entity.model, entity.rig!, poseMatrices(entity.rig!, anim.pose()), { yaw });
```

## Documentation

- [Creature](https://voxolith.github.io/docs/generators/creature/): rig and clips, the inside, resolution rules, real scale, presets
- [Animation](https://voxolith.github.io/docs/engine/animation/): playing, posing, baking and damage in the engine
- [Stamping and crowds](https://voxolith.github.io/docs/engine/stamping-and-crowds/): many animated rats on a budget, and what they cost
- [The contract](https://voxolith.github.io/docs/generators/the-contract/): what every generator is checked against
- [API reference](https://voxolith.github.io/docs/generators/api/gen-creature/)

## Development

```sh
bun install
bun run verify              # binding, hidden interior, chest slice, every clip in one piece, footfalls, damage
bun run preview species     # also: cut, clips, walk, turns; --scale 100 for the real-size rat
bun run bench               # crowd update and brick edits per frame, headless
```

## License

MIT
