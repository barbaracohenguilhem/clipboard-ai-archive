// Renders the demo HTML pages in Playwright Chromium and saves
// 1280×800 PNG screenshots ready for the Chrome Web Store listing.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const TARGETS = [
  {
    name: '01-popup',
    file: 'scripts/screenshots/demo-popup.html',
    desc: 'Popup with recent clips, type filters, AI tags',
  },
  {
    name: '02-sidepanel',
    file: 'scripts/screenshots/demo-sidepanel.html',
    desc: 'Side panel with tag rail and detail view',
  },
  {
    name: '03-settings',
    file: 'scripts/screenshots/demo-settings.html',
    desc: 'Settings — retention, AI status, blocklist',
  },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2, // retina-quality output
});

for (const target of TARGETS) {
  const page = await ctx.newPage();
  const url = 'file://' + path.join(root, target.file);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const out = path.join(outDir, `${target.name}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`✓ ${out}  (${target.desc})`);
  await page.close();
}

await browser.close();
console.log(`\n${TARGETS.length} screenshots ready in ${outDir}`);
