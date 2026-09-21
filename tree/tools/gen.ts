// Bake .vox files for every preset, for the viewer, the editor or MagicaVoxel.
//   bun tools/gen.ts [season]

import { mkdirSync, writeFileSync } from "node:fs";
import { seededRandom } from "@voxolith/renderer/core";
import { entityToVox } from "@voxolith/engine/vox";
import { generateTree, PRESETS, PRESET_NAMES } from "../src/index";
import { cloneParams, type Season } from "../src/params";

const season = (process.argv[2] ?? "summer") as Season;
const OUT = new URL("../out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

for (const name of PRESET_NAMES) {
  const p = cloneParams(PRESETS[name]);
  p.look.season = season;
  const { entity, stats } = generateTree(p, seededRandom(21), name);
  const file = `${OUT}${name}-${season}.vox`;
  writeFileSync(file, new Uint8Array(entityToVox(entity)));
  console.log(
    `${name.padEnd(7)} ${entity.model.size.x}x${entity.model.size.y}x${entity.model.size.z} ` +
      `${String(stats.total).padStart(7)} voxels -> ${file}`,
  );
}
