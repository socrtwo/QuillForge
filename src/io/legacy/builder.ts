/**
 * DocBuilder: the shared back end of the legacy and cross-category importers.
 *
 * A reader walks its file and calls text(), endParagraph(), table and note methods with
 * plain property objects; the builder turns them into schema nodes (marks, paragraph
 * attributes, nested lists, tables, images, footnotes) and finishes the document with the
 * same normalization the DOCX/ODT importers use. Readers never touch ProseMirror directly.
 */
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { schema } from '../../editor/schema';
import type { DocSettings, HF } from '../../editor/settings';
import { PAGE_SIZES } from '../../editor/settings';
import { buildNestedLists, finishDoc, markSet, newSettings, normalizeImportedFormatting, type FlatListItem } from '../serialize';

const S = schema;
const M = schema.marks;

export interface CharProps {
  bold?: boolean; italic?: boolean; underline?: boolean | string; strike?: boolean; dstrike?: boolean;
  sup?: boolean; sub?: boolean; smallcaps?: boolean; allcaps?: boolean; hidden?: boolean;
  outline?: boolean; shadow?: boolean;
  font?: string | null; size?: number | null; color?: string | null; highlight?: string | null;
  link?: string | null; spacing?: number | null;
}

export interface TabStop { pos: number; align?: 'left' | 'center' | 'right' | 'decimal'; leader?: string }

export interface ListInfo { ordered: boolean; level?: number; format?: string; start?: number }

export interface ParaProps {
  style?: string | null;
  align?: 'left' | 'center' | 'right' | 'justify' | null;
  indentLeft?: number | null; indentRight?: number | null; indentFirst?: number | null;
  spaceBefore?: number | null; spaceAfter?: number | null;
  /** "1.5" (multiple), "14pt" (exact) or "atleast:14". */
  lineHeight?: string | null;
  keepNext?: boolean; keepLines?: boolean; pageBreakBefore?: boolean;
  tabs?: TabStop[] | null;
  list?: ListInfo | null;
  border?: string | null; bg?: string | null;
  outlineLevel?: number | null;
}

export interface CellProps { width?: number | null; bg?: string | null; colspan?: number; rowspan?: number; valign?: string | null; header?: boolean }

type Block = { kind: 'node'; node: PMNode } | { kind: 'list'; item: FlatListItem };

interface Container { blocks: Block[] }
interface TableBuild { rows: { cells: { props: CellProps; c: Container }[] }[]; attrs: Record<string, unknown> }

const ALIGN: Record<string, string> = { left: 'left', center: 'center', right: 'right', justify: 'justify' };

const round = (n: number) => Math.round(n * 100) / 100;

export class DocBuilder {
  settings: DocSettings = newSettings();
  /** The most common body font, used when normalizing (null: decided from the runs). */
  defaultFont: string | null = null;
  private inl: PMNode[] = [];
  private stack: Container[] = [{ blocks: [] }];
  private tables: { t: TableBuild; row: TableBuild['rows'][number] | null; cell: { props: CellProps; c: Container } | null }[] = [];
  private noteSeq = 0;

  get hasInline(): boolean { return this.inl.length > 0; }
  private get cur(): Container { return this.stack[this.stack.length - 1]; }

