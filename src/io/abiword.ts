/**
 * AbiWord import (.abw XML, .zabw gzip-compressed, .awt templates).
 *
 * AbiWord's AWML stores formatting as CSS-like `props` strings ("font-weight:bold; color:ff0000")
 * on styles (<s>), paragraphs (<p>), spans (<c>), sections, table cells and images.
 * Mapped: metadata (dc.*), paragraph and character styles with basedon chains, page size and
 * section margins, headers/footers (sections with type="header"/"footer"), paragraph props
 * (alignment, margins, indents, line height, keep-with-next, direction), character props (font,
 * size, weight, style, underline/strike/overline, super/subscript, color, background), lists
 * (<lists>/<l> definitions with levels and parents), tables with row/column spans and cell
 * colours, images from <data>, hyperlinks, bookmarks, footnotes/endnotes, annotations,
 * revisions (+N insertions, -N deletions), page/column/line breaks and fields.
 * Not mapped: frames' absolute positions (images and text boxes become inline/floating),
 * table borders other than on/off, revision formatting changes.
 */
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { schema } from '../editor/schema';
import type { StyleDef } from '../editor/settings';
import { PAGE_SIZES } from '../editor/settings';
import { gunzip } from './archive';
import { attr, kid, kids, kidsNamed, parseXml, decodeXml } from './xml-read';
import { InlineBuf, charMarks, headingStyle, hfFromBlocks, makeTable, normColor, paraAttrs, type CellSpec, type CharProps } from './runs';
import { base64ToBytes, buildNestedLists, canonicalStyleName, finishDoc, lengthToPt, newSettings, para, sniffImageMime, toDataUrl, type FlatListItem } from './serialize';

const S = schema.nodes;
const MK = schema.marks;

type Props = Record<string, string>;

