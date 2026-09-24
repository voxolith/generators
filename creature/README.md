# @voxolith/gen-creature

Rigged, animated voxel creatures for [Voxolith](https://github.com/voxolith/engine). A rat
first; other small quadrupeds follow from the same shape and different parameters.

The entity is a rest-pose model whose voxels each know their bone, a 26-bone rig (pelvis,
spine, chest, neck, head, ears, a 7-bone tail, three bones per leg) and generated clips: `walk`,
`turn-left`, `turn-right`, `run`, `idle`, `sniff`, `death`. Play, blend and bake them with
[`@voxolith/engine/animation`](https://github.com/voxolith/engine#animation).

Under the fur there is fat, flesh and muscle by depth, a skeleton down the spine, legs and tail,
a skull around a brain, lungs and a heart in the chest and a gut in the belly — out of sight
until `wound` carves the model or `sever` takes a limb off. When a pose uncovers flesh that was
buried at rest (under a swinging haunch), the rig's `cover` table draws it as fur, so only
damage ever shows the inside.

## Resolution

Chosen so it animates without losing the voxel look:
- nothing animated is thinner than 2 voxels, except the tail's last third;
- at least 4 voxels between joints, so a 15° bend moves a limb end by a voxel;
- the detail budget goes to the head (eyes, ears, snout, incisors), the body stays simple masses;
- legs are longer than a real rat's (`legLength` 1.5): a real rat's legs hide under its belly,
  and a gait nobody can see does not read.

The default rat is about 3.5k voxels, 26 bones, and bakes a posed model in about 2 ms.

```ts
import { generateCreature, PRESETS } from "@voxolith/gen-creature";
import { bakePose, makeAnimator, poseMatrices } from "@voxolith/engine/animation";

const { entity } = generateCreature(PRESETS.rat, seededRandom(1));
const anim = makeAnimator(entity, "walk");
anim.update(dt);
const posed = bakePose(entity.model, entity.rig!, poseMatrices(entity.rig!, anim.pose()), { yaw });
```

```sh
bun run verify              # binding, hidden interior, chest slice, every clip in one piece, footfalls, damage
bun run preview species     # also: cut, clips, walk, turns
```
