#!/usr/bin/env node
// Generates the Android launcher icon from the suite icon sources in resources/:
//   resources/icon.svg             full tile (legacy square icon, store icon)
//   resources/icon-foreground.svg  adaptive-icon foreground (transparent, artwork inside the 66dp safe circle)
//   resources/icon-background.txt  adaptive-icon background colour (#RRGGBB)
//
// Outputs:
//   android/app/src/main/res/drawable/ic_launcher_foreground.xml        vector, converted from icon-foreground.svg
//   android/app/src/main/res/values/ic_launcher_background.xml          background (and splash) colour
//   android/app/src/main/res/mipmap-anydpi-v26/ic_launcher{,_round}.xml adaptive icon (colour + vector + monochrome)
//   android/app/src/main/res/mipmap-*/ic_launcher_monochrome.png         themed-icon silhouette (Android 13+)
//   android/app/src/main/res/mipmap-*/ic_launcher.png, ic_launcher_round.png   legacy icons (API 24-25)
//   resources/icon-512.png                                               store / README / desktop window icon
//
// Usage: node scripts/gen-android-icons.mjs [--no-png]
// The SVG-to-vector converter handles what the suite icons use: <g> with translate/scale transforms, fill and
// opacity; <rect> (rounded); <path> with fill, stroke, stroke-width, line joins and caps. Anything else (gradients,
// masks, text) stops the script so the vector never silently differs from the artwork.
// PNG rendering uses Playwright's Chromium; CHROMIUM_PATH overrides the browser binary.

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');
const fullSvg = readFileSync(join(root, 'resources/icon.svg'), 'utf8');
const fgSvg = readFileSync(join(root, 'resources/icon-foreground.svg'), 'utf8');
const BG = readFileSync(join(root, 'resources/icon-background.txt'), 'utf8').trim().toUpperCase();
if (!/^#[0-9A-F]{6}$/.test(BG)) throw new Error(`resources/icon-background.txt: expected #RRGGBB, got "${BG}"`);

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log('wrote', path.replace(root + '/', ''));
}

