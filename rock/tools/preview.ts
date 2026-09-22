// Contact sheets for iterating on the look.
//   bun tools/preview.ts [species|seeds|roughness|angularity] [--width N] [--seeds N]

import { mkdirSync, writeFileSync } from "node:fs";
import { seededRandom } from "@voxolith/renderer/core";
import { contactSheet, encodePng, renderEntity, type SheetCell } from "@voxolith/engine/preview";
import { PRESETS, PRESET_NAMES } from "../src/index";
import { GENERATE } from "./shared";

const args = process.argv.slice(2);
const round = args.find((a) => !a.startsWith("--")) ?? "species";
const flag = (n: string, d: number) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d;
};
const W = flag("width", 260);
const H = Math.round(W * 0.9);
const SEEDS = flag("seeds", 3);
const OUT = new URL("../previews/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function cell(params: unknown, seed: number, label: string): SheetCell {
  const { entity, stats } = GENERATE(params as never, seededRandom(seed), label);
  const render = renderEntity(entity, { width: W, height: H, yawDeg: 34, pitchDeg: 22 });
  console.log(
    `  ${label.padEnd(20)} ${String(stats.total).padStart(7)} vox ` +
      `${entity.model.size.x}x${entity.model.size.y}x${entity.model.size.z} ${stats.ms.toFixed(0)}+${render.ms.toFixed(0)} ms`,
  );
  return { render, label };
}

const cells: SheetCell[] = [];
let cols = PRESET_NAMES.length;
let title = round;
const clone = (p: unknown) => JSON.parse(JSON.stringify(p));

if (round === "species") {
  title = "presets";
  for (const name of PRESET_NAMES) cells.push(cell(PRESETS[name], 21, name));
} else if (round === "seeds") {
  cols = SEEDS;
  for (const name of ["boulder", "outcrop", "basalt"])
    for (let s = 0; s < SEEDS; s++) cells.push(cell(PRESETS[name], 100 + s * 7, `${name} #${s}`));
} else if (round === "roughness") {
  cols = 4;
  for (const r of [0, 0.08, 0.16, 0.3]) {
    const p = clone(PRESETS.boulder); p.shape.roughness = r;
    cells.push(cell(p, 21, `rough ${r}`));
  }
  for (const d of [0.8, 1.6, 2.8, 4.5]) {
    const p = clone(PRESETS.boulder); p.shape.detail = d;
    cells.push(cell(p, 21, `detail ${d}`));
  }
} else if (round === "angularity") {
  cols = 4;
  for (const e of [2, 3, 5, 8]) {
    const p = clone(PRESETS.boulder); p.shape.exponent = e;
    cells.push(cell(p, 21, `exp ${e}`));
  }
  for (const a of [0.35, 0.6, 0.9, 1.3]) {
    const p = clone(PRESETS.boulder); p.shape.aspect = a;
    cells.push(cell(p, 21, `aspect ${a}`));
  }
}

const sheet = contactSheet(cells, cols, title);
const file = `${OUT}${round}.png`;
writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.rgb));
console.log(`wrote ${file} (${sheet.width}x${sheet.height})`);
