/**
 * DocBook XML import (DocBook 4.x with or without the DTD, DocBook 5 namespace).
 *
 * Mapped: info/articleinfo/bookinfo (title, subtitle, authors, abstract, keywords) → document
 * properties and Title/Subtitle paragraphs; book/part/chapter/appendix/preface/article/section/
 * sect1–5/simplesect/refsect* → headings by depth; bridgehead; para/simpara/formalpara;
 * itemized/ordered (numeration, startingnumber)/variable/simple lists and procedures;
 * programlisting/screen/synopsis → code blocks; literallayout/address → line-broken paragraphs;
 * blockquote/epigraph (with attribution) → Quote; admonitions (note, tip, warning, caution,
 * important) and sidebars → text boxes; CALS and HTML tables (spans via namest/nameend and
 * morerows, alignment, header rows); figures and media objects (embedded data: URIs or
 * fileref with alt text), equations (TeX alt → math), footnotes, links (ulink, link, xref,
 * uri, email), emphasis roles (bold/strong, underline, strikethrough), code-like inline
 * elements, quotes, sub/superscript, glossaries and Q&A sets. The toc element becomes a table
 * of contents. Not mapped: indexes (index terms are dropped), callout graphics, XInclude.
 */
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { schema } from '../editor/schema';
import { attr, kid, kids, kidsNamed, decodeXml, parseXml, textOf } from './xml-read';
import { InlineBuf, headingStyle, makeTable, type CellSpec } from './runs';
import { buildNestedLists, finishDoc, newSettings, para } from './serialize';

const S = schema.nodes;
const MK = schema.marks;

const SECTIONS = new Set(['book', 'part', 'chapter', 'appendix', 'preface', 'article', 'section', 'sect1', 'sect2', 'sect3', 'sect4', 'sect5', 'simplesect', 'refentry', 'refsection', 'refsect1', 'refsect2', 'refsect3', 'colophon', 'dedication', 'acknowledgements', 'glossary', 'bibliography', 'reference', 'partintro', 'refsynopsisdiv', 'setindex', 'set']);
const INFO = new Set(['info', 'articleinfo', 'bookinfo', 'chapterinfo', 'sectioninfo', 'sect1info', 'sect2info', 'sect3info', 'sect4info', 'sect5info', 'prefaceinfo', 'appendixinfo', 'partinfo', 'refentryinfo', 'refsect1info', 'refmeta', 'refnamediv', 'docinfo']);
const CODE_INLINE = new Set(['literal', 'code', 'command', 'filename', 'option', 'varname', 'function', 'classname', 'systemitem', 'userinput', 'computeroutput',
  'envar', 'prompt', 'constant', 'type', 'markup', 'tag', 'sgmltag', 'property', 'parameter', 'methodname', 'interfacename', 'exceptionname', 'returnvalue',
  'token', 'symbol', 'literallayout-inline', 'errorcode', 'errorname', 'keycode', 'database', 'package', 'uri-literal']);
const ITALIC_INLINE = new Set(['citetitle', 'firstterm', 'glossterm', 'foreignphrase', 'replaceable', 'wordasword', 'citation', 'lineannotation', 'attribution']);
const BOLD_INLINE = new Set(['guilabel', 'guibutton', 'guimenu', 'guimenuitem', 'guisubmenu', 'guiicon', 'interface', 'keycap', 'application', 'productname', 'orgname']);
const ADMONITIONS = new Set(['note', 'tip', 'warning', 'caution', 'important', 'danger']);
const NUMERATION: Record<string, string> = { arabic: 'decimal', loweralpha: 'lower-alpha', upperalpha: 'upper-alpha', lowerroman: 'lower-roman', upperroman: 'upper-roman' };

const xlinkHref = (el: Element): string | null => {
  for (let i = 0; i < el.attributes.length; i++) if (el.attributes[i].localName === 'href') return el.attributes[i].value;
  return null;
};

