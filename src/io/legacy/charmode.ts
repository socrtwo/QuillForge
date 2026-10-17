/**
 * Character-mode word processors of the DOS and IBM-host era.
 *
 *   - WordStar 3-4 (and 5-7 documents, which add a 128-byte header): the high bit marks word
 *     ends and soft spaces; 8D 0A is a soft line end; ^B bold, ^Y italic, ^S underline, ^D double
 *     strike, ^T superscript, ^V subscript, ^X strike-out; dot commands (.pa, .he, .fo, .lm, .rm, .cp…)
 *     start a line. WordStar 5+ adds 1B c 1C extended characters and 1D … 1D tags.
 *   - XyWrite: CP437 text with commands in guillemets («MDBO», «MDIT», «MDUL», «MDNM», «PG», «FC»,
 *     «FR», «LM n», «RM n», «RH…», «FN…»).
 *   - IBM DisplayWrite (DCA Revisable-Form Text): EBCDIC text with structured fields and
 *     control sequences (CSP 2B); required carrier returns end paragraphs.
 *   - MultiMate: CP437 text; 0xAF ends a paragraph, 0x14 is a tab.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { DocBuilder, type CharProps, type ParaProps } from './builder';
import { dosChar, ebcdicChar } from './codepage';

const u8a = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

// ---------------------------------------------------------------------------------------
// WordStar

function wordStar(u8: Uint8Array, b: DocBuilder, plain?: { out: string }): void {
  let i = u8[0] === 0x1d && u8[1] === 0x7d ? 128 : 0; // WordStar 5-7 header
  const cp: CharProps = {};
  const pp: ParaProps = {};
  const put = (s: string) => (plain ? (plain.out += s) : b.text(s, cp));
  const para = () => { if (plain) plain.out += '\n'; else b.endParagraph({ ...pp }); };
  let lineStart = true;
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  while (i < u8.length) {
    const c = u8[i];
    if (c === 0x1a) break; // end of file
    if (lineStart && (c === 0x2e || c === 0xae)) {
      // Dot command: the whole line.
      let e = i;
      while (e < u8.length && u8[e] !== 0x0a) e++;
      const line = Array.from(u8.subarray(i + 1, e), (x) => String.fromCharCode(x & 0x7f)).join('').replace(/\r$/, '');
      const cmd = line.slice(0, 2).toLowerCase(), arg = line.slice(2).trim();
      if (!plain) {
        if (cmd === 'pa') b.pageBreak();
        else if (cmd === 'he' || cmd === 'h1') b.running('header', arg.replace(/#/g, '{PAGE}'));
        else if (cmd === 'fo' || cmd === 'f1') b.running('footer', arg.replace(/#/g, '{PAGE}'));
        else if (cmd === 'lm' && /^\d+$/.test(arg)) pp.indentLeft = Math.max(0, (parseInt(arg, 10) - 1) * 7.2);
        else if (cmd === 'oj') pp.align = /off|n/i.test(arg) ? 'left' : 'justify';
        else if (cmd === 'ls' && /^[1-3]$/.test(arg)) pp.lineHeight = arg === '1' ? null : arg;
      }
      i = e + 1;
      lineStart = true;
      continue;
    }
    lineStart = false;
    if (c === 0x0d) {
      if (u8[i + 1] === 0x0a) i++;
      para();
      lineStart = true;
    } else if (c === 0x8d) {
      if (u8[i + 1] === 0x0a || u8[i + 1] === 0x8a) i++;
      put(' ');
      lineStart = true;
    } else if (c === 0x0a || c === 0x8a) { lineStart = true; }
    else if (c === 0x09 || c === 0x89) put('\t');
    else if (c === 0x0c) { if (!plain) { b.flush({ ...pp }); b.pageBreak(); } lineStart = true; }
    else if (c === 0x02) cp.bold = !cp.bold;
    else if (c === 0x04) cp.bold = !cp.bold;
    else if (c === 0x13) cp.underline = !cp.underline;
    else if (c === 0x19) cp.italic = !cp.italic;
    else if (c === 0x14) cp.sup = !cp.sup;
    else if (c === 0x16) cp.sub = !cp.sub;
    else if (c === 0x18) cp.strike = !cp.strike;
    else if (c === 0x0f || c === 0xa0) put(c === 0x0f ? ' ' : ' ');
    else if (c === 0x1b && u8[i + 2] === 0x1c) { put(dosChar(u8[i + 1])); i += 2; }
    else if (c === 0x1d) {
      // WordStar 5+ tag: 1D, type, length (2 bytes), data, length, 1D
      const len = u8[i + 2] | (u8[i + 3] << 8);
      i += len > 0 && len < 4096 ? len + 3 : 0;
    } else if (c >= 0x20) put(String.fromCharCode(c & 0x7f));
    i++;
  }
  if (!plain) b.flush({ ...pp });
}

export async function importWordStar(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const b = new DocBuilder();
  b.defaultFont = 'Courier New';
  wordStar(u8a(data), b);
  return b.build();
}

// ---------------------------------------------------------------------------------------
// XyWrite

function xyWrite(u8: Uint8Array, b: DocBuilder, plain?: { out: string }): void {
  const cp: CharProps = {};
  const pp: ParaProps = {};
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  const put = (s: string) => (plain ? (plain.out += s) : b.text(s, cp));
  for (let i = 0; i < u8.length; i++) {
    const c = u8[i];
    if (c === 0x1a) break;
    if (c === 0xae) {
      const e = u8.indexOf(0xaf, i + 1);
      if (e > i && e - i < 2048) {
        const cmd = Array.from(u8.subarray(i + 1, e), (x) => dosChar(x)).join('');
        const op = cmd.slice(0, 2).toUpperCase(), arg = cmd.slice(2).trim();
        if (!plain) {
          if (op === 'MD') {
            const m = arg.toUpperCase();
            if (m === 'BO') cp.bold = true; else if (m === 'IT') cp.italic = true; else if (m === 'UL') cp.underline = true;
            else if (m === 'SU') cp.sup = true; else if (m === 'SD') cp.sub = true; else if (m === 'SO') cp.strike = true;
            else if (m === 'NM') { cp.bold = cp.italic = cp.underline = cp.sup = cp.sub = cp.strike = false; }
          } else if (op === 'PG') { b.flush({ ...pp }); b.pageBreak(); }
          else if (op === 'FC') pp.align = 'center';
          else if (op === 'FR') pp.align = 'right';
          else if (op === 'LM' && /^\d+/.test(arg)) pp.indentLeft = parseInt(arg, 10) * 7.2;
          else if (op === 'RH' || op === 'HD') b.running('header', arg.replace(/^[A-Z0-9, ]*,/, ''));
          else if (op === 'RF' || op === 'FT') b.running('footer', arg.replace(/^[A-Z0-9, ]*,/, ''));
          else if (op === 'FN') b.footnote(arg.replace(/^\d*,?/, ''));
        }
        i = e;
        continue;
      }
    }
    if (c === 0xff && i + 2 < u8.length) { i += 2; continue; } // three-byte mode codes (XyWrite III+)
    if (c === 0x0d) { if (u8[i + 1] === 0x0a) i++; if (plain) plain.out += '\n'; else { b.endParagraph({ ...pp }); pp.align = null; } }
    else if (c === 0x09) put('\t');
    else if (c === 0x0c) { if (!plain) { b.flush({ ...pp }); b.pageBreak(); } }
    else if (c >= 0x20) put(dosChar(c));
  }
  if (!plain) b.flush({ ...pp });
}

export async function importXyWrite(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const b = new DocBuilder();
  b.defaultFont = 'Courier New';
  xyWrite(u8a(data), b);
  return b.build();
}

// ---------------------------------------------------------------------------------------
// DisplayWrite / DCA-RFT (EBCDIC)

function dca(u8: Uint8Array, b: DocBuilder, plain?: { out: string }): void {
  const cp: CharProps = {};
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  const put = (s: string) => (plain ? (plain.out += s) : b.text(s, cp));
  const para = () => (plain ? (plain.out += '\n') : b.endParagraph());
  let i = 0;
  // Skip the leading structured fields (length word, then class X'D3' or X'E0').
  while (i + 3 < u8.length && (u8[i + 2] === 0xd3 || u8[i + 2] === 0xe0)) {
    const len = (u8[i] << 8) | u8[i + 1];
    if (len < 3 || i + len > u8.length) break;
    if (u8[i + 2] === 0xe0) { i += 3; break; } // text unit: the text follows its introducer
    i += len;
  }
  for (; i < u8.length; i++) {
    const c = u8[i];
    if (c === 0x2b) {
      // Control sequence: 2B, class, count (including itself), function, parameters.
      const cls = u8[i + 1], len = u8[i + 2];
      if (cls === 0xd4 && len >= 3) {
        const fn = u8[i + 3];
        if (fn === 0x0a) cp.underline = true; else if (fn === 0x0e) cp.underline = false;
        else if (fn === 0x8a) cp.bold = true; else if (fn === 0x8e) cp.bold = false;
      }
      i += Math.max(2, len + 1);
      continue;
    }
    if (c === 0x06 || c === 0x15 || c === 0x0d) { if (c === 0x0d && u8[i + 1] === 0x25) i++; para(); }
    else if (c === 0x05) put('\t');
    else if (c === 0x0c) { if (!plain) { b.flush(); b.pageBreak(); } }
    else if (c === 0x41) put(' ');
    else if (c === 0xca) { /* syllable hyphen */ }
    else if (c >= 0x40) put(ebcdicChar(c));
  }
  if (!plain) b.flush();
}

