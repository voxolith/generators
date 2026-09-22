# @voxolith/gen-building

Procedural voxel buildings for [Voxolith](https://github.com/voxolith/engine): a small shape
grammar. A plinth, a stack of hollow storeys with floor slabs, windows cut on a rhythm and a door
on the front, quoins or timber framing, and a gable, hip or flat roof with eaves, a ridge and
chimneys. Windows are real glass to the renderer and a fraction of them glow.

```ts
import { generateBuilding, PRESETS } from "@voxolith/gen-building";
import { seededRandom } from "@voxolith/renderer/core";

const { entity } = generateBuilding(PRESETS.farmhouse, seededRandom(42));
```

Presets: `cottage`, `farmhouse`, `townhouse`, `tower`, `barn`. Four wall styles and four roofings
swap by palette.

```sh
bun run verify              # connectivity, hollowness, openings, determinism, share codes
bun run preview species     # contact sheets into previews/
```
