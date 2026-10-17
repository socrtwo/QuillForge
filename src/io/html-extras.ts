/**
 * HTML import helpers that recover formatting kept outside the elements themselves:
 *
 * - document style sheets: simple rules (tag, .class, tag.class, #id, comma lists; no
 *   combinators or pseudo-classes) are applied as inline styles, lowest specificity first, so
 *   class-based formatting from LibreOffice, Word ("Web Page"), Google Docs and similar
 *   exporters survives; LibreOffice "-western/-cjk/-ctl" and Word "Mso…" class names map to
 *   paragraph styles where they name a built-in one;
 * - @page rules → page size and margins;
 * - LibreOffice's <div title="header"> / <div title="footer"> (and Word's mso-element header
 *   / footer divisions) → document header and footer (page-number fields kept as {PAGE}).
 */
import type { DocSettings } from '../editor/settings';
import { PAGE_SIZES } from '../editor/settings';
import { canonicalStyleName, lengthToPt } from './serialize';

interface Rule { sel: { tag: string | null; cls: string | null; id: string | null }; spec: number; order: number; decls: string }

const KEEP_PROPS = /^(font-family|font-size|font-weight|font-style|font-variant|color|background|background-color|text-align|text-indent|text-decoration|text-transform|vertical-align|line-height|letter-spacing|margin(-top|-bottom|-left|-right)?|padding(-top|-bottom|-left|-right)?|border(-top|-bottom|-left|-right)?(-style|-width|-color)?|page-break-before|page-break-after|break-before|break-after|direction|list-style-type)$/;

