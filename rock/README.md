# @voxolith/gen-rock

Procedural voxel rocks and boulders for [Voxolith](https://github.com/voxolith/engine). A rock is a
noise-displaced superellipsoid — round, blocky or slab-like — with a surface pass that hands out
mottled tones, sedimentary strata on a tilted bedding plane, cracks, moss on the upward faces,
lichen, a damp band at the base and optional snow. `outcrop` tumbles smaller rocks against a main
mass, kept as one connected piece.

```ts
import { generateRock, PRESETS } from "@voxolith/gen-rock";
import { seededRandom } from "@voxolith/renderer/core";

const { entity } = generateRock(PRESETS.boulder, seededRandom(42));
```

Presets: `boulder`, `sandstone`, `basalt`, `limestone`, `mossy`, `outcrop`, `pebbles`. Stone skins
swap by palette, so the same shape restyles without regenerating.

```sh
bun run verify              # connectivity, determinism, knobs, share codes
bun run preview species     # contact sheets into previews/
```
