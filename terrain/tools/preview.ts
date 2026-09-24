// A shaded map of the terrain, for judging the layout.  bun tools/preview.ts [size] [seed]

import { mkdirSync, writeFileSync } from "node:fs";
import { encodePng } from "@voxolith/gen-kit/preview";
import { generateTerrain } from "../src/index";

const size = Number(process.argv[2] ?? 640);
const seed = Number(process.argv[3] ?? 7);
const t = generateTerrain({ width: size, depth: size }, seed);
const rgb = new Uint8Array(size * size * 3);
const light = [-0.6, 0.7, -0.4];
for (let z = 0; z < size; z++)
  for (let x = 0; x < size; x++) {
    const h = t.heightAt(x, z);
    // Hillshade from the height gradient.
    const nx = t.heightAt(x - 1, z) - t.heightAt(x + 1, z);
    const nz = t.heightAt(x, z - 1) - t.heightAt(x, z + 1);
    const n = [nx, 2, nz];
    const l = Math.hypot(n[0], n[1], n[2]);
    const shade = 0.55 + 0.45 * Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / l);
    let c = t.roles[t.topRole(x, z) - 1].color;
    if (t.waterAt(x, z)) {
      const w = t.roles[9].color, k = Math.min(1, t.waterDepth(x, z) / 5);
      c = [c[0] * (1 - k) * 0.6 + w[0] * (0.4 + k * 0.6), c[1] * (1 - k) * 0.6 + w[1] * (0.4 + k * 0.6), c[2] * (1 - k) * 0.6 + w[2] * (0.4 + k * 0.6)];
    }
    const i = (x + z * size) * 3;
    const lift = 0.85 + (h - t.params.baseY) * 0.012;
    rgb[i] = Math.min(255, c[0] * 255 * shade * lift);
    rgb[i + 1] = Math.min(255, c[1] * 255 * shade * lift);
    rgb[i + 2] = Math.min(255, c[2] * 255 * shade * lift);
  }
const out = new URL("../previews/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}map.png`, encodePng(size, size, rgb));
console.log(`wrote ${out}map.png (${size}x${size}, seed ${seed})`);