  /** Marks for a character-property object. */
  marks(cp: CharProps | null | undefined): Mark[] {
    if (!cp) return [];
    const m: (Mark | null)[] = [];
    if (cp.bold) m.push(M.bold.create());
    if (cp.italic) m.push(M.italic.create());
    if (cp.underline) m.push(M.underline.create({ style: typeof cp.underline === 'string' ? cp.underline : 'single' }));
    if (cp.strike) m.push(M.strike.create());
    if (cp.dstrike) m.push(M.dstrike.create());
    if (cp.sup) m.push(M.sup.create()); else if (cp.sub) m.push(M.sub.create());
    if (cp.smallcaps) m.push(M.smallcaps.create());
    if (cp.allcaps) m.push(M.allcaps.create());
    if (cp.hidden) m.push(M.hidden.create());
    if (cp.outline) m.push(M.effect.create({ kind: 'outline' }));
    else if (cp.shadow) m.push(M.effect.create({ kind: 'shadow' }));
    if (cp.font) m.push(M.font.create({ family: cleanFont(cp.font) }));
    if (cp.size && cp.size > 0 && cp.size < 1000) m.push(M.size.create({ pt: Math.round(cp.size * 2) / 2 }));
    if (cp.color && /^#[0-9a-f]{6}$/i.test(cp.color) && cp.color.toLowerCase() !== '#000000') m.push(M.color.create({ color: cp.color }));
    if (cp.highlight && /^#[0-9a-f]{6}$/i.test(cp.highlight)) m.push(M.highlight.create({ color: cp.highlight }));
    if (cp.spacing) m.push(M.spacing.create({ pt: round(cp.spacing) }));
    if (cp.link && /^(https?|mailto|ftp):/i.test(cp.link)) m.push(M.link.create({ href: cp.link }));
    return markSet(m);
  }

  /** Append text (may contain \t; \n starts a new line within the paragraph). */
  text(s: string, cp?: CharProps | null): void {
    if (!s) return;
    const clean = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f￾￿]/g, '').replace(/\r\n?/g, '\n');
    const marks = this.marks(cp);
    const parts = clean.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) this.inl.push(S.nodes.hard_break.create());
      if (p) {
        const last = this.inl[this.inl.length - 1];
        if (last && last.isText && last.marks.length === marks.length && last.sameMarkup(S.text('x', marks))) this.inl[this.inl.length - 1] = S.text(last.text + p, marks);
        else this.inl.push(S.text(p, marks));
      }
    });
  }

  lineBreak(): void { this.inl.push(S.nodes.hard_break.create()); }

  image(src: string, opts: { width?: number | null; height?: number | null; alt?: string; wrap?: string } = {}): void {
    if (!src) return;
    this.inl.push(S.nodes.image.create({ src, alt: opts.alt || '', width: opts.width ? round(opts.width) : null, height: opts.height ? round(opts.height) : null, wrap: opts.wrap || 'inline' }));
  }

  footnote(text: string, kind: 'foot' | 'end' = 'foot'): void {
    const t = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim();
    this.inl.push(S.nodes.footnote.create({ text: t, kind, id: `n${++this.noteSeq}` }));
  }

  field(type: string, value = ''): void {
    this.inl.push(S.nodes.field.create({ type, value }));
  }

  /** Close the current paragraph (an empty one if nothing was added). */
  endParagraph(pp: ParaProps = {}): void {
    // In a list the list supplies the indent; the source's hanging indent would double it.
    const attrs = paraAttrs(pp.list ? { ...pp, indentLeft: null, indentFirst: null, tabs: null } : pp);
    const p = S.nodes.paragraph.create(attrs, this.inl);
    this.inl = [];
    if (pp.list) this.cur.blocks.push({ kind: 'list', item: { level: pp.list.level ?? 0, ordered: pp.list.ordered, format: pp.list.format, start: pp.list.start, blocks: [p] } });
    else this.cur.blocks.push({ kind: 'node', node: p });
  }

  /** Close an open paragraph if it has content. */
  flush(pp: ParaProps = {}): void { if (this.inl.length) this.endParagraph(pp); }

  block(node: PMNode | null | undefined): void {
    if (!node) return;
    this.flush();
    this.cur.blocks.push({ kind: 'node', node });
  }

  pageBreak(): void { this.block(S.nodes.page_break.create()); }
  columnBreak(): void { this.block(S.nodes.column_break.create()); }
  sectionBreak(kind: 'nextPage' | 'continuous' | 'evenPage' | 'oddPage' = 'nextPage'): void { this.block(S.nodes.section_break.create({ kind })); }
  rule(): void { this.block(S.nodes.horizontal_rule.create()); }

  // ---- tables
  get inTable(): boolean { return this.tables.length > 0; }
  startTable(attrs: Record<string, unknown> = {}): void {
    this.flush();
    this.tables.push({ t: { rows: [], attrs }, row: null, cell: null });
  }
  startRow(): void {
    const t = this.tables[this.tables.length - 1];
    if (!t) return;
    if (t.cell) this.endCell();
    t.row = { cells: [] };
    t.t.rows.push(t.row);
  }
  startCell(props: CellProps = {}): void {
    const t = this.tables[this.tables.length - 1];
    if (!t) return;
    if (!t.row) this.startRow();
    if (t.cell) this.endCell();
    t.cell = { props, c: { blocks: [] } };
    t.row!.cells.push(t.cell);
    this.stack.push(t.cell.c);
  }
  endCell(): void {
    const t = this.tables[this.tables.length - 1];
    if (!t || !t.cell) return;
    this.flush();
    this.stack.pop();
    t.cell = null;
  }
  endRow(): void {
    const t = this.tables[this.tables.length - 1];
    if (!t) return;
    if (t.cell) this.endCell();
    t.row = null;
  }
  /** Set the widths (pt) and shading of the cells of the row being built. */
  rowWidths(widths: (number | null)[], shading: (string | null)[] = []): void {
    const t = this.tables[this.tables.length - 1];
    const row = t?.row || t?.t.rows[t.t.rows.length - 1];
    if (!row) return;
    row.cells.forEach((c, i) => {
      const w = widths[i];
      if (w != null && w > 0 && w < 2000 && c.props.width == null) c.props.width = w;
      if (shading[i] && !c.props.bg) c.props.bg = shading[i];
    });
  }
  /** Mark the row being built as a repeating header row. */
  rowHeader(): void {
    const t = this.tables[this.tables.length - 1];
    const row = t?.row || t?.t.rows[t.t.rows.length - 1];
    if (row && t!.t.rows.indexOf(row) === (t!.t.attrs.headerRows as number || 0)) t!.t.attrs.headerRows = ((t!.t.attrs.headerRows as number) || 0) + 1;
  }
  endTable(): void {
    const t = this.tables[this.tables.length - 1];
    if (!t) return;
    if (t.cell) this.endCell();
    this.tables.pop();
    const node = buildTable(t.t);
    if (node) this.cur.blocks.push({ kind: 'node', node });
  }

  // ---- page setup and running heads
  page(p: { width?: number; height?: number; top?: number; bottom?: number; left?: number; right?: number; landscape?: boolean; headerDist?: number; footerDist?: number }): void {
    const pg = this.settings.page;
    const ok = (n: number | undefined, lo: number, hi: number) => n != null && Number.isFinite(n) && n >= lo && n <= hi;
    if (ok(p.width, 72, 5000) && ok(p.height, 72, 5000)) {
      const w = round(p.width!), h = round(p.height!);
      pg.orientation = p.landscape ?? w > h ? 'landscape' : 'portrait';
      pg.width = Math.min(w, h); pg.height = Math.max(w, h);
      pg.sizeName = Object.entries(PAGE_SIZES).find(([, [a, b]]) => Math.abs(a - pg.width) < 3 && Math.abs(b - pg.height) < 3)?.[0] || 'Custom';
    }
    const m = pg.margin;
    if (ok(p.top, 0, 1000)) m.top = round(p.top!);
    if (ok(p.bottom, 0, 1000)) m.bottom = round(p.bottom!);
    if (ok(p.left, 0, 1000)) m.left = round(p.left!);
    if (ok(p.right, 0, 1000)) m.right = round(p.right!);
    if (ok(p.headerDist, 0, 1000)) pg.headerDist = round(p.headerDist!);
    if (ok(p.footerDist, 0, 1000)) pg.footerDist = round(p.footerDist!);
  }

  /** Set a header or footer from text; {PAGE} and {NUMPAGES} tokens are page fields. */
  running(which: 'header' | 'footer', text: string, opts: { align?: 'left' | 'center' | 'right'; first?: boolean; even?: boolean } = {}): void {
    const t = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\s*\n\s*/g, ' ').trim();
    if (!t) return;
    const key = (opts.first ? (which === 'header' ? 'firstHeader' : 'firstFooter') : opts.even ? (which === 'header' ? 'evenHeader' : 'evenFooter') : which) as 'header';
    const hf: HF = { left: '', center: '', right: '' };
    if (t.includes('\t') && !opts.align) {
      const parts = t.split('\t').map((x) => x.trim());
      if (parts.length >= 3) { hf.left = parts[0]; hf.center = parts[1]; hf.right = parts.slice(2).join(' '); }
      else if (parts.length === 2) { hf.left = parts[0]; hf.right = parts[1]; }
    } else hf[opts.align || 'left'] = t;
    this.settings[key] = hf;
    if (opts.first) this.settings.differentFirst = true;
    if (opts.even) this.settings.differentOddEven = true;
  }

  property(key: string, value: string | null | undefined): void {
    const v = (value || '').replace(/[\x00-\x1f]/g, ' ').trim();
    if (v) this.settings.properties = { ...this.settings.properties, [key]: v };
  }

  /** Finish: close everything, group list paragraphs, normalize formatting, validate. */
  build(): PMNode {
    while (this.tables.length) this.endTable();
    this.flush();
    while (this.stack.length > 1) this.stack.pop();
    const blocks = groupBlocks(this.stack[0].blocks);
    let out = blocks;
    try { out = normalizeImportedFormatting(blocks, this.settings, this.defaultFont); } catch { /* keep raw */ }
    return finishDoc(out, this.settings);
  }
}