class DocbookReader {
  settings = newSettings();
  titles = new Map<string, string>();
  rootTitleUsed = false;

  constructor(private root: Element) {
    for (const el of Array.from(root.getElementsByTagName('*'))) {
      const id = el.getAttribute('id') || el.getAttribute('xml:id') || attr(el, 'id');
      if (!id) continue;
      const t = kid(el, 'title') || kid(kid(el, 'info'), 'title');
      this.titles.set(id, t ? textOf(t) : '');
    }
  }

  read(): PMNode {
    const out: PMNode[] = [];
    if (SECTIONS.has(this.root.localName)) this.section(this.root, out, 0);
    else this.blocks(this.root, out, 0);
    return finishDoc(out, this.settings);
  }

  private info(info: Element | null, out: PMNode[], depth: number): string | null {
    if (!info) return null;
    const p = this.settings.properties;
    const title = kid(info, 'title');
    const authors = kids(info).flatMap((k) => (k.localName === 'authorgroup' ? kids(k) : [k])).filter((k) => /^(author|editor|corpauthor|othercredit)$/.test(k.localName))
      .map((a) => (a.localName === 'corpauthor' ? textOf(a) : [kid(a, 'personname') || a].map((pn) => [textOf(kid(pn, 'honorific')), textOf(kid(pn, 'firstname')), textOf(kid(pn, 'othername')), textOf(kid(pn, 'surname'))].filter(Boolean).join(' ') || textOf(kid(a, 'orgname')) || textOf(pn))[0]))
      .filter(Boolean);
    if (depth === 0) {
      if (title && !p.title) p.title = textOf(title);
      if (authors.length && !p.author) p.author = authors.join('; ');
      const abs = kid(info, 'abstract');
      if (abs && !p.comments) p.comments = textOf(abs);
      const kw = kid(info, 'keywordset');
      if (kw) p.keywords = kidsNamed(kw, 'keyword').map((k) => textOf(k)).join(', ');
      const sub = kid(info, 'subject') || kid(info, 'subjectset');
      if (sub) p.subject = textOf(sub);
      if (title) out.push(para(this.inline(title), { style: 'Title' }));
      const subtitle = kid(info, 'subtitle');
      if (subtitle) out.push(para(this.inline(subtitle), { style: 'Subtitle' }));
      if (authors.length) out.push(para([schema.text(authors.join(', '))], { align: 'center' }));
      const date = kid(info, 'pubdate') || kid(info, 'date');
      if (date) out.push(para([schema.text(textOf(date))], { align: 'center' }));
      if (abs) this.blocks(abs, out, depth);
      return title ? textOf(title) : null;
    }
    return title ? textOf(title) : null;
  }

  private section(el: Element, out: PMNode[], depth: number): void {
    const infoEl = kids(el).find((k) => INFO.has(k.localName)) || null;
    const ownTitle = kid(el, 'title');
    if (depth === 0) {
      // The root's title becomes the document Title; its info block may also carry one.
      const infoTitle = this.info(infoEl, out, 0);
      if (ownTitle && !infoTitle) {
        if (!this.settings.properties.title) this.settings.properties.title = textOf(ownTitle);
        out.push(para(this.inline(ownTitle), { style: 'Title' }));
      }
      const sub = kid(el, 'subtitle');
      if (sub && !infoEl) out.push(para(this.inline(sub), { style: 'Subtitle' }));
    } else {
      const t = ownTitle || kid(infoEl, 'title');
      const label = attr(el, 'label');
      if (t) {
        const inl = this.inline(t);
        if (label) inl.unshift(schema.text(label + ' '));
        out.push(para(inl, { style: headingStyle(Math.min(depth, 9)), id: el.getAttribute('id') || el.getAttribute('xml:id') }));
      }
      if (el.localName === 'refentry') {
        const nd = kid(el, 'refnamediv');
        if (nd) out.push(para([schema.text(kidsNamed(nd, 'refname').map((r) => textOf(r)).join(', ') + ' — ' + textOf(kid(nd, 'refpurpose')))]));
      }
    }
    this.blocks(el, out, depth);
  }

