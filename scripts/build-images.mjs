/**
 * Turns the raw supplier photos in /assets into transparent, tightly cropped
 * WebP files in /public/assets.
 *
 * The photos are shot on a white sweep, so the background is removed with a
 * flood fill that starts at the border — that keeps the white areas *inside*
 * the product (the card is part clear acrylic) instead of punching holes in it.
 *
 * Run with: npm install sharp --no-save && node scripts/build-images.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets');
const OUT = path.join(root, 'public', 'assets');

const BG_MIN = 214; // a background pixel is at least this bright…
const MAX_SATURATION = 16; // …and this close to neutral gray
const MAX_EDGE = 900;
const PAD = 8;

const FILES = [
  ['googlereview.avif', 'card-angle.webp'],
  ['googlereview2.jpg', 'card-pair.webp'],
  ['googlereview3.jpg', 'card-back.webp'],
  ['googlereview4.jpg', 'card-range.webp'],
];

async function cutout(file, outName) {
  const { data, info } = await sharp(path.join(SRC, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const idx = (x, y) => (y * width + x) * channels;

  const bg = new Uint8Array(width * height);
  const stack = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (bg[p]) return;
    const o = idx(x, y);
    const lo = Math.min(data[o], data[o + 1], data[o + 2]);
    const hi = Math.max(data[o], data[o + 1], data[o + 2]);
    if (lo < BG_MIN || hi - lo > MAX_SATURATION) return;
    bg[p] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  // Average the mask over a 3x3 window so the cut has a soft edge, and track
  // the bounding box of what survives so the result can be cropped tight.
  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          sum += nx < 0 || ny < 0 || nx >= width || ny >= height ? 1 : bg[ny * width + nx];
        }
      }

      const alpha = Math.round((1 - sum / 9) * 255);
      data[idx(x, y) + 3] = alpha;

      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const left = Math.max(0, minX - PAD);
  const top = Math.max(0, minY - PAD);

  await sharp(data, { raw: { width, height, channels } })
    .extract({
      left,
      top,
      width: Math.min(width - left, maxX - minX + PAD * 2),
      height: Math.min(height - top, maxY - minY + PAD * 2),
    })
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(path.join(OUT, outName));

  console.log(`${file} → public/assets/${outName}`);
}

await fs.mkdir(OUT, { recursive: true });
for (const [file, outName] of FILES) {
  await cutout(file, outName);
}