function cleanFont(f: string): string {
  return f.replace(/[\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64) || 'Times New Roman';
}

function paraAttrs(pp: ParaProps): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (pp.style) a.style = pp.style;
  if (pp.align && ALIGN[pp.align]) a.align = pp.align === 'left' ? null : pp.align;
  const pt = (n: number | null | undefined, lo = -1000, hi = 2000) => (n != null && Number.isFinite(n) && n >= lo && n <= hi && Math.abs(n) > 0.01 ? round(n) : null);
  a.indentLeft = pt(pp.indentLeft);
  a.indentRight = pt(pp.indentRight);
  a.indentFirst = pt(pp.indentFirst);
  a.spaceBefore = pt(pp.spaceBefore, 0);
  a.spaceAfter = pt(pp.spaceAfter, 0);
  if (pp.lineHeight) a.lineHeight = pp.lineHeight;
  if (pp.keepNext) a.keepNext = true;
  if (pp.keepLines) a.keepLines = true;
  if (pp.pageBreakBefore) a.pageBreakBefore = true;
  if (pp.border) a.border = pp.border;
  if (pp.bg) a.bg = pp.bg;
  if (pp.outlineLevel) a.outlineLevel = pp.outlineLevel;
  if (pp.tabs && pp.tabs.length) a.tabs = JSON.stringify(pp.tabs.filter((t) => t.pos > 0 && t.pos < 2000).slice(0, 40).map((t) => ({ pos: round(t.pos), align: t.align || 'left', leader: t.leader || 'none' })));
  return a;
}