export function parseProps(s: string | null | undefined): Props {
  const out: Props = {};
  if (!s) return out;
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

const color = (v: string | undefined) => (v && v !== 'transparent' ? normColor(/^[0-9a-f]{6}$/i.test(v) ? '#' + v : v) : null);
const len = (v: string | undefined) => (v ? lengthToPt(v) : null);

function charProps(p: Props): CharProps {
  const deco = (p['text-decoration'] || '').toLowerCase();
  const pos = (p['text-position'] || '').toLowerCase();
  const out: CharProps = {};
  if (p['font-weight'] === 'bold') out.bold = true;
  if (p['font-style'] === 'italic') out.italic = true;
  if (deco.includes('underline')) out.underline = true;
  if (deco.includes('line-through')) out.strike = true;
  if (pos === 'superscript') out.sup = true;
  if (pos === 'subscript') out.sub = true;
  if (p['font-variant'] === 'small-caps') out.smallcaps = true;
  if (p['text-transform'] === 'uppercase') out.allcaps = true;
  if (p['display'] === 'none') out.hidden = true;
  if (p['font-family']) out.font = p['font-family'];
  if (p['font-size']) out.size = len(p['font-size']);
  out.color = color(p.color);
  out.highlight = color(p.bgcolor);
  if (p.lang && p.lang !== '-none-') out.lang = p.lang;
  return out;
}

function lineHeight(v: string | undefined): string | null {
  if (!v) return null;
  if (/^[\d.]+$/.test(v)) return Math.abs(parseFloat(v) - 1) < 0.01 ? null : String(parseFloat(v));
  if (/\+$/.test(v)) { const pt = lengthToPt(v.slice(0, -1)); return pt ? `atleast:${pt}` : null; }
  const pt = lengthToPt(v);
  return pt ? `${pt}pt` : null;
}

function paraProps(p: Props): Record<string, any> {
  return paraAttrs({
    align: p['text-align'], indentLeft: len(p['margin-left']), indentRight: len(p['margin-right']), indentFirst: len(p['text-indent']),
    spaceBefore: len(p['margin-top']), spaceAfter: len(p['margin-bottom']), lineHeight: lineHeight(p['line-height']),
    keepNext: p['keep-with-next'] === 'yes', keepLines: p['keep-together'] === 'yes', dir: p['dom-dir'] === 'rtl' ? 'rtl' : null, bg: color(p['bgcolor']),
  });
}

/** AbiWord list types (FL_ListType) → list kind and format. */
const LIST_TYPES: Record<number, { ordered: boolean; format: string }> = {
  0: { ordered: true, format: 'decimal' }, 1: { ordered: true, format: 'lower-alpha' }, 2: { ordered: true, format: 'upper-alpha' },
  3: { ordered: true, format: 'lower-roman' }, 4: { ordered: true, format: 'upper-roman' }, 5: { ordered: false, format: 'disc' },
  6: { ordered: false, format: '–' }, 7: { ordered: false, format: 'square' }, 8: { ordered: false, format: '▸' }, 9: { ordered: false, format: '◆' },
  10: { ordered: false, format: '✶' }, 11: { ordered: false, format: '⇒' }, 12: { ordered: false, format: '✓' }, 13: { ordered: false, format: '☐' },
  14: { ordered: false, format: '☞' }, 15: { ordered: false, format: '♥' }, 16: { ordered: false, format: '➢' },
};
const LIST_STYLE_NAMES: Record<string, { ordered: boolean; format: string }> = {
  'numbered list': LIST_TYPES[0], 'lower case list': LIST_TYPES[1], 'upper case list': LIST_TYPES[2], 'lower roman list': LIST_TYPES[3],
  'upper roman list': LIST_TYPES[4], 'bullet list': LIST_TYPES[5], 'dashed list': LIST_TYPES[6], 'square list': LIST_TYPES[7],
  'triangle list': LIST_TYPES[8], 'diamond list': LIST_TYPES[9], 'star list': LIST_TYPES[10], 'implies list': LIST_TYPES[11],
  'tick list': LIST_TYPES[12], 'box list': LIST_TYPES[13], 'hand list': LIST_TYPES[14], 'heart list': LIST_TYPES[15], 'arrowhead list': LIST_TYPES[16],
};

interface ListDef { id: string; parent: string; type: number; start: number; delim: string }

class AbiReader {
  settings = newSettings();
  images = new Map<string, string>();
  styles = new Map<string, { type: string; basedOn: string | null; props: Props }>();
  lists = new Map<string, ListDef>();
  revisions = new Map<string, string>();
  notes = new Map<string, { kind: 'foot' | 'end'; text: string }>();
  comments = new Map<string, string>();
  hf = new Map<string, Element>();

  constructor(private root: Element) {}

  read(): PMNode {
    const r = this.root;
    for (const m of kidsNamed(kid(r, 'metadata'), 'm')) {
      const key = attr(m, 'key') || '';
      const v = (m.textContent || '').trim();
      const p = this.settings.properties;
      if (key === 'dc.title') p.title = v;
      else if (key === 'dc.creator') p.author = v;
      else if (key === 'dc.subject') p.subject = v;
      else if (key === 'dc.description') p.comments = v;
      else if (key === 'abiword.keywords' || key === 'dc.keywords') p.keywords = v;
      else if (key === 'dc.language' && v) this.settings.language = v;
    }
    for (const d of kidsNamed(kid(r, 'data'), 'd')) {
      const name = attr(d, 'name');
      if (!name) continue;
      const raw = d.textContent || '';
      const bytes = attr(d, 'base64') === 'no' ? new TextEncoder().encode(raw) : base64ToBytes(raw.replace(/\s+/g, ''));
      const mime = sniffImageMime(bytes) || attr(d, 'mime-type') || 'image/png';
      if (/^image\//.test(mime)) this.images.set(name, toDataUrl(bytes, mime));
    }
    for (const s of kidsNamed(kid(r, 'styles'), 's')) {
      this.styles.set(attr(s, 'name') || '', { type: attr(s, 'type') || 'P', basedOn: attr(s, 'basedon'), props: parseProps(attr(s, 'props')) });
    }
    for (const l of kidsNamed(kid(r, 'lists'), 'l')) {
      const id = attr(l, 'id') || '';
      this.lists.set(id, { id, parent: attr(l, 'parentid') || '0', type: parseInt(attr(l, 'type') || '5', 10), start: parseInt(attr(l, 'start-value') || '1', 10), delim: attr(l, 'list-delim') || '%L' });
    }
    for (const rv of kidsNamed(kid(r, 'revisions'), 'r')) this.revisions.set(attr(rv, 'id') || '', (rv.textContent || '').trim() || 'Unknown');
    this.importStyles();
    this.pageSize(kid(r, 'pagesize'));
    const sections = kidsNamed(r, 'section');
    for (const s of sections) {
      const type = attr(s, 'type');
      const id = attr(s, 'id');
      if (type && id) this.hf.set(id, s);
    }
    const blocks: PMNode[] = [];
    let first = true;
    for (const s of sections) {
      if (attr(s, 'type')) continue;
      if (first) { this.sectionSettings(s); first = false; } else blocks.push(S.section_break.create({ kind: 'nextPage' }));
      this.blocks(s, blocks);
    }
    for (const [cid, text] of this.comments) {
      if (!this.settings.comments[cid]) this.settings.comments[cid] = { id: cid, author: 'Unknown', date: 0, text, resolved: false, replies: [] };
    }
    return finishDoc(blocks, this.settings);
  }

  private importStyles(): void {
    const out: Record<string, StyleDef> = {};
    for (const [name, st] of this.styles) {
      if (!name || name === 'Normal' && !Object.keys(st.props).length) continue;
      const p = st.props;
      const c = charProps(p);
      const canonical = canonicalStyleName(name) || name;
      const def: StyleDef = { name: canonical, type: st.type === 'C' ? 'character' : 'paragraph' };
      if (st.basedOn && st.basedOn !== 'None') def.basedOn = canonicalStyleName(st.basedOn) || st.basedOn;
      if (c.font) def.font = c.font;
      if (c.size) def.size = c.size;
      if (c.bold) def.bold = true;
      if (c.italic) def.italic = true;
      if (c.underline) def.underline = true;
      if (c.color && c.color !== '#000000') def.color = c.color;
      const pa = paraProps(p);
      for (const k of ['align', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'indentFirst', 'lineHeight', 'keepNext'] as const) if (pa[k] != null) (def as any)[k] = pa[k];
      out[canonical] = def;
    }
    // Normal's font and size set the document defaults.
    const normal = out.Normal;
    if (normal?.font) this.settings.theme = { ...this.settings.theme, bodyFont: normal.font, headingFont: out['Heading 1']?.font || normal.font };
    this.settings.styles = out;
  }

  private pageSize(ps: Element | null): void {
    if (!ps) return;
    const units = attr(ps, 'units') || 'in';
    const w = lengthToPt((attr(ps, 'width') || '8.5') + units) || 612;
    const h = lengthToPt((attr(ps, 'height') || '11') + units) || 792;
    const pg = this.settings.page;
    pg.width = Math.round(Math.min(w, h) * 100) / 100;
    pg.height = Math.round(Math.max(w, h) * 100) / 100;
    pg.orientation = attr(ps, 'orientation') === 'landscape' ? 'landscape' : 'portrait';
    pg.sizeName = 'Custom';
    for (const [n, [pw, ph]] of Object.entries(PAGE_SIZES)) if (Math.abs(pw - pg.width) < 2 && Math.abs(ph - pg.height) < 2) { pg.sizeName = n; break; }
  }

  private sectionSettings(s: Element): void {
    const p = parseProps(attr(s, 'props'));
    const m = this.settings.page.margin;
    const v = (k: string, d: number) => len(p[k]) ?? d;
    m.top = v('page-margin-top', m.top); m.bottom = v('page-margin-bottom', m.bottom); m.left = v('page-margin-left', m.left); m.right = v('page-margin-right', m.right);
    this.settings.page.headerDist = v('page-margin-header', this.settings.page.headerDist);
    this.settings.page.footerDist = v('page-margin-footer', this.settings.page.footerDist);
    const place = (target: 'header' | 'footer' | 'firstHeader' | 'firstFooter' | 'evenHeader' | 'evenFooter', id: string | null) => {
      const sec = id ? this.hf.get(id) : null;
      if (!sec) return;
      const blocks: PMNode[] = [];
      this.blocks(sec, blocks);
      const hf = hfFromBlocks(blocks);
      if (hf) this.settings[target] = hf;
    };
    place('header', attr(s, 'header'));
    place('footer', attr(s, 'footer'));
    if (attr(s, 'header-first') || attr(s, 'footer-first')) { this.settings.differentFirst = true; place('firstHeader', attr(s, 'header-first')); place('firstFooter', attr(s, 'footer-first')); }
    if (attr(s, 'header-even') || attr(s, 'footer-even')) { this.settings.differentOddEven = true; place('evenHeader', attr(s, 'header-even')); place('evenFooter', attr(s, 'footer-even')); }
    const cols = parseInt(p.columns || '1', 10);
    void cols;
  }

  private styleKind(name: string | null): { style: string; char: CharProps } {
    if (!name) return { style: 'Normal', char: {} };
    const canonical = canonicalStyleName(name) || name;
    const m = /^Heading (\d)$/i.exec(canonical);
    return { style: m ? headingStyle(parseInt(m[1], 10)) : canonical, char: {} };
  }

  /** Block content of a section, cell, frame, footnote or annotation. */
  blocks(container: Element, out: PMNode[]): void {
    let listRun: FlatListItem[] = [];
    const flushList = () => { if (listRun.length) { out.push(...buildNestedLists(listRun)); listRun = []; } };
    for (const el of kids(container)) {
      switch (el.localName) {
        case 'p': {
          const ps = this.paragraph(el);
          const listId = attr(el, 'listid');
          const level = parseInt(attr(el, 'level') || '0', 10) || 0;
          if (listId && listId !== '0' && level > 0) {
            const kind = this.listKind(listId, parseProps(attr(el, 'props'))['list-style']);
            for (const p of ps.paras) listRun.push({ level, ordered: kind.ordered, format: kind.format, start: kind.start, blocks: [p] });
            if (ps.after.length) { flushList(); out.push(...ps.after); }
          } else {
            flushList();
            out.push(...ps.paras, ...ps.after);
          }
          break;
        }
        case 'table': flushList(); { const t = this.table(el); if (t) out.push(t); } break;
        case 'frame': flushList(); this.frame(el, out); break;
        case 'toc': flushList(); out.push(S.gen_block.create({ kind: 'toc' })); break;
        default: break;
      }
    }
    flushList();
  }

  private listKind(listId: string, listStyle?: string): { ordered: boolean; format: string; start: number } {
    const def = this.lists.get(listId);
    const byName = listStyle ? LIST_STYLE_NAMES[listStyle.toLowerCase()] : undefined;
    const t = byName || (def ? LIST_TYPES[def.type] : undefined) || LIST_TYPES[5];
    return { ...t, start: def && t.ordered ? Math.max(0, def.start) || 1 : 1 };
  }

  private paragraph(el: Element): { paras: PMNode[]; after: PMNode[] } {
    const st = this.styleKind(attr(el, 'style'));
    const props = parseProps(attr(el, 'props'));
    const attrs: Record<string, any> = { ...paraProps(props), style: st.style };
    const inList = !!attr(el, 'listid') && attr(el, 'listid') !== '0';
    if (inList) {
      delete attrs.indentLeft; delete attrs.indentFirst;
      // List styles carry the list's own indents: the list node provides them instead.
      if (props['list-style'] || this.styles.get(attr(el, 'style') || '')?.props['list-style']) attrs.style = 'Normal';
    }
    const paras: PMNode[] = [];
    const after: PMNode[] = [];
    const buf = new InlineBuf();
    const flush = (force = false) => { if (!buf.empty || force) paras.push(S.paragraph.create(attrs, buf.take())); };
    let pageBreakPending = false;
    const walk = (node: Element, marks: readonly Mark[], ctx: { link?: string | null }) => {
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType === 3 || c.nodeType === 4) {
          const t = (c.nodeValue || '').replace(/[\r\n]+/g, '');
          if (t) {
            const parts = t.split('\t');
            parts.forEach((p, i) => { if (i) buf.text('\t', marks); if (p) buf.text(p, marks); });
          }
          continue;
        }
        if (c.nodeType !== 1) continue;
        const e = c as Element;
        switch (e.localName) {
          case 'c': case 'span': {
            const cp = charProps(parseProps(attr(e, 'props')));
            const cs = attr(e, 'style');
            let m = charMarks(cp, marks);
            if (cs && cs !== 'None') {
              const sd = this.styles.get(cs);
              if (sd) m = charMarks(charProps(sd.props), m);
            }
            const rev = attr(e, 'revision');
            if (rev) {
              const mm = /([+-])(\d+)/.exec(rev);
              if (mm) {
                const author = this.revisions.get(mm[2]) || 'Unknown';
                m = [...m, (mm[1] === '+' ? MK.insertion : MK.deletion).create({ author, id: `abw-${mm[2]}` })];
              }
            }
            walk(e, m, ctx);
            break;
          }
          case 'a': {
            const href = e.getAttribute('xlink:href') || attr(e, 'href') || '';
            const link = /^\s*(javascript|vbscript):/i.test(href) ? null : href;
            walk(e, link ? [...marks, MK.link.create({ href: link })] : marks, { ...ctx, link });
            break;
          }
          case 'br': buf.node(S.hard_break.create()); break;
          case 'cbr': flush(); after.push(S.column_break.create()); break;
          case 'pbr': flush(); pageBreakPending = true; break;
          case 'tab': buf.text('\t', marks); break;
          case 'image': {
            const src = this.images.get(attr(e, 'dataid') || '');
            if (src) {
              const ip = parseProps(attr(e, 'props'));
              buf.node(S.image.create({ src, alt: attr(e, 'alt') || attr(e, 'title') || '', width: len(ip.width), height: len(ip.height) }, null, marks as Mark[]));
            }
            break;
          }
          case 'bookmark':
            if (attr(e, 'type') !== 'end' && attr(e, 'name')) buf.node(S.bookmark.create({ name: attr(e, 'name') }));
            break;
          case 'field': {
            const type = attr(e, 'type') || '';
            if (type === 'list_label' || type === 'footnote_anchor' || type === 'endnote_anchor') break;
            if (type === 'footnote_ref' || type === 'endnote_ref') {
              const id = attr(e, type === 'footnote_ref' ? 'footnote-id' : 'endnote-id') || '';
              const note = this.notes.get(`${type[0]}:${id}`);
              buf.node(S.footnote.create({ text: note?.text || '', kind: type === 'endnote_ref' ? 'end' : 'foot', id }));
              break;
            }
            const map: Record<string, string> = { page_number: 'PAGE', page_count: 'NUMPAGES', date: 'DATE', time: 'TIME', file_name: 'FILENAME', meta_title: 'TITLE', meta_creator: 'AUTHOR', word_count: 'NUMWORDS' };
            if (map[type]) buf.node(S.field.create({ type: map[type], value: (e.textContent || '').trim() }, null, marks as Mark[]));
            else walk(e, marks, ctx);
            break;
          }
          case 'foot': case 'endnote': {
            // Note bodies are stored inline after (or before) their reference field.
            const kind = e.localName === 'foot' ? 'foot' : 'end';
            const idAttr = kind === 'foot' ? 'footnote-id' : 'endnote-id';
            const text = kidsNamed(e, 'p').map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim()).join('\n');
            const id = attr(e, idAttr) || attr(kid(kid(e, 'p'), 'field'), idAttr) || '';
            this.notes.set(`${kind[0]}:${id}`, { kind, text });
            // Patch an already-emitted reference.
            buf.items = buf.items.map((n) => (n.type === S.footnote && n.attrs.id === id && !n.attrs.text && n.attrs.kind === kind ? S.footnote.create({ ...n.attrs, text }) : n));
            break;
          }
          case 'ann': {
            const id = attr(e, 'annotation-id') || String(this.comments.size + 1);
            const ap = parseProps(attr(e, 'props'));
            const text = kidsNamed(e, 'p').map((p) => (p.textContent || '').trim()).join('\n');
            this.settings.comments[`abw-${id}`] = { id: `abw-${id}`, author: ap['annotation-author'] || 'Unknown', date: Date.parse(ap['annotation-date'] || '') || 0, text, resolved: false, replies: [] };
            break;
          }
          case 'annotate': {
            const id = attr(e, 'annotation') || attr(e, 'annotation-id') || '';
            walk(e, [...marks, MK.comment.create({ id: `abw-${id}` })], ctx);
            break;
          }
          case 'math': case 'embed': break;
          default: walk(e, marks, ctx);
        }
      }
    };
    walk(el, [], {});
    // The tab after a list label belongs to the label.
    if (inList && buf.items[0]?.isText && buf.items[0].text!.startsWith('\t')) {
      const t = buf.items[0].text!.replace(/^\t+/, '');
      if (t) buf.items[0] = schema.text(t, buf.items[0].marks); else buf.items.shift();
    }
    flush(paras.length === 0);
    if (pageBreakPending) after.push(S.page_break.create());
    // Note bodies that came after their references.
    const fix = (p: PMNode): PMNode => {
      let changed = false;
      const kidsOut: PMNode[] = [];
      p.forEach((n) => {
        if (n.type === S.footnote && !n.attrs.text) {
          const note = this.notes.get(`${n.attrs.kind[0]}:${n.attrs.id}`);
          if (note) { kidsOut.push(S.footnote.create({ ...n.attrs, text: note.text })); changed = true; return; }
        }
        kidsOut.push(n);
      });
      return changed ? p.type.create(p.attrs, kidsOut) : p;
    };
    return { paras: paras.map(fix), after };
  }

  private table(el: Element): PMNode | null {
    interface C { top: number; bot: number; left: number; right: number; spec: CellSpec }
    const cells: C[] = [];
    let row = 0, col = 0;
    for (const c of kidsNamed(el, 'cell')) {
      const p = parseProps(attr(c, 'props'));
      const left = p['left-attach'] != null ? parseInt(p['left-attach'], 10) : col;
      const right = p['right-attach'] != null ? parseInt(p['right-attach'], 10) : left + 1;
      const top = p['top-attach'] != null ? parseInt(p['top-attach'], 10) : row;
      const bot = p['bot-attach'] != null ? parseInt(p['bot-attach'], 10) : top + 1;
      row = top; col = right;
      const blocks: PMNode[] = [];
      this.blocks(c, blocks);
      const bg = p['bg-style'] === '0' ? null : color(p['background-color']);
      cells.push({ top, bot, left, right, spec: { blocks, colspan: Math.max(1, right - left), rowspan: Math.max(1, bot - top), background: bg, valign: p['vert-align'] ? (['top', 'middle', 'bottom'][parseInt(p['vert-align'], 10)] || null) : null } });
    }
    if (!cells.length) return null;
    const nrows = Math.max(...cells.map((c) => c.top)) + 1;
    const rows: CellSpec[][] = Array.from({ length: nrows }, () => []);
    for (const c of cells.sort((a, b) => a.top - b.top || a.left - b.left)) rows[c.top].push(c.spec);
    const tp = parseProps(attr(el, 'props'));
    const widths = (tp['table-column-props'] || '').split('/').map((w) => lengthToPt(w.trim())).filter((x): x is number => x != null);
    if (widths.length) {
      for (const c of cells) c.spec.width = widths.slice(c.left, c.right).reduce((a, b) => a + b, 0) || null;
    }
    return makeTable(rows, { borderless: tp['table-line-type'] === '0' || tp['table-line-thickness'] === '0' });
  }

  private frame(el: Element, out: PMNode[]): void {
    const p = parseProps(attr(el, 'props'));
    const type = p['frame-type'] || 'textbox';
    const width = len(p['frame-width']);
    if (type === 'image') {
      const src = this.images.get(attr(el, 'strux-image-dataid') || p['strux-image-dataid'] || '');
      if (src) out.push(para([S.image.create({ src, width, height: len(p['frame-height']), wrap: p['wrap-mode']?.includes('right') ? 'left' : p['wrap-mode']?.includes('left') ? 'right' : 'inline' })]));
      return;
    }
    const blocks: PMNode[] = [];
    this.blocks(el, blocks);
    if (blocks.length) out.push(S.text_box.create({ width: width ? String(Math.round(width)) : null, bg: color(p['background-color']), float: 'none' }, blocks));
  }
}

export function abiwordToDoc(xml: string): PMNode {
  const d = parseXml(xml.replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/i, ''));
  const root = d?.documentElement;
  if (!root || root.localName !== 'abiword') throw new Error('Not an AbiWord document (abiword root element missing)');
  return new AbiReader(root).read();
}

export async function importAbiword(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const u8 = new Uint8Array(data);
  return abiwordToDoc(decodeXml(u8[0] === 0x1f && u8[1] === 0x8b ? gunzip(u8) : u8));
}
