// Bake .vox files for every preset.  bun tools/gen.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { seededRandom } from "@voxolith/renderer/core";
import { entityToVox } from "@voxolith/engine/vox";
import { PRESETS, PRESET_NAMES } from "../src/index";
import { GENERATE } from "./shared";

const OUT = new URL("../out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

for (const name of PRESET_NAMES) {
  const { entity, stats } = GENERATE(PRESETS[name], seededRandom(21), name);
  const file = `${OUT}${name}.vox`;
  writeFileSync(file, new Uint8Array(entityToVox(entity)));
  console.log(`${name.padEnd(10)} ${entity.model.size.x}x${entity.model.size.y}x${entity.model.size.z} ${String(stats.total).padStart(7)} voxels -> ${file}`);
}