function groupBlocks(blocks: Block[]): PMNode[] {
  const out: PMNode[] = [];
  let run: FlatListItem[] = [];
  const end = () => { if (run.length) { out.push(...buildNestedLists(run)); run = []; } };
  for (const b of blocks) {
    if (b.kind === 'list') run.push(b.item);
    else { end(); out.push(b.node); }
  }
  end();
  return out;
}

function buildTable(t: TableBuild): PMNode | null {
  const rows = t.rows.filter((r) => r.cells.length);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.cells.reduce((n, c) => n + Math.max(1, c.props.colspan || 1), 0)));
  const pmRows = rows.map((r) => {
    const cells = r.cells.map((c) => {
      const content = groupBlocks(c.c.blocks);
      const type = c.props.header ? S.nodes.table_header : S.nodes.table_cell;
      const colspan = Math.max(1, Math.min(c.props.colspan || 1, 1000));
      const attrs: Record<string, unknown> = { colspan, rowspan: Math.max(1, c.props.rowspan || 1) };
      if (c.props.width && c.props.width > 0) attrs.colwidth = [Math.round(c.props.width * 96 / 72)];
      if (c.props.bg) attrs.background = c.props.bg;
      if (c.props.valign) attrs.valign = c.props.valign;
      return type.create(attrs, content.length ? content : [S.nodes.paragraph.create()]);
    });
    let n = r.cells.reduce((k, c) => k + Math.max(1, c.props.colspan || 1), 0);
    while (n++ < width) cells.push(S.nodes.table_cell.create(null, [S.nodes.paragraph.create()]));
    return S.nodes.table_row.create(null, cells);
  });
  try {
    return S.nodes.table.create(t.attrs, pmRows);
  } catch {
    return null;
  }
}

/** Twips (1/20 pt) to points. */
export const tw = (n: number) => n / 20;

/** A 24-bit RGB value or Word's 16-colour index to #rrggbb. */
export const WORD_ICO = ['', '#000000', '#0000ff', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#ffff00', '#ffffff', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0'];
export const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
