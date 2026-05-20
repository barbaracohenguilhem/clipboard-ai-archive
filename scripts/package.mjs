// Builds a Chrome-Web-Store-ready zip in dist/clipboard-archive-vX.Y.Z.zip
// containing only files the extension runtime needs (no node_modules, no
// tests, no docs, no scripts).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
);
const version = manifest.version;
const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const outZip = path.join(distDir, `clipboard-archive-v${version}.zip`);
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

// Directories/files to INCLUDE in the zip (zip -r recurses into dirs).
const includes = [
  'manifest.json',
  'background',
  'content',
  'popup',
  'sidepanel',
  'settings',
  'shared',
  'assets/icons',
];

// `zip` is preinstalled on macOS and most Linux distros.
execFileSync('zip', ['-r', '-q', outZip, ...includes], {
  cwd: root,
  stdio: 'inherit',
});

const stats = fs.statSync(outZip);
console.log(`✓ ${outZip}`);
console.log(`  ${(stats.size / 1024).toFixed(1)} KB`);
console.log('\nReady to upload at https://chrome.google.com/webstore/devconsole/');
