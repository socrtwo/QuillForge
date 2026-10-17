/**
 * Email-safe HTML for the embedded editor (docs/EMBED.md): the document rendered as a fragment whose
 * formatting is entirely in inline style attributes. Mail clients drop <style> blocks, classes and
 * scripts, so the document's style sheet (paragraph and character styles, theme colours, tables, lists)
 * is applied here, element by element, the way a CSS inliner does. Images keep their src (data: URIs and
 * cid: references pass through unchanged).
 */
import type { Node as PMNode } from 'prosemirror-model';
import { prepareDoc, collectFootnotes, renderHtml, baseCss, docSettings } from '../io/serialize';
import { notesSectionHtml } from '../io/html';
import { stylesCss } from '../editor/styles';
import { docToText } from '../io/text';

export interface EmailContent { html: string; text: string }

interface Rule { selectors: string[]; decls: [string, string, boolean][]; order: number }

/** Splits a style sheet into plain rules; @-rules (media queries, fonts) are skipped. */
export function parseCss(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0, order = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    // Find the matching close brace (nested blocks only occur inside @-rules).
    let depth = 1, j = open + 1;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    const body = src.slice(open + 1, j - 1);
    i = j;
    if (!head || head.startsWith('@')) continue;
    rules.push({ selectors: splitTop(head, ','), decls: parseDecls(body), order: order++ });
  }
  return rules;
}

/** Splits on a separator outside parentheses, brackets and quotes. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = '', cur = '';
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseDecls(body: string): [string, string, boolean][] {
  const out: [string, string, boolean][] = [];
  for (const part of splitTop(body, ';')) {
    const c = part.indexOf(':');
    if (c <= 0) continue;
    const prop = part.slice(0, c).trim();
    let value = part.slice(c + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, '').trim();
    if (value) out.push([prop.startsWith('--') ? prop : prop.toLowerCase(), value, important]);
  }
  return out;
}

/** CSS specificity as a sortable number (ids, then classes/attributes/pseudo-classes, then types). */
export function specificity(sel: string): number {
  let s = sel;
  // :not(x) counts as x.
  for (let k = 0; k < 5 && /:not\(/.test(s); k++) s = s.replace(/:not\(([^()]*)\)/g, ' $1');
  let a = 0, b = 0, c = 0;
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return ' '; });
  s = s.replace(/#[\w-]+/g, () => { a++; return ' '; });
  s = s.replace(/\.[\w-]+/g, () => { b++; return ' '; });
  s = s.replace(/::[\w-]+/g, () => { c++; return ' '; });
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => { b++; return ' '; });
  s.replace(/(^|[\s>+~])([a-zA-Z][\w-]*)/g, () => { c++; return ''; });
  return a * 10000 + b * 100 + c;
}

/** Replaces var(--x, fallback) using the custom properties visible at an element. */
function resolveVars(value: string, lookup: (name: string) => string | undefined, depth = 0): string {
  if (depth > 8 || !value.includes('var(')) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (_m, name: string, fb?: string) => {
    const v = lookup(name);
    return resolveVars(v !== undefined ? v : (fb ?? '').trim(), lookup, depth + 1);
  });
}

/**
 * Applies the rules of `css` to every element under `root` (root included) as inline styles, then strips
 * classes, data-* attributes and custom properties. Inline styles already on an element win over the sheet,
 * except !important declarations. Elements that end up display:none are removed.
 */