  blocks(el: Element, out: PMNode[], depth: number): void {
    for (const c of kids(el)) this.block(c, out, depth);
  }

  private block(c: Element, out: PMNode[], depth: number): void {
    const n = c.localName;
    if (SECTIONS.has(n)) { this.section(c, out, depth + 1); return; }
    if (INFO.has(n) || n === 'title' || n === 'subtitle' || n === 'titleabbrev' || n === 'indexterm' || n === 'index') return;
    if (ADMONITIONS.has(n) || n === 'sidebar') {
      const inner: PMNode[] = [];
      const t = kid(c, 'title');
      inner.push(para([schema.text(t ? textOf(t) : n[0].toUpperCase() + n.slice(1), [MK.bold.create()])]));
      this.blocks(c, inner, depth);
      const bg: Record<string, string> = { note: '#eef4fb', tip: '#eefbee', warning: '#fdf1e6', caution: '#fdf1e6', important: '#fdeeee', danger: '#fdeeee', sidebar: '#f4f4f4' };
      out.push(S.text_box.create({ bg: bg[n] || null, border: '1px solid #999', kind: 'textbox' }, inner));
      return;
    }
    switch (n) {
      case 'para': case 'simpara': {
        // Block children (lists, tables, examples) are allowed inside para in DocBook.
        let buf: Element[] = [];
        const flushInline = () => {
          if (!buf.length) return;
          const holder = c.ownerDocument.createElement('para');
          for (const b of buf) holder.appendChild(b.cloneNode(true));
          const inl = this.inline(holder);
          if (inl.length) out.push(para(inl, attr(c, 'role') === 'center' ? { align: 'center' } : null));
          buf = [];
        };
        for (const k of Array.from(c.childNodes)) {
          if (k.nodeType === 1 && this.isBlock((k as Element).localName)) { flushInline(); this.block(k as Element, out, depth); }
          else buf.push(k as Element);
        }
        flushInline();
        return;
      }
      case 'formalpara': {
        const t = kid(c, 'title');
        const p = kid(c, 'para');
        const inl = [...(t ? [schema.text(textOf(t) + '. ', [MK.bold.create()])] : []), ...(p ? this.inline(p) : [])];
        out.push(para(inl));
        return;
      }
      case 'bridgehead': {
        const m = /sect(\d)/.exec(attr(c, 'renderas') || '');
        out.push(para(this.inline(c), { style: headingStyle(m ? parseInt(m[1], 10) : Math.min(depth + 1, 9)) }));
        return;
      }
      case 'itemizedlist': case 'orderedlist': case 'procedure': case 'simplelist': case 'stepalternatives': case 'substeps': {
        const t = kid(c, 'title');
        if (t) out.push(para(this.inline(t), { style: 'Heading 6' }));
        out.push(...this.list(c, 0));
        return;
      }
      case 'variablelist': case 'glosslist': case 'glossdiv': {
        const t = kid(c, 'title');
        if (t) out.push(para(this.inline(t), { style: 'Heading 6' }));
        for (const e of kids(c).filter((k) => k.localName === 'varlistentry' || k.localName === 'glossentry')) {
          const terms = kids(e).filter((k) => k.localName === 'term' || k.localName === 'glossterm');
          const inl: PMNode[] = [];
          terms.forEach((tm, i) => { if (i) inl.push(schema.text(', ')); inl.push(...this.inline(tm, [MK.bold.create()])); });
          out.push(para(inl, { keepNext: true }));
          const defs: PMNode[] = [];
          for (const d of kids(e)) if (d.localName === 'listitem' || d.localName === 'glossdef') this.blocks(d, defs, depth);
          for (const d of defs) out.push(d.type === S.paragraph ? S.paragraph.create({ ...d.attrs, indentLeft: 36 }, d.content) : d);
        }
        return;
      }
      case 'programlisting': case 'screen': case 'synopsis': case 'cmdsynopsis': case 'funcsynopsis': case 'classsynopsis': case 'literallayout-code': {
        const text = (c.textContent || '').replace(/^\n/, '').replace(/\s+$/, '');
        out.push(S.code_block.create({ language: attr(c, 'language') }, text ? schema.text(text) : null));
        return;
      }
      case 'literallayout': case 'address': {
        if (attr(c, 'class') === 'monospaced') { const text = (c.textContent || '').replace(/^\n/, '').replace(/\s+$/, ''); out.push(S.code_block.create(null, text ? schema.text(text) : null)); return; }
        out.push(para(this.inline(c, [], true)));
        return;
      }
      case 'blockquote': case 'epigraph': {
        const inner: PMNode[] = [];
        const t = kid(c, 'title');
        if (t) inner.push(para(this.inline(t, [MK.bold.create()]), { style: 'Quote' }));
        for (const k of kids(c)) {
          if (k.localName === 'attribution') continue;
          this.block(k, inner, depth);
        }
        for (const b of inner) out.push(b.type === S.paragraph ? S.paragraph.create({ ...b.attrs, style: 'Quote' }, b.content) : b);
        const a = kid(c, 'attribution');
        if (a) out.push(para([schema.text('— '), ...this.inline(a)], { style: 'Quote', align: 'right' }));
        return;
      }
      case 'example': case 'informalexample': case 'figure': case 'informalfigure': case 'equation': case 'informalequation': {
        const t = kid(c, 'title') || kid(kid(c, 'info'), 'title');
        const caption = t ? para(this.inline(t, [MK.bold.create()]), { style: 'Caption' }) : null;
        if (caption && /example/.test(n)) out.push(caption);
        this.blocks(c, out, depth);
        if (caption && !/example/.test(n)) out.push(caption);
        return;
      }
      case 'mediaobject': case 'screenshot': case 'graphic': case 'imageobject': {
        const img = this.media(c);
        if (img) out.push(para([img], { align: 'center' }));
        else { const alt = textOf(kid(c, 'textobject')) || textOf(kid(c, 'alt')); if (alt) out.push(para([schema.text(`[${alt}]`)])); }
        const cap = kid(c, 'caption');
        if (cap) this.blocks(cap, out, depth);
        return;
      }
      case 'mathphrase': case 'alt': {
        const latex = this.tex(c.parentElement || c);
        if (latex) out.push(S.math_block.create({ latex }));
        return;
      }
      case 'table': case 'informaltable': {
        const t = kid(c, 'title') || kid(c, 'caption');
        if (t) out.push(para(this.inline(t, [MK.bold.create()]), { style: 'Caption' }));
        const tbl = this.table(c);
        if (tbl) out.push(tbl);
        return;
      }
      case 'qandaset': case 'qandadiv': {
        for (const k of kids(c)) {
          if (k.localName === 'qandaentry') {
            for (const part of kids(k)) {
              const inner: PMNode[] = [];
              this.blocks(part, inner, depth);
              const label = part.localName === 'question' ? 'Q: ' : part.localName === 'answer' ? 'A: ' : '';
              if (inner[0]?.type === S.paragraph && label) inner[0] = S.paragraph.create(inner[0].attrs, [schema.text(label, [MK.bold.create()]), ...(inner[0].content as any).content]);
              out.push(...inner);
            }
          } else this.block(k, out, depth);
        }
        return;
      }
      case 'toc': case 'lot': out.push(S.gen_block.create({ kind: 'toc' })); return;
      case 'bibliodiv': case 'bibliolist': this.blocks(c, out, depth); return;
      case 'biblioentry': case 'bibliomixed': out.push(para(this.inline(c), { indentLeft: 36, indentFirst: -36 })); return;
      case 'segmentedlist': case 'calloutlist': out.push(...this.list(c, 0)); return;
      case 'anchor': return;
      case 'remark': out.push(para(this.inline(c), { style: 'Quote' })); return;
      case 'footnote': return;
      default:
        if (c.children.length) this.blocks(c, out, depth);
        else if (textOf(c)) out.push(para(this.inline(c)));
    }
  }

