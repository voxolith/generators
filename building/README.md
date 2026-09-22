# @voxolith/gen-building

Procedural voxel buildings for [Voxolith](https://github.com/voxolith/engine). A small shape
grammar lays out the mass (plinth, hollow storeys with floor slabs, a gable, hip or flat roof),
then detail passes work over it at roughly 2.5 voxels to the foot:

- **Walls**: brick in running bond, ashlar courses of varying height, plaster that spalls to show
  brick, or a timber frame with posts at every jamb and braced end bays. Mortar joints are recessed
  and timbers stand proud, so the walls have relief rather than just colour.
- **Trim**: quoins, string courses, a projecting plinth with a water table, a corniced parapet.
- **Windows**: set back in a reveal, framed, with glazing bars, a proud sill, a lintel or soldier
  course, slatted shutters and flower boxes. The glass is real glass to the renderer and a fraction
  of it glows.
- **Doors**: a panelled leaf with a glazed transom, handle and door case, or boarded barn doors
  with Z braces; a hood on brackets, a lamp, and stone steps up the plinth.
- **Roofs**: tile, slate or shingle laid in staggered courses with per-tile tone, or thatch with
  streaks, ragged eaves and a ligger ridge. Ridge cap, barge boards, rafter tails, gutters and
  downpipes; brick chimneys with a corbelled cap and hollow pots.
- **Weather**: streaks under sills, rising damp, moss on roofs and plinth.

```ts
import { generateBuilding, PRESETS } from "@voxolith/gen-building";
import { seededRandom } from "@voxolith/renderer/core";

const { entity } = generateBuilding(PRESETS.farmhouse, seededRandom(42));
```

Presets: `cottage`, `farmhouse`, `townhouse`, `tower`, `barn`. The four wall styles and four
roofings are separate from the geometry, and colours come from 32 roles, so a house restyles by
palette.

```sh
bun run verify              # connectivity, hollowness, openings, determinism, share codes
bun run preview species     # contact sheets into previews/: species|roofs|walls|seeds|closeup
```
