// Cost of rebuilding a fine terrain from data (what a chunk-fill worker does
// once) and of filling one ground chunk, at the valley example's size (span 4:
// 1280 x 1280 coarse columns).  bun tools/bench.ts [k]   (default 10)
//
// One k per process: JavaScriptCore specialises the shared closures on the
// first terrain it sees, so every extra terrain or fill form in one process
// makes the ones after it slower than they are on their own.

import { makeNoise } from "@voxolith/gen-kit";
import { fineTerrainFrom, fineTerrainInit, generateTerrain, refineTerrain, type FineTerrain, type TopOverride } from "../src/index";

const span = 4, W = 320 * span, seed = 1;
const ms = (t: number) => `${(performance.now() - t).toFixed(1)} ms`;
let t = performance.now();
const coarse = generateTerrain({
  width: W, depth: W, height: 192, featureSize: 110 + 25 * span,
  river: { enabled: true, width: 14 + 3 * span, depth: 5, banks: 16 + 2 * span, meander: 260 + 70 * span },
}, seed);
console.log(`generateTerrain ${W}x${W} (the valley's shape): ${ms(t)}`);

// A settlement's surface: a path band through the middle, as a closure.
const surface = new Uint8Array(W * W);
for (let z = 0; z < W; z++) for (let x = W / 2 - 3; x <= W / 2 + 3; x++) surface[x + z * W] = 2;
const noise = makeNoise(seed);
const top = (x: number, z: number) => (surface[x + z * W] === 2 ? (noise.value2(x * 0.3, z * 0.3) > 0.55 ? 22 : 21) : 0);

const CHUNK = 256;
/** Fill one chunk the way the valley does: a box per brick column, every brick in its span. */
const chunk = (f: FineTerrain, cx: number, cz: number, over?: TopOverride) => {
  const cells = new Uint8Array(512);
  let bricks = 0;
  for (let oz = cz; oz < cz + CHUNK; oz += 8)
    for (let ox = cx; ox < cx + CHUNK; ox += 8) {
      const [y0, y1] = f.columnSpan(ox, oz);
      for (let oy = y0 & ~7; oy <= y1; oy += 8) { cells.fill(0); f.fillBrick(cells, ox, oy, oz, 3, over); bricks++; }
    }
  return bricks;
};
{
  const K = Number(process.argv[2] ?? 10);
  const fine = refineTerrain(coarse, K, { seed });
  t = performance.now();
  const init = fineTerrainInit(fine, top);
  const tInit = ms(t);
  t = performance.now();
  const copy = structuredClone(init);
  const tClone = ms(t);
  t = performance.now();
  const rebuilt = fineTerrainFrom(copy);
  const tFrom = ms(t);
  console.log(`k = ${K}: fineTerrainInit ${tInit}, structuredClone ${tClone} (${((init.terrain.heights.byteLength + init.options.top!.byteLength) / 1e6).toFixed(1)} MB), fineTerrainFrom ${tFrom}`);
  // What a worker then does: fill chunks with the override as data. The best
  // of 5 per chunk, since this machine's timings swing by a third between
  const Wf = W * K, n = Wf / CHUNK;
  for (let i = 0; i < 6; i++) chunk(rebuilt, 0, i * CHUNK);
  let sum = 0, worst = 0, bricks = 0;
  const spots = 16;
  for (let s = 0; s < spots; s++) {
    const x = ((s * 7) % n) * CHUNK, z = ((s * 13) % n) * CHUNK;
    let best = Infinity;
    for (let r = 0; r < 5; r++) { const t0 = performance.now(); bricks = chunk(rebuilt, x, z); best = Math.min(best, performance.now() - t0); }
    sum += best;
    worst = Math.max(worst, best);
  }
  console.log(`  fillBrick per ${CHUNK}^2 chunk (rebuilt, data): mean ${(sum / spots).toFixed(1)} ms, worst ${worst.toFixed(1)} ms (about ${bricks} bricks a chunk)`);
}
