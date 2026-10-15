/** SVG generators for shapes, diagrams and charts. Output is embedded as an editable image. */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const svgToDataUrl = (svg: string) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

export const PALETTE = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e', '#636363', '#997300'];

// ------------------------------------------------------------------------------------------
// Shapes

export interface ShapeData { kind: string; fill: string; stroke: string; strokeWidth: number; text: string; textColor: string; w: number; h: number; font?: string; fontSize?: number }

export const SHAPES: { kind: string; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' }, { kind: 'rounded', label: 'Rounded Rectangle' }, { kind: 'ellipse', label: 'Oval' },
  { kind: 'triangle', label: 'Triangle' }, { kind: 'rtriangle', label: 'Right Triangle' }, { kind: 'diamond', label: 'Diamond' },
  { kind: 'pentagon', label: 'Pentagon' }, { kind: 'hexagon', label: 'Hexagon' }, { kind: 'octagon', label: 'Octagon' },
  { kind: 'parallelogram', label: 'Parallelogram' }, { kind: 'trapezoid', label: 'Trapezoid' }, { kind: 'cross', label: 'Cross' },
  { kind: 'arrowRight', label: 'Right Arrow' }, { kind: 'arrowLeft', label: 'Left Arrow' }, { kind: 'arrowUp', label: 'Up Arrow' },
  { kind: 'arrowDown', label: 'Down Arrow' }, { kind: 'arrowLR', label: 'Left-Right Arrow' }, { kind: 'chevron', label: 'Chevron' },
  { kind: 'star5', label: '5-Point Star' }, { kind: 'star6', label: '6-Point Star' }, { kind: 'burst', label: 'Explosion' },
  { kind: 'heart', label: 'Heart' }, { kind: 'lightning', label: 'Lightning Bolt' }, { kind: 'moon', label: 'Moon' },
  { kind: 'cloud', label: 'Cloud' }, { kind: 'callout', label: 'Speech Callout' }, { kind: 'thought', label: 'Thought Bubble' },
  { kind: 'banner', label: 'Ribbon Banner' }, { kind: 'scroll', label: 'Scroll' }, { kind: 'frame', label: 'Frame' },
  { kind: 'line', label: 'Line' }, { kind: 'arrowLine', label: 'Arrow' }, { kind: 'doubleArrowLine', label: 'Double Arrow' },
  { kind: 'flowProcess', label: 'Flowchart: Process' }, { kind: 'flowDecision', label: 'Flowchart: Decision' }, { kind: 'flowTerminator', label: 'Flowchart: Terminator' },
  { kind: 'flowData', label: 'Flowchart: Data' }, { kind: 'flowDocument', label: 'Flowchart: Document' }, { kind: 'flowDatabase', label: 'Flowchart: Database' },
  { kind: 'brace', label: 'Left Brace' }, { kind: 'bracket', label: 'Left Bracket' }, { kind: 'smiley', label: 'Smiley Face' },
];

function poly(pts: [number, number][]) { return `<polygon points="${pts.map((p) => p.join(',')).join(' ')}"/>`; }
function regular(n: number, w: number, h: number, rot = -Math.PI / 2) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; pts.push([w / 2 + (w / 2 - 2) * Math.cos(a), h / 2 + (h / 2 - 2) * Math.sin(a)]); }
  return poly(pts);
}
function star(n: number, w: number, h: number, inner = 0.45) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : 1;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push([w / 2 + (w / 2 - 2) * r * Math.cos(a), h / 2 + (h / 2 - 2) * r * Math.sin(a)]);
  }
  return poly(pts);
}

