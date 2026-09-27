// Contact sheets of every entity generator at its finer scales.
//   bun tools/fine-preview.ts [--width N] [--vpm 20,50] [--out dir]
// Per generator and scale: the whole model, then a close-up of its middle;
// previews/fine.png (or <dir>/fine.png). Every scale in `gen.scales` unless
// --vpm picks some. For judging refinement by eye.

import { mkdirSync, writeFileSync } from "node:fs";
import { seededRandom } from "@voxolith/renderer/core";
import { listGenerators } from "@voxolith/engine";
import { contactSheet, encodePng, renderEntity, type SheetCell } from "@voxolith/gen-kit/preview";
import { registerTreeGenerators } from "@voxolith/gen-tree";
import { registerBushGenerators } from "@voxolith/gen-bush";
import { registerGrassGenerators } from "@voxolith/gen-grass";
import { registerRockGenerators } from "@voxolith/gen-rock";
import { registerBuildingGenerators } from "@voxolith/gen-building";

registerTreeGenerators();
registerBushGenerators();
registerGrassGenerators();
registerRockGenerators();
registerBuildingGenerators();

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const W = Number(opt("--width") ?? 0) || 300;
const only = opt("--vpm")?.split(",").map(Number);
const OUT = opt("--out") ? `${opt("--out")!.replace(/\/$/, "")}/` : new URL("../previews/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const cells: SheetCell[] = [];
for (const gen of listGenerators()) {
  for (const vpm of (gen.scales ?? []).filter((v) => !only || only.includes(v))) {
    const t0 = performance.now();
    const e = gen.generate(structuredClone(gen.defaults), seededRandom(7), { voxelsPerMetre: vpm });
    const ms = performance.now() - t0;
    const mb = ((e.model.sparse?.bricks.size ?? 0) * 288) / 1048576;
    const view = { width: W, height: Math.round(W * 0.8), yawDeg: 35, pitchDeg: 16 };
    cells.push({ render: renderEntity(e, view), label: `${gen.id.replace("voxolith/", "")} ${vpm}/m ${(ms / 1000).toFixed(1)}s ${mb.toFixed(0)}MB` });
    cells.push({ render: renderEntity(e, { ...view, zoom: 0.22, aimY: 0.45, pitchDeg: 12 }), label: "close" });
    console.log(`${gen.id} at ${vpm} vox/m: ${(ms / 1000).toFixed(1)} s, ${mb.toFixed(0)} MB`);
  }
}
const sheet = contactSheet(cells, { cols: 4, title: only ? `every generator at ${only.join(", ")} voxels per metre` : "every generator at its finer scales" });
writeFileSync(`${OUT}fine.png`, encodePng(sheet.width, sheet.height, sheet.rgb));
console.log(`wrote ${OUT}fine.png`);