export function inlineCss(root: HTMLElement, css: string): void {
  const rules = parseCss(css);
  const all = [root, ...root.querySelectorAll<HTMLElement>('*')];
  const matched = new Map<Element, { spec: number; order: number; decl: [string, string, boolean] }[]>();
  const host = root.ownerDocument.createElement('div');
  // Selectors are matched with the root in place, so ".qf-doc .ProseMirror p" finds descendants of root.
  const parent = root.parentNode;
  const next = root.nextSibling;
  host.appendChild(root);
  try {
    for (const rule of rules) for (const sel of rule.selectors) {
      let els: Element[];
      try { els = [...host.querySelectorAll(sel)]; } catch { continue; }
      if (!els.length) continue;
      const spec = specificity(sel);
      for (const el of els) {
        let list = matched.get(el);
        if (!list) matched.set(el, (list = []));
        for (const decl of rule.decls) list.push({ spec, order: rule.order, decl });
      }
    }
  } finally {
    if (parent) parent.insertBefore(root, next); else host.removeChild(root);
  }
  // Custom properties per element (sheet then inline), inherited down the tree.
  const custom = new Map<Element, Map<string, string>>();
  const ordered = new Map<Element, Map<string, [string, boolean]>>();
  for (const el of all) {
    const list = (matched.get(el) || []).sort((x, y) => (Number(x.decl[2]) - Number(y.decl[2])) || x.spec - y.spec || x.order - y.order);
    const props = new Map<string, [string, boolean]>();
    for (const { decl: [p, v, imp] } of list) props.set(p, [v, imp]);
    for (const [p, v] of parseDecls(el.getAttribute('style') || '')) {
      if (props.get(p)?.[1]) continue; // !important in the sheet wins over inline
      props.set(p, [v, false]);
    }
    const vars = new Map<string, string>();
    for (const [p, [v]] of props) if (p.startsWith('--')) vars.set(p, v);
    custom.set(el, vars);
    ordered.set(el, props);
  }
  const lookup = (el: Element) => (name: string): string | undefined => {
    for (let n: Element | null = el; n; n = n.parentElement) { const v = custom.get(n)?.get(name); if (v !== undefined) return v; }
    return undefined;
  };
  for (const el of all) {
    const props = ordered.get(el)!;
    const css: string[] = [];
    for (const [p, [v]] of props) {
      if (p.startsWith('--')) continue;
      const val = resolveVars(v, lookup(el)).trim();
      if (!val || /var\(/.test(val)) continue;
      css.push(`${p}:${val}`);
    }
    if (css.length) el.setAttribute('style', css.join(';')); else el.removeAttribute('style');
  }
  for (const el of all) {
    el.removeAttribute('class');
    for (const a of [...el.attributes]) if (a.name.startsWith('data-')) el.removeAttribute(a.name);
    if (el !== root && /(^|;)\s*display\s*:\s*none\b/i.test(el.getAttribute('style') || '')) el.remove();
  }
}

const UNSAFE_TAGS = 'script, style, link, meta, iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, base, svg foreignObject';

/** Removes anything active: scripts, event handlers, javascript: URLs, embedded frames and form controls. */
export function stripActiveContent(root: HTMLElement): void {
  root.querySelectorAll(UNSAFE_TAGS).forEach((e) => e.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'contenteditable' || n === 'spellcheck' || n === 'draggable') { el.removeAttribute(a.name); continue; }
      if (/^(href|src|xlink:href|action|formaction|background|poster)$/.test(n)) {
        const v = a.value.replace(/[\u0000- ]+/g, '').toLowerCase();
        if (/^(javascript|vbscript):/.test(v) || (/^data:/.test(v) && !/^data:image\/(png|jpe?g|gif|webp|bmp)[;,]/.test(v))) el.removeAttribute(a.name);
      }
    }
  }
}

/** Metric-compatible open fonts bundled with the editor, and the originals they stand in for (src/fonts.ts). */
const ORIGINAL_FONT: Record<string, string> = {
  carlito: 'Calibri', caladea: 'Cambria', tinos: '"Times New Roman"', arimo: 'Arial', cousine: '"Courier New"',
  gelasio: 'Georgia', 'eb garamond': 'Garamond', 'libre baskerville': 'Baskerville',
};
/** "Carlito", sans-serif -> Calibri, "Carlito", sans-serif */
export function withOriginalFonts(list: string): string {
  return list.replace(/(^|,)\s*(["']?)([^,"']+)\2(?=\s*(,|$))/g, (m, sep: string, q: string, name: string) => {
    const orig = ORIGINAL_FONT[name.trim().toLowerCase()];
    return orig && !new RegExp(`(^|,)\\s*["']?${orig.replace(/"/g, '')}["']?\\s*(,|$)`, 'i').test(list) ? `${sep}${sep ? ' ' : ''}${orig}, ${q}${name.trim()}${q}` : m;
  });
}

/** Email-safe HTML fragment and plain text of a document. */
export function emailContent(doc: PMNode): EmailContent {
  const settings = docSettings(doc);
  const prepared = prepareDoc(doc);
  const notes = collectFootnotes(prepared);
  const tdoc = document.implementation.createHTMLDocument('');
  const { container, notes: used } = renderHtml(prepared.content, notes, { document: tdoc });
  // Task-list check boxes are form controls, which mail clients drop: use the symbols instead.
  container.querySelectorAll('input[type=checkbox]').forEach((box) => box.replaceWith(tdoc.createTextNode(box.hasAttribute('checked') ? '☑ ' : '☐ ')));
  // Page and column breaks mean nothing in a message.
  container.querySelectorAll('.page-break, .column-break, .section-break').forEach((e) => e.remove());
  const wrap = tdoc.createElement('div');
  wrap.className = 'qf-doc';
  wrap.appendChild(container);
  const notesHtml = notesSectionHtml(used);
  if (notesHtml) { const t = tdoc.createElement('template'); t.innerHTML = notesHtml; wrap.appendChild(t.content); }
  tdoc.body.appendChild(wrap);
  // The page frame (margins, shadow, print rules) is for files; a message gets the content rules only.
  const css = baseCss(settings, true).replace(/^body\{[^}]*\}\s*/m, '') + '\n' + stylesCss(settings);
  inlineCss(wrap, css);
  // The editor's open fonts stand in for common proprietary ones; a recipient most likely has the original.
  for (const el of [wrap, ...wrap.querySelectorAll<HTMLElement>('[style*="font-family"]')]) {
    const st = el.getAttribute('style');
    if (st) el.setAttribute('style', st.replace(/font-family:([^;]*)/g, (_m, list: string) => `font-family:${withOriginalFonts(list)}`));
  }
  stripActiveContent(wrap);
  // The outer wrapper only carried custom properties; the .ProseMirror div holds the base font.
  const out = tdoc.createElement('div');
  while (wrap.firstChild) out.appendChild(wrap.firstChild);
  const html = out.innerHTML.trim();
  return { html, text: docToText(doc).replace(/\f/g, '\n').replace(/\n+$/, '\n') };
}
