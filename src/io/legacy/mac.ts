/**
 * Classic Macintosh word processors: MacWrite / MacWrite II / MacWrite Pro, WriteNow and
 * ClarisWorks / AppleWorks word processing. Best effort: these programs keep their text in
 * structured records (and Macintosh resource forks, which are lost when the file leaves a Mac);
 * the text records are decoded from the data fork in Mac OS Roman, with paragraphs at
 * carriage returns. Formatting is not read.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { be } from '../cfb';
import { DocBuilder } from './builder';
import { macChar } from './codepage';

const u8a = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

/**
 * Text runs that read like prose: stretches of printable Mac OS Roman text (with CR and tab)
 * between control bytes, kept when long enough and mostly letters and spaces.
 */
export function macTextRuns(u8: Uint8Array, from = 0, minLen = 4): string[] {
  const runs: string[] = [];
  let cur = '';
  const keep = () => {
    const t = cur.replace(/^\s+|\s+$/g, '');
    const letters = (t.match(/[\p{L}\p{N} ,.;:'"!?()\-–—’“”]/gu) || []).length;
    if (t.length >= minLen && letters >= t.length * 0.75 && /[\p{L}]{2}/u.test(t)) runs.push(cur.replace(/^\0+|\0+$/g, ''));
    cur = '';
  };
  for (let i = from; i < u8.length; i++) {
    const c = u8[i];
    if (c === 0x0d || c === 0x09 || (c >= 0x20 && c < 0x7f) || (c >= 0x80 && c < 0xd9 && c !== 0xa0 && c !== 0xc9 && c !== 0xca)) cur += c === 0x0d ? '\r' : macChar(c);
    else keep();
  }
  keep();
  return runs;
}

/** MacWrite 4.5+ compresses text in nibbles: 15 common characters, 0xF escapes a full byte. */
const NIBBLE = ' etnroaisdlhcfp';
function nibbleDecode(u8: Uint8Array, p: number, count: number): string {
  let out = '';
  const nib: number[] = [];
  for (let i = p; out.length < count && i < u8.length; i++) {
    nib.push(u8[i] >> 4, u8[i] & 15);
    while (nib.length && out.length < count) {
      if (nib[0] !== 15) out += NIBBLE[nib.shift()!];
      else if (nib.length >= 3) { nib.shift(); out += macChar((nib.shift()! << 4) | nib.shift()!); }
      else break;
    }
  }
  return out;
}

/**
 * MacWrite (versions 3 and 6): a paragraph information array of 16-byte entries whose first word
 * points at the paragraph's data (a length word, then plain or nibble-compressed text ending in CR).
 * The array is found by its shape; its first entries are the main document in order.
 */
function macWriteParagraphs(u8: Uint8Array): string[] | null {
  const v = be.u16(u8, 0);
  if (v !== 3 && v !== 6) return null;
  const nMain = be.u16(u8, 2);
  const textAt = (off: number): string | null => {
    const len = be.u16(u8, off);
    if (len < 1 || len > 8192 || off + 2 > u8.length) return null;
    const raw = u8.subarray(off + 2, off + 2 + len);
    const plainOk = raw.length === len && raw[len - 1] === 0x0d && raw.every((c, k) => k === len - 1 || c >= 0x20 || c === 0x09);
    if (plainOk) return Array.from(raw.subarray(0, len - 1), macChar).join('');
    const t = nibbleDecode(u8, off + 2, len);
    return t.length === len && t.endsWith('\r') && !/[\x00-\x08\x0e-\x1f]/.test(t.slice(0, -1)) ? t.slice(0, -1) : null;
  };
  let best: { at: number; n: number } | null = null;
  for (let at = 0x40; at + 48 <= u8.length; at += 2) {
    let n = 0;
    while (at + (n + 1) * 16 <= u8.length && n < 20000) {
      const off = be.u16(u8, at + n * 16);
      if (off < 0x40 || off >= u8.length || be.u16(u8, off) > 8192) break;
      n++;
    }
    if (n >= 3 && (!best || n > best.n)) best = { at, n };
    if (n > 3) at += 16 * (n - 1);
  }
  if (!best) return null;
  const out: string[] = [];
  const count = nMain > 0 && nMain <= best.n ? nMain : best.n;
  for (let k = 0; k < count; k++) {
    const t = textAt(be.u16(u8, best.at + k * 16));
    if (t != null) out.push(t);
  }
  return out.length ? out : null;
}

function emit(b: DocBuilder, paras: string[]): void {
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  for (const p of paras) for (const line of p.split('\r')) { b.text(line); b.endParagraph(); }
}

export async function importMacWrite(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const u8 = u8a(data);
  const b = new DocBuilder();
  const recs = macWriteParagraphs(u8) || [], runs = macTextRuns(u8, 0x40);
  const letters = (a: string[]) => a.join('').replace(/[^\p{L}]/gu, '').length;
  emit(b, letters(recs) >= letters(runs) ? recs : runs);
  return b.build();
}

export async function importWriteNow(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const b = new DocBuilder();
  emit(b, macTextRuns(u8a(data), 0x10));
  return b.build();
}

export async function importClarisWorks(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const u8 = u8a(data);
  if (String.fromCharCode(...u8.subarray(4, 8)) !== 'BOBO') throw new Error('Not a ClarisWorks / AppleWorks document');
  const b = new DocBuilder();
  // The text zone holds the document text; style and font names are short runs that the prose filter drops.
  emit(b, macTextRuns(u8, 0x100, 6));
  return b.build();
}

export function extractText(u8: Uint8Array): string {
  return macTextRuns(u8, 0x10).join('\n').replace(/\r/g, '\n');
}
