/**
 * Shared character/paragraph property mapping for importers that read formatting as plain
 * property bags (AbiWord, KWord, HWPX, Pages, FictionBook, DocBook, LaTeX, light markups…).
 * Each importer translates its own attributes into CharProps / ParaProps and gets schema
 * marks and paragraph attributes back, so the mapping rules live in one place.
 */
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { schema } from '../editor/schema';
import { markSet } from './serialize';

const MK = schema.marks;

export interface CharProps {
  bold?: boolean; italic?: boolean; underline?: boolean | string; strike?: boolean; dstrike?: boolean;
  sup?: boolean; sub?: boolean; smallcaps?: boolean; allcaps?: boolean; code?: boolean; hidden?: boolean;
  font?: string | null; size?: number | null; color?: string | null; highlight?: string | null; shading?: string | null;
  link?: string | null; spacing?: number | null; lang?: string | null;
}

export interface ParaProps {
  style?: string; align?: string | null; indentLeft?: number | null; indentRight?: number | null; indentFirst?: number | null;
  spaceBefore?: number | null; spaceAfter?: number | null; lineHeight?: string | null; keepNext?: boolean; keepLines?: boolean;
  pageBreakBefore?: boolean; bg?: string | null; border?: string | null; dir?: string | null; outlineLevel?: number | null;
}

/** Normalize a color: "#abc", "abc123", "rgb()", named colors pass through; "auto"/transparent → null. */
export function normColor(c: string | null | undefined): string | null {
  if (!c) return null;
  const v = c.trim();
  if (!v || /^(auto|none|transparent|inherit|default)$/i.test(v)) return null;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return ('#' + v.slice(1).split('').map((x) => x + x).join('')).toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return '#' + v.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7).toLowerCase(); // #rrggbbaa
  if (/^(rgb|hsl)a?\(/i.test(v) || /^[a-z]+$/i.test(v)) return v.toLowerCase();
  return null;
}

/** Map an alignment word from any producer to the schema's values. */
export function normAlign(a: string | null | undefined): string | null {
  if (!a) return null;
  const v = a.toLowerCase();
  if (/^(left|start|begin)$/.test(v)) return 'left';
  if (/^(right|end)$/.test(v)) return 'right';
  if (/^(center|centre|centered|middle)$/.test(v)) return 'center';
  if (/^(justify|justified|both|block|distribute)$/.test(v)) return v === 'distribute' ? 'distribute' : 'justify';
  return null;
}

export function charMarks(p: CharProps, extra: readonly Mark[] = []): Mark[] {
  const m: Mark[] = [...extra];
  if (p.bold) m.push(MK.bold.create());
  if (p.italic) m.push(MK.italic.create());
  if (p.underline) m.push(MK.underline.create({ style: typeof p.underline === 'string' ? p.underline : 'single' }));
  if (p.strike) m.push(MK.strike.create());
  if (p.dstrike) m.push(MK.dstrike.create());
  if (p.sup) m.push(MK.sup.create());
  else if (p.sub) m.push(MK.sub.create());
  if (p.smallcaps) m.push(MK.smallcaps.create());
  if (p.allcaps) m.push(MK.allcaps.create());
  if (p.code) m.push(MK.code.create());
  if (p.hidden) m.push(MK.hidden.create());
  if (p.font) m.push(MK.font.create({ family: p.font }));
  if (p.size && p.size > 0 && p.size < 1000) m.push(MK.size.create({ pt: Math.round(p.size * 2) / 2 }));
  const color = normColor(p.color);
  if (color && color !== '#000000') m.push(MK.color.create({ color }));
  const hl = normColor(p.highlight);
  if (hl && hl !== '#ffffff') m.push(MK.highlight.create({ color: hl }));
  const sh = normColor(p.shading);
  if (sh && sh !== '#ffffff' && !hl) m.push(MK.shading.create({ color: sh }));
  if (p.spacing) m.push(MK.spacing.create({ pt: p.spacing }));
  if (p.lang) m.push(MK.lang.create({ lang: p.lang }));
  if (p.link && !/^\s*(javascript|vbscript):/i.test(p.link)) m.push(MK.link.create({ href: p.link }));
  return markSet(m);
}