function parseRules(css: string): { rules: Rule[]; page: string | null } {
  const rules: Rule[] = [];
  let page: string | null = null;
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--|-->/g, '');
  const re = /([^{}@]+|@page[^{]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let order = 0;
  while ((m = re.exec(clean))) {
    const selText = m[1].trim();
    const body = m[2].trim();
    if (/^@page/i.test(selText)) { if (!/:(first|left|right)/.test(selText)) page = body; continue; }
    if (/^@/.test(selText)) continue;
    const decls = body.split(';').map((d) => d.trim()).filter((d) => {
      const i = d.indexOf(':');
      return i > 0 && KEEP_PROPS.test(d.slice(0, i).trim().toLowerCase());
    }).join(';');
    if (!decls) continue;
    for (const one of selText.split(',')) {
      const s = one.trim();
      const sm = /^([a-zA-Z][\w-]*)?(?:\.([\w-]+))?(?:#([\w-]+))?$/.exec(s);
      if (!sm || (!sm[1] && !sm[2] && !sm[3])) continue;
      const tag = sm[1] ? sm[1].toLowerCase() : null;
      if (tag && /^(html|body|a|style|script|head|title|meta)$/.test(tag) && !sm[2]) continue;
      rules.push({ sel: { tag, cls: sm[2] || null, id: sm[3] || null }, spec: (sm[3] ? 100 : 0) + (sm[2] ? 10 : 0) + (tag ? 1 : 0), order: order++, decls });
    }
  }
  return { rules, page };
}

/** Apply document style sheets as inline styles; returns the @page declarations if any. */
export function inlineDocumentCss(doc: Document): string | null {
  const sheets = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent || '').join('\n');
  if (!sheets.trim()) return null;
  const { rules, page } = parseRules(sheets);
  if (!rules.length) return page;
  rules.sort((a, b) => a.spec - b.spec || a.order - b.order);
  const byTag = new Map<string, Rule[]>();
  const byClass = new Map<string, Rule[]>();
  const byId = new Map<string, Rule[]>();
  for (const r of rules) {
    const key = r.sel.id ? ['id', r.sel.id] : r.sel.cls ? ['cls', r.sel.cls] : ['tag', r.sel.tag!];
    const map = key[0] === 'id' ? byId : key[0] === 'cls' ? byClass : byTag;
    const list = map.get(key[1]) || [];
    list.push(r);
    map.set(key[1], list);
  }
  const body = doc.body;
  if (!body) return page;
  for (const el of Array.from(body.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    const matched: Rule[] = [];
    for (const r of byTag.get(tag) || []) matched.push(r);
    for (const c of Array.from(el.classList)) for (const r of byClass.get(c) || []) if (!r.sel.tag || r.sel.tag === tag) matched.push(r);
    if (el.id) for (const r of byId.get(el.id) || []) if ((!r.sel.tag || r.sel.tag === tag) && (!r.sel.cls || el.classList.contains(r.sel.cls))) matched.push(r);
    if (!matched.length) continue;
    matched.sort((a, b) => a.spec - b.spec || a.order - b.order);
    const inline = el.getAttribute('style') || '';
    el.setAttribute('style', [...matched.map((r) => r.decls), inline].filter(Boolean).join(';'));
    // Paragraph styles named by the class (LibreOffice "note-para-western", Word "MsoTitle").
    if (/^(p|div|h[1-6])$/.test(tag) && !el.hasAttribute('data-style')) {
      for (const c of Array.from(el.classList)) {
        const base = c.replace(/-(western|cjk|ctl)$/, '').replace(/[-_]+/g, ' ');
        const name = canonicalStyleName(base) || canonicalStyleName(c);
        if (name && name !== 'Normal' && !(/^h\d$/.test(tag) && /^Heading/.test(name))) { el.setAttribute('data-style', name); break; }
      }
    }
  }
  return page;
}

/** Page size and margins from @page declarations. */
export function applyPageCss(decls: string | null, settings: DocSettings): void {
  if (!decls) return;
  const pg = settings.page;
  const get = (p: string) => new RegExp(`(?:^|;)\\s*${p}\\s*:\\s*([^;]+)`, 'i').exec(decls)?.[1].trim();
  const size = get('size');
  if (size) {
    const parts = size.split(/\s+/);
    const named = Object.keys(PAGE_SIZES).find((k) => k.toLowerCase() === parts[0].toLowerCase());
    if (named) { [pg.width, pg.height] = PAGE_SIZES[named]; pg.sizeName = named; if (/landscape/i.test(size)) pg.orientation = 'landscape'; }
    else if (parts.length >= 2) {
      const w = lengthToPt(parts[0]), h = lengthToPt(parts[1]);
      if (w && h) {
        pg.width = Math.round(Math.min(w, h) * 100) / 100; pg.height = Math.round(Math.max(w, h) * 100) / 100; pg.orientation = w > h ? 'landscape' : 'portrait';
        pg.sizeName = 'Custom';
        for (const [n, [pw, ph]] of Object.entries(PAGE_SIZES)) if (Math.abs(pw - pg.width) < 2 && Math.abs(ph - pg.height) < 2) { pg.sizeName = n; break; }
      }
    }
  }
  const all = get('margin');
  if (all) {
    const v = all.split(/\s+/).map((x) => lengthToPt(x));
    if (v.every((x) => x != null)) {
      const [t, r = t, b = t, l = r] = v as number[];
      pg.margin = { top: t, right: r, bottom: b, left: l };
    }
  }
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const v = get(`margin-${side}`);
    const pt = v ? lengthToPt(v) : null;
    if (pt != null) pg.margin[side] = Math.round(pt * 100) / 100;
  }
}

/** Move header/footer divisions out of the body into the document settings. */
export function extractHeaderFooter(doc: Document, settings: DocSettings): void {
  const body = doc.body;
  if (!body) return;
  const parts = Array.from(body.querySelectorAll('div[title="header"], div[title="footer"], div[style*="mso-element:header"], div[style*="mso-element:footer"]'));
  for (const div of parts) {
    const isHeader = (div.getAttribute('title') || '') === 'header' || /mso-element:\s*header/.test(div.getAttribute('style') || '');
    const clone = div.cloneNode(true) as Element;
    clone.querySelectorAll('sdfield[type="PAGE"], span.MsoPageNumber, sdfield[subtype="PAGE"]').forEach((f) => f.replaceWith(doc.createTextNode('{PAGE}')));
    clone.querySelectorAll('sdfield[type="DOCSTAT"]').forEach((f) => f.replaceWith(doc.createTextNode('{NUMPAGES}')));
    const p = clone.querySelector('p, div') || clone;
    const align = (p.getAttribute('align') || (/text-align\s*:\s*(\w+)/.exec(p.getAttribute('style') || '')?.[1]) || 'left').toLowerCase();
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    div.remove();
    if (!text) continue;
    const key = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
    const hf = { left: '', center: '', right: '', [key]: text };
    if (isHeader) settings.header = hf; else settings.footer = hf;
  }
}

/**
 * Block-level backgrounds (paragraph shading, cell fill) are attributes of the block: keep them
 * out of the inline style so they are not also applied to the text as a highlight.
 */
export function moveBlockBackgrounds(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, td, th, li, blockquote, div')) as HTMLElement[]) {
    const bg = el.style.backgroundColor;
    if (!bg || bg === 'transparent') continue;
    el.style.removeProperty('background-color');
    el.style.removeProperty('background');
    if (el.tagName !== 'DIV' && el.tagName !== 'LI') el.setAttribute('data-bg', bg);
  }
}