  private isBlock(n: string): boolean {
    return /^(itemizedlist|orderedlist|variablelist|simplelist|programlisting|screen|literallayout|blockquote|table|informaltable|figure|informalfigure|example|informalexample|mediaobject|note|tip|warning|caution|important|sidebar|procedure|equation|informalequation|synopsis|address)$/.test(n);
  }

  private list(c: Element, level: number): PMNode[] {
    const ordered = c.localName === 'orderedlist' || c.localName === 'procedure' || c.localName === 'substeps';
    const format = ordered ? NUMERATION[attr(c, 'numeration') || 'arabic'] || 'decimal' : (attr(c, 'mark') === 'opencircle' ? 'circle' : attr(c, 'mark') === 'box' || attr(c, 'mark') === 'square' ? 'square' : attr(c, 'mark') === 'dash' ? '–' : 'disc');
    const start = parseInt(attr(c, 'startingnumber') || '1', 10) || 1;
    const items = kids(c).filter((k) => /^(listitem|step|member|callout|seglistitem)$/.test(k.localName));
    const entries = items.map((it) => {
      const blocks: PMNode[] = [];
      if (it.localName === 'member') blocks.push(para(this.inline(it)));
      else this.blocks(it, blocks, 0);
      return { level, ordered, format, start, blocks: blocks.length ? blocks : [para()] };
    });
    if (!entries.length) return [];
    return buildNestedLists(entries);
  }

