/**
 * Microsoft Works word processor documents (.wps).
 *
 *   - Works 4.5 to 9 (and Works 2000-2004/Suite): a compound file whose CONTENTS stream holds a
 *     chunk directory ("CHNKWKS " / "CHNKINK "). The TEXT chunk is UTF-16; FONT names the fonts.
 *   - Works 3 and 4 for Windows: a compound file whose MN0 stream starts with a 256-byte header
 *     followed by the text (Windows code page) and Write-style 128-byte formatting pages.
 *   - Works for DOS 1-3: a 256-byte header followed by the text (DOS code page).
 *   - Kingsoft WPS Writer files with the same extension are Word documents and open as such.
 *
 * Imported: text, paragraphs, tabs, page breaks, the default font; character formatting for
 * Works 3/4 (bold, italic, underline, size, font) from the formatting pages.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { openCfb, le, type Cfb } from '../cfb';
import { DocBuilder, type CharProps } from './builder';
import { decodeDos, winChar } from './codepage';

const u8a = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

interface Chunk { name: string; type: string; index: number; offset: number; length: number }

/** The chunk directory of a Works 4.5+ CONTENTS stream. */
export function worksChunks(c: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  if (!/^CHNK/.test(String.fromCharCode(...c.subarray(0, 4)))) return out;
  const n = le.u16(c, 12);
  for (let k = 0, p = 0x20; k < Math.min(n || 64, 512) && p + 24 <= c.length; k++, p += 24) {
    const name = String.fromCharCode(...c.subarray(p + 2, p + 6));
    if (!/^[A-Z ]{4}$/.test(name)) break;
    out.push({ name, index: le.u16(c, p + 6), type: String.fromCharCode(...c.subarray(p + 12, p + 16)), offset: le.u32(c, p + 16), length: le.u32(c, p + 20) });
  }
  return out;
}

function emitText(b: DocBuilder, text: string, cp: CharProps | null = null): void {
  const t = text.replace(/\r\n/g, '\r');
  let buf = '';
  const flush = () => { if (buf) { b.text(buf, cp); buf = ''; } };
  for (const ch of t) {
    const c = ch.charCodeAt(0);
    if (ch === '\r' || ch === '\n') { flush(); b.endParagraph(); }
    else if (c === 0x0c) { flush(); b.flush(); b.pageBreak(); }
    else if (c === 0x0b) { flush(); b.lineBreak(); }
    else if (c === 0x09 || c >= 0x20) buf += ch;
  }
  flush();
}

function readContents(cfb: Cfb, b: DocBuilder): boolean {
  const c = cfb.read('CONTENTS');
  if (!c) return false;
  const chunks = worksChunks(c);
  const texts = chunks.filter((k) => k.name === 'TEXT').sort((a, z) => a.index - z.index);
  if (!texts.length) return false;
  const font = chunks.find((k) => k.name === 'FONT');
  if (font) {
    // FONT: count, then [length][UTF-16 name]… entries.
    const f = c.subarray(font.offset, font.offset + font.length);
    for (let p = 4; p + 2 < f.length; ) {
      const len = le.u16(f, p);
      if (!len || len > 64) break;
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(le.u16(f, p + 2 + i * 2));
      if (/^[\x20-\x7e]+$/.test(s.replace(/\0+$/, ''))) { b.defaultFont = s.replace(/\0+$/, ''); break; }
      p += 2 + len * 2 + 4;
    }
  }
  for (const t of texts) {
    const d = c.subarray(t.offset, Math.min(c.length, t.offset + t.length));
    let s = '';
    for (let i = 0; i + 1 < d.length; i += 2) s += String.fromCharCode(le.u16(d, i));
    emitText(b, s);
  }
  return true;
}

