import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', '..', 'frontend', 'public');

const sources = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512 },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
];

for (const { svg, out, size } of sources) {
  await sharp(readFileSync(join(publicDir, svg)))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, out));
  console.log(`generated ${out}`);
}
