#!/usr/bin/env node
// Generates the QuillForge launcher icon in every format the Android app needs
// from a single set of vector shapes (defined below in a 108x108 adaptive-icon
// coordinate space; the 66dp safe zone is the circle centered at 54,54 r=33).
//
// Outputs:
//   resources/icon.svg                                   full-bleed source artwork
//   resources/icon-foreground.svg                        foreground layer only
//   resources/icon-512.png                               store / README icon
//   android/app/src/main/res/drawable/ic_launcher_foreground.xml   (vector)
//   android/app/src/main/res/drawable/ic_launcher_background.xml   (vector)
//   android/app/src/main/res/drawable/ic_launcher_monochrome.xml   (vector, themed icons)
//   android/app/src/main/res/mipmap-*/ic_launcher.png, ic_launcher_round.png  (legacy, API 24-25)
//
// Usage: node scripts/gen-android-icons.mjs [--no-png]
// PNG rendering uses Playwright's Chromium. Set CHROMIUM_PATH to override the browser binary.

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');

const NAVY = '#2B4A7E';
const NAVY_DARK = '#1C3360';
const AMBER = '#F2A541';
const PAPER = '#FDF7EA';
const PAPER_FOLD = '#E8DCC0';
const LINE = '#B9C6DC';

// --- Artwork (108x108 viewport) -------------------------------------------
// Page with a folded corner.
const page = 'M38,28 L63,28 L70,35 L70,63 L38,63 Z';
const pageFold = 'M63,28 L63,35 L70,35 Z';
// Faint ruled lines on the page, left of the nib.
const pageLines = 'M41,35 L49,35 L49,36.6 L41,36.6 Z M41,40 L47,40 L47,41.6 L41,41.6 Z M41,45 L46,45 L46,46.6 L41,46.6 Z M41,50 L46.5,50 L46.5,51.6 L41,51.6 Z';
// Fountain-pen / quill nib pointing down onto the anvil, with a breather hole
// and a slit (cut out with evenOdd so the monochrome layer stays correct).
const nibOuter = 'M54,64 L44.5,44 C43.6,38.5 45.5,33.5 49,30 L59,30 C62.5,33.5 64.4,38.5 63.5,44 Z';
const nibHole = 'M54,39.2 A2.6,2.6 0 1,0 54,44.4 A2.6,2.6 0 1,0 54,39.2 Z';
const nibSlit = 'M53.3,44.2 L54.7,44.2 L54.7,60 L53.3,60 Z';
const nib = `${nibOuter} ${nibHole} ${nibSlit}`;
// Nib collar (where the quill shaft would attach).
const nibCollar = 'M48,25 L60,25 L60,30.5 L48,30.5 Z';
// Anvil ("forge"): horn on the left, face, waist and foot.
const anvil = 'M23,64 C30,64.5 34,64 39,64 L83,64 L83,70.5 L71,70.5 C67,71.5 65,74 65,77 L71,77 L71,81 L39,81 L39,77 L45,77 C45,74 43,71.5 39,70.5 C31,70 26,68 23,64 Z';
// Sparks flying from the point where the nib meets the anvil.
const sparks = 'M66,57.5 L71.5,54 L72.5,55.6 L67,59.1 Z M41,57.5 L35.5,54 L34.5,55.6 L40,59.1 Z M68.5,62.2 L75,61.4 L75.2,63.2 L68.7,64 Z M39.5,62.2 L33,61.4 L32.8,63.2 L39.3,64 Z';

const fg = [
  { d: page, fill: PAPER },
  { d: pageFold, fill: PAPER_FOLD },
  { d: pageLines, fill: LINE },
  { d: nibCollar, fill: AMBER },
  { d: nib, fill: NAVY_DARK, evenOdd: true },
  { d: anvil, fill: AMBER },
  { d: sparks, fill: AMBER },
];
// Monochrome (Android 13 themed icon): silhouettes only, page drawn as an outline frame.
const pageFrame = `${page} M40.5,30.5 L62,30.5 L67.5,36 L67.5,60.5 L40.5,60.5 Z`;
const mono = [
  { d: pageFrame, fill: '#FFFFFF', evenOdd: true },
  { d: nibCollar, fill: '#FFFFFF' },
  { d: nib, fill: '#FFFFFF', evenOdd: true },
  { d: anvil, fill: '#FFFFFF' },
  { d: sparks, fill: '#FFFFFF' },
];
const bg = [
  { d: 'M0,0 L108,0 L108,108 L0,108 Z', fill: NAVY },
  // subtle diagonal glow
  { d: 'M0,108 L108,0 L108,108 Z', fill: '#FFFFFF', alpha: 0.05 },
];

