// Contact sheets for iterating on the look.
//   bun tools/preview.ts [round] [--width N] [--seeds N]

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
const W = flag("width", 300);
const H = Math.round(W * 1.05);
const SEEDS = flag("seeds", 3);
const OUT = new URL("../previews/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function cell(params: unknown, seed: number, label: string): SheetCell {
  const { entity, stats } = GENERATE(params as never, seededRandom(seed), label);
  const render = renderEntity(entity, { width: W, height: H, yawDeg: 34, pitchDeg: 16 });
  console.log(
    `  ${label.padEnd(20)} ${String(stats.total).padStart(7)} vox ` +
      `${entity.model.size.x}x${entity.model.size.y}x${entity.model.size.z} ${stats.ms.toFixed(0)}+${render.ms.toFixed(0)} ms`,
  );
  return { render, label };
}

const cells: SheetCell[] = [];
let cols = PRESET_NAMES.length;
let title = round;

if (round === "species") {
  title = "presets";
  for (const name of PRESET_NAMES) cells.push(cell(PRESETS[name], 21, name));
} else if (round === "seeds") {
  title = "variation";
  cols = SEEDS;
  for (const name of PRESET_NAMES.slice(0, 2))
    for (let s = 0; s < SEEDS; s++) cells.push(cell(PRESETS[name], 100 + s, `${name} s${s}`));
} else if (round === "seasons") {
  title = "seasons";
  cols = 4;
  for (const name of PRESET_NAMES.slice(0, 2))
    for (const season of ["spring", "summer", "autumn", "winter"] as const) {
      const p = JSON.parse(JSON.stringify(PRESETS[name]));
      p.look.season = season;
      cells.push(cell(p, 12, `${name} ${season}`));
    }
} else {
  console.error(`unknown round "${round}"; try species, seeds, seasons`);
  process.exit(1);
}

const sheet = contactSheet(cells, { cols, title });
const file = `${OUT}${round}.png`;
writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.rgb));
console.log(`\nwrote ${file} (${sheet.width}x${sheet.height})`);
