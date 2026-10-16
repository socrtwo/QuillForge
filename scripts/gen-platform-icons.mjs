#!/usr/bin/env node
// Renders resources/icon.svg to the PNG sizes the other platforms need:
//   resources/icon-1024.png                       desktop installers (Windows .ico and macOS .icns are derived from it)
//   public/icons/icon-192.png, icon-512.png       web app manifest (PWA, ChromeOS)
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   iOS (1024x1024)
// Usage: node scripts/gen-platform-icons.mjs   (uses Playwright's Chromium; CHROMIUM_PATH overrides it)
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'resources/icon.svg'), 'utf8');
const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p) && statSync(p).isFile());
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
const outputs = [
  [1024, 'resources/icon-1024.png'],
  [512, 'public/icons/icon-512.png'],
  [192, 'public/icons/icon-192.png'],
  [1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'],
];
for (const [size, rel] of outputs) {
  const out = join(root, rel);
  if (rel.startsWith('ios/') && !existsSync(dirname(out))) continue;
  mkdirSync(dirname(out), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body></html>`);
  await page.locator('svg').first().screenshot({ path: out, omitBackground: true });
  console.log('wrote', rel);
}
await browser.close();