// --- Writers -----------------------------------------------------------------
const svgPaths = (layers) =>
  layers
    .map(
      (l) =>
        `  <path d="${l.d}" fill="${l.fill}"${l.alpha != null ? ` fill-opacity="${l.alpha}"` : ''}${l.evenOdd ? ' fill-rule="evenodd"' : ''}/>`,
    )
    .join('\n');

function svg(layers, { size = 108, viewBox = '0 0 108 108', clip = null } = {}) {
  const clipDef =
    clip === 'circle'
      ? '<clipPath id="c"><circle cx="54" cy="54" r="36"/></clipPath>'
      : clip === 'rounded'
        ? '<clipPath id="c"><rect x="18" y="18" width="72" height="72" rx="13"/></clipPath>'
        : '';
  const open = clip ? `<defs>${clipDef}</defs>\n<g clip-path="url(#c)">` : '<g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">\n${open}\n${svgPaths(layers)}\n</g>\n</svg>\n`;
}

const hex = (c, alpha) => {
  const h = c.replace('#', '').toUpperCase();
  if (alpha == null) return `#${h}`;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${a}${h}`;
};
function vector(layers, comment) {
  const paths = layers
    .map(
      (l) =>
        `    <path\n        android:fillColor="${hex(l.fill, l.alpha)}"${l.evenOdd ? '\n        android:fillType="evenOdd"' : ''}\n        android:pathData="${l.d}" />`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${comment} Generated by scripts/gen-android-icons.mjs; edit the script, not this file. -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportWidth="108"\n    android:viewportHeight="108">\n${paths}\n</vector>\n`;
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log('wrote', path.replace(root + '/', ''));
}

write(join(root, 'resources/icon.svg'), svg([...bg, ...fg], { size: 1024 }));
write(join(root, 'resources/icon-foreground.svg'), svg(fg, { size: 1024 }));
write(join(res, 'drawable/ic_launcher_foreground.xml'), vector(fg, 'QuillForge adaptive icon foreground.'));
write(join(res, 'drawable/ic_launcher_background.xml'), vector(bg, 'QuillForge adaptive icon background.'));
write(join(res, 'drawable/ic_launcher_monochrome.xml'), vector(mono, 'QuillForge themed (monochrome) icon.'));

// The Capacitor template ships a drawable-v24 foreground that would shadow ours,
// plus PNG foregrounds referenced from mipmap; remove them.
for (const p of ['drawable-v24/ic_launcher_foreground.xml']) {
  const f = join(res, p);
  if (existsSync(f)) rmSync(f);
}

if (process.argv.includes('--no-png')) process.exit(0);

// --- PNG rendering -------------------------------------------------------------
const { chromium } = await import('playwright');
const launchOpts = { headless: true };
if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
let browser;
try {
  browser = await chromium.launch(launchOpts);
} catch (err) {
  // Fall back to any locally installed Playwright Chromium build.
  const { readdirSync } = await import('node:fs');
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const cand = existsSync(base)
    ? readdirSync(base)
        .filter((d) => d.startsWith('chromium-'))
        .flatMap((d) => [join(base, d, 'chrome-linux64/chrome'), join(base, d, 'chrome-linux/chrome')])
        .filter(existsSync)
    : [];
  if (!cand.length) throw err;
  browser = await chromium.launch({ ...launchOpts, executablePath: cand[0] });
}
const pageCtx = await browser.newPage();

async function renderPng(svgText, px, out) {
  await pageCtx.setViewportSize({ width: px, height: px });
  const sized = svgText.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);
  await pageCtx.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${sized}</body></html>`,
  );
  const buf = await pageCtx.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log('wrote', out.replace(root + '/', ''), `${px}px`);
}

// Legacy icons: crop to the central 72x72 of the 108 canvas (what launchers show).
const legacySquare = svg([...bg, ...fg], { viewBox: '18 18 72 72', clip: 'rounded' });
const legacyRound = svg([...bg, ...fg], { viewBox: '18 18 72 72', clip: 'circle' });
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, px] of Object.entries(densities)) {
  await renderPng(legacySquare, px, join(res, `mipmap-${d}/ic_launcher.png`));
  await renderPng(legacyRound, px, join(res, `mipmap-${d}/ic_launcher_round.png`));
  const oldFg = join(res, `mipmap-${d}/ic_launcher_foreground.png`);
  if (existsSync(oldFg)) rmSync(oldFg);
}
await renderPng(svg([...bg, ...fg], { viewBox: '9 9 90 90' }), 512, join(root, 'resources/icon-512.png'));

await browser.close();