  private media(c: Element): PMNode | null {
    const objs = c.localName === 'imageobject' ? [c] : kids(c).filter((k) => k.localName === 'imageobject' || k.localName === 'imagedata');
    for (const o of objs) {
      const d = o.localName === 'imagedata' ? o : kid(o, 'imagedata');
      const src = d ? attr(d, 'fileref') || xlinkHref(d) || '' : '';
      if (!src) continue;
      const alt = textOf(kid(c, 'textobject')) || textOf(kid(c, 'alt'));
      const dim = (v: string | null) => { if (!v) return null; const m = /^([\d.]+)\s*(in|cm|mm|pt|px)?$/.exec(v); if (!m) return null; const x = parseFloat(m[1]); return m[2] === 'in' ? x * 72 : m[2] === 'cm' ? x * 28.35 : m[2] === 'mm' ? x * 2.835 : m[2] === 'px' ? x * 0.75 : x; };
      return S.image.create({ src, alt, width: dim(attr(d, 'contentwidth') || attr(d, 'width')), height: dim(attr(d, 'contentdepth') || attr(d, 'depth')) });
    }
    if (c.localName === 'graphic') { const src = attr(c, 'fileref'); if (src) return S.image.create({ src }); }
    return null;
  }

  private tex(el: Element): string | null {
    const alt = kids(el).find((k) => k.localName === 'alt' && /tex/i.test(attr(k, 'role') || 'tex'));
    if (alt) return textOf(alt).replace(/^\$+|\$+$/g, '').replace(/^\\\[|\\\]$/g, '').trim();
    const mp = kid(el, 'mathphrase');
    if (mp) return textOf(mp);
    return null;
  }