// --- SVG -> VectorDrawable ----------------------------------------------------------------
function parseSvg(text) {
  const rootNode = { name: '#root', attrs: {}, children: [] };
  const stack = [rootNode];
  const re = /<(\/?)([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
  let m;
  while ((m = re.exec(text))) {
    if (!m[2]) continue;
    if (m[1]) { stack.pop(); continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node = { name: m[2], attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return rootNode.children[0];
}
const color = (c) => {
  if (!c || c === 'none') return null;
  let h = c.trim().replace('#', '').toUpperCase();
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (!/^[0-9A-F]{6}$/.test(h)) throw new Error(`unsupported colour ${c}`);
  return '#' + h;
};
function transformOf(t) {
  // Composes translate()/scale() into p' = s*p + (tx, ty).
  let s = 1, tx = 0, ty = 0;
  const ops = [...(t || '').matchAll(/(translate|scale)\(([^)]*)\)/g)];
  if ((t || '').replace(/(translate|scale)\([^)]*\)/g, '').trim()) throw new Error(`unsupported transform ${t}`);
  // Applied right to left: the last operation acts on the point first.
  const mats = ops.map(([, op, args]) => {
    const n = args.trim().split(/[\s,]+/).map(Number);
    return op === 'translate' ? { s: 1, tx: n[0], ty: n[1] ?? 0 } : (n[1] !== undefined && n[1] !== n[0] ? (() => { throw new Error('non-uniform scale'); })() : { s: n[0], tx: 0, ty: 0 });
  });
  for (const m of mats) { tx = tx + s * m.tx; ty = ty + s * m.ty; s = s * m.s; }
  return { s, tx, ty };
}
const num = (v) => Number(Number(v).toFixed(3)).toString();
function rectPath(a) {
  const x = +a.x || 0, y = +a.y || 0, w = +a.width, h = +a.height;
  let rx = a.rx != null ? +a.rx : a.ry != null ? +a.ry : 0;
  rx = Math.min(rx, w / 2, h / 2);
  if (!rx) return `M${num(x)},${num(y)} H${num(x + w)} V${num(y + h)} H${num(x)} Z`;
  return `M${num(x + rx)},${num(y)} H${num(x + w - rx)} A${num(rx)},${num(rx)} 0 0 1 ${num(x + w)},${num(y + rx)} V${num(y + h - rx)} A${num(rx)},${num(rx)} 0 0 1 ${num(x + w - rx)},${num(y + h)} H${num(x + rx)} A${num(rx)},${num(rx)} 0 0 1 ${num(x)},${num(y + h - rx)} V${num(y + rx)} A${num(rx)},${num(rx)} 0 0 1 ${num(x + rx)},${num(y)} Z`;
}
function toVector(svgText, comment) {
  const svg = parseSvg(svgText);
  const [vx, vy, vw, vh] = (svg.attrs.viewBox || `0 0 ${svg.attrs.width} ${svg.attrs.height}`).split(/[\s,]+/).map(Number);
  if (vx || vy) throw new Error('viewBox must start at 0 0');
  const out = [];
  const walk = (node, inh, depth) => {
    const pad = '    '.repeat(depth);
    const a = node.attrs;
    const st = { ...inh };
    if (a.fill !== undefined) st.fill = a.fill;
    if (a.stroke !== undefined) st.stroke = a.stroke;
    for (const k of ['stroke-width', 'stroke-linejoin', 'stroke-linecap']) if (a[k] !== undefined) st[k] = a[k];
    if (a.opacity !== undefined) st.opacity = (inh.opacity ?? 1) * Number(a.opacity);
    if (a['fill-opacity'] !== undefined) st.fillOpacity = Number(a['fill-opacity']);
    switch (node.name) {
      case 'svg': for (const c of node.children) walk(c, st, depth); return;
      case 'g': {
        const t = a.transform ? transformOf(a.transform) : null;
        if (t) out.push(`${pad}<group android:scaleX="${num(t.s)}" android:scaleY="${num(t.s)}" android:translateX="${num(t.tx)}" android:translateY="${num(t.ty)}">`);
        for (const c of node.children) walk(c, st, depth + (t ? 1 : 0));
        if (t) out.push(`${pad}</group>`);
        return;
      }
      case 'rect': case 'path': {
        if (a.transform) throw new Error('transform on a shape is not supported; put it on a <g>');
        const d = node.name === 'rect' ? rectPath(a) : a.d.replace(/\s+/g, ' ').trim();
        const fill = color(st.fill ?? '#000');
        const stroke = color(st.stroke);
        const alpha = (st.opacity ?? 1);
        const attrs = [];
        if (fill) { attrs.push(`android:fillColor="${fill}"`); const fa = alpha * (st.fillOpacity ?? 1); if (fa !== 1) attrs.push(`android:fillAlpha="${num(fa)}"`); }
        if (stroke) {
          attrs.push(`android:strokeColor="${stroke}"`, `android:strokeWidth="${num(st['stroke-width'] ?? 1)}"`);
          if (alpha !== 1) attrs.push(`android:strokeAlpha="${num(alpha)}"`);
          if (st['stroke-linejoin']) attrs.push(`android:strokeLineJoin="${st['stroke-linejoin']}"`);
          if (st['stroke-linecap']) attrs.push(`android:strokeLineCap="${st['stroke-linecap']}"`);
        }
        if (a['fill-rule'] === 'evenodd') attrs.push('android:fillType="evenOdd"');
        out.push(`${pad}<path\n${pad}    ${attrs.join(`\n${pad}    `)}\n${pad}    android:pathData="${d}" />`);
        return;
      }
      default: throw new Error(`<${node.name}> is not supported by the vector converter`);
    }
  };
  walk(svg, {}, 1);
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${comment} Generated by scripts/gen-android-icons.mjs from resources/; edit those, not this file. -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportWidth="${vw}"\n    android:viewportHeight="${vh}">\n${out.join('\n')}\n</vector>\n`;
}

write(join(res, 'drawable/ic_launcher_foreground.xml'), toVector(fgSvg, 'Adaptive icon foreground.'));
write(join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by scripts/gen-android-icons.mjs from resources/icon-background.txt. -->\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n    <color name="splash_background">${BG}</color>\n</resources>\n`);
const adaptive = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n</adaptive-icon>\n`;
write(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
write(join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive);
// Replaced by the colour resource and the monochrome PNGs; the Capacitor template's drawable-v24 foreground
// would shadow ours.
for (const p of ['drawable/ic_launcher_background.xml', 'drawable/ic_launcher_monochrome.xml', 'drawable-v24/ic_launcher_foreground.xml']) {
  const f = join(res, p);
  if (existsSync(f)) { rmSync(f); console.log('removed', f.replace(root + '/', '')); }
}

if (process.argv.includes('--no-png')) process.exit(0);

// --- PNG rendering -------------------------------------------------------------------------
const { chromium } = await import('playwright');
const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && existsSync(p) && statSync(p).isFile());
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const sized = (svg, px, viewBox) => svg.replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height|viewBox)="[^"]*"/g, '').replace('<svg', `<svg width="${px}" height="${px}" viewBox="${viewBox || '0 0 512 512'}"`));
async function renderPng(svgText, px, out) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${svgText}</body></html>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log('wrote', out.replace(root + '/', ''), `${px}px`);
}
// The 108dp adaptive canvas shows its central 72dp: in the 512-unit artwork that is 512*18/108 .. 512*90/108.
const C = 512 * 18 / 108, W = 512 * 72 / 108;
const crop = `${num(C)} ${num(C)} ${num(W)} ${num(W)}`;
// Adaptive composition for the legacy round icon: background colour + foreground, cropped to what launchers show.
const composed = (clip) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="c">${clip}</clipPath></defs><g clip-path="url(#c)"><rect width="512" height="512" fill="${BG}"/>${inner(fgSvg)}</g></svg>`;
const round = composed(`<circle cx="256" cy="256" r="${num(W / 2)}"/>`);
// Themed icon: the foreground's white parts, with the coloured details (text lines, quill outline) cut out.
const monoInner = inner(fgSvg).replace(/(fill|stroke)="#(?![fF]{3}\b|[fF]{6}\b)[0-9a-fA-F]{3,6}"/g, '$1="#000"');
const mono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#000"/>${monoInner}</mask></defs><rect width="512" height="512" fill="#fff" mask="url(#m)"/></svg>`;

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  await renderPng(sized(fullSvg, 48 * k), 48 * k, join(res, `mipmap-${d}/ic_launcher.png`));
  await renderPng(sized(round, 48 * k, crop), 48 * k, join(res, `mipmap-${d}/ic_launcher_round.png`));
  await renderPng(sized(mono, 108 * k), 108 * k, join(res, `mipmap-${d}/ic_launcher_monochrome.png`));
  const oldFg = join(res, `mipmap-${d}/ic_launcher_foreground.png`);
  if (existsSync(oldFg)) rmSync(oldFg);
}
await renderPng(sized(fullSvg, 512), 512, join(root, 'resources/icon-512.png'));
await browser.close();
