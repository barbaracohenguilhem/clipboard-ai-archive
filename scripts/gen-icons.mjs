// Generates icon-{16,32,48,128}.png from assets/icon.svg using sharp.
// Run with: node scripts/gen-icons.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'assets', 'icon.svg');
const outDir = path.join(root, 'assets', 'icons');

fs.mkdirSync(outDir, { recursive: true });
const svg = fs.readFileSync(svgPath);

const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  const outPath = path.join(outDir, `icon-${size}.png`);
  await sharp(svg)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath} (${size}×${size})`);
}

// Also write a 440x280 promotional tile for the Chrome Web Store listing.
// Centered icon on the brand background.
const promoPath = path.join(root, 'assets', 'promo-440x280.png');
const promoBg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280" width="440" height="280">
     <defs>
       <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%" stop-color="#3b7bff"/>
         <stop offset="100%" stop-color="#1f4fcc"/>
       </linearGradient>
     </defs>
     <rect width="440" height="280" fill="url(#g)"/>
     <text x="220" y="220" font-family="system-ui, -apple-system, sans-serif"
           font-size="22" font-weight="600" fill="white" text-anchor="middle">
       Clipboard AI Archive
     </text>
     <text x="220" y="248" font-family="system-ui, -apple-system, sans-serif"
           font-size="13" fill="white" fill-opacity="0.85" text-anchor="middle">
       Private clipboard history with on-device AI
     </text>
   </svg>`
);
const iconAt140 = await sharp(svg).resize(140, 140).png().toBuffer();
await sharp(promoBg)
  .composite([{ input: iconAt140, top: 30, left: 150 }])
  .png()
  .toFile(promoPath);
console.log(`✓ ${promoPath} (promo tile)`);
