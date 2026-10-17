#!/usr/bin/env node
// Renders the suite icon sources in resources/ (icon.svg, icon-foreground.svg, icon-background.txt) to the
// PNG sizes the other platforms need:
//   resources/icon-1024.png                       desktop installers (Windows .ico and macOS .icns are derived from it)
//   public/icons/icon-192.png, icon-512.png       web app manifest, purpose "any" (PWA, ChromeOS)
//   public/icons/icon-maskable-512.png            web app manifest, purpose "maskable" (full-bleed background)
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   iOS 1024x1024: opaque, square corners
//                                                 (iOS rounds the corners itself and rejects transparency)
// public/favicon.svg is a copy of resources/icon.svg.
// Usage: node scripts/gen-platform-icons.mjs   (uses Playwright's Chromium; CHROMIUM_PATH overrides it)
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'resources/icon.svg'), 'utf8');
const fg = readFileSync(join(root, 'resources/icon-foreground.svg'), 'utf8');
const bg = readFileSync(join(root, 'resources/icon-background.txt'), 'utf8').trim();
const inner = (s) => s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
// Full-bleed variants: the tile without its rounded corners (iOS), the adaptive layers on a square (maskable).
const square = svg.replace(/(<rect\b[^>]*\bwidth="512"[^>]*?)\s+rx="[^"]*"/, '$1');
if (square === svg) throw new Error('resources/icon.svg: expected a 512x512 background <rect rx=…> to square off for iOS');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${bg}"/>${inner(fg)}</svg>`;

const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && existsSync(p) && statSync(p).isFile());
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
const outputs = [
  [svg, 1024, 'resources/icon-1024.png', true],
  [svg, 512, 'public/icons/icon-512.png', true],
  [svg, 192, 'public/icons/icon-192.png', true],
  [maskable, 512, 'public/icons/icon-maskable-512.png', false],
  [square, 1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', false],
];
for (const [src, size, rel, transparent] of outputs) {
  const out = join(root, rel);
  if (rel.startsWith('ios/') && !existsSync(dirname(out))) continue;
  mkdirSync(dirname(out), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  const sized = src.replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', `<svg width="${size}" height="${size}"`));
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#fff'}">${sized}</body></html>`);
  await page.locator('svg').first().screenshot({ path: out, omitBackground: transparent });
  console.log('wrote', rel);
}
copyFileSync(join(root, 'resources/icon.svg'), join(root, 'public/favicon.svg'));
console.log('wrote public/favicon.svg');
await browser.close();
