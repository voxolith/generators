// Contact sheets for iterating on the look.
//
//   bun tools/preview.ts <round> [--width N] [--seeds N]
//
// Rounds follow the order the look is decided in: shape first, then bark, then
// foliage, then resolution, then the whole species set.

import { mkdirSync, writeFileSync } from "node:fs";
import { seededRandom } from "@voxolith/renderer/core";
import { contactSheet, encodePng, renderEntity, type RenderOptions, type SheetCell } from "@voxolith/engine/preview";
import { generateTree, PRESETS } from "../src/index";
import { cloneParams, type TreeParams } from "../src/params";

const args = process.argv.slice(2);
const round = args.find((a) => !a.startsWith("--")) ?? "skeleton";
const flag = (name: string, dflt: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const W = flag("width", 300);
const H = Math.round(W * 1.35);
const SEEDS = flag("seeds", 3);

const OUT = new URL("../previews/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function cell(params: TreeParams, seed: number, label: string, opts: RenderOptions = {}): SheetCell {
  const { entity, stats } = generateTree(params, seededRandom(seed));
  const render = renderEntity(entity, { width: W, height: H, yawDeg: 34, pitchDeg: 8, ...opts });
  console.log(
    `  ${label.padEnd(26)} ${String(stats.total).padStart(7)} vox ` +
      `(wood ${String(stats.wood).padStart(6)}, leaf ${String(stats.foliage).padStart(6)}) ` +
      `${entity.model.size.x}x${entity.model.size.y}x${entity.model.size.z} ` +
      `${stats.ms.toFixed(0)}+${render.ms.toFixed(0)} ms`,
  );
  return { render, label };
}

const tweak = (base: TreeParams, fn: (p: TreeParams) => void): TreeParams => {
  const p = cloneParams(base);
  fn(p);
  return p;
};

const cells: SheetCell[] = [];
let title = round;
let cols = SEEDS;

console.log(`round: ${round}`);
switch (round) {
  case "skeleton": {
    // Bare structure: judge trunk mass, taper, flare, branch angles, silhouette.
    title = "skeleton (no foliage)";
    for (const name of ["oak", "spruce"]) {
      for (let s = 0; s < SEEDS; s++) {
        cells.push(cell(tweak(PRESETS[name], (p) => (p.foliage.enabled = false)), 100 + s, `${name} s${s}`));
      }
    }
    break;
  }
  case "bark": {
    // Close crop on the lower trunk: judge furrow wavelength and contrast.
    title = "bark, lower trunk";
    cols = 3;
    for (const name of ["oak", "birch", "pine"]) {
      for (const wl of [3, 5, 7]) {
        cells.push(
          cell(
            tweak(PRESETS[name], (p) => {
              p.foliage.enabled = false;
              p.look.furrowWavelength = wl;
            }),
            7,
            `${name} wl${wl}`,
            { zoom: 0.16, aimY: 0.09, pitchDeg: 2 },
          ),
        );
      }
    }
    break;
  }
  case "foliage": {
    // The lollipop-versus-cloud question: cluster size against sky holes.
    title = "foliage: cluster radius x sky holes";
    cols = 3;
    for (const r of [3.2, 4.5, 6]) {
      for (const macro of [0.25, 0.38, 0.5]) {
        cells.push(
          cell(
            tweak(PRESETS.oak, (p) => {
              p.foliage.clusterRadius = r;
              p.foliage.macroThreshold = macro;
            }),
            3,
            `r${r} holes${macro}`,
          ),
        );
      }
    }
    break;
  }
  case "shell": {
    title = "foliage: shell depth";
    cols = 4;
    for (const d of [0, 6, 12, 20]) {
      cells.push(cell(tweak(PRESETS.oak, (p) => (p.foliage.shellDepth = d)), 3, `shell ${d}`));
    }
    break;
  }
  case "resolution": {
    title = "resolution";
    cols = 3;
    for (const name of ["oak", "spruce"]) {
      for (const h of [96, 144, 192]) {
        cells.push(cell(tweak(PRESETS[name], (p) => (p.shape.height = h)), 5, `${name} ${h}`));
      }
    }
    break;
  }
  case "species": {
    title = "species";
    cols = 5;
    for (const name of ["oak", "maple", "birch", "spruce", "pine"]) {
      cells.push(cell(PRESETS[name], 21, name));
    }
    break;
  }
  case "seasons": {
    title = "seasons";
    cols = 4;
    for (const name of ["oak", "spruce"]) {
      for (const season of ["spring", "summer", "autumn", "winter"] as const) {
        cells.push(cell(tweak(PRESETS[name], (p) => (p.look.season = season)), 12, `${name} ${season}`));
      }
    }
    break;
  }
  default:
    console.error(`unknown round "${round}"; try skeleton, bark, foliage, shell, resolution, species, seasons`);
    process.exit(1);
}

const sheet = contactSheet(cells, { cols, title });
const file = `${OUT}${round}.png`;
writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.rgb));
console.log(`\nwrote ${file} (${sheet.width}x${sheet.height}, ${(sheet.ms / 1000).toFixed(1)} s of rendering)`);
