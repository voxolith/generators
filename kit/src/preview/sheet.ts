// Contact sheets: many renders tiled into one captioned image.
//
// Iterating on a generator means comparing variants side by side, not squinting
// at one render at a time, so this is the main output of a preview run.

import { drawText, textWidth } from "./font";
import type { RenderResult } from "./render";

/** One tile of a {@link contactSheet}: an image and the caption under it. */
export interface SheetCell {
  render: RenderResult;
  label?: string;
}

/** Layout and colours of a {@link contactSheet}. */
export interface SheetOptions {
  /** Columns; default the square root of the cell count, rounded up. */
  cols?: number;
  /** Gap between cells and around the edge, in pixels. */
  pad?: number;
  /** Background colour, 0..255 per channel. */
  background?: [number, number, number];
  /** Caption and title colour, 0..255 per channel. */
  labelColor?: [number, number, number];
  /** Pixel size of the built-in bitmap font. Default 2. */
  labelScale?: number;
  /** A heading drawn across the top. */
  title?: string;
}

/**
 * Tile renders into one captioned image, left to right then top to bottom, each cell as large as
 * the largest render. Comparing variants side by side is the main output of a preview run.
 *
 * @param cells - At least one; throws on an empty list.
 * @param opts - Columns, spacing, colours and an optional title.
 * @returns The sheet as one image.
 * @example
 * ```ts
 * const cells = [1, 2, 3].map((seed) => ({
 *   render: renderEntity(generateRock(PRESETS.boulder, seededRandom(seed)).entity, { width: 240 }),
 *   label: `seed ${seed}`,
 * }));
 * const sheet = contactSheet(cells, { cols: 3, title: "boulder" });
 * await Bun.write("rocks.png", encodePng(sheet.width, sheet.height, sheet.rgb));
 * ```
 */
export function contactSheet(cells: SheetCell[], opts: SheetOptions = {}): RenderResult {
  if (cells.length === 0) throw new Error("contactSheet needs at least one cell");
  const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(cells.length)));
  const rows = Math.ceil(cells.length / cols);
  const pad = opts.pad ?? 10;
  const bg = opts.background ?? [16, 20, 30];
  const fg = opts.labelColor ?? [226, 232, 240];
  const scale = opts.labelScale ?? 2;
  const labelH = cells.some((c) => c.label) ? 5 * scale + 6 : 0;
  const titleH = opts.title ? 5 * (scale + 1) + 10 : 0;

  const cw = Math.max(...cells.map((c) => c.render.width));
  const ch = Math.max(...cells.map((c) => c.render.height));
  const W = pad + cols * (cw + pad);
  const H = titleH + pad + rows * (ch + labelH + pad);
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    rgb[i * 3] = bg[0];
    rgb[i * 3 + 1] = bg[1];
    rgb[i * 3 + 2] = bg[2];
  }

  if (opts.title) drawText(rgb, W, H, pad, 6, opts.title, fg, scale + 1);

  cells.forEach((cell, k) => {
    const col = k % cols, row = (k / cols) | 0;
    const x0 = pad + col * (cw + pad);
    const y0 = titleH + pad + row * (ch + labelH + pad);
    const r = cell.render;
    for (let y = 0; y < r.height; y++) {
      const dst = ((y0 + y) * W + x0) * 3;
      rgb.set(r.rgb.subarray(y * r.width * 3, (y + 1) * r.width * 3), dst);
    }
    if (cell.label) {
      const tw = textWidth(cell.label, scale);
      const tx = x0 + Math.max(0, ((r.width - tw) / 2) | 0);
      drawText(rgb, W, H, tx, y0 + r.height + 3, cell.label, fg, scale);
    }
  });

  return { width: W, height: H, rgb, ms: cells.reduce((s, c) => s + c.render.ms, 0) };
}