export function paraAttrs(p: ParaProps): Record<string, any> {
  const a: Record<string, any> = {};
  if (p.style) a.style = p.style;
  const al = normAlign(p.align);
  if (al && al !== 'left') a.align = al;
  const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
  if (num(p.indentLeft)) a.indentLeft = num(p.indentLeft);
  if (num(p.indentRight)) a.indentRight = num(p.indentRight);
  if (num(p.indentFirst)) a.indentFirst = num(p.indentFirst);
  if (num(p.spaceBefore) != null) a.spaceBefore = num(p.spaceBefore);
  if (num(p.spaceAfter) != null) a.spaceAfter = num(p.spaceAfter);
  if (p.lineHeight) a.lineHeight = p.lineHeight;
  if (p.keepNext) a.keepNext = true;
  if (p.keepLines) a.keepLines = true;
  if (p.pageBreakBefore) a.pageBreakBefore = true;
  const bg = normColor(p.bg);
  if (bg && bg !== '#ffffff') a.bg = bg;
  if (p.border) a.border = p.border;
  if (p.dir) a.dir = p.dir;
  if (p.outlineLevel) a.outlineLevel = p.outlineLevel;
  return a;
}

/** Collects inline nodes, merging adjacent text with identical marks. */
export class InlineBuf {
  items: PMNode[] = [];
  text(t: string, marks: readonly Mark[] = []): void {
    if (!t) return;
    const last = this.items[this.items.length - 1];
    if (last && last.isText && sameMarks(last.marks, marks)) this.items[this.items.length - 1] = schema.text(last.text + t, last.marks);
    else this.items.push(schema.text(t, marks as Mark[]));
  }
  node(n: PMNode | null | undefined): void { if (n) this.items.push(n); }
  get empty(): boolean { return this.items.length === 0; }
  take(): PMNode[] { const r = this.items; this.items = []; return r; }
}

function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m, i) => m.eq(b[i]));
}

/** Heading style name for a level (1–9); level 0 → Title. */
export function headingStyle(level: number): string {
  if (level <= 0) return 'Title';
  return `Heading ${Math.min(9, Math.max(1, Math.round(level)))}`;
}

export interface CellSpec {
  blocks: PMNode[]; colspan?: number; rowspan?: number; header?: boolean;
  background?: string | null; valign?: string | null; borders?: string | null; width?: number | null;
}

/** Build a table node from rows of cells (spans already resolved; covered cells omitted). */
export function makeTable(rows: CellSpec[][], opts: { headerRows?: number; width?: string | number | null; style?: string; borderless?: boolean } = {}): PMNode | null {
  const S = schema.nodes;
  const trs = rows.filter((r) => r.length).map((r, ri) => S.table_row.create(null, r.map((c) => {
    const type = c.header || ri < (opts.headerRows || 0) ? S.table_header : S.table_cell;
    const content = c.blocks.length ? c.blocks : [S.paragraph.create()];
    const attrs: Record<string, any> = { colspan: Math.max(1, c.colspan || 1), rowspan: Math.max(1, c.rowspan || 1) };
    if (c.background) attrs.background = normColor(c.background);
    if (c.valign) attrs.valign = c.valign;
    if (c.borders) attrs.borders = c.borders;
    if (c.width && c.width > 0) attrs.colwidth = Array.from({ length: attrs.colspan }, () => Math.round((c.width! * 4) / 3 / attrs.colspan));
    return type.create(attrs, content);
  })));
  if (!trs.length) return null;
  return S.table.create({ headerRows: opts.headerRows || 0, width: opts.width ?? null, style: opts.style || (opts.borderless ? 'Plain Table' : 'Table Grid') }, trs);
}

/** Header/footer text (with {PAGE}-style tokens for fields) from imported blocks, placed by alignment. */
export function hfFromBlocks(blocks: PMNode[]): { left: string; center: string; right: string } | null {
  const lines: string[] = [];
  let align: string | null = null;
  const walk = (n: PMNode) => {
    if (n.type === schema.nodes.paragraph) {
      if (align == null) align = n.attrs.align;
      let s = '';
      n.forEach((c) => {
        if (c.isText) s += c.text;
        else if (c.type === schema.nodes.field) s += `{${c.attrs.type}${c.attrs.format ? ':' + c.attrs.format : ''}}`;
        else if (c.type === schema.nodes.hard_break) s += ' ';
      });
      if (s.trim()) lines.push(s.trim());
      return;
    }
    n.forEach(walk);
  };
  blocks.forEach(walk);
  const text = lines.join(' ').trim();
  if (!text) return null;
  const tabs = text.split('\t');
  if (tabs.length >= 2) return { left: tabs[0].trim(), center: tabs.length >= 3 ? tabs[1].trim() : '', right: tabs[tabs.length - 1].trim() };
  const key = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  return { left: '', center: '', right: '', [key]: text };
}
