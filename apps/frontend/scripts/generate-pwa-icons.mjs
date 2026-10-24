// Rasterises the ViralGenHub mark (public/logo.svg) into the PNG icons the web
// app manifest and iOS home screen need. Uses sharp, which the frontend
// already depends on through Next.js image optimisation (no new dependency).
//
//   node scripts/generate-pwa-icons.mjs
//
// Writes public/icons/app/icon-192.png, icon-512.png and apple-touch-icon.png.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const source = join(root, 'logo.svg');
const outDir = join(root, 'icons', 'app');

const icons = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

await mkdir(outDir, { recursive: true });
for (const [name, size] of icons) {
  const target = join(outDir, name);
  await sharp(source, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(target);
  console.log(`wrote ${target} (${size}x${size})`);
}
