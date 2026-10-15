/** Picture Format contextual commands. */
import { def } from './registry';
import type { App } from '../app';
import { NodeSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../editor/schema';
import { openDialog, toast, promptDialog } from '../ui/dialog';
import { pickFile, readFileAsDataURL, download } from '../ui/dom';
import { editGraphicAt } from './insert';

const N = schema.nodes;
const v = (app: App) => app.view;

export function selectedImage(app: App, pos?: number): { node: PMNode; pos: number } | null {
  const st = app.state;
  if (pos != null) { const n = st.doc.nodeAt(pos); return n && n.type === N.image ? { node: n, pos } : null; }
  const sel = st.selection;
  if (sel instanceof NodeSelection && sel.node.type === N.image) return { node: sel.node, pos: sel.from };
  const after = st.doc.nodeAt(sel.from);
  if (after && after.type === N.image) return { node: after, pos: sel.from };
  const before = sel.$from.nodeBefore;
  if (before && before.type === N.image) return { node: before, pos: sel.from - 1 };
  return null;
}

function setImg(app: App, patch: Record<string, any> | ((a: Record<string, any>) => Record<string, any>), pos?: number) {
  const im = selectedImage(app, pos);
  if (!im) { toast('Select a picture first.'); return; }
  const next = typeof patch === 'function' ? patch(im.node.attrs) : patch;
  const tr = app.state.tr.setNodeMarkup(im.pos, undefined, { ...im.node.attrs, ...next });
  tr.setSelection(NodeSelection.create(tr.doc, im.pos));
  v(app).dispatch(tr);
}

const has = { isEnabled: (app: App) => !!selectedImage(app) };

const FILTERS: [string, string, string][] = [
  ['none', 'Original', ''], ['grayscale', 'Grayscale', 'grayscale(1)'], ['sepia', 'Sepia', 'sepia(.85)'], ['washout', 'Washout', 'brightness(1.4) contrast(.6)'],
  ['bw', 'Black & White', 'grayscale(1) contrast(3)'], ['bright', 'Brighter', 'brightness(1.25)'], ['dark', 'Darker', 'brightness(.75)'], ['contrast', 'More Contrast', 'contrast(1.4)'],
  ['saturate', 'Saturate', 'saturate(1.8)'], ['blur', 'Soft Edges (Blur)', 'blur(1.5px)'], ['invert', 'Negative', 'invert(1)'], ['vintage', 'Vintage', 'sepia(.4) saturate(1.3) contrast(.9) brightness(1.05)'],
  ['cool', 'Cool Tone', 'hue-rotate(20deg) saturate(1.1)'], ['warm', 'Warm Tone', 'sepia(.25) saturate(1.3)'],
];

def([
  {
    id: 'picture.wrap', label: 'Wrap Text', icon: 'wrap_text', tab: 'Picture', group: 'Arrange', kind: 'menu', edits: true, ...has,
    run: (app, arg) => setImg(app, { wrap: arg || 'inline' }),
    menu: (app) => [['inline', 'In Line with Text'], ['left', 'Square, Float Left'], ['right', 'Square, Float Right'], ['center', 'Top and Bottom'], ['behind', 'Behind Text'], ['front', 'In Front of Text']].map(([a, l]) => ({ id: 'picture.wrap', arg: a, label: l, checked: selectedImage(app)?.node.attrs.wrap === a })),
  },
  { id: 'picture.rotate', label: 'Rotate', icon: 'rotate_right', tab: 'Picture', group: 'Arrange', edits: true, ...has, run: (app, arg) => setImg(app, (a) => ({ rotate: (((a.rotate || 0) + (typeof arg === 'number' ? arg : 90)) % 360 + 360) % 360 })) },
  { id: 'picture.rotateLeft', label: 'Rotate Left 90°', icon: 'rotate_left', tab: 'Picture', group: 'Arrange', edits: true, ...has, run: (app) => app.exec('picture.rotate', -90) },
  { id: 'picture.flipH', label: 'Flip Horizontal', icon: 'flip', tab: 'Picture', group: 'Arrange', edits: true, ...has, run: (app) => setImg(app, (a) => ({ flipH: !a.flipH })) },
  { id: 'picture.flipV', label: 'Flip Vertical', icon: 'flip', tab: 'Picture', group: 'Arrange', edits: true, ...has, run: (app) => setImg(app, (a) => ({ flipV: !a.flipV })) },
  {
    id: 'picture.size', label: 'Size…', icon: 'photo_size_select_large', tab: 'Picture', group: 'Size', edits: true, ...has,
    run: async (app) => {
      const im = selectedImage(app)!;
      const a = im.node.attrs;
      const ratio = (a.height || 1) / (a.width || 1);
      const r = await openDialog({ title: 'Size', fields: [
        { key: 'w', label: 'Width (pt)', type: 'number', value: a.width, half: true },
        { key: 'h', label: 'Height (pt)', type: 'number', value: a.height, half: true },
        { key: 'lock', label: 'Lock aspect ratio', type: 'checkbox', value: true, half: true },
        { key: 'pct', label: 'Scale (%)', type: 'number', value: 100, half: true },
      ], onChange: (x, ctl, key) => { if (x.lock && key === 'w') ctl.set('h', Math.round(x.w * ratio)); if (x.lock && key === 'h') ctl.set('w', Math.round(x.h / ratio)); if (key === 'pct') { ctl.set('w', Math.round(a.width * x.pct / 100)); ctl.set('h', Math.round(a.height * x.pct / 100)); } } });
      if (r) setImg(app, { width: r.w, height: r.h });
    },
  },
  { id: 'picture.reset', label: 'Reset Picture', icon: 'restart_alt', tab: 'Picture', group: 'Adjust', edits: true, ...has, run: (app) => setImg(app, { filter: null, rotate: 0, flipH: false, flipV: false, border: null, crop: null, opacity: null, shadow: false }) },
  {
    id: 'picture.filter', label: 'Artistic Effects & Color', icon: 'filter', tab: 'Picture', group: 'Adjust', kind: 'menu', edits: true, ...has,
    run: (app, arg) => setImg(app, { filter: FILTERS.find((f) => f[0] === arg)?.[2] || null }),
    menu: () => FILTERS.map(([k, l]) => ({ id: 'picture.filter', arg: k, label: l })),
  },
  {
    id: 'picture.corrections', label: 'Corrections…', icon: 'tune', tab: 'Picture', group: 'Adjust', edits: true, ...has,
    run: async (app) => {
      const r = await openDialog({ title: 'Picture Corrections', preview: true, fields: [
        { key: 'b', label: 'Brightness', type: 'range', min: 20, max: 200, value: 100, suffix: '%' },
        { key: 'c', label: 'Contrast', type: 'range', min: 20, max: 300, value: 100, suffix: '%' },
        { key: 's', label: 'Saturation', type: 'range', min: 0, max: 300, value: 100, suffix: '%' },
        { key: 'hue', label: 'Hue rotate', type: 'range', min: 0, max: 360, value: 0, suffix: '°' },
        { key: 'blur', label: 'Blur (px)', type: 'range', min: 0, max: 10, step: 0.5, value: 0 },
        { key: 'op', label: 'Transparency', type: 'range', min: 0, max: 95, value: Math.round((1 - (selectedImage(app)!.node.attrs.opacity ?? 1)) * 100), suffix: '%' },
      ], onChange: (x, ctl) => ctl.setPreview(`<img src="${selectedImage(app)!.node.attrs.src}" style="max-width:100%;max-height:160px;filter:brightness(${x.b}%) contrast(${x.c}%) saturate(${x.s}%) hue-rotate(${x.hue}deg) blur(${x.blur}px);opacity:${1 - x.op / 100}">`) });
      if (r) setImg(app, { filter: `brightness(${r.b}%) contrast(${r.c}%) saturate(${r.s}%) hue-rotate(${r.hue}deg)${r.blur ? ` blur(${r.blur}px)` : ''}`, opacity: r.op ? 1 - r.op / 100 : null });
    },
  },
  {
    id: 'picture.crop', label: 'Crop…', icon: 'crop', tab: 'Picture', group: 'Size', edits: true, ...has,
    run: async (app) => {
      const im = selectedImage(app)!;
      let c: any = {}; try { c = JSON.parse(im.node.attrs.crop || '{}'); } catch { /* */ }
      const r = await openDialog({ title: 'Crop', help: 'Percent of the picture to trim from each edge. Use "Apply permanently" to discard the cropped area.', preview: true, fields: [
        { key: 't', label: 'Top %', type: 'number', value: c.t || 0, half: true }, { key: 'b', label: 'Bottom %', type: 'number', value: c.b || 0, half: true },
        { key: 'l', label: 'Left %', type: 'number', value: c.l || 0, half: true }, { key: 'r', label: 'Right %', type: 'number', value: c.r || 0, half: true },
        { key: 'shape', label: 'Crop to shape', type: 'select', options: ['none', 'circle', 'ellipse', 'rounded'], value: 'none', half: true },
        { key: 'perm', label: 'Apply permanently (delete cropped areas)', type: 'checkbox', value: false, half: true },
      ], onChange: (x, ctl) => ctl.setPreview(`<img src="${im.node.attrs.src}" style="max-width:100%;max-height:180px;clip-path:${x.shape === 'circle' ? 'circle(50%)' : x.shape === 'ellipse' ? 'ellipse(50% 50%)' : `inset(${x.t}% ${x.r}% ${x.b}% ${x.l}%${x.shape === 'rounded' ? ' round 12%' : ''})`}">`) });
      if (!r) return;
      if (r.perm || r.shape !== 'none') {
        const img = new Image();
        img.src = im.node.attrs.src;
        await img.decode().catch(() => undefined);
        const sx = (img.naturalWidth * r.l) / 100, sy = (img.naturalHeight * r.t) / 100;
        const sw = img.naturalWidth * (1 - (r.l + r.r) / 100), sh = img.naturalHeight * (1 - (r.t + r.b) / 100);
        const cv = document.createElement('canvas'); cv.width = Math.max(1, sw); cv.height = Math.max(1, sh);
        const ctx = cv.getContext('2d')!;
        if (r.shape !== 'none') { ctx.beginPath(); if (r.shape === 'rounded') { const rr = Math.min(sw, sh) * 0.12; (ctx as any).roundRect(0, 0, sw, sh, rr); } else ctx.ellipse(sw / 2, sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2); ctx.clip(); }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const a = im.node.attrs;
        setImg(app, { src: cv.toDataURL('image/png'), crop: null, width: a.width * (1 - (r.l + r.r) / 100), height: a.height * (1 - (r.t + r.b) / 100) });
      } else setImg(app, { crop: JSON.stringify({ t: r.t, b: r.b, l: r.l, r: r.r }) });
    },
  },
  {
    id: 'picture.border', label: 'Picture Border', icon: 'border_style', tab: 'Picture', group: 'Picture Styles', kind: 'menu', edits: true, ...has,
    run: (app, arg) => setImg(app, { border: arg === 'none' ? null : arg }),
    menu: () => [['none', 'No Outline'], ['1px solid #000', 'Thin Black'], ['3px solid #000', 'Thick Black'], ['2px solid #fff', 'White'], ['6px solid #fff', 'White Frame'], ['8px double #8b6c42', 'Gold Double Frame'], ['4px dashed #444', 'Dashed']].map(([a, l]) => ({ id: 'picture.border', arg: a, label: l })),
  },
  {
    id: 'picture.styles', label: 'Picture Styles', icon: 'photo_frame', tab: 'Picture', group: 'Picture Styles', kind: 'gallery', edits: true, ...has,
    run: (app, arg) => {
      const styles: Record<string, Record<string, any>> = {
        simple: { border: '6px solid #fff', shadow: true }, shadow: { shadow: true, border: null }, rounded: { crop: null, border: '1px solid #ccc' },
        polaroid: { border: '10px solid #fff', shadow: true }, bevel: { border: '6px ridge #c0c0c0' }, plain: { border: null, shadow: false },
      };
      setImg(app, styles[arg] || styles.plain);
    },
    menu: () => ['plain', 'simple', 'shadow', 'polaroid', 'bevel', 'rounded'].map((s) => ({ id: 'picture.styles', arg: s, label: s[0].toUpperCase() + s.slice(1) })),
  },
  { id: 'picture.shadow', label: 'Picture Shadow', icon: 'shadow', tab: 'Picture', group: 'Picture Styles', kind: 'toggle', edits: true, ...has, run: (app) => setImg(app, (a) => ({ shadow: !a.shadow })), isActive: (app) => !!selectedImage(app)?.node.attrs.shadow },
  {
    id: 'picture.altText', label: 'Alt Text…', icon: 'image_search', tab: 'Picture', group: 'Accessibility', edits: true, ...has,
    run: async (app) => {
      const im = selectedImage(app)!;
      const r = await openDialog({ title: 'Alt Text', help: 'Describe the picture for people who use screen readers (1–2 sentences).', fields: [{ key: 'alt', label: 'Description', type: 'textarea', rows: 3, value: im.node.attrs.alt }, { key: 'decorative', label: 'Mark as decorative', type: 'checkbox', value: im.node.attrs.alt === '' && im.node.attrs.title === 'decorative' }] });
      if (r) setImg(app, { alt: r.decorative ? '' : r.alt, title: r.decorative ? 'decorative' : im.node.attrs.title });
    },
  },
  {
    id: 'picture.change', label: 'Change Picture…', icon: 'image', tab: 'Picture', group: 'Adjust', edits: true, ...has,
    run: async (app) => { const files = await pickFile('image/*'); if (files.length) setImg(app, { src: await readFileAsDataURL(files[0]), editKind: null, editData: null }); },
  },
  {
    id: 'picture.compress', label: 'Compress Pictures…', icon: 'compress', tab: 'Picture', group: 'Adjust', edits: true,
    run: async (app) => {
      const r = await openDialog({ title: 'Compress Pictures', fields: [
        { key: 'res', label: 'Resolution', type: 'radio', options: [{ value: '220', label: 'Print (220 ppi)' }, { value: '150', label: 'Web (150 ppi)' }, { value: '96', label: 'E-mail (96 ppi)' }], value: '150' },
        { key: 'all', label: 'Apply to all pictures in the document', type: 'checkbox', value: true },
        { key: 'q', label: 'JPEG quality', type: 'range', min: 40, max: 95, value: 80 },
      ] });
      if (!r) return;
      const list: { node: PMNode; pos: number }[] = [];
      if (r.all) app.state.doc.descendants((n, pos) => { if (n.type === N.image) list.push({ node: n, pos }); return true; });
      else { const im = selectedImage(app); if (im) list.push(im); }
      let saved = 0;
      const tr = app.state.tr;
      for (const im of list) {
        const img = new Image(); img.src = im.node.attrs.src;
        try { await img.decode(); } catch { continue; }
        const targetW = Math.round(((im.node.attrs.width || img.naturalWidth * 0.75) / 72) * +r.res);
        if (img.naturalWidth <= targetW && im.node.attrs.src.length < 200000) continue;
        const scale = Math.min(1, targetW / img.naturalWidth);
        const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        const png = /image\/png/.test(im.node.attrs.src.slice(0, 30));
        const url = cv.toDataURL(png ? 'image/png' : 'image/jpeg', r.q / 100);
        if (url.length < im.node.attrs.src.length) { saved += im.node.attrs.src.length - url.length; tr.setNodeMarkup(im.pos, undefined, { ...im.node.attrs, src: url }); }
      }
      v(app).dispatch(tr);
      toast(`Saved about ${Math.round((saved * 0.75) / 1024)} KB`);
    },
  },
  {
    id: 'picture.save', label: 'Save as Picture…', icon: 'download', tab: 'Picture', group: 'Adjust', ...has,
    run: async (app) => {
      const im = selectedImage(app)!;
      const blob = await (await fetch(im.node.attrs.src)).blob();
      const ext = (blob.type.split('/')[1] || 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg');
      const { saveAs } = await import('../platform/native');
      await saveAs(blob, `${im.node.attrs.alt || 'picture'}.${ext}`);
    },
  },
  {
    id: 'picture.link', label: 'Link Picture…', icon: 'link', tab: 'Picture', group: 'Adjust', edits: true, ...has,
    run: async (app) => { const im = selectedImage(app)!; const u = await promptDialog('Picture Link', 'Address:', im.node.attrs.link || 'https://'); if (u != null) setImg(app, { link: u || null }); },
  },
  {
    id: 'picture.formatDialog', label: 'Format Picture…', icon: 'tune', tab: 'Picture', group: 'Size', edits: true,
    run: (app, arg) => {
      const im = selectedImage(app, arg?.pos);
      if (!im) { toast('Select a picture first.'); return; }
      if (im.node.attrs.editKind) return editGraphicAt(app, im.pos);
      app.view.dispatch(app.state.tr.setSelection(NodeSelection.create(app.state.doc, im.pos)));
      return app.exec('picture.size');
    },
  },
  { id: 'picture.editGraphic', label: 'Edit Shape/Chart/Diagram', icon: 'edit', tab: 'Picture', group: 'Adjust', edits: true, ...has, run: (app) => editGraphicAt(app) },
  {
    id: 'picture.removeBackground', label: 'Remove Background (Simple)', icon: 'auto_fix_high', tab: 'Picture', group: 'Adjust', edits: true, ...has,
    run: async (app) => {
      const im = selectedImage(app)!;
      const r = await openDialog({ title: 'Remove Background', help: 'Makes pixels similar to the corner color transparent. Works best on plain backgrounds.', fields: [{ key: 'tol', label: 'Tolerance', type: 'range', min: 5, max: 120, value: 40 }] });
      if (!r) return;
      const img = new Image(); img.src = im.node.attrs.src; await img.decode().catch(() => undefined);
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      const [r0, g0, b0] = [d.data[0], d.data[1], d.data[2]];
      for (let i = 0; i < d.data.length; i += 4) if (Math.abs(d.data[i] - r0) + Math.abs(d.data[i + 1] - g0) + Math.abs(d.data[i + 2] - b0) < r.tol) d.data[i + 3] = 0;
      ctx.putImageData(d, 0, 0);
      setImg(app, { src: cv.toDataURL('image/png') });
    },
  },
]);
void download;
