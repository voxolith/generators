# @voxolith/gen-terrain

Procedural voxel terrain for [Voxolith](https://github.com/voxolith/engine): rolling hills from
layered noise, a river that meanders along a noise contour and carves its own valley with sloping
banks and a width that swells into deep pools and pinches into shallow narrows along its course
(`river.widthVariation`, `river.widthScale`), lakes wherever the ground dips below the water level, and a surface chosen per column —
grass (drier up high), rock on steep slopes, sand on the banks, gravel and mud on the beds.
Water fills every flooded column with a `water` material the renderer animates.

It describes a region rather than a model, so it returns a heightfield, not an entity:

```ts
import { generateTerrain } from "@voxolith/gen-terrain";

const terrain = generateTerrain({ width: 1280, depth: 1280, height: 192 }, seed);
const { base } = palette.allocate(terrain.roles, "terrain");
// in a chunked world's generate(ctx):
ctx.edit({ ...ctx.box, y1: terrain.maxY() }, (cells, ox, oy, oz) => terrain.fillBrick(cells, ox, oy, oz, base));
```

- `heights` is sampled once and is yours to edit: a settlement levels pads into it before the
  world is built, and everything else reads the edited map.
- `fillBrick(cells, ox, oy, oz, base, top?)` writes one 8³ brick; `top` can override a column's
  top voxel with an absolute palette slot (a path, a yard).
- `heightAt`, `waterAt`, `waterDepth`, `topRole`, `roleAt` for placement rules, and
  `pick(origin, dir, { water })` to put a cursor or a lamp on the ground.
- `terrainHeight(params, seed)` is the height function on its own, pure in (x, z), for a world
  that streams columns without sampling the whole map.

```sh
bun run verify              # shape, river continuity, fillBrick vs roleAt, determinism, picking
bun run preview             # a shaded map into previews/map.png
```