export function shapeSvg(d: ShapeData): string {
  const { w, h } = d;
  const m = 2;
  let body = '';
  switch (d.kind) {
    case 'rect': case 'flowProcess': body = `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}"/>`; break;
    case 'rounded': body = `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" rx="${Math.min(w, h) / 6}"/>`; break;
    case 'flowTerminator': body = `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" rx="${h / 2}"/>`; break;
    case 'ellipse': body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - m}" ry="${h / 2 - m}"/>`; break;
    case 'triangle': body = poly([[w / 2, m], [w - m, h - m], [m, h - m]]); break;
    case 'rtriangle': body = poly([[m, m], [w - m, h - m], [m, h - m]]); break;
    case 'diamond': case 'flowDecision': body = poly([[w / 2, m], [w - m, h / 2], [w / 2, h - m], [m, h / 2]]); break;
    case 'pentagon': body = regular(5, w, h); break;
    case 'hexagon': body = regular(6, w, h, 0); break;
    case 'octagon': body = regular(8, w, h, Math.PI / 8); break;
    case 'parallelogram': case 'flowData': body = poly([[w * 0.2, m], [w - m, m], [w * 0.8, h - m], [m, h - m]]); break;
    case 'trapezoid': body = poly([[w * 0.2, m], [w * 0.8, m], [w - m, h - m], [m, h - m]]); break;
    case 'cross': body = poly([[w / 3, m], [2 * w / 3, m], [2 * w / 3, h / 3], [w - m, h / 3], [w - m, 2 * h / 3], [2 * w / 3, 2 * h / 3], [2 * w / 3, h - m], [w / 3, h - m], [w / 3, 2 * h / 3], [m, 2 * h / 3], [m, h / 3], [w / 3, h / 3]]); break;
    case 'arrowRight': body = poly([[m, h * 0.3], [w * 0.6, h * 0.3], [w * 0.6, m], [w - m, h / 2], [w * 0.6, h - m], [w * 0.6, h * 0.7], [m, h * 0.7]]); break;
    case 'arrowLeft': body = poly([[w - m, h * 0.3], [w * 0.4, h * 0.3], [w * 0.4, m], [m, h / 2], [w * 0.4, h - m], [w * 0.4, h * 0.7], [w - m, h * 0.7]]); break;
    case 'arrowUp': body = poly([[w * 0.3, h - m], [w * 0.3, h * 0.4], [m, h * 0.4], [w / 2, m], [w - m, h * 0.4], [w * 0.7, h * 0.4], [w * 0.7, h - m]]); break;
    case 'arrowDown': body = poly([[w * 0.3, m], [w * 0.3, h * 0.6], [m, h * 0.6], [w / 2, h - m], [w - m, h * 0.6], [w * 0.7, h * 0.6], [w * 0.7, m]]); break;
    case 'arrowLR': body = poly([[m, h / 2], [w * 0.25, m], [w * 0.25, h * 0.3], [w * 0.75, h * 0.3], [w * 0.75, m], [w - m, h / 2], [w * 0.75, h - m], [w * 0.75, h * 0.7], [w * 0.25, h * 0.7], [w * 0.25, h - m]]); break;
    case 'chevron': body = poly([[m, m], [w * 0.7, m], [w - m, h / 2], [w * 0.7, h - m], [m, h - m], [w * 0.3, h / 2]]); break;
    case 'star5': body = star(5, w, h, 0.4); break;
    case 'star6': body = star(6, w, h, 0.55); break;
    case 'burst': body = star(12, w, h, 0.7); break;
    case 'heart': body = `<path d="M${w / 2},${h * 0.9} C${w * 0.05},${h * 0.55} ${w * 0.02},${h * 0.15} ${w * 0.27},${h * 0.1} C${w * 0.42},${h * 0.07} ${w / 2},${h * 0.2} ${w / 2},${h * 0.28} C${w / 2},${h * 0.2} ${w * 0.58},${h * 0.07} ${w * 0.73},${h * 0.1} C${w * 0.98},${h * 0.15} ${w * 0.95},${h * 0.55} ${w / 2},${h * 0.9}Z"/>`; break;
    case 'lightning': body = poly([[w * 0.4, m], [w * 0.75, m], [w * 0.55, h * 0.4], [w * 0.8, h * 0.4], [w * 0.25, h - m], [w * 0.4, h * 0.55], [w * 0.15, h * 0.55]]); break;
    case 'moon': body = `<path d="M${w * 0.65},${m} A${w * 0.48},${h * 0.48} 0 1 0 ${w * 0.65},${h - m} A${w * 0.36},${h * 0.42} 0 1 1 ${w * 0.65},${m}Z"/>`; break;
    case 'cloud': body = `<path d="M${w * 0.25},${h * 0.85} C${w * 0.02},${h * 0.85} ${w * 0.02},${h * 0.5} ${w * 0.2},${h * 0.48} C${w * 0.15},${h * 0.2} ${w * 0.45},${h * 0.1} ${w * 0.55},${h * 0.3} C${w * 0.65},${h * 0.08} ${w * 0.95},${h * 0.2} ${w * 0.85},${h * 0.48} C${w * 1.0},${h * 0.55} ${w * 0.95},${h * 0.85} ${w * 0.75},${h * 0.85}Z"/>`; break;
    case 'callout': body = `<path d="M${m},${m} H${w - m} V${h * 0.7} H${w * 0.45} L${w * 0.25},${h - m} L${w * 0.3},${h * 0.7} H${m}Z"/>`; break;
    case 'thought': body = `<ellipse cx="${w / 2}" cy="${h * 0.4}" rx="${w / 2 - m}" ry="${h * 0.38}"/><circle cx="${w * 0.22}" cy="${h * 0.85}" r="${Math.min(w, h) * 0.06}"/><circle cx="${w * 0.12}" cy="${h * 0.95}" r="${Math.min(w, h) * 0.03}"/>`; break;
    case 'banner': body = poly([[m, h * 0.2], [w * 0.15, h * 0.2], [w * 0.15, m], [w * 0.85, m], [w * 0.85, h * 0.2], [w - m, h * 0.2], [w * 0.9, h * 0.5], [w - m, h * 0.8], [w * 0.15, h * 0.8], [w * 0.15, h - m], [m, h * 0.8], [w * 0.1, h * 0.5]]); break;
    case 'scroll': body = `<path d="M${w * 0.1},${h * 0.15} H${w - m} V${h * 0.85} H${w * 0.1}Z"/><ellipse cx="${w * 0.1}" cy="${h / 2}" rx="${w * 0.08}" ry="${h * 0.35}"/>`; break;
    case 'frame': body = `<path fill-rule="evenodd" d="M${m},${m}H${w - m}V${h - m}H${m}Z M${w * 0.12},${h * 0.12}V${h * 0.88}H${w * 0.88}V${h * 0.12}Z"/>`; break;
    case 'line': return wrap(d, `<line x1="${m}" y1="${h / 2}" x2="${w - m}" y2="${h / 2}" fill="none"/>`, true);
    case 'arrowLine': return wrap(d, `<defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="${d.stroke}"/></marker></defs><line x1="${m}" y1="${h / 2}" x2="${w - 8}" y2="${h / 2}" marker-end="url(#a)" fill="none"/>`, true);
    case 'doubleArrowLine': return wrap(d, `<defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="${d.stroke}"/></marker></defs><line x1="8" y1="${h / 2}" x2="${w - 8}" y2="${h / 2}" marker-end="url(#a)" marker-start="url(#a)" fill="none"/>`, true);
    case 'flowDocument': body = `<path d="M${m},${m} H${w - m} V${h * 0.8} C${w * 0.75},${h * 0.65} ${w * 0.5},${h * 1.05} ${m},${h * 0.85}Z"/>`; break;
    case 'flowDatabase': body = `<path d="M${m},${h * 0.15} A${w / 2 - m},${h * 0.13} 0 0 1 ${w - m},${h * 0.15} V${h * 0.85} A${w / 2 - m},${h * 0.13} 0 0 1 ${m},${h * 0.85}Z"/><path fill="none" d="M${m},${h * 0.15} A${w / 2 - m},${h * 0.13} 0 0 0 ${w - m},${h * 0.15}"/>`; break;
    case 'brace': return wrap(d, `<path fill="none" d="M${w * 0.7},${m} C${w * 0.4},${m} ${w * 0.5},${h / 2} ${w * 0.2},${h / 2} C${w * 0.5},${h / 2} ${w * 0.4},${h - m} ${w * 0.7},${h - m}"/>`, true);
    case 'bracket': return wrap(d, `<path fill="none" d="M${w * 0.7},${m} H${w * 0.3} V${h - m} H${w * 0.7}"/>`, true);
    case 'smiley': body = `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - m}"/><circle cx="${w * 0.36}" cy="${h * 0.38}" r="${Math.min(w, h) * 0.05}" fill="${d.stroke}"/><circle cx="${w * 0.64}" cy="${h * 0.38}" r="${Math.min(w, h) * 0.05}" fill="${d.stroke}"/><path fill="none" d="M${w * 0.3},${h * 0.6} Q${w / 2},${h * 0.8} ${w * 0.7},${h * 0.6}"/>`; break;
    default: body = `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}"/>`;
  }
  return wrap(d, body, false);
}

