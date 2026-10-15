/** Draw tab: ink canvas (pen, pencil, highlighter, eraser), signature capture. */
import { safeColor, safeNum } from '../util/sanitize';
import { def } from './registry';
import type { App } from '../app';
import { schema } from '../editor/schema';
import { insertInline } from '../editor/ops';
import { openDialog } from '../ui/dialog';
import { h } from '../ui/dom';

const N = schema.nodes;

interface Stroke { tool: string; color: string; width: number; pts: [number, number, number][] }
interface InkData { w: number; h: number; strokes: Stroke[]; bg?: string }

export const inkPrefs = { tool: 'pen', color: '#1f3864', width: 3 };

function strokePath(s: Stroke): string {
  // Points come from document data (editData), so coerce every coordinate to a number.
  const n = (v: unknown) => safeNum(v, 0).toFixed(1);
  const pts = Array.isArray(s.pts) ? s.pts : [];
  if (pts.length < 2) { const [x, y] = pts[0] || [0, 0]; return `M${n(x)},${n(y)} l0.1,0`; }
  let d = `M${n(pts[0][0])},${n(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i].map(Number), [x1, y1] = pts[i + 1].map(Number);
    d += ` Q${n(x0)},${n(y0)} ${n((x0 + x1) / 2)},${n((y0 + y1) / 2)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${n(l[0])},${n(l[1])}`;
}

export function inkSvg(d: InkData): string {
  const paths = d.strokes.map((s) => {
    const avgP = s.pts.reduce((a, p) => a + (p[2] || 0.5), 0) / (s.pts.length || 1);
    const w = s.tool === 'highlighter' ? s.width * 4 : s.width * (0.6 + avgP * 0.8);
    const op = s.tool === 'highlighter' ? 0.35 : s.tool === 'pencil' ? 0.75 : 1;
    return `<path d="${strokePath(s)}" fill="none" stroke="${safeColor(s.color)}" stroke-width="${safeNum(w, 1, 0, 500).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${op}"${s.tool === 'pencil' ? ' stroke-dasharray="0.5 0.6"' : ''}/>`;
  }).join('');
  const W = safeNum(d.w, 600, 1, 20000), H = safeNum(d.h, 400, 1, 20000);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${d.bg ? `<rect width="100%" height="100%" fill="${safeColor(d.bg, '#ffffff')}"/>` : ''}${paths}</svg>`;
}

async function inkDialog(app: App, init: InkData, title: string): Promise<InkData | null> {
  const data: InkData = JSON.parse(JSON.stringify(init));
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${data.w} ${data.h}`);
  svg.setAttribute('class', 'qf-ink-canvas');
  svg.style.touchAction = 'none';
  const render = () => { svg.innerHTML = inkSvg(data).replace(/^<svg[^>]*>|<\/svg>$/g, ''); };
  render();
  let cur: Stroke | null = null;
  const pt = (e: PointerEvent): [number, number, number] => {
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * data.w, ((e.clientY - r.top) / r.height) * data.h, e.pressure || 0.5];
  };
  const eraseAt = (p: [number, number, number]) => {
    const before = data.strokes.length;
    data.strokes = data.strokes.filter((s) => !s.pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 10));
    if (data.strokes.length !== before) render();
  };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    if (inkPrefs.tool === 'eraser') { eraseAt(pt(e)); return; }
    cur = { tool: inkPrefs.tool, color: inkPrefs.color, width: inkPrefs.width, pts: [pt(e)] };
    data.strokes.push(cur);
    render();
  });
  svg.addEventListener('pointermove', (e) => {
    if (inkPrefs.tool === 'eraser' && e.buttons) { eraseAt(pt(e)); return; }
    if (!cur) return;
    for (const ce of (e as any).getCoalescedEvents?.() || [e]) cur.pts.push(pt(ce));
    render();
  });
  const end = () => { cur = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  const toolbar = h('div', { class: 'qf-ink-tools' });
  const tools: [string, string][] = [['pen', 'edit'], ['pencil', 'draw'], ['highlighter', 'ink_highlighter'], ['eraser', 'ink_eraser']];
  const mkTool = (t: string, ic: string) => {
    const b = h('button', { class: 'qf-iconbtn' + (inkPrefs.tool === t ? ' qf-on' : ''), type: 'button', title: t, onclick: () => { inkPrefs.tool = t; toolbar.querySelectorAll('.qf-tool').forEach((x) => x.classList.remove('qf-on')); b.classList.add('qf-on'); } }, h('span', { class: 'qf-icon' }, ic));
    b.classList.add('qf-tool');
    return b;
  };
  for (const [t, ic] of tools) toolbar.appendChild(mkTool(t, ic));
  for (const c of ['#000000', '#1f3864', '#c00000', '#00b050', '#7030a0', '#ffc000', '#ffff00']) toolbar.appendChild(h('button', { class: 'qf-color', type: 'button', style: `background:${c}`, onclick: () => { inkPrefs.color = c; } }));
  const width = h('input', { type: 'range', min: '1', max: '14', value: String(inkPrefs.width) }) as HTMLInputElement;
  width.addEventListener('input', () => { inkPrefs.width = +width.value; });
  toolbar.append(width,
    h('button', { class: 'qf-iconbtn', type: 'button', title: 'Undo stroke', onclick: () => { data.strokes.pop(); render(); } }, h('span', { class: 'qf-icon' }, 'undo')),
    h('button', { class: 'qf-iconbtn', type: 'button', title: 'Clear', onclick: () => { data.strokes = []; render(); } }, h('span', { class: 'qf-icon' }, 'delete')));
  const r = await openDialog({ title, wide: true, content: h('div', { class: 'qf-ink-wrap' }, toolbar, svg), ok: 'Insert' });
  return r ? data : null;
}

async function insertInk(app: App, data: InkData, pos?: number) {
  const svg = inkSvg(data);
  const { svgToDataUrl, rasterize } = await import('../editor/graphics');
  const png = await rasterize(svgToDataUrl(svg), data.w, data.h, 2);
  const attrs = { src: png, width: Math.round(data.w * 0.75), height: Math.round(data.h * 0.75), editKind: 'ink', editData: JSON.stringify(data), alt: 'Drawing' };
  const view = app.view;
  if (pos != null) { const n = view.state.doc.nodeAt(pos); if (n) { view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...attrs })); return; } }
  insertInline(view, N.image.create(attrs));
}

def([
  {
    id: 'draw.canvas', label: 'Drawing Canvas', icon: 'draw', tab: 'Draw', group: 'Drawing', edits: true, popular: true,
    run: async (app, arg) => {
      const data = await inkDialog(app, arg?.data || { w: 600, h: 360, strokes: [] }, arg?.pos != null ? 'Edit Drawing' : 'Draw');
      if (data && data.strokes.length) await insertInk(app, data, arg?.pos);
    },
  },
  { id: 'draw.pen', label: 'Pen', icon: 'edit', tab: 'Draw', group: 'Tools', edits: true, run: (app) => { inkPrefs.tool = 'pen'; app.exec('draw.canvas'); } },
  { id: 'draw.pencil', label: 'Pencil', icon: 'draw', tab: 'Draw', group: 'Tools', edits: true, run: (app) => { inkPrefs.tool = 'pencil'; app.exec('draw.canvas'); } },
  { id: 'draw.highlighter', label: 'Highlighter Pen', icon: 'ink_highlighter', tab: 'Draw', group: 'Tools', edits: true, run: (app) => { inkPrefs.tool = 'highlighter'; app.exec('draw.canvas'); } },
  {
    id: 'draw.penSettings', label: 'Pen Color and Thickness…', icon: 'palette', tab: 'Draw', group: 'Tools',
    run: async () => { const r = await openDialog({ title: 'Pen', fields: [{ key: 'color', label: 'Color', type: 'color', value: inkPrefs.color }, { key: 'width', label: 'Thickness', type: 'range', min: 1, max: 14, value: inkPrefs.width }] }); if (r) { inkPrefs.color = r.color; inkPrefs.width = r.width; } },
  },
  {
    id: 'draw.signature', label: 'Draw Signature', icon: 'signature', tab: 'Draw', group: 'Drawing', edits: true,
    run: async (app) => { inkPrefs.tool = 'pen'; inkPrefs.color = '#0b2a6f'; inkPrefs.width = 2.5; const d = await inkDialog(app, { w: 480, h: 160, strokes: [] }, 'Sign Here'); if (d && d.strokes.length) await insertInk(app, d); },
  },
  {
    id: 'draw.graphPaper', label: 'Sketch on Graph Paper', icon: 'grid_on', tab: 'Draw', group: 'Drawing', edits: true,
    run: async (app) => { const d = await inkDialog(app, { w: 600, h: 400, strokes: [], bg: '#fbfbff' }, 'Sketch'); if (d && d.strokes.length) await insertInk(app, d); },
  },
  { id: 'draw.editDrawing', label: 'Edit Drawing', icon: 'edit', tab: 'Draw', group: 'Drawing', edits: true, run: (app) => app.exec('insert.editGraphic') },
  { id: 'draw.shapes', label: 'Shapes', icon: 'interests', tab: 'Draw', group: 'Drawing', kind: 'menu', edits: true, run: (app, arg) => app.exec('insert.shapes', arg), menu: () => [{ id: 'insert.shapes', arg: 'rect', label: 'Rectangle' }, { id: 'insert.shapes', arg: 'ellipse', label: 'Oval' }, { id: 'insert.shapes', arg: 'arrowLine', label: 'Arrow' }, { id: 'insert.shapes', arg: 'callout', label: 'Callout' }, { id: 'insert.shapes', label: 'All Shapes…' }] },
]);