export async function importDca(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const b = new DocBuilder();
  dca(u8a(data), b);
  return b.build();
}

// ---------------------------------------------------------------------------------------
// MultiMate

function multiMate(u8: Uint8Array, b: DocBuilder, plain?: { out: string }): void {
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  const put = (s: string) => (plain ? (plain.out += s) : b.text(s));
  // The first record is the document summary; text starts at the first record that reads as text.
  let start = 0;
  for (let r = 0; r * 512 < u8.length; r++) {
    const rec = u8.subarray(r * 512, r * 512 + 512);
    let txt = 0;
    for (const x of rec) if ((x >= 0x20 && x < 0x7f) || x === 0xaf) txt++;
    if (txt > rec.length * 0.6) { start = r * 512; break; }
  }
  for (let i = start; i < u8.length; i++) {
    const c = u8[i];
    if (c === 0x1a) break;
    if (c === 0xaf || c === 0x0d) { if (c === 0x0d && u8[i + 1] === 0x0a) i++; if (plain) plain.out += '\n'; else b.endParagraph(); }
    else if (c === 0x14 || c === 0x09) put('\t');
    else if (c === 0x0c) { if (!plain) { b.flush(); b.pageBreak(); } }
    else if (c >= 0x20 && c !== 0xff) put(dosChar(c));
  }
  if (!plain) b.flush();
}

export async function importMultiMate(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const b = new DocBuilder();
  b.defaultFont = 'Courier New';
  multiMate(u8a(data), b);
  return b.build();
}

export function extractText(u8: Uint8Array, kind: 'wordstar' | 'xywrite' | 'rft' | 'multimate'): string {
  const p = { out: '' };
  const b = new DocBuilder();
  try {
    if (kind === 'wordstar') wordStar(u8, b, p);
    else if (kind === 'xywrite') xyWrite(u8, b, p);
    else if (kind === 'rft') dca(u8, b, p);
    else multiMate(u8, b, p);
  } catch { /* partial */ }
  return p.out;
}