function wrap(d: ShapeData, body: string, lineOnly: boolean): string {
  const text = d.text ? textBlock(d.text, d.w / 2, d.h / 2, d.textColor, d.fontSize || 14, d.w * 0.8, d.font) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}"><g fill="${lineOnly ? 'none' : d.fill}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}" stroke-linejoin="round">${body}</g>${text}</svg>`;
}

function textBlock(text: string, cx: number, cy: number, color: string, size: number, maxW: number, font = 'Carlito, Arial, sans-serif'): string {
  const lines = wrapText(text, maxW, size);
  const lh = size * 1.2;
  const top = cy - ((lines.length - 1) * lh) / 2;
  return `<text x="${cx}" y="${top}" fill="${color}" font-family="${esc(font)}" font-size="${size}" text-anchor="middle" dominant-baseline="middle">${lines.map((l, i) => `<tspan x="${cx}" y="${top + i * lh}">${esc(l)}</tspan>`).join('')}</text>`;
}

function wrapText(text: string, maxW: number, size: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (t.length * size * 0.52 > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// Diagrams (list/process/cycle/hierarchy/pyramid/venn/matrix/timeline)

export interface DiagramData { kind: string; items: string[]; colors: string[]; w: number; h: number; textColor?: string }

export const DIAGRAMS: { kind: string; label: string; help: string }[] = [
  { kind: 'process', label: 'Basic Process', help: 'Steps in order, one per line' },
  { kind: 'chevrons', label: 'Chevron Process', help: 'Steps in order, one per line' },
  { kind: 'cycle', label: 'Cycle', help: 'Stages of a continuing cycle' },
  { kind: 'hierarchy', label: 'Hierarchy / Org Chart', help: 'Indent child lines with a leading "-" per level' },
  { kind: 'pyramid', label: 'Pyramid', help: 'Top to bottom' },
  { kind: 'funnel', label: 'Funnel', help: 'Top to bottom' },
  { kind: 'venn', label: 'Venn', help: '2 or 3 overlapping sets' },
  { kind: 'matrix', label: 'Matrix (2×2)', help: 'Four quadrants' },
  { kind: 'list', label: 'Vertical List', help: 'Items, one per line' },
  { kind: 'blocks', label: 'Block List', help: 'Items, one per line' },
  { kind: 'timeline', label: 'Timeline', help: '"Date: event" one per line' },
  { kind: 'radial', label: 'Radial', help: 'First line is the center' },
];

export function diagramSvg(d: DiagramData): string {
  const { w, h } = d;
  const items = d.items.filter((s) => s.trim());
  const col = (i: number) => d.colors[i % d.colors.length] || PALETTE[i % PALETTE.length];
  const tc = d.textColor || '#ffffff';
  const n = Math.max(1, items.length);
  let body = '';
  const label = (t: string, x: number, y: number, maxW: number, size = 13, color = tc) => textBlock(t, x, y, color, size, maxW);
  switch (d.kind) {
    case 'process': {
      const bw = (w - (n - 1) * 30) / n, bh = Math.min(h - 10, 80);
      items.forEach((t, i) => {
        const x = i * (bw + 30), y = (h - bh) / 2;
        body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="${col(i)}"/>` + label(t, x + bw / 2, y + bh / 2, bw - 10);
        if (i < n - 1) body += `<polygon points="${x + bw + 6},${h / 2 - 9} ${x + bw + 24},${h / 2} ${x + bw + 6},${h / 2 + 9}" fill="#999"/>`;
      });
      break;
    }
    case 'chevrons': {
      const bw = w / n + 10, bh = Math.min(h - 10, 70);
      items.forEach((t, i) => {
        const x = i * (bw - 14), y = (h - bh) / 2, p = 22;
        body += `<polygon points="${x},${y} ${x + bw - p},${y} ${x + bw},${y + bh / 2} ${x + bw - p},${y + bh} ${x},${y + bh} ${x + (i ? p : 0)},${y + bh / 2}" fill="${col(i)}"/>` + label(t, x + bw / 2, y + bh / 2, bw - 2 * p);
      });
      break;
    }
    case 'cycle': {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 45, r = Math.min(60, (Math.PI * R) / n - 6);
      body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#bbb" stroke-width="3" stroke-dasharray="6 6"/>`;
      items.forEach((t, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        body += `<circle cx="${x}" cy="${y}" r="${r}" fill="${col(i)}"/>` + label(t, x, y, r * 1.7, 12);
      });
      break;
    }
    case 'radial': {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 45;
      const [center, ...rest] = items;
      rest.forEach((t, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, rest.length);
        const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        body += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#aaa" stroke-width="3"/><circle cx="${x}" cy="${y}" r="38" fill="${col(i + 1)}"/>` + label(t, x, y, 66, 11);
      });
      body += `<circle cx="${cx}" cy="${cy}" r="55" fill="${col(0)}"/>` + label(center || '', cx, cy, 100, 14);
      break;
    }
    case 'hierarchy': {
      interface T { text: string; kids: T[]; depth: number }
      const root: T = { text: '', kids: [], depth: -1 };
      const stack: T[] = [root];
      for (const raw of items) {
        const m = /^(-*)\s*(.*)$/.exec(raw)!;
        const depth = m[1].length;
        const node: T = { text: m[2], kids: [], depth };
        while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
        stack[stack.length - 1].kids.push(node);
        stack.push(node);
      }
      const levels: T[][] = [];
      const walk = (t: T, d: number) => { (levels[d] ||= []).push(t); t.kids.forEach((k) => walk(k, d + 1)); };
      root.kids.forEach((k) => walk(k, 0));
      const lh = h / Math.max(1, levels.length);
      const pos = new Map<T, { x: number; y: number }>();
      levels.forEach((lv, li) => {
        const bw = Math.min(150, w / lv.length - 12);
        lv.forEach((t, i) => {
          const x = (w / lv.length) * (i + 0.5), y = lh * (li + 0.5);
          pos.set(t, { x, y });
          body += `<rect x="${x - bw / 2}" y="${y - 22}" width="${bw}" height="44" rx="6" fill="${col(li)}"/>` + label(t.text, x, y, bw - 8, 12);
        });
      });
      let lines = '';
      const link = (t: T) => t.kids.forEach((k) => { const a = pos.get(t)!, b = pos.get(k)!; lines += `<path d="M${a.x},${a.y + 22} V${(a.y + b.y) / 2} H${b.x} V${b.y - 22}" fill="none" stroke="#999" stroke-width="2"/>`; link(k); });
      root.kids.forEach(link);
      body = lines + body;
      break;
    }
    case 'pyramid': case 'funnel': {
      const lh = h / n;
      items.forEach((t, i) => {
        const k = d.kind === 'pyramid' ? i : n - 1 - i;
        const top = (w / 2) * (k / n), bot = (w / 2) * ((k + 1) / n);
        const y = i * lh;
        const [a, b] = d.kind === 'pyramid' ? [top, bot] : [bot, top];
        body += `<polygon points="${w / 2 - a},${y} ${w / 2 + a},${y} ${w / 2 + b},${y + lh - 3} ${w / 2 - b},${y + lh - 3}" fill="${col(i)}"/>` + label(t, w / 2, y + lh / 2, Math.max(60, (a + b) * 0.9), 12);
      });
      if (d.kind === 'pyramid') body = body.replace(/points="([\d.]+),0 ([\d.]+),0/, `points="${w / 2},0 ${w / 2},0`);
      break;
    }
    case 'venn': {
      const r = Math.min(w, h) * 0.3;
      const centers = n >= 3 ? [[w / 2 - r * 0.6, h / 2 - r * 0.35], [w / 2 + r * 0.6, h / 2 - r * 0.35], [w / 2, h / 2 + r * 0.6]] : [[w / 2 - r * 0.6, h / 2], [w / 2 + r * 0.6, h / 2]];
      centers.forEach((c, i) => { if (items[i] !== undefined) body += `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="${col(i)}" fill-opacity="0.55"/>`; });
      centers.forEach((c, i) => { if (items[i] !== undefined) body += label(items[i], c[0] + (c[0] - w / 2) * 0.5, c[1] + (c[1] - h / 2) * 0.5, r, 13, '#000'); });
      break;
    }
    case 'matrix': {
      const q = [[0, 0], [1, 0], [0, 1], [1, 1]];
      q.forEach(([cx, cy], i) => {
        const x = cx * (w / 2), y = cy * (h / 2);
        body += `<rect x="${x + 3}" y="${y + 3}" width="${w / 2 - 6}" height="${h / 2 - 6}" rx="6" fill="${col(i)}"/>` + label(items[i] || '', x + w / 4, y + h / 4, w / 2 - 20);
      });
      break;
    }
    case 'list': {
      const lh = h / n;
      items.forEach((t, i) => { body += `<rect x="0" y="${i * lh + 3}" width="14" height="${lh - 6}" fill="${col(i)}"/><rect x="18" y="${i * lh + 3}" width="${w - 18}" height="${lh - 6}" fill="${col(i)}" fill-opacity="0.18"/>` + label(t, 18 + (w - 18) / 2, i * lh + lh / 2, w - 40, 13, '#222'); });
      break;
    }
    case 'blocks': {
      const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
      const bw = w / cols, bh = h / rows;
      items.forEach((t, i) => { const x = (i % cols) * bw, y = Math.floor(i / cols) * bh; body += `<rect x="${x + 4}" y="${y + 4}" width="${bw - 8}" height="${bh - 8}" rx="4" fill="${col(i)}"/>` + label(t, x + bw / 2, y + bh / 2, bw - 16); });
      break;
    }
    case 'timeline': {
      const y = h / 2;
      body += `<line x1="10" y1="${y}" x2="${w - 10}" y2="${y}" stroke="#666" stroke-width="4"/>`;
      items.forEach((t, i) => {
        const x = 30 + (i * (w - 60)) / Math.max(1, n - 1);
        const [date, ...ev] = t.split(':');
        const up = i % 2 === 0;
        body += `<circle cx="${x}" cy="${y}" r="9" fill="${col(i)}"/><line x1="${x}" y1="${y}" x2="${x}" y2="${up ? y - 40 : y + 40}" stroke="${col(i)}" stroke-width="2"/>`;
        body += label(date.trim(), x, up ? y - 52 : y + 52, 110, 12, '#222') + label(ev.join(':').trim(), x, up ? y - 80 : y + 80, 120, 11, '#555');
      });
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-4 -4 ${w + 8} ${h + 8}" font-family="Carlito, Arial, sans-serif">${body}</svg>`;
}

// ------------------------------------------------------------------------------------------
// Charts

export interface ChartData { kind: string; title: string; categories: string[]; series: { name: string; values: number[] }[]; w: number; h: number; legend: boolean; labels: boolean; colors?: string[] }

export const CHARTS = [
  { kind: 'column', label: 'Clustered Column' }, { kind: 'stackedColumn', label: 'Stacked Column' }, { kind: 'bar', label: 'Clustered Bar' },
  { kind: 'line', label: 'Line' }, { kind: 'area', label: 'Area' }, { kind: 'pie', label: 'Pie' }, { kind: 'doughnut', label: 'Doughnut' },
  { kind: 'scatter', label: 'Scatter (X = categories)' }, { kind: 'radar', label: 'Radar' },
];

export function parseChartCsv(csv: string): { categories: string[]; series: { name: string; values: number[] }[] } {
  const rows = csv.trim().split(/\r?\n/).map((l) => l.split(/\t|,/).map((c) => c.trim()));
  const header = rows[0] || [];
  const series = header.slice(1).map((name, i) => ({ name, values: rows.slice(1).map((r) => parseFloat(r[i + 1]) || 0) }));
  return { categories: rows.slice(1).map((r) => r[0]), series };
}

export function chartToCsv(d: Pick<ChartData, 'categories' | 'series'>): string {
  return [['', ...d.series.map((s) => s.name)].join(','), ...d.categories.map((c, i) => [c, ...d.series.map((s) => s.values[i] ?? '')].join(','))].join('\n');
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function chartSvg(d: ChartData): string {
  const { w, h } = d;
  const colors = d.colors?.length ? d.colors : PALETTE;
  const titleH = d.title ? 28 : 6;
  const legendH = d.legend ? 24 : 0;
  let body = d.title ? `<text x="${w / 2}" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${esc(d.title)}</text>` : '';
  const pl = 44, pr = 12, pt = titleH + 6, pb = 30 + legendH;
  const pw = w - pl - pr, ph = h - pt - pb;
  const cats = d.categories, ser = d.series;
  const fmt = (n: number) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n * 100) / 100));

  if (d.kind === 'pie' || d.kind === 'doughnut') {
    const vals = ser[0]?.values || [];
    const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const cx = w / 2, cy = pt + ph / 2, R = Math.min(pw, ph) / 2;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, r: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      const ri = d.kind === 'doughnut' ? R * 0.55 : 0;
      body += `<path d="M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, ri)} ${ri ? `A${ri},${ri} 0 ${large} 0 ${p(a0, ri)}` : ''}Z" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="1.5"/>`;
      if (d.labels && v > 0) { const am = (a0 + a1) / 2; body += `<text x="${cx + R * 0.75 * Math.cos(am)}" y="${cy + R * 0.75 * Math.sin(am)}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#fff">${Math.round((v / total) * 100)}%</text>`; }
      a0 = a1;
    });
    if (d.legend) body += legend(cats, colors, w, h - legendH + 6);
    return svgWrap(w, h, body);
  }

  if (d.kind === 'radar') {
    const cx = w / 2, cy = pt + ph / 2, R = Math.min(pw, ph) / 2;
    const max = niceMax(Math.max(...ser.flatMap((s) => s.values), 0));
    const n = cats.length || 1;
    for (let k = 1; k <= 4; k++) body += `<polygon points="${cats.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return `${cx + R * (k / 4) * Math.cos(a)},${cy + R * (k / 4) * Math.sin(a)}`; }).join(' ')}" fill="none" stroke="#ddd"/>`;
    cats.forEach((c, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; body += `<text x="${cx + (R + 12) * Math.cos(a)}" y="${cy + (R + 12) * Math.sin(a)}" font-size="10" text-anchor="middle" fill="#555">${esc(c)}</text>`; });
    ser.forEach((s, si) => {
      body += `<polygon points="${s.values.map((v, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return `${cx + R * (v / max) * Math.cos(a)},${cy + R * (v / max) * Math.sin(a)}`; }).join(' ')}" fill="${colors[si % colors.length]}" fill-opacity="0.3" stroke="${colors[si % colors.length]}" stroke-width="2"/>`;
    });
    if (d.legend) body += legend(ser.map((s) => s.name), colors, w, h - legendH + 6);
    return svgWrap(w, h, body);
  }

  const stacked = d.kind === 'stackedColumn';
  const allVals = stacked ? cats.map((_, i) => ser.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0)) : ser.flatMap((s) => s.values);
  const minV = Math.min(0, ...allVals);
  const maxV = niceMax(Math.max(...allVals, 0));
  const horizontal = d.kind === 'bar';
  const scale = (v: number) => ((v - minV) / (maxV - minV || 1));
  // grid
  for (let k = 0; k <= 5; k++) {
    const val = minV + ((maxV - minV) * k) / 5;
    if (horizontal) { const x = pl + pw * (k / 5); body += `<line x1="${x}" y1="${pt}" x2="${x}" y2="${pt + ph}" stroke="#e5e5e5"/><text x="${x}" y="${pt + ph + 14}" font-size="10" text-anchor="middle" fill="#666">${fmt(val)}</text>`; }
    else { const y = pt + ph - ph * (k / 5); body += `<line x1="${pl}" y1="${y}" x2="${pl + pw}" y2="${y}" stroke="#e5e5e5"/><text x="${pl - 6}" y="${y + 3}" font-size="10" text-anchor="end" fill="#666">${fmt(val)}</text>`; }
  }
  const n = cats.length || 1;
  const band = (horizontal ? ph : pw) / n;
  if (d.kind === 'column' || d.kind === 'bar' || stacked) {
    const gap = band * 0.2;
    const bw = stacked ? band - 2 * gap : (band - 2 * gap) / Math.max(1, ser.length);
    cats.forEach((c, i) => {
      let acc = 0;
      ser.forEach((s, si) => {
        const val = s.values[i] || 0;
        const color = colors[si % colors.length];
        if (horizontal) {
          const y = pt + i * band + gap + si * bw;
          const x0 = pl + pw * scale(0), x1 = pl + pw * scale(val);
          body += `<rect x="${Math.min(x0, x1)}" y="${y}" width="${Math.abs(x1 - x0)}" height="${bw - 1}" fill="${color}"/>`;
          if (d.labels) body += `<text x="${x1 + 3}" y="${y + bw / 2 + 3}" font-size="10" fill="#333">${fmt(val)}</text>`;
        } else {
          const x = pl + i * band + gap + (stacked ? 0 : si * bw);
          const base = stacked ? acc : 0;
          const y0 = pt + ph - ph * scale(base), y1 = pt + ph - ph * scale(base + val);
          body += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw - 1}" height="${Math.abs(y0 - y1)}" fill="${color}"/>`;
          if (d.labels) body += `<text x="${x + bw / 2}" y="${Math.min(y0, y1) - 3}" font-size="10" text-anchor="middle" fill="#333">${fmt(val)}</text>`;
          acc += val;
        }
      });
      if (horizontal) body += `<text x="${pl - 6}" y="${pt + i * band + band / 2 + 3}" font-size="10" text-anchor="end" fill="#444">${esc(c)}</text>`;
      else body += `<text x="${pl + i * band + band / 2}" y="${pt + ph + 14}" font-size="10" text-anchor="middle" fill="#444">${esc(c)}</text>`;
    });
  } else {
    cats.forEach((c, i) => { body += `<text x="${pl + i * band + band / 2}" y="${pt + ph + 14}" font-size="10" text-anchor="middle" fill="#444">${esc(c)}</text>`; });
    ser.forEach((s, si) => {
      const color = colors[si % colors.length];
      const pts = s.values.map((val, i) => [pl + i * band + band / 2, pt + ph - ph * scale(val)]);
      if (d.kind === 'area') body += `<polygon points="${pl + band / 2},${pt + ph - ph * scale(0)} ${pts.map((p) => p.join(',')).join(' ')} ${pts.length ? pts[pts.length - 1][0] : 0},${pt + ph - ph * scale(0)}" fill="${color}" fill-opacity="0.35"/>`;
      if (d.kind !== 'scatter') body += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
      pts.forEach((p, i) => { body += `<circle cx="${p[0]}" cy="${p[1]}" r="${d.kind === 'scatter' ? 4 : 3}" fill="${color}"/>`; if (d.labels) body += `<text x="${p[0]}" y="${p[1] - 7}" font-size="10" text-anchor="middle" fill="#333">${fmt(s.values[i])}</text>`; });
    });
  }
  body += `<line x1="${pl}" y1="${pt + ph}" x2="${pl + pw}" y2="${pt + ph}" stroke="#888"/><line x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt + ph}" stroke="#888"/>`;
  if (d.legend) body += legend(ser.map((s) => s.name), colors, w, h - legendH + 6);
  return svgWrap(w, h, body);
}

function legend(names: string[], colors: string[], w: number, y: number): string {
  const itemW = Math.min(140, w / Math.max(1, names.length));
  const start = (w - itemW * names.length) / 2;
  return names.map((n, i) => `<rect x="${start + i * itemW}" y="${y}" width="10" height="10" fill="${colors[i % colors.length]}"/><text x="${start + i * itemW + 14}" y="${y + 9}" font-size="11" fill="#333">${esc(n)}</text>`).join('');
}

function svgWrap(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Carlito, Arial, sans-serif"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
}

/** Rasterize an SVG data URL to PNG (for formats that don't support SVG). */
export function rasterize(svgUrl: string, w: number, h: number, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = svgUrl;
  });
}