/** Works 3/4: header (text from 0x100), then Write-style character pages after the text. */
function readMn0(mn: Uint8Array, b: DocBuilder): boolean {
  let start = le.u32(mn, 0x22);
  if (start < 0x80 || start >= mn.length) start = 0x100;
  let end = le.u32(mn, 0x26);
  if (!(end > start && end <= mn.length)) end = Math.min(mn.length, start + 65536);
  const fonts: string[] = [];
  const fm = /\x0f([\x20-\x7e]{2,31})\0?/g;
  const tail = String.fromCharCode(...mn.subarray(end, Math.min(mn.length, end + 8192)));
  for (let m: RegExpExecArray | null; (m = fm.exec(tail)) && fonts.length < 64; ) fonts.push(m[1]);
  if (fonts[0]) b.defaultFont = fonts[0];
  // Character formatting pages: 128 bytes, fcFirst, then runs (fcLim, offset) as in Windows Write.
  const runs: { fc: number; end: number; cp: CharProps }[] = [];
  for (let pg = Math.ceil(end / 128) * 128; pg + 128 <= mn.length && runs.length < 10000; pg += 128) {
    const page = mn.subarray(pg, pg + 128);
    const first = le.u32(page, 0), n = page[127];
    if (first < start || first >= end || !n || n > 20) continue;
    let fc = first, ok = true;
    const got: typeof runs = [];
    for (let k = 0; k < n; k++) {
      const lim = le.u32(page, 4 + k * 6), bf = le.u16(page, 8 + k * 6);
      if (lim <= fc || lim > end) { ok = false; break; }
      const cp: CharProps = {};
      if (bf !== 0xffff && bf + 4 < 127) {
        const cch = page[4 + bf], p = page.subarray(5 + bf, 5 + bf + cch);
        if (cch >= 2) { cp.bold = !!(p[1] & 1); cp.italic = !!(p[1] & 2); }
        if (cch >= 3 && p[2]) cp.size = p[2] / 2;
        if (cch >= 4) cp.underline = !!(p[3] & 1);
      }
      got.push({ fc, end: lim, cp });
      fc = lim;
    }
    if (ok) runs.push(...got);
  }
  const text = Array.from(mn.subarray(start, end), winChar).join('');
  if (!runs.length) { emitText(b, text); return true; }
  let pos = start;
  for (const r of runs.sort((a, z) => a.fc - z.fc)) {
    if (r.fc > pos) emitText(b, text.slice(pos - start, r.fc - start));
    emitText(b, text.slice(Math.max(pos, r.fc) - start, r.end - start), r.cp);
    pos = Math.max(pos, r.end);
  }
  if (pos < end) emitText(b, text.slice(pos - start));
  return true;
}

export async function importWorks(data: ArrayBuffer, name: string): Promise<PMNode> {
  const u8 = u8a(data);
  const cfb = openCfb(u8);
  const b = new DocBuilder();
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 90, right: 90 });
  if (cfb) {
    if (cfb.find('WordDocument')) return (await import('./word')).importWord97(data, name).catch(async () => (await import('../recover')).importDoc97(data, name));
    if (readContents(cfb, b)) return b.build();
    const mn = cfb.read('MN0');
    if (mn && readMn0(mn, b)) return b.build();
    throw new Error('No Works text stream (CONTENTS or MN0) was found');
  }
  if (u8[0] === 0x01 && u8[1] === 0xfe) {
    // Works for DOS: text follows the 256-byte header; runs of formatting codes are dropped.
    const body = u8.subarray(0x100);
    let end = body.indexOf(0x1a);
    if (end < 0) end = body.length;
    emitText(b, decodeDos(body.subarray(0, end), 'cp437').replace(/[\x00-\x08\x0e-\x1f]/g, ''));
    return b.build();
  }
  throw new Error('Not a Microsoft Works document');
}

export function extractText(u8: Uint8Array): string {
  try {
    const cfb = openCfb(u8);
    if (cfb) {
      const c = cfb.read('CONTENTS');
      if (c) return worksChunks(c).filter((k) => k.name === 'TEXT').map((t) => { let s = ''; for (let i = t.offset; i + 1 < Math.min(c.length, t.offset + t.length); i += 2) s += String.fromCharCode(le.u16(c, i)); return s; }).join('').replace(/\r/g, '\n');
      const mn = cfb.read('MN0');
      if (mn) return Array.from(mn.subarray(0x100, Math.min(mn.length, le.u32(mn, 0x26) || mn.length)), winChar).join('').replace(/\r/g, '');
    }
    return decodeDos(u8.subarray(0x100)).replace(/[\x00-\x08\x0e-\x1f]/g, '');
  } catch { return ''; }
}
