/**
 * Small, namespace-agnostic XML reading helpers shared by the XML-based importers
 * (Word 2003 XML, flat OPC, StarOffice 1.x, AbiWord, KWord, Pages '09, HWPX, FictionBook,
 * DocBook). Elements and attributes are matched by local name so prefix and namespace
 * variations between producers and versions do not matter.
 */
import { stripInvalidXml } from './ooxml-util';
import { decodeEntity } from './serialize';
import { decodeAs } from './encoding';

/** Decode XML bytes honoring a BOM or the encoding named in the XML declaration. */
export function decodeXml(data: ArrayBuffer | Uint8Array): string {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  if (u8[0] === 0x3c && u8[1] === 0x00) return new TextDecoder('utf-16le').decode(u8);
  if (u8[0] === 0x00 && u8[1] === 0x3c) return new TextDecoder('utf-16be').decode(u8);
  const head = String.fromCharCode(...Array.from(u8.subarray(0, 200)));
  const m = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head);
  const label = m ? m[1].toLowerCase() : 'utf-8';
  if (label !== 'utf-8' && label !== 'utf8') {
    try { return new TextDecoder(label).decode(u8); } catch { /* unknown label: fall through */ }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    return decodeAs(u8, 'windows-1252')!;
  }
}

/** Parse XML text; retries once after removing characters illegal in XML. Returns null on failure. */
export function parseXml(text: string): Document | null {
  const parse = (t: string): Document | null => {
    try {
      const d = new DOMParser().parseFromString(t, 'application/xml');
      if (!d.documentElement || d.documentElement.localName === 'parsererror' || d.getElementsByTagName('parsererror').length) return null;
      return d;
    } catch {
      return null;
    }
  };
  const clean = text.replace(/^\uFEFF/, '');
  return parse(clean) || parse(looseXml(clean));
}

const XML_BUILTIN = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
const escapeXmlText = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Make XML that relies on an external DTD parseable: drop the DOCTYPE (keeping simple internal
 * <!ENTITY> definitions), replace HTML/ISO named entities with their characters, escape stray
 * ampersands and remove characters that XML 1.0 forbids.
 */
export function looseXml(text: string): string {
  const defs = new Map<string, string>();
  let s = stripInvalidXml(text).replace(/^\s*<\?xml[^>]*\?>/, '');
  s = s.replace(/<!DOCTYPE[^[>]*(\[([\s\S]*?)\])?\s*>/i, (_m, _sub, inner: string | undefined) => {
    if (inner) for (const m of inner.matchAll(/<!ENTITY\s+([\w.-]+)\s+(?:"([^"]*)"|'([^']*)')\s*>/g)) defs.set(m[1], m[2] ?? m[3] ?? '');
    return '';
  });
  for (let round = 0; round < 3; round++) {
    s = s.replace(/&([A-Za-z][\w.-]*);/g, (m, name: string) => {
      if (XML_BUILTIN.has(name)) return m;
      if (defs.has(name)) return defs.get(name)!;
      const ch = decodeEntity(name);
      return ch != null ? escapeXmlText(ch) : `&amp;${name};`;
    });
  }
  return s.replace(/&(?!(?:[a-zA-Z][\w.-]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

export function parseXmlBytes(data: ArrayBuffer | Uint8Array): Document | null {
  return parseXml(decodeXml(data));
}

/** Child elements. */
export function kids(el: Element | null | undefined): Element[] {
  const out: Element[] = [];
  if (!el) return out;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) out.push(c);
  return out;
}

/** First child element with this local name. */
export function kid(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c;
  return null;
}

/** Child elements with this local name. */
export function kidsNamed(el: Element | null | undefined, name: string): Element[] {
  return kids(el).filter((c) => c.localName === name);
}

/** Descendant elements with this local name (document order). */
export function desc(el: Element | Document | null | undefined, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.getElementsByTagNameNS('*', name));
}

export function firstDesc(el: Element | Document | null | undefined, name: string): Element | null {
  if (!el) return null;
  return el.getElementsByTagNameNS('*', name)[0] || null;
}

/** Attribute by local name, any namespace. */
export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const a = el.attributes;
  for (let i = 0; i < a.length; i++) if (a[i].localName === name) return a[i].value;
  return null;
}

/** Attribute by namespace URI (or by local name in a namespace whose URI ends with `nsTail`). */
export function attrNs(el: Element | null | undefined, nsTail: string, name: string): string | null {
  if (!el) return null;
  const a = el.attributes;
  for (let i = 0; i < a.length; i++) if (a[i].localName === name && (a[i].namespaceURI || '').endsWith(nsTail)) return a[i].value;
  return null;
}

export function numAttr(el: Element | null | undefined, name: string): number | null {
  const v = attr(el, name);
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Text content with collapsed whitespace. */
export function textOf(el: Element | null | undefined): string {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Walk up to the nearest ancestor with one of these local names. */
export function closest(el: Element | null, names: string[]): Element | null {
  for (let e = el?.parentElement || null; e; e = e.parentElement) if (names.includes(e.localName)) return e;
  return null;
}