  private table(t: Element): PMNode | null {
    const tgroup = kid(t, 'tgroup');
    if (!tgroup) {
      // HTML-style table (DocBook 5 / 4.5 informaltable with tr/td).
      const rowsEl = [...kidsNamed(kid(t, 'thead'), 'tr'), ...kidsNamed(t, 'tr'), ...kids(t).filter((k) => k.localName === 'tbody').flatMap((b) => kidsNamed(b, 'tr')), ...kidsNamed(kid(t, 'tfoot'), 'tr')];
      const head = kidsNamed(kid(t, 'thead'), 'tr').length;
      const rows: CellSpec[][] = rowsEl.map((tr) => kids(tr).filter((k) => k.localName === 'td' || k.localName === 'th').map((cell) => ({
        blocks: this.cellBlocks(cell), colspan: parseInt(attr(cell, 'colspan') || '1', 10) || 1, rowspan: parseInt(attr(cell, 'rowspan') || '1', 10) || 1, header: cell.localName === 'th',
      })));
      return makeTable(rows, { headerRows: head });
    }
    const colspecs = kidsNamed(tgroup, 'colspec');
    const colIndex = new Map<string, number>();
    colspecs.forEach((cs, i) => { const nm = attr(cs, 'colname'); const num = parseInt(attr(cs, 'colnum') || String(i + 1), 10); if (nm) colIndex.set(nm, num - 1); });
    const aligns = colspecs.map((cs) => attr(cs, 'align'));
    const head = kidsNamed(kid(tgroup, 'thead'), 'row');
    const body = kids(tgroup).filter((k) => k.localName === 'tbody').flatMap((b) => kidsNamed(b, 'row'));
    const foot = kidsNamed(kid(tgroup, 'tfoot'), 'row');
    const rows: CellSpec[][] = [...head, ...body, ...foot].map((row) => {
      let col = 0;
      return kids(row).filter((k) => k.localName === 'entry' || k.localName === 'entrytbl').map((e) => {
        const ns = attr(e, 'namest'), ne = attr(e, 'nameend'), cn = attr(e, 'colname');
        if (ns && colIndex.has(ns)) col = colIndex.get(ns)!;
        else if (cn && colIndex.has(cn)) col = colIndex.get(cn)!;
        const span = ns && ne && colIndex.has(ne) ? colIndex.get(ne)! - col + 1 : 1;
        const align = attr(e, 'align') || aligns[col];
        const blocks = this.cellBlocks(e).map((b) => (align && b.type === S.paragraph ? S.paragraph.create({ ...b.attrs, align }, b.content) : b));
        const spec: CellSpec = { blocks, colspan: Math.max(1, span), rowspan: (parseInt(attr(e, 'morerows') || '0', 10) || 0) + 1, valign: attr(e, 'valign') };
        col += Math.max(1, span);
        return spec;
      });
    });
    return makeTable(rows, { headerRows: head.length });
  }

  private cellBlocks(cell: Element): PMNode[] {
    if (kids(cell).some((k) => this.isBlock(k.localName) || k.localName === 'para' || k.localName === 'simpara')) {
      const out: PMNode[] = [];
      for (const k of Array.from(cell.childNodes)) {
        if (k.nodeType === 1) this.block(k as Element, out, 0);
        else if ((k.nodeValue || '').trim()) out.push(para([schema.text((k.nodeValue || '').trim())]));
      }
      return out;
    }
    return [para(this.inline(cell))];
  }

