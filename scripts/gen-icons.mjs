// Generates minimal placeholder PNGs (solid blue squares with rounded corners
// can't be easily encoded without a PNG lib, so we ship a tiny solid blue PNG
// for each size; Chrome will scale it). Replace with a real designed icon later.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// 16x16 PNG, solid #2b6cff. Generated once and inlined below.
// (Pre-computed PNG so this script has no external deps.)
const PNG_16 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR4nGNgGAW' +
  'jYBSMglEwCkbBKBgFowAAEEAAAaCnnY8AAAAASUVORK5CYII=';
// 32x32 PNG, solid #2b6cff
const PNG_32 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAHElEQVRYhe3BAQ' +
  'EAAACCIP+vbkhAAQAAAADwGEACgAEBUu7HzgAAAABJRU5ErkJggg==';
// 48x48 PNG, solid #2b6cff
const PNG_48 =
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAKElEQVRoge3BAQ' +
  'EAAACCIP+vbkhQAQAAAAAAAAAAAAAAAAAAAOBpQGEAAfvqglAAAAAASUVORK5C' +
  'YII=';
// 128x128 PNG, solid #2b6cff
const PNG_128 =
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAVUlEQVR4nO3BMQ' +
  'EAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAdwMTSAABx30JJwAAAABJRU5ErkJggg==';

const FILES = {
  'icon-16.png': PNG_16,
  'icon-32.png': PNG_32,
  'icon-48.png': PNG_48,
  'icon-128.png': PNG_128,
};

for (const [name, b64] of Object.entries(FILES)) {
  fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
}
console.log(`Wrote ${Object.keys(FILES).length} icons to ${outDir}`);