  inline(el: Element, marks: readonly Mark[] = [], keepLines = false): PMNode[] {
    const buf = new InlineBuf();
    const walk = (node: Element, m: readonly Mark[]) => {
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType === 3 || c.nodeType === 4) {
          const v = c.nodeValue || '';
          if (keepLines) {
            v.split('\n').forEach((line, i) => { if (i) buf.node(S.hard_break.create()); if (line) buf.text(line, m); });
          } else buf.text(m.some((x) => x.type === MK.code) ? v.replace(/\n/g, ' ') : v.replace(/\s+/g, ' '), m);
          continue;
        }
        if (c.nodeType !== 1) continue;
        const e = c as Element;
        const n = e.localName;
        const add = (mk: Mark) => walk(e, mk.addToSet(m));
        if (CODE_INLINE.has(n)) { add(MK.code.create()); continue; }
        if (ITALIC_INLINE.has(n)) { add(MK.italic.create()); continue; }
        if (BOLD_INLINE.has(n)) { add(MK.bold.create()); continue; }
        switch (n) {
          case 'emphasis': {
            const role = (attr(e, 'role') || '').toLowerCase();
            if (role === 'bold' || role === 'strong') add(MK.bold.create());
            else if (role === 'underline') add(MK.underline.create());
            else if (role === 'strikethrough' || role === 'strike' || role === 'line-through') add(MK.strike.create());
            else add(MK.italic.create());
            break;
          }
          case 'strong': add(MK.bold.create()); break;
          case 'subscript': add(MK.sub.create()); break;
          case 'superscript': add(MK.sup.create()); break;
          case 'quote': buf.text('“', m); walk(e, m); buf.text('”', m); break;
          case 'footnote': {
            const text = kids(e).map((k) => textOf(k)).join('\n') || textOf(e);
            buf.node(S.footnote.create({ text, id: e.getAttribute('id') || e.getAttribute('xml:id') || '' }));
            break;
          }
          case 'footnoteref': break;
          case 'ulink': case 'link': case 'uri': case 'olink': {
            const href = attr(e, 'url') || xlinkHref(e) || (n === 'uri' ? textOf(e) : null) || (attr(e, 'linkend') ? '#' + attr(e, 'linkend') : null);
            if (!e.childNodes.length && href) { buf.text(attr(e, 'linkend') ? this.titles.get(attr(e, 'linkend')!) || href : href, href && !/^\s*(javascript|vbscript):/i.test(href) ? [...m, MK.link.create({ href })] : m); break; }
            if (href && !/^\s*(javascript|vbscript):/i.test(href)) add(MK.link.create({ href })); else walk(e, m);
            break;
          }
          case 'email': { const addr = textOf(e); buf.text(addr, [...m, MK.link.create({ href: 'mailto:' + addr })]); break; }
          case 'xref': {
            const end = attr(e, 'linkend') || '';
            buf.text(attr(e, 'endterm') ? this.titles.get(attr(e, 'endterm')!) || end : this.titles.get(end) || end, [...m, MK.link.create({ href: '#' + end })]);
            break;
          }
          case 'trademark': walk(e, m); buf.text(attr(e, 'class') === 'registered' ? '®' : attr(e, 'class') === 'copyright' ? '©' : attr(e, 'class') === 'service' ? '℠' : '™', m); break;
          case 'keycombo': kids(e).forEach((k, i) => { if (i) buf.text('+', m); walk(k, MK.bold.create().addToSet(m)); }); break;
          case 'menuchoice': kids(e).forEach((k, i) => { if (i) buf.text(' ▸ ', m); walk(k, MK.bold.create().addToSet(m)); }); break;
          case 'inlinemediaobject': { const img = this.media(e); if (img) buf.node(img); break; }
          case 'inlineequation': { const tx = this.tex(e); if (tx) buf.node(S.math_inline.create({ latex: tx })); else walk(e, m); break; }
          case 'indexterm': case 'remark': case 'anchor': case 'alt': break;
          case 'anchor-text': break;
          case 'sbr': case 'br': buf.node(S.hard_break.create()); break;
          default: walk(e, m);
        }
      }
    };
    walk(el, marks);
    const items = buf.take();
    if (!keepLines) {
      if (items[0]?.isText) { const t = items[0].text!.replace(/^\s+/, ''); if (t) items[0] = schema.text(t, items[0].marks); else items.shift(); }
      const last = items[items.length - 1];
      if (last?.isText) { const t = last.text!.replace(/\s+$/, ''); if (t) items[items.length - 1] = schema.text(t, last.marks); else items.pop(); }
    }
    return items;
  }
}

export function docbookToDoc(xml: string): PMNode {
  const d = parseXml(xml);
  const root = d?.documentElement;
  if (!root) throw new Error('Not a DocBook document (the XML could not be read)');
  return new DocbookReader(root).read();
}

export async function importDocbook(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  return docbookToDoc(decodeXml(data));
}
