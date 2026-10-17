/**
 * Microsoft Word binary formats, written from Microsoft's published file format
 * descriptions:
 *
 *   - Word for Windows 1.x / 2.0 (FIB magic A59B / A5DB; 2-byte lengths in the FIB),
 *   - Word 6.0 / Word 95 (compound file, nFib 101-104, one-byte sprms),
 *   - Word 97-2003 (compound file, nFib ≥ 193, two-byte sprms, Unicode pieces),
 *   - Word for DOS and Windows Write (128-byte pages, CHP/PAP prefixes),
 *   - Word for Macintosh 1-5 (text and basic formatting).
 *
 * The Windows formats share one reader: FIB → piece table → CHPX/PAPX formatted disk pages
 * (FKPs) → style sheet → sections, headers/footers, notes, fields, tables and lists. Every
 * structure is bounds-checked; a damaged part is skipped rather than failing the import.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { openCfb, le, be } from '../cfb';
import { DocBuilder, WORD_ICO, hex, tw, type CharProps, type ParaProps, type TabStop } from './builder';
import { decodeCodepage, decodeMacRoman, decodeDos, winChar, macChar } from './codepage';
import { bytesToBase64 } from '../serialize';

// ---------------------------------------------------------------------------------------
// Shared helpers

const u8a = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

/** Language id → Windows code page for single-byte text (Word 6 and older store no code page). */
export function lidCodepage(lid: number): number {
  const p = lid & 0x3ff;
  if ([0x19, 0x22, 0x23, 0x02, 0x2f, 0x1c].includes(p) && p !== 0x1c) return 1251; // Russian, Ukrainian, Belarusian, Bulgarian, Macedonian
  if ([0x05, 0x0e, 0x15, 0x18, 0x1a, 0x1b, 0x24, 0x1c].includes(p)) return lid === 0x0c1a ? 1251 : 1250;
  if (p === 0x08) return 1253;
  if (p === 0x1f) return 1254;
  if (p === 0x0d) return 1255;
  if (p === 0x01) return 1256;
  if ([0x25, 0x26, 0x27].includes(p)) return 1257;
  if (p === 0x2a) return 1258;
  if (p === 0x1e) return 874;
  if (p === 0x11) return 932;
  if (p === 0x12) return 949;
  if (p === 0x04) return lid === 0x0404 || lid === 0x0c04 ? 950 : 936;
  return 1252;
}

const NFC: Record<number, string> = { 0: 'decimal', 1: 'upper-roman', 2: 'lower-roman', 3: 'upper-alpha', 4: 'lower-alpha', 5: 'decimal', 6: 'decimal', 22: 'decimal-leading-zero' };

/** Map Word's built-in style names (any case) to this app's names. */
export function wordStyleName(name: string): string {
  const n = name.trim();
  const h = /^heading\s*(\d)$/i.exec(n);
  if (h) return `Heading ${h[1]}`;
  const map: Record<string, string> = {
    normal: 'Normal', title: 'Title', subtitle: 'Subtitle', 'body text': 'Body Text', 'block text': 'Block Text', quote: 'Quote',
    'list paragraph': 'List Paragraph', caption: 'Caption', 'footnote text': 'Footnote Text', 'header': 'Header', 'footer': 'Footer',
    'toc 1': 'TOC 1', 'toc 2': 'TOC 2', 'toc 3': 'TOC 3', 'plain text': 'Plain Text', 'no spacing': 'No Spacing',
  };
  return map[n.toLowerCase()] || n;
}

// ---------------------------------------------------------------------------------------
// Sprm interpretation (Word 2/6 one-byte opcodes and Word 97 two-byte opcodes)

/** Operand length of a Word 6 / Word 2 sprm; -1 = variable (next byte), -2 = unknown. */
const W6_LEN: Record<number, number> = {
  2: 2, 3: -1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: -1, 13: 1, 14: 1, 15: -1, 16: 2, 17: 2, 18: 2, 19: 2, 20: 4, 21: 2, 22: 2,
  23: -3, 24: 1, 25: 1, 26: 2, 27: 2, 28: 2, 29: 1, 30: 2, 31: 2, 32: 2, 33: 2, 34: 2, 35: 2, 36: 2, 37: 1, 38: 2, 39: 2, 40: 2, 41: 2, 42: 2, 43: 2,
  44: 1, 45: 2, 46: 2, 47: 2, 48: 2, 49: 2, 50: 1, 51: 1, 52: -1, 53: 1, 54: 1, 55: 1, 56: 1, 57: 1, 58: 1, 64: -1,
  65: 1, 66: 1, 67: 1, 68: -1, 69: 2, 70: 4, 71: 1, 72: 2, 73: 3, 74: -1, 75: 1, 76: 1, 77: 1, 78: 1, 79: 1,
  80: 2, 81: -1, 82: -1, 83: 0, 84: 0, 85: 1, 86: 1, 87: 1, 88: 1, 89: 1, 90: 1, 91: 1, 92: 1, 93: 2, 94: 1, 95: 3, 96: 2, 97: 2, 98: 1, 99: 1,
  100: 1, 101: 1, 102: 1, 103: -1, 104: 1, 105: -1, 106: -1, 107: 2, 108: -1, 109: 2, 110: 2, 111: 2, 112: 2, 113: 2, 114: 2, 115: 1, 116: 1, 117: 1, 118: 1,
  119: 1, 120: -1, 121: 2, 122: 2, 123: 2, 124: 2, 131: 1, 132: 1, 133: -1, 136: 3, 137: 3, 138: 1, 139: 1, 140: 2, 141: 2, 142: 1, 143: 1, 144: 2, 145: 2,
  146: 1, 147: 1, 148: 2, 149: 2, 150: 1, 151: 1, 152: 1, 153: 1, 154: 2, 155: 2, 156: 2, 157: 2, 158: 1, 159: 1, 160: 2, 161: 2, 162: 1, 163: 1,
  164: 2, 165: 2, 166: 2, 167: 2, 168: 2, 169: 2, 170: 2, 171: 2, 182: 2, 183: 2, 184: 2, 185: 1, 186: 1, 187: 12, 188: -1, 189: 2, 190: -4, 191: -1,
  192: 4, 193: 5, 194: 4, 195: 2, 196: 4, 197: 2, 198: 2, 199: 5, 200: 4,
};

/** Map Word 6 opcodes onto the Word 97 opcodes the interpreter understands. */
const W6_TO_97: Record<number, number> = {
  2: 0x4600, 5: 0x2403, 7: 0x2405, 8: 0x2406, 9: 0x2407, 12: 0xc63e, 13: 0x25ff, 15: 0xc60d, 16: 0x840e, 17: 0x840f, 19: 0x8411, 20: 0x6412, 21: 0xa413, 22: 0xa414,
  23: 0xc615, 24: 0x2416, 25: 0x2417, 38: 0x6424, 39: 0x6425, 40: 0x6426, 41: 0x6427, 47: 0x442d, 51: 0x2431,
  65: 0x0800, 66: 0x0801, 67: 0x0802, 68: 0x6a03, 71: 0x0806, 74: 0x6a09, 75: 0x080a, 80: 0x4a30, 83: 0x2a33,
  85: 0x0835, 86: 0x0836, 87: 0x0837, 88: 0x0838, 89: 0x0839, 90: 0x083a, 91: 0x083b, 92: 0x083c, 93: 0x4a3d, 94: 0x2a3e, 95: 0xea3f,
  96: 0x8840, 98: 0x2a42, 99: 0x4a43, 101: 0x4845, 104: 0x2a48, 117: 0x0855, 118: 0x0856,
  142: 0x3009, 143: 0x300a, 144: 0x500b, 145: 0x900c, 147: 0x300e, 150: 0x3011, 153: 0x3014, 156: 0xb017, 157: 0xb018, 161: 0x501c, 162: 0x301d,
  164: 0xb01f, 165: 0xb020, 166: 0xb021, 167: 0xb022, 168: 0x9023, 169: 0x9024,
  182: 0x5400, 183: 0x9601, 184: 0x9602, 186: 0x3404, 189: 0x9407, 190: 0xd608, 191: 0xd609,
};

export interface Sprm { op: number; arg: Uint8Array; }

/** Split a grpprl into sprms. `w6` selects one-byte opcodes. */
export function parseGrpprl(b: Uint8Array, w6: boolean): Sprm[] {
  const out: Sprm[] = [];
  let p = 0;
  while (p < b.length) {
    if (w6) {
      const op = b[p];
      let len = W6_LEN[op];
      if (len === undefined) break;
      let start = p + 1;
      if (len === -1) { len = b[p + 1] ?? 0; start = p + 2; }
      else if (len === -3) { len = b[p + 1] === 255 ? 0 : (b[p + 1] ?? 0); start = p + 2; }
      else if (len === -4) { len = le.u16(b, p + 1); start = p + 3; }
      const mapped = W6_TO_97[op];
      if (mapped !== undefined) out.push({ op: mapped, arg: b.subarray(start, start + len) });
      p = start + len;
    } else {
      if (p + 2 > b.length) break;
      const op = le.u16(b, p);
      const spra = op >> 13;
      let start = p + 2, len: number;
      switch (spra) {
        case 0: case 1: len = 1; break;
        case 2: case 4: case 5: len = 2; break;
        case 3: len = 4; break;
        case 7: len = 3; break;
        default:
          if (op === 0xd608 || op === 0xd606) { len = le.u16(b, p + 2) - 1; start = p + 4; }
          else if (op === 0xc615 && b[p + 2] === 255) { const del = b[p + 3]; const add = b[p + 4 + del * 4]; len = 1 + del * 4 + 1 + add * 3; start = p + 3; }
          else { len = b[p + 2] ?? 0; start = p + 3; }
      }
      out.push({ op, arg: b.subarray(start, start + len) });
      p = start + Math.max(0, len);
    }
  }
  return out;
}

/** Character properties with the toggles Word resolves against the style (0x80 / 0x81). */
export interface Chp extends CharProps { ftc?: number; istd?: number; spec?: boolean; picLoc?: number; vanish?: boolean; del?: boolean; fldVanish?: boolean; symbol?: { ftc: number; ch: number }; ole?: boolean; data?: boolean }

export interface Pap extends ParaProps { istd?: number; inTable?: boolean; ttp?: boolean; itap?: number; ilfo?: number; ilvl?: number; nLvlAnm?: number; anld?: { nfc: number; start: number; text: string }; cellX?: number[]; cellShd?: (string | null)[]; header?: boolean; tableJc?: string; widowControl?: boolean; dxaGap?: number }

export interface Sep { bkc?: number; xaPage?: number; yaPage?: number; dxaLeft?: number; dxaRight?: number; dyaTop?: number; dyaBottom?: number; dyaHdrTop?: number; dyaHdrBottom?: number; landscape?: boolean; titlePage?: boolean; grpfIhdt?: number; cols?: number; nfcPgn?: number; pgnStart?: number; restartPgn?: boolean }

const toggle = (v: number, base: boolean | undefined) => (v === 0 ? false : v === 1 ? true : v === 0x80 ? !!base : v === 0x81 ? !base : !!v);
const ULS: Record<number, string | boolean> = { 0: false, 1: 'single', 2: 'words', 3: 'double', 4: 'dotted', 6: 'thick', 7: 'dashed', 9: 'dotDash', 10: 'dotDotDash', 11: 'wavy' };

export function applyChp(chp: Chp, sprms: Sprm[], base: Chp, fonts: string[]): void {
  for (const { op, arg } of sprms) {
    const v = arg[0] ?? 0;
    switch (op) {
      case 0x0835: chp.bold = toggle(v, base.bold); break;
      case 0x0836: chp.italic = toggle(v, base.italic); break;
      case 0x0837: chp.strike = toggle(v, base.strike); break;
      case 0x0838: chp.outline = toggle(v, base.outline); break;
      case 0x0839: chp.shadow = toggle(v, base.shadow); break;
      case 0x083a: chp.smallcaps = toggle(v, base.smallcaps); break;
      case 0x083b: chp.allcaps = toggle(v, base.allcaps); break;
      case 0x083c: chp.vanish = toggle(v, base.vanish); break;
      case 0x2a53: chp.dstrike = !!v; break;
      case 0x2a3e: chp.underline = ULS[v] ?? (v ? 'single' : false); break;
      case 0x2a42: chp.color = v > 0 && v < WORD_ICO.length ? WORD_ICO[v] : null; break;
      case 0x6870: chp.color = arg[3] ? null : hex(arg[0], arg[1], arg[2]); break;
      case 0x2a0c: { const hl = ['', '#000000', '#0000ff', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#ffff00', '#ffffff', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0']; chp.highlight = hl[v] || null; break; }
      case 0x4a43: chp.size = (arg.length >= 2 ? le.u16(arg, 0) : arg[0]) / 2; break;
      case 0xea3f: if (arg[0] & 1) chp.size = le.u16(arg, 1) / 2; break; // sprmCSizePos: fChgHps
      case 0x2a48: chp.sup = v === 1; chp.sub = v === 2; break;
      case 0x4845: { const p = (arg[0] << 24) >> 24; chp.sup = p > 0; chp.sub = p < 0; break; }
      case 0x4a3d: case 0x4a4f: { const f = le.u16(arg, 0); chp.ftc = f; if (fonts[f]) chp.font = fonts[f]; break; }
      case 0x8840: chp.spacing = le.i16(arg, 0) / 20; break;
      case 0x4a30: chp.istd = le.u16(arg, 0); break;
      case 0x2a33: Object.assign(chp, { bold: false, italic: false, strike: false, underline: false, smallcaps: false, allcaps: false, sup: false, sub: false, color: null, size: base.size, font: base.font }); break;
      case 0x0855: chp.spec = !!v; break;
      case 0x0856: chp.ole = !!v; break;
      case 0x080a: chp.ole = !!v; break;
      case 0x0806: chp.data = !!v; break;
      case 0x6a03: chp.picLoc = le.u32(arg, 0); break;
      case 0x0800: chp.del = !!v; break;
      case 0x0802: chp.fldVanish = !!v; break;
      case 0x6a09: chp.symbol = { ftc: le.u16(arg, 0), ch: le.u16(arg, 2) }; break;
    }
  }
}

function brcCss(arg: Uint8Array, w97: boolean): string | null {
  // BRC80 (Word 97 four bytes / Word 6 two bytes): width in eighths of a point, type, colour index.
  let width: number, type: number, ico: number;
  if (w97 && arg.length >= 4) { width = arg[0]; type = arg[1]; ico = arg[2]; }
  else { const w = le.u16(arg, 0); width = w & 7; type = (w >> 3) & 3; ico = (w >> 6) & 0x1f; width = width * 6; if (type === 0) return null; }
  if (!type || type === 0xff) return null;
  const pt = Math.max(0.5, Math.min(6, width / 8));
  const style = type === 3 ? 'double' : type === 6 ? 'dotted' : type === 7 || type === 22 ? 'dashed' : 'solid';
  return `${style} ${pt}pt ${WORD_ICO[ico] || '#000000'}`;
}

export function applyPap(pap: Pap, sprms: Sprm[], w97: boolean): void {
  const border: Record<string, string> = {};
  for (const { op, arg } of sprms) {
    const v = arg[0] ?? 0;
    switch (op) {
      case 0x4600: pap.istd = le.u16(arg, 0); break;
      case 0x2403: case 0x2461: pap.align = (['left', 'center', 'right', 'justify', 'justify'] as const)[v] || 'left'; break;
      case 0x2405: pap.keepLines = !!v; break;
      case 0x2406: pap.keepNext = !!v; break;
      case 0x2407: pap.pageBreakBefore = !!v; break;
      case 0x2431: pap.widowControl = !!v; break;
      case 0x840e: case 0x845d: pap.indentRight = tw(le.i16(arg, 0)); break;
      case 0x840f: case 0x845e: pap.indentLeft = tw(le.i16(arg, 0)); break;
      case 0x8411: case 0x8460: pap.indentFirst = tw(le.i16(arg, 0)); break;
      case 0x6412: {
        const dya = le.i16(arg, 0), mult = le.u16(arg, 2);
        if (mult) pap.lineHeight = dya > 0 && dya !== 240 ? String(Math.round(dya / 240 * 100) / 100) : null;
        else if (dya < 0) pap.lineHeight = `${Math.round(-dya / 20 * 10) / 10}pt`;
        else if (dya > 0) pap.lineHeight = `atleast:${Math.round(dya / 20 * 10) / 10}`;
        break;
      }
      case 0xa413: pap.spaceBefore = tw(le.u16(arg, 0)); break;
      case 0xa414: pap.spaceAfter = tw(le.u16(arg, 0)); break;
      case 0x2416: pap.inTable = !!v; break;
      case 0x2417: pap.ttp = !!v; break;
      case 0x6649: pap.itap = le.u32(arg, 0); if (pap.itap > 0) pap.inTable = true; break;
      case 0x260a: pap.ilvl = v; break;
      case 0x460b: pap.ilfo = le.u16(arg, 0); break;
      case 0x2640: pap.outlineLevel = v < 9 ? v + 1 : null; break;
      case 0x25ff: pap.nLvlAnm = v; break;
      case 0xc63e: {
        // ANLD (Word 6 auto-numbering): nfc, text before/after counts, …, start number, number text.
        const nfc = arg[0], before = arg[1], after = arg[2], start = le.u16(arg, 6);
        let text = '';
        for (let k = 0; k < before + after && 0x14 + k < arg.length; k++) text += winChar(arg[0x14 + k]);
        pap.anld = { nfc, start: start || 1, text };
        break;
      }
      case 0xc60d: case 0xc615: {
        // Tab changes: deletions then additions (positions in twips, then TBD bytes).
        const tabs: TabStop[] = (pap.tabs || []).slice();
        let p = 0;
        const del = arg[p++] ?? 0;
        const dels = new Set<number>();
        for (let k = 0; k < del; k++) dels.add(le.i16(arg, p + k * 2));
        p += del * 2 + (op === 0xc615 ? del * 2 : 0);
        const add = arg[p++] ?? 0;
        const kept = tabs.filter((t) => !dels.has(Math.round(t.pos * 20)));
        for (let k = 0; k < add; k++) {
          const pos = le.i16(arg, p + k * 2), tbd = arg[p + add * 2 + k] ?? 0;
          const jc = tbd & 7, tlc = (tbd >> 3) & 7;
          kept.push({ pos: tw(pos), align: (['left', 'center', 'right', 'decimal', 'left'] as const)[jc] || 'left', leader: ['none', 'dot', 'hyphen', 'underscore', 'heavy', 'middleDot'][tlc] || 'none' });
        }
        pap.tabs = kept.sort((a, b) => a.pos - b.pos);
        break;
      }
      case 0x6424: { const c = brcCss(arg, w97); if (c) border.top = c; break; }
      case 0x6425: { const c = brcCss(arg, w97); if (c) border.left = c; break; }
      case 0x6426: { const c = brcCss(arg, w97); if (c) border.bottom = c; break; }
      case 0x6427: { const c = brcCss(arg, w97); if (c) border.right = c; break; }
      case 0x442d: { const shd = le.u16(arg, 0); const back = (shd >> 5) & 0x1f; if (back && WORD_ICO[back] && back !== 8) pap.bg = WORD_ICO[back]; break; }
      case 0x5400: pap.tableJc = ['left', 'center', 'right'][le.u16(arg, 0)] || undefined; break;
      case 0x9602: pap.dxaGap = le.i16(arg, 0); break;
      case 0x3404: pap.header = !!v; break;
      case 0xd608: {
        const n = arg[0];
        if (n > 0 && n < 64 && arg.length >= 1 + (n + 1) * 2) {
          const xs: number[] = [];
          for (let k = 0; k <= n; k++) xs.push(le.i16(arg, 1 + k * 2));
          pap.cellX = xs;
        }
        break;
      }
      case 0xd609: case 0xd612: {
        const shd: (string | null)[] = [];
        if (op === 0xd609) for (let k = 0; k + 1 < arg.length; k += 2) { const back = (le.u16(arg, k) >> 5) & 0x1f; shd.push(back && back !== 8 ? WORD_ICO[back] || null : null); }
        else for (let k = 0; k + 9 < arg.length; k += 10) { const auto = arg[k + 7] === 0xff; shd.push(auto ? null : hex(arg[k + 4], arg[k + 5], arg[k + 6])); }
        if (shd.some(Boolean)) pap.cellShd = shd;
        break;
      }
    }
  }
  if (Object.keys(border).length) pap.border = JSON.stringify(border);
}

export function applySep(sep: Sep, sprms: Sprm[]): void {
  for (const { op, arg } of sprms) {
    const v = arg[0] ?? 0;
    switch (op) {
      case 0x3009: sep.bkc = v; break;
      case 0x300a: sep.titlePage = !!v; break;
      case 0x500b: sep.cols = le.u16(arg, 0) + 1; break;
      case 0x300e: sep.nfcPgn = v; break;
      case 0x3011: sep.restartPgn = !!v; break;
      case 0x3014: sep.grpfIhdt = v; break;
      case 0xb017: sep.dyaHdrTop = le.u16(arg, 0); break;
      case 0xb018: sep.dyaHdrBottom = le.u16(arg, 0); break;
      case 0x501c: sep.pgnStart = le.u16(arg, 0); break;
      case 0x301d: sep.landscape = v === 2; break;
      case 0xb01f: sep.xaPage = le.u16(arg, 0); break;
      case 0xb020: sep.yaPage = le.u16(arg, 0); break;
      case 0xb021: sep.dxaLeft = le.u16(arg, 0); break;
      case 0xb022: sep.dxaRight = le.u16(arg, 0); break;
      case 0x9023: sep.dyaTop = Math.abs(le.i16(arg, 0)); break;
      case 0x9024: sep.dyaBottom = Math.abs(le.i16(arg, 0)); break;
    }
  }
}

// ---------------------------------------------------------------------------------------
// The Windows reader (Word 2, 6/95, 97-2003)

interface Piece { cp: number; cpEnd: number; fc: number; ansi: boolean }
interface Run<T> { fc: number; fcEnd: number; props: T }
interface StyleInfo { name: string; sgc: number; base: number; chp: Sprm[]; pap: Sprm[] }

type Ver = 2 | 6 | 8;

class WinWordReader {
  wd: Uint8Array;
  tbl: Uint8Array;
  data: Uint8Array | null;
  ver: Ver;
  b = new DocBuilder();
  text = '';
  pieces: Piece[] = [];
  chpRuns: Run<Sprm[]>[] = [];
  papRuns: Run<{ istd: number; sprms: Sprm[] }>[] = [];
  styles: StyleInfo[] = [];
  fonts: string[] = [];
  fontCharset: number[] = [];
  cp: number;
  fcLcb: (i: number) => { fc: number; lcb: number };
  ccp: { text: number; ftn: number; hdd: number; mcr: number; atn: number; edn: number; txbx: number; hdrTxbx: number };
  chpCache = new Map<string, Chp>();
  styleChp = new Map<number, Chp>();
  stylePap = new Map<number, Pap>();
  lists = new Map<number, { nfc: number[]; start: number[]; bullets: string[] }>();
  lfo: number[] = [];
  notes: string[] = [];
  styleNames = new Map<number, string>();
  w97: boolean;

  constructor(wd: Uint8Array, tbl: Uint8Array | null, data: Uint8Array | null, ver: Ver) {
    this.wd = wd; this.tbl = tbl || wd; this.data = data; this.ver = ver;
    this.w97 = ver === 8;
    const u32 = (o: number) => le.u32(wd, o);
    const lid = le.u16(wd, 6);
    this.cp = lidCodepage(lid);
    if (ver === 8) {
      let p = 32;
      const csw = le.u16(wd, p); p += 2 + csw * 2;
      const cslw = le.u16(wd, p); const lw = p + 2; p = lw + cslw * 4;
      const cb = le.u16(wd, p); const base = p + 2;
      const c = (k: number) => (k < cslw ? le.u32(wd, lw + k * 4) : 0);
      this.ccp = { text: c(3), ftn: c(4), hdd: c(5), mcr: c(6), atn: c(7), edn: c(8), txbx: c(9), hdrTxbx: c(10) };
      this.fcLcb = (i) => (i < cb ? { fc: le.u32(wd, base + i * 8), lcb: le.u32(wd, base + i * 8 + 4) } : { fc: 0, lcb: 0 });
    } else if (ver === 6) {
      this.ccp = { text: u32(0x34), ftn: u32(0x38), hdd: u32(0x3c), mcr: u32(0x40), atn: u32(0x44), edn: u32(0x48), txbx: u32(0x4c), hdrTxbx: u32(0x50) };
      this.fcLcb = (i) => ({ fc: u32(0x58 + i * 8), lcb: u32(0x5c + i * 8) });
    } else {
      this.ccp = { text: u32(0x34), ftn: u32(0x38), hdd: u32(0x3c), mcr: u32(0x40), atn: u32(0x44), edn: 0, txbx: 0, hdrTxbx: 0 };
      this.fcLcb = (i) => ({ fc: u32(0x58 + i * 6), lcb: le.u16(wd, 0x5c + i * 6) });
    }
  }

  /** Bytes of a FIB fc/lcb structure from the table stream (Word 97) or the main stream. */
  part(i: number): Uint8Array | null {
    const { fc, lcb } = this.fcLcb(i);
    if (!lcb || fc + lcb > this.tbl.length || lcb > 1 << 26) return null;
    return this.tbl.subarray(fc, fc + lcb);
  }

  decode1(b: number): string { return this.cp === 1252 ? winChar(b) : decodeCodepage(new Uint8Array([b]), this.cp); }

  /** Word 6 and older store text in the code page of the fonts' character set (DBCS for East Asian). */
  pickCodepage(): void {
    if (this.ver === 8) return;
    const CS: Record<number, number> = { 128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250 };
    const counts = new Map<number, number>();
    for (const cs of this.fontCharset) if (CS[cs]) counts.set(CS[cs], (counts.get(CS[cs]) || 0) + 1);
    const cands = [932, 936, 949, 950].filter((c) => counts.has(c));
    if (cands.length && (le.u16(this.wd, 0) !== 0xa5dc || this.cp === 1252)) {
      // Several East Asian font sets: keep the code page that decodes the text with the fewest errors.
      const fcMin = le.u32(this.wd, 0x18), sample = this.wd.subarray(fcMin, Math.min(this.wd.length, fcMin + Math.min(this.ccp.text || 4096, 8192)));
      let best = cands[0], bestBad = Infinity;
      for (const c of cands.length > 1 ? cands : []) {
        this.cp = c;
        const t = this.decodeBytes(sample);
        const bad = (t.match(/\ufffd/g) || []).length * 4 + (t.match(/[\u0080-\u00ff]/g) || []).length;
        if (bad < bestBad) { bestBad = bad; best = c; }
      }
      this.cp = best;
    }
    else if (this.cp === 1252 && counts.size === 1) this.cp = [...counts.keys()][0];
  }

  /** Decode single-byte or DBCS text so that every byte keeps one character position. */
  decodeBytes(bytes: Uint8Array): string {
    if (this.cp === 1252) return Array.from(bytes, winChar).join('');
    if (![932, 936, 949, 950].includes(this.cp)) return decodeCodepage(bytes, this.cp);
    // East Asian Word 6 stores a double-byte character as a little-endian word (trail byte first);
    // choose the parse (swapped or not) with the fewest stray high bytes, by dynamic programming.
    const cp = this.cp;
    const lead = (x: number) => (cp === 932 ? (x >= 0x81 && x <= 0x9f) || (x >= 0xe0 && x <= 0xfc) : x >= 0x81 && x <= 0xfe);
    const trail = (x: number) => (cp === 932 ? x >= 0x40 && x <= 0xfc && x !== 0x7f : cp === 949 ? x >= 0x41 && x <= 0xfe : x >= 0x40 && x <= 0xfe);
    const single = (x: number) => (x < 0x80 || (cp === 932 && x >= 0xa1 && x <= 0xdf) ? 0 : 1);
    const n = bytes.length;
    const parse = (swapped: boolean) => {
      const cost = new Float64Array(n + 2).fill(0);
      const pick = new Uint8Array(n);
      for (let i = n - 1; i >= 0; i--) {
        let best = single(bytes[i]) + cost[i + 1], ch = 1;
        if (i + 1 < n) {
          const l = swapped ? bytes[i + 1] : bytes[i], t = swapped ? bytes[i] : bytes[i + 1];
          if (lead(l) && trail(t) && cost[i + 2] < best) { best = cost[i + 2]; ch = 2; }
        }
        cost[i] = best; pick[i] = ch;
      }
      return { cost: cost[0], pick };
    };
    const a = parse(true), b = parse(false);
    const use = a.cost <= b.cost ? a : b, swapped = use === a;
    let out = '';
    for (let i = 0; i < n; ) {
      if (use.pick[i] === 2) {
        const pair = swapped ? new Uint8Array([bytes[i + 1], bytes[i]]) : bytes.subarray(i, i + 2);
        out += decodeCodepage(pair, cp) + '\uffff';
        i += 2;
      } else { const x = bytes[i]; out += x < 0x80 ? String.fromCharCode(x) : decodeCodepage(bytes.subarray(i, i + 1), cp); i++; }
    }
    return out;
  }

  readPieces(): void {
    const wd = this.wd;
    this.pickCodepage();
    const total = this.ccp.text + this.ccp.ftn + this.ccp.hdd + this.ccp.mcr + this.ccp.atn + this.ccp.edn + this.ccp.txbx + this.ccp.hdrTxbx + 1;
    const clx = this.ver !== 2 ? this.part(33) : null;
    const complex = this.ver === 8 || !!(le.u16(wd, 0x0a) & 0x0004);
    if (clx && complex) {
      let q = 0;
      while (q < clx.length && clx[q] === 1) q += 3 + le.u16(clx, q + 1);
      if (clx[q] === 2) {
        const lcb = le.u32(clx, q + 1);
        const plc = clx.subarray(q + 5, q + 5 + lcb);
        const n = Math.floor((plc.length - 4) / 12);
        for (let k = 0; k < n; k++) {
          const cp = le.u32(plc, k * 4), cpEnd = le.u32(plc, k * 4 + 4);
          let fc = le.u32(plc, (n + 1) * 4 + k * 8 + 2);
          let ansi = this.ver !== 8;
          if (this.ver === 8) { ansi = !!(fc & 0x40000000); fc = ansi ? (fc & 0x3fffffff) >>> 1 : fc & 0x3fffffff; }
          if (cpEnd > cp && cpEnd - cp < 1 << 26) this.pieces.push({ cp, cpEnd, fc, ansi });
        }
      }
    }
    if (!this.pieces.length) {
      const fcMin = le.u32(wd, 0x18), fcMac = le.u32(wd, 0x1c);
      const len = Math.min(total, Math.max(0, Math.min(fcMac, wd.length) - fcMin));
      this.pieces.push({ cp: 0, cpEnd: len, fc: fcMin, ansi: true });
    }
    const parts: string[] = [];
    let budget = wd.length;
    for (const pc of this.pieces) {
      const n = Math.min(pc.cpEnd - pc.cp, budget);
      let s = '';
      if (pc.ansi) {
        const bytes = wd.subarray(pc.fc, Math.min(wd.length, pc.fc + n));
        s = this.decodeBytes(bytes);
      } else {
        const end = Math.min(wd.length - 1, pc.fc + n * 2);
        const codes: number[] = [];
        for (let i = pc.fc; i < end; i += 2) codes.push(wd[i] | (wd[i + 1] << 8));
        for (let i = 0; i < codes.length; i += 8192) s += String.fromCharCode(...codes.slice(i, i + 8192));
      }
      s = s.padEnd(pc.cpEnd - pc.cp, ' ').slice(0, pc.cpEnd - pc.cp);
      parts.push(s);
      budget -= s.length;
      if (budget <= 0) break;
    }
    this.text = parts.join('');
  }

  /** File position of a character position. */
  fcOf(cp: number): number {
    for (const p of this.pieces) if (cp >= p.cp && cp < p.cpEnd) return p.fc + (cp - p.cp) * (p.ansi ? 1 : 2);
    const last = this.pieces[this.pieces.length - 1];
    return last ? last.fc + (cp - last.cp) * (last.ansi ? 1 : 2) : cp;
  }

  readFkps(): void {
    const wd = this.wd;
    const pnSize = this.ver === 8 ? 4 : 2;
    const readBte = (i: number): number[] => {
      const plc = this.part(i);
      if (!plc) return [];
      const n = Math.floor((plc.length - 4) / (4 + pnSize));
      const pns: number[] = [];
      for (let k = 0; k < n; k++) pns.push(pnSize === 4 ? le.u32(plc, (n + 1) * 4 + k * 4) & 0x3fffff : le.u16(plc, (n + 1) * 4 + k * 2));
      return pns;
    };
    const chpPns = readBte(12), papPns = readBte(13);
    // Word 6/2 files that are not complex may list fewer bin-table pages than exist: the rest follow on.
    if (this.ver !== 8) {
      const cpnChp = le.u16(wd, this.ver === 6 ? 0x18e : 0), cpnPap = le.u16(wd, this.ver === 6 ? 0x190 : 0);
      while (this.ver === 6 && chpPns.length && chpPns.length < cpnChp && chpPns.length < 4096) chpPns.push(chpPns[chpPns.length - 1] + 1);
      while (this.ver === 6 && papPns.length && papPns.length < cpnPap && papPns.length < 4096) papPns.push(papPns[papPns.length - 1] + 1);
    }
    const page = (pn: number) => (pn * 512 + 512 <= wd.length ? wd.subarray(pn * 512, pn * 512 + 512) : null);
    for (const pn of chpPns) {
      const fkp = page(pn);
      if (!fkp) continue;
      const crun = fkp[511];
      if (!crun || crun > 101) continue;
      for (let k = 0; k < crun; k++) {
        const fc = le.u32(fkp, k * 4), fcEnd = le.u32(fkp, k * 4 + 4);
        const off = fkp[(crun + 1) * 4 + k] * 2;
        let sprms: Sprm[] = [];
        if (off && off < 511) {
          const cb = fkp[off];
          const g = fkp.subarray(off + 1, Math.min(511, off + 1 + cb));
          sprms = this.ver === 2 ? chp2Sprms(g) : parseGrpprl(g, this.ver === 6);
        }
        this.chpRuns.push({ fc, fcEnd, props: sprms });
      }
    }
    const bx = this.ver === 8 ? 13 : 7;
    for (const pn of papPns) {
      const fkp = page(pn);
      if (!fkp) continue;
      const crun = fkp[511];
      if (!crun || crun > 101) continue;
      for (let k = 0; k < crun; k++) {
        const fc = le.u32(fkp, k * 4), fcEnd = le.u32(fkp, k * 4 + 4);
        const off = fkp[(crun + 1) * 4 + k * (this.ver === 2 ? 7 : bx)] * 2;
        let istd = 0, sprms: Sprm[] = [];
        if (off && off < 511) {
          let cb = fkp[off], start = off + 1, len: number;
          if (this.ver === 8) { if (cb === 0) { cb = fkp[off + 1]; start = off + 2; len = cb * 2; } else len = cb * 2 - 1; }
          else if (this.ver === 6) len = cb * 2;
          else len = cb * 2;
          const g = fkp.subarray(start, Math.min(511, start + len));
          if (this.ver === 2) { istd = g[0]; sprms = parseGrpprl(g.subarray(7), true); }
          else { istd = le.u16(g, 0); sprms = parseGrpprl(g.subarray(2), this.ver === 6); }
        }
        this.papRuns.push({ fc, fcEnd, props: { istd, sprms } });
      }
    }
    this.chpRuns.sort((a, b) => a.fc - b.fc);
    this.papRuns.sort((a, b) => a.fc - b.fc);
  }

  readFonts(): void {
    const t = this.part(15);
    // Word for Windows 1/2 numbers its first fonts implicitly: Tms Rmn, Symbol, Helv.
    if (this.ver === 2) this.fonts.push('Times New Roman', 'Symbol', 'Arial');
    if (!t) return;
    if (this.ver === 2) this.fonts.length = 0;
    if (this.ver === 8) {
      const n = le.u16(t, 0);
      let p = le.u16(t, 0) === 0xffff ? 6 : 4;
      for (let k = 0; k < Math.min(n, 2000) && p < t.length; k++) {
        const cb = t[p] + 1;
        let name = '';
        for (let i = p + 40; i + 1 < p + cb; i += 2) { const c = le.u16(t, i); if (!c) break; name += String.fromCharCode(c); }
        this.fonts.push(name);
        p += cb;
      }
    } else {
      let p = 2;
      while (p < t.length && this.fonts.length < 2000) {
        const cb = t[p] + 1;
        if (cb < 2) break;
        let name = '';
        for (let i = p + 6; i < p + cb && t[i]; i++) name += winChar(t[i]);
        this.fonts.push(name);
        this.fontCharset.push(t[p + 4]);
        p += cb;
      }
    }
  }

  readStyles(): void {
    const s = this.part(1);
    if (!s || this.ver === 2) return;
    const cbStshi = le.u16(s, 0);
    const stshi = s.subarray(2, 2 + cbStshi);
    const cstd = le.u16(stshi, 0), cbBase = le.u16(stshi, 2) || (this.ver === 8 ? 10 : 8);
    let p = 2 + cbStshi;
    for (let i = 0; i < Math.min(cstd, 4000) && p + 2 <= s.length; i++) {
      const cb = le.u16(s, p);
      const std = s.subarray(p + 2, p + 2 + cb);
      p += 2 + cb;
      if (!cb) { this.styles.push({ name: '', sgc: 0, base: 0xfff, chp: [], pap: [] }); continue; }
      const sgc = le.u16(std, 2) & 0xf, base = le.u16(std, 2) >> 4, cupx = le.u16(std, 4) & 0xf;
      let q = cbBase, name = '';
      if (this.ver === 8) {
        const n = le.u16(std, q); q += 2;
        for (let k = 0; k < n; k++) name += String.fromCharCode(le.u16(std, q + k * 2));
        q += n * 2 + 2;
      } else {
        const n = std[q]; q += 1;
        for (let k = 0; k < n; k++) name += winChar(std[q + k]);
        q += n + 1;
      }
      const upx: Uint8Array[] = [];
      for (let k = 0; k < cupx && q + 2 <= std.length; k++) {
        if (q % 2) q++;
        const len = le.u16(std, q);
        upx.push(std.subarray(q + 2, q + 2 + len));
        q += 2 + len;
      }
      let chp: Sprm[] = [], pap: Sprm[] = [];
      if (sgc === 1) { pap = upx[0] ? parseGrpprl(upx[0].subarray(2), this.ver === 6) : []; chp = upx[1] ? parseGrpprl(upx[1], this.ver === 6) : []; }
      else if (sgc === 2) chp = upx[0] ? parseGrpprl(upx[0], this.ver === 6) : [];
      this.styles.push({ name: name.replace(/,.*$/, ''), sgc, base, chp, pap });
    }
  }

  styleCharProps(istd: number, depth = 0): Chp {
    const cached = this.styleChp.get(istd);
    if (cached) return cached;
    const st = this.styles[istd];
    const out: Chp = { size: 10 };
    if (st && depth < 12) {
      const base = st.base !== 0xfff && st.base !== istd ? this.styleCharProps(st.base, depth + 1) : { size: 10 };
      Object.assign(out, base);
      applyChp(out, st.chp, base, this.fonts);
    }
    if (out.size == null) out.size = 10;
    this.styleChp.set(istd, out);
    return out;
  }

  styleParaProps(istd: number, depth = 0): Pap {
    const cached = this.stylePap.get(istd);
    if (cached) return cached;
    const st = this.styles[istd];
    const out: Pap = {};
    if (st && depth < 12) {
      if (st.base !== 0xfff && st.base !== istd) Object.assign(out, this.styleParaProps(st.base, depth + 1));
      applyPap(out, st.pap, this.w97);
    }
    this.stylePap.set(istd, out);
    return out;
  }

  /** Register paragraph styles in the document settings so the editor shows them as Word did. */
  exportStyles(used: Set<number>): void {
    const styles = { ...this.b.settings.styles };
    for (const istd of used) {
      const st = this.styles[istd];
      if (!st || st.sgc !== 1 || !st.name) continue;
      const name = this.styleName(istd);
      const c = this.styleCharProps(istd), p = this.styleParaProps(istd);
      const base = st.base !== 0xfff && this.styles[st.base]?.name ? this.styleName(st.base) : undefined;
      styles[name] = {
        ...(styles[name] || {}), name, type: 'paragraph', basedOn: base && base !== name ? base : undefined,
        font: c.font || undefined, size: c.size || undefined, bold: c.bold || undefined, italic: c.italic || undefined, underline: c.underline ? true : undefined,
        color: c.color || undefined, caps: c.allcaps || undefined, smallCaps: c.smallcaps || undefined,
        align: p.align && p.align !== 'left' ? p.align : undefined, spaceBefore: p.spaceBefore ?? undefined, spaceAfter: p.spaceAfter ?? undefined,
        indentLeft: p.indentLeft ?? undefined, indentRight: p.indentRight ?? undefined, indentFirst: p.indentFirst ?? undefined,
        keepNext: p.keepNext || undefined, keepLines: p.keepLines || undefined, pageBreakBefore: p.pageBreakBefore || undefined,
        lineHeight: p.lineHeight || undefined,
      } as any;
    }
    this.b.settings.styles = styles;
  }

  styleName(istd: number): string {
    let n = this.styleNames.get(istd);
    if (n) return n;
    const raw = this.styles[istd]?.name || '';
    n = raw ? wordStyleName(raw) : 'Normal';
    if (istd === 0) n = 'Normal';
    this.styleNames.set(istd, n);
    return n;
  }

  readLists(): void {
    if (this.ver !== 8) return;
    const lstPart = this.part(73), lfo = this.part(74);
    // The LVL records follow the PlfLst directly (outside its byte count).
    const lst = lstPart ? this.tbl.subarray(this.fcLcb(73).fc) : null;
    if (lst) {
      const n = le.u16(lst, 0);
      let p = 2 + n * 28;
      for (let k = 0; k < Math.min(n, 2000); k++) {
        const o = 2 + k * 28;
        const lsid = le.u32(lst, o);
        const simple = lst[o + 26] & 1;
        const info = { nfc: [] as number[], start: [] as number[], bullets: [] as string[] };
        for (let lv = 0; lv < (simple ? 1 : 9) && p + 28 <= lst.length; lv++) {
          const start = le.u32(lst, p), nfc = lst[p + 4];
          const cbChpx = lst[p + 24], cbPapx = lst[p + 25];
          p += 28 + cbPapx + cbChpx;
          const cch = le.u16(lst, p);
          let txt = '';
          for (let c = 0; c < cch && c < 64; c++) txt += String.fromCharCode(le.u16(lst, p + 2 + c * 2));
          p += 2 + cch * 2;
          info.nfc.push(nfc); info.start.push(start); info.bullets.push(txt);
        }
        this.lists.set(lsid, info);
      }
    }
    if (lfo) {
      const n = le.u32(lfo, 0);
      for (let k = 0; k < Math.min(n, 4000); k++) this.lfo.push(le.u32(lfo, 4 + k * 16));
    }
  }

  /** Paragraph properties for the paragraph whose mark is at cp. */
  papAt(cp: number): Pap {
    const fc = this.fcOf(cp);
    const r = findRun(this.papRuns, fc);
    const istd = r ? r.props.istd : 0;
    const pap: Pap = { ...this.styleParaProps(istd), istd };
    if (r) applyPap(pap, r.props.sprms, this.w97);
    return pap;
  }

  chpAt(cp: number, istd: number): Chp {
    const fc = this.fcOf(cp);
    const r = findRun(this.chpRuns, fc);
    const key = `${istd}:${r ? r.fc : -1}`;
    let c = this.chpCache.get(key);
    if (!c) {
      const base = this.styleCharProps(istd);
      c = { ...base };
      if (r) {
        const cs = r.props.find((s) => s.op === 0x4a30);
        if (cs) { const cb = this.styleCharProps(le.u16(cs.arg, 0)); Object.assign(c, cb); }
        applyChp(c, r.props, base, this.fonts);
      }
      if (c.size === base.size) c.size = base.size;
      this.chpCache.set(key, c);
    }
    return c;
  }

  listFor(pap: Pap): { ordered: boolean; level: number; format?: string; start?: number } | null {
    if (pap.ilfo && pap.ilfo > 0 && pap.ilfo <= this.lfo.length) {
      const l = this.lists.get(this.lfo[pap.ilfo - 1]);
      const lv = Math.min(pap.ilvl || 0, 8);
      if (!l) return { ordered: false, level: lv };
      const nfc = l.nfc[lv] ?? l.nfc[0] ?? 23;
      const txt = l.bullets[lv] ?? '';
      if (nfc === 255 || !txt.replace(/[\x00-\x08\s]/g, '')) return null;
      if (nfc === 23) { const ch = l.bullets[lv] || '•'; return { ordered: false, level: lv, format: /[•]/.test(ch) || !ch.trim() ? 'disc' : /[o]/.test(ch) ? 'circle' : /[▪■]/.test(ch) ? 'square' : 'disc' }; }
      return { ordered: true, level: lv, format: NFC[nfc] || 'decimal', start: l.start[lv] || 1 };
    }
    if (pap.nLvlAnm && pap.anld) {
      const lvl = pap.nLvlAnm >= 1 && pap.nLvlAnm <= 9 ? pap.nLvlAnm - 1 : 0;
      if (pap.anld.nfc === 23 || pap.nLvlAnm === 11) return { ordered: false, level: lvl };
      return { ordered: true, level: lvl, format: NFC[pap.anld.nfc] || 'decimal', start: pap.anld.start };
    }
    return null;
  }

  /** Text of a sub-document range, as plain text with fields resolved. */
  plain(cp: number, cpEnd: number): string {
    return resolveFieldsPlain(this.text.slice(cp, cpEnd));
  }

  readNotes(refIdx: number, txtIdx: number, base: number): Map<number, string> {
    const out = new Map<number, string>();
    const ref = this.part(refIdx), txt = this.part(txtIdx);
    if (!ref || !txt) return out;
    const n = Math.floor((ref.length - 4) / 6);
    const tn = Math.floor(txt.length / 4) - 1;
    for (let k = 0; k < n && k < tn; k++) {
      const cpRef = le.u32(ref, k * 4);
      const a = le.u32(txt, k * 4), z = le.u32(txt, k * 4 + 4);
      const t = this.plain(base + a, base + z).replace(/^[\x02\s]+/, '').replace(/[\r\n]+$/, '').replace(/\r/g, '\n');
      out.set(cpRef, t);
    }
    return out;
  }

  readSections(): { cp: number; sep: Sep }[] {
    const plc = this.part(6);
    const out: { cp: number; sep: Sep }[] = [];
    if (!plc) return [{ cp: this.ccp.text, sep: {} }];
    const n = Math.floor((plc.length - 4) / (4 + 12));
    for (let k = 0; k < n; k++) {
      const cpEnd = le.u32(plc, (k + 1) * 4);
      const sed = (n + 1) * 4 + k * 12;
      const fcSepx = le.u32(plc, sed + 2);
      const sep: Sep = {};
      if (fcSepx !== 0xffffffff && fcSepx + 2 < this.wd.length) {
        const cb = this.ver === 2 ? this.wd[fcSepx] : le.u16(this.wd, fcSepx);
        const g = this.wd.subarray(fcSepx + (this.ver === 2 ? 1 : 2), fcSepx + (this.ver === 2 ? 1 : 2) + cb);
        applySep(sep, parseGrpprl(g, this.ver !== 8));
      }
      out.push({ cp: cpEnd, sep });
    }
    return out.length ? out : [{ cp: this.ccp.text, sep: {} }];
  }

  readHeaders(sections: { cp: number; sep: Sep }[]): void {
    const plc = this.part(11);
    if (!plc || !this.ccp.hdd) return;
    const base = this.ccp.text + this.ccp.ftn;
    const n = Math.floor(plc.length / 4) - 1;
    const story = (k: number) => (k >= 0 && k < n ? this.headerText(base + le.u32(plc, k * 4), base + le.u32(plc, k * 4 + 4)) : null);
    // Story order per section: even header, odd header, even footer, odd footer, first header, first footer.
    let idx: (number | null)[] = [];
    const sep = sections[0]?.sep || {};
    if (this.ver === 8) idx = [6, 7, 8, 9, 10, 11];
    else {
      const dop = this.part(31);
      let k = popcount(dop ? dop[1] : 0) & 0xff;
      const flags = sep.grpfIhdt ?? 0;
      for (let bit = 0; bit < 6; bit++) idx.push(flags & (1 << bit) ? k++ : null);
      if (!flags && n > 1) idx = [null, k, null, k + 1, null, null];
    }
    const get = (i: number) => (idx[i] == null ? null : story(idx[i]!));
    const put = (which: 'header' | 'footer', s: { text: string; align: 'left' | 'center' | 'right' } | null, opts: { first?: boolean; even?: boolean } = {}) => {
      if (s && s.text.trim()) this.b.running(which, s.text, { ...opts, align: s.text.includes('\t') ? undefined : s.align });
    };
    put('header', get(1)); put('footer', get(3));
    if (sep.titlePage) { put('header', get(4), { first: true }); put('footer', get(5), { first: true }); }
    const eh = get(0), ef = get(2);
    if ((eh && eh.text.trim() && eh.text !== get(1)?.text) || (ef && ef.text.trim() && ef.text !== get(3)?.text)) { put('header', eh, { even: true }); put('footer', ef, { even: true }); }
  }

  headerText(cp: number, cpEnd: number): { text: string; align: 'left' | 'center' | 'right' } {
    if (cpEnd <= cp) return { text: '', align: 'left' };
    const raw = this.text.slice(cp, cpEnd);
    const text = resolveFieldsPlain(raw, true).replace(/\r+$/, '').replace(/\r/g, ' ');
    const pap = this.papAt(cp + Math.max(0, raw.indexOf('\r')));
    return { text, align: pap.align === 'center' ? 'center' : pap.align === 'right' ? 'right' : 'left' };
  }

  blips: Uint8Array[] = [];
  spidPib = new Map<number, number>();
  spaAt = new Map<number, { spid: number; w: number; h: number }>();

  /** OfficeArt: picture store (BLIPs) and shape → picture links from the drawing group. */
  readArt(): void {
    if (this.ver !== 8) return;
    const dgg = this.part(50);
    if (!dgg) return;
    const walk = (b: Uint8Array, from: number, to: number, depth: number, sp: { spid?: number; pib?: number }) => {
      let p = from;
      while (p + 8 <= to && depth < 12) {
        const verInst = le.u16(b, p), type = le.u16(b, p + 2), len = le.u32(b, p + 4);
        const start = p + 8, end = Math.min(to, start + len);
        if (end < start) break;
        if ((verInst & 0xf) === 0xf) {
          const inner: { spid?: number; pib?: number } = type === 0xf004 ? {} : sp;
          walk(b, start, end, depth + 1, inner);
          if (type === 0xf004 && inner.spid != null && inner.pib) this.spidPib.set(inner.spid, inner.pib);
        } else if (type === 0xf007) {
          // FBSE: the BLIP follows inline, or lives in the WordDocument stream at foDelay.
          const size = le.u32(b, start + 20), foDelay = le.u32(b, start + 28), cbName = b[start + 33];
          const inl = start + 36 + cbName;
          if (inl + 8 <= end) this.blips.push(b.subarray(inl, end));
          else if (foDelay + size <= this.wd.length && size) this.blips.push(this.wd.subarray(foDelay, foDelay + size));
          else this.blips.push(new Uint8Array(0));
        } else if (type === 0xf00a) sp.spid = le.u32(b, start);
        else if (type === 0xf00b || type === 0xf121 || type === 0xf122) {
          const n = verInst >> 4;
          for (let k = 0; k < n && start + k * 6 + 6 <= end; k++) {
            const id = le.u16(b, start + k * 6) & 0x3fff;
            if (id === 0x104) sp.pib = le.u32(b, start + k * 6 + 2);
          }
        }
        p = start + len;
      }
    };
    try {
      // OfficeArtContent: the drawing group container, then per drawing a one-byte label and its container.
      let p = 0;
      while (p + 8 <= dgg.length) {
        if ((le.u16(dgg, p) & 0xf) !== 0xf || (le.u16(dgg, p + 2) !== 0xf000 && le.u16(dgg, p + 2) !== 0xf002)) { p++; continue; }
        const len = le.u32(dgg, p + 4);
        walk(dgg, p, Math.min(dgg.length, p + 8 + len), 0, {});
        p += 8 + len;
      }
    } catch { /* ignore drawing damage */ }
    const spa = this.part(40);
    if (spa) {
      const n = Math.floor((spa.length - 4) / 30);
      for (let k = 0; k < n; k++) {
        const o = (n + 1) * 4 + k * 26;
        const w = tw(le.i32(spa, o + 12) - le.i32(spa, o + 4)), h = tw(le.i32(spa, o + 16) - le.i32(spa, o + 8));
        this.spaAt.set(le.u32(spa, k * 4), { spid: le.u32(spa, o), w, h });
      }
    }
  }

  /** The picture id (pib) of the first shape in OfficeArt records. */
  shapePib(b: Uint8Array): number {
    let found = 0;
    const walk = (from: number, to: number, depth: number) => {
      let p = from;
      while (!found && p + 8 <= to && depth < 12) {
        const verInst = le.u16(b, p), type = le.u16(b, p + 2), len = le.u32(b, p + 4);
        const start = p + 8;
        if ((verInst & 0xf) === 0xf) walk(start, Math.min(to, start + len), depth + 1);
        else if (type === 0xf00b || type === 0xf121 || type === 0xf122) {
          for (let k = 0; k < verInst >> 4 && start + k * 6 + 6 <= to; k++) if ((le.u16(b, start + k * 6) & 0x3fff) === 0x104) { found = le.u32(b, start + k * 6 + 2); break; }
        }
        p = start + len;
      }
    };
    walk(0, b.length, 0);
    return found;
  }

  blipImage(pib: number): string | null {
    const b = this.blips[pib - 1];
    return b && b.length ? findImage(b, 0) : null;
  }

  floating(cp: number): boolean {
    const a = this.spaAt.get(cp);
    if (!a) return false;
    const pib = this.spidPib.get(a.spid);
    const img = pib ? this.blipImage(pib) : null;
    if (img) this.b.image(img, { width: a.w > 0 && a.w < 2000 ? a.w : null, height: a.h > 0 && a.h < 2000 ? a.h : null });
    return !!img;
  }

  picture(chp: Chp): void {
    const fc = chp.picLoc;
    const src = this.ver === 8 ? this.data : this.wd;
    if (fc == null || !src || fc + 68 > src.length) return;
    const lcb = le.u32(src, fc), cbHeader = le.u16(src, fc + 4);
    if (lcb < cbHeader || fc + lcb > src.length + 16 || cbHeader < 0x3a) return;
    const mm = le.u16(src, fc + 6);
    const dxaGoal = le.i16(src, fc + 0x1c), dyaGoal = le.i16(src, fc + 0x1e), mx = le.u16(src, fc + 0x20), my = le.u16(src, fc + 0x22);
    const body = src.subarray(fc + cbHeader, Math.min(src.length, fc + lcb));
    let img: string | null = null;
    if (this.ver === 8 && mm === 0x64) {
      // Inline OfficeArt shape: its pib property names a picture in the store.
      const pib = this.shapePib(body);
      if (pib) img = this.blipImage(pib);
    }
    if (!img) img = findImage(body, mm);
    if (!img) return;
    const w = dxaGoal > 0 ? tw(dxaGoal) * (mx || 1000) / 1000 : null, h = dyaGoal > 0 ? tw(dyaGoal) * (my || 1000) / 1000 : null;
    this.b.image(img, { width: w && w < 2000 ? w : null, height: h && h < 2000 ? h : null });
  }

  build(): PMNode {
    const b = this.b;
    this.readFonts();
    this.readPieces();
    this.readStyles();
    this.readLists();
    try { this.readArt(); } catch { /* no pictures */ }
    try { this.readFkps(); } catch { /* text only */ }
    const sections = this.readSections();
    const s0 = sections[0].sep;
    b.page({
      width: s0.xaPage ? tw(s0.xaPage) : 612, height: s0.yaPage ? tw(s0.yaPage) : 792,
      left: tw(s0.dxaLeft ?? 1800), right: tw(s0.dxaRight ?? 1800), top: tw(s0.dyaTop ?? 1440), bottom: tw(s0.dyaBottom ?? 1440),
      headerDist: s0.dyaHdrTop != null ? tw(s0.dyaHdrTop) : undefined, footerDist: s0.dyaHdrBottom != null ? tw(s0.dyaHdrBottom) : undefined,
      landscape: s0.landscape,
    });
    if (s0.pgnStart && s0.restartPgn) b.settings.pageNumber.start = s0.pgnStart;
    try { this.readHeaders(sections); } catch { /* no running heads */ }
    const fns = this.readNotes(2, 3, this.ccp.text);
    const ens = this.ver === 8 ? this.readNotes(46, 47, this.ccp.text + this.ccp.ftn + this.ccp.hdd + this.ccp.mcr + this.ccp.atn) : new Map<number, string>();

    const used = new Set<number>([0]);
    const T = this.text;
    const end = Math.min(this.ccp.text || T.length, T.length);
    let secIdx = 0;
    let paraStart = 0;
    // Fields: stack of { inResult, code, link }
    const fields: { result: boolean; code: string }[] = [];
    let row: Pap[] = [];
    let lastFloat = -2;
    let inTable = false;
    let cellOpen = false;
    const openCell = (pap: Pap) => {
      if (!inTable) { b.startTable({ align: pap.tableJc && pap.tableJc !== 'left' ? pap.tableJc : null }); inTable = true; b.startRow(); }
      if (!cellOpen) { b.startCell(); cellOpen = true; }
    };
    for (let cp = 0; cp < end; cp++) {
      const ch = T[cp];
      const code = T.charCodeAt(cp);
      if (cp === paraStart) {
        // Paragraph start: look ahead to its mark for table membership.
        let m = cp;
        while (m < end && T[m] !== '\r' && T[m] !== '\x07') m++;
        const pap = this.papAt(Math.min(m, end - 1));
        if (pap.inTable && !(T[m] === '\x07' && pap.ttp)) openCell(pap);
        else if (inTable && !pap.inTable) { b.endTable(); inTable = false; cellOpen = false; row = []; }
      }
      // Fields
      if (code === 0x13) { fields.push({ result: false, code: '' }); continue; }
      if (code === 0x14) { const f = fields[fields.length - 1]; if (f) f.result = true; continue; }
      if (code === 0x15) {
        const f = fields.pop();
        if (f && !f.result) this.fieldWithoutResult(f.code);
        continue;
      }
      const inCode = fields.some((f) => !f.result);
      if (inCode) { fields[fields.length - 1].code += ch; continue; }
      if (ch === '\r' || ch === '\x07') {
        const pap = this.papAt(cp);
        used.add(pap.istd || 0);
        if (ch === '\x07' && pap.ttp) {
          // Row end: apply widths from the row's table definition.
          if (cellOpen) { b.endCell(); cellOpen = false; }
          const xs = pap.cellX;
          if (xs && xs.length > 1) b.rowWidths(xs.slice(1).map((x, i) => tw(x - xs[i])), pap.cellShd || []);
          if (pap.header) b.rowHeader();
          b.endRow();
          row = [];
          paraStart = cp + 1;
          continue;
        }
        const list = this.listFor(pap);
        const style = this.styleName(pap.istd || 0);
        b.endParagraph({ ...pap, style, list, tabs: pap.tabs });
        if (ch === '\x07' && pap.inTable) { if (cellOpen) { b.endCell(); cellOpen = false; } row.push(pap); }
        paraStart = cp + 1;
        // Section end
        if (secIdx < sections.length - 1 && cp + 1 >= sections[secIdx].cp) {
          const bkc = sections[secIdx + 1].sep.bkc ?? 2;
          if (!inTable) b.sectionBreak((['continuous', 'nextPage', 'nextPage', 'evenPage', 'oddPage'] as const)[bkc] || 'nextPage');
          secIdx++;
        }
        continue;
      }
      if (code === 0x0c) {
        // Page break, or section break when it ends a section.
        if (secIdx < sections.length - 1 && cp + 1 >= sections[secIdx].cp) {
          const pap = this.papAt(cp);
          b.flush({ ...pap, style: this.styleName(pap.istd || 0) });
          const bkc = sections[secIdx + 1].sep.bkc ?? 2;
          b.sectionBreak((['continuous', 'nextPage', 'nextPage', 'evenPage', 'oddPage'] as const)[bkc] || 'nextPage');
          secIdx++;
          paraStart = cp + 1;
        } else if (!inTable) {
          const pap = this.papAt(cp);
          b.flush({ ...pap, style: this.styleName(pap.istd || 0) });
          b.pageBreak();
          paraStart = cp + 1;
        }
        continue;
      }
      const istd = this.paraIstdAt(cp);
      const chp = this.chpAt(cp, istd);
      if (chp.vanish || chp.del || chp.fldVanish) continue;
      if (code === 0x0b) { b.lineBreak(); continue; }
      if (code === 0x0e) { b.columnBreak(); continue; }
      if (code === 0x1e) { b.text('‑', chp); continue; }
      if (code === 0x1f) { b.text('­', chp); continue; }
      if (code === 0x02 && chp.spec) {
        const t = fns.get(cp) ?? ens.get(cp);
        if (t != null) b.footnote(t, fns.has(cp) ? 'foot' : 'end');
        continue;
      }
      if ((code === 0x01 || code === 0x08) && chp.spec) {
        if (code === 0x08) { if (this.floating(cp)) lastFloat = cp; }
        else if (!chp.ole && lastFloat !== cp - 1) this.picture(chp);
        continue;
      }
      if (code === 0x28 && chp.spec && chp.symbol) { b.text(symbolChar(chp.symbol.ch, this.fonts[chp.symbol.ftc] || ''), { ...chp, font: /symbol|wingdings/i.test(this.fonts[chp.symbol.ftc] || '') ? null : chp.font }); continue; }
      if ((code < 0x20 && code !== 0x09) || code === 0x05) continue;
      const link = fields.length ? fieldLink(fields[fields.length - 1].code) : null;
      // Gather a run of characters with the same properties.
      let j = cp + 1;
      while (j < end && j - cp < 4096) {
        const c2 = T.charCodeAt(j);
        if (c2 < 0x20 && c2 !== 0x09) break;
        if (this.paraIstdAt(j) !== istd || this.chpAt(j, istd) !== chp) break;
        j++;
      }
      let run = T.slice(cp, j);
      if (chp.font && /symbol|wingdings|webdings/i.test(chp.font)) run = Array.from(run, (c) => symbolChar(c.charCodeAt(0), chp.font!)).join('');
      b.text(run, link ? { ...chp, link } : chp);
      cp = j - 1;
    }
    if (inTable) b.endTable();
    this.exportStyles(used);
    return b.build();
  }

  private istdCache: { fc: number; fcEnd: number; istd: number } | null = null;
  /** Style of the paragraph containing cp (from the PAPX run covering it). */
  paraIstdAt(cp: number): number {
    const fc = this.fcOf(cp);
    const c = this.istdCache;
    if (c && fc >= c.fc && fc < c.fcEnd) return c.istd;
    const r = findRun(this.papRuns, fc);
    const istd = r ? r.props.istd : 0;
    this.istdCache = r ? { fc: r.fc, fcEnd: r.fcEnd, istd } : null;
    return istd;
  }

  fieldWithoutResult(code: string): void {
    const t = code.trim().split(/\s+/)[0]?.toUpperCase();
    if (t === 'PAGE' || t === 'NUMPAGES' || t === 'DATE' || t === 'TIME') this.b.field(t);
  }
}

function popcount(n: number): number { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }

function findRun<T>(runs: Run<T>[], fc: number): Run<T> | null {
  let lo = 0, hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = runs[mid];
    if (fc < r.fc) hi = mid - 1;
    else if (fc >= r.fcEnd) lo = mid + 1;
    else return r;
  }
  return null;
}

function fieldLink(code: string): string | null {
  const m = /^\s*HYPERLINK\s+(?:"([^"]+)"|(\S+))/i.exec(code);
  const url = m ? m[1] || m[2] : null;
  return url && /^(https?|mailto|ftp):/i.test(url) ? url : null;
}

/** Plain text of a range with field codes removed (results kept); PAGE fields become tokens. */
export function resolveFieldsPlain(raw: string, tokens = false): string {
  let out = '';
  const st: { result: boolean; code: string }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 0x13) { st.push({ result: false, code: '' }); continue; }
    if (c === 0x14) { if (st.length) st[st.length - 1].result = true; continue; }
    if (c === 0x15) {
      const f = st.pop();
      if (f && !f.result && tokens) { const t = f.code.trim().split(/\s+/)[0]?.toUpperCase(); if (t === 'PAGE' || t === 'NUMPAGES') out += `{${t}}`; }
      continue;
    }
    if (st.some((f) => !f.result)) { st[st.length - 1].code += raw[i]; continue; }
    if (tokens && st.length && /^\s*(PAGE|NUMPAGES)\b/i.test(st[st.length - 1].code)) { if (!/\{(PAGE|NUMPAGES)\}$/.test(out)) out += `{${st[st.length - 1].code.trim().split(/\s+/)[0].toUpperCase()}}`; continue; }
    if (c === 0x07) out += '\t';
    else if (c === 0x0b) out += '\n';
    else if (c === 0x0d) out += '\r';
    else if (c === 0x09) out += '\t';
    else if (c === 0x1e) out += '‑';
    else if (c >= 0x20) out += raw[i];
  }
  return out;
}

/** Symbol-font and Wingdings private-use characters to Unicode where a close match exists. */
function symbolChar(ch: number, font: string): string {
  const c = ch >= 0xf000 ? ch - 0xf000 : ch;
  if (/symbol/i.test(font)) {
    const greek = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ';
    const lower = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ';
    if (c >= 0x41 && c <= 0x5a) return greek[c - 0x41] || String.fromCharCode(c);
    if (c >= 0x61 && c <= 0x7a) return lower[c - 0x61] || String.fromCharCode(c);
    const m: Record<number, string> = { 0xb7: '•', 0xa8: '♣', 0xa9: '♦', 0xaa: '♥', 0xab: '♠', 0xae: '→', 0xac: '←', 0xad: '↑', 0xaf: '↓', 0xb0: '°', 0xb1: '±', 0xb4: '×', 0xb8: '÷', 0xb9: '≠', 0xba: '≡', 0xbb: '≈', 0xa3: '≤', 0xb3: '≥', 0xa5: '∞', 0xd6: '√', 0xe5: '∑', 0xf2: '∫', 0xd2: '®', 0xd3: '©', 0xd4: '™', 0xde: '⇒', 0x22: '∀', 0x24: '∃', 0x27: '∋', 0xce: '∈', 0xc7: '∩', 0xc8: '∪', 0xc6: '∅', 0xd1: '∇', 0xb6: '∂', 0xbc: '…' };
    return m[c] || String.fromCharCode(c);
  }
  if (/wingdings/i.test(font)) {
    const m: Record<number, string> = { 0xa7: '▪', 0xa8: '◻', 0x6c: '●', 0x6e: '■', 0x6f: '□', 0x71: '❑', 0x75: '◆', 0x76: '❖', 0xd8: '➢', 0xfc: '✓', 0xfb: '✗', 0xfe: '☑', 0x4a: '☺', 0x4c: '☹', 0x46: '☞', 0xe0: '➔', 0xe8: '➔', 0x9f: '•', 0x77: '⬥', 0x3f: '✍', 0x2a: '✉', 0x28: '☎' };
    return m[c] || '•';
  }
  return String.fromCharCode(ch);
}

/** A data: URL for the first PNG/JPEG/GIF image in picture data, or a DIB from a metafile. */
export function findImage(b: Uint8Array, mm = 0): string | null {
  const find = (sig: number[], from = 0) => {
    for (let i = from; i + sig.length <= b.length; i++) { let ok = true; for (let k = 0; k < sig.length; k++) if (b[i + k] !== sig[k]) { ok = false; break; } if (ok) return i; }
    return -1;
  };
  const png = find([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png >= 0) return 'data:image/png;base64,' + bytesToBase64(b.subarray(png));
  const jpg = find([0xff, 0xd8, 0xff]);
  if (jpg >= 0) return 'data:image/jpeg;base64,' + bytesToBase64(b.subarray(jpg));
  const gif = find([0x47, 0x49, 0x46, 0x38]);
  if (gif >= 0) return 'data:image/gif;base64,' + bytesToBase64(b.subarray(gif));
  // A Windows metafile carrying a device-independent bitmap (META_DIBSTRETCHBLT / META_STRETCHDIB / META_DIBBITBLT).
  for (let p = mm === 8 || mm === 0 ? 0 : 0; p + 6 < b.length; ) {
    const size = le.u32(b, p) * 2, fn = le.u16(b, p + 4);
    if (p === 0 && (le.u16(b, 0) === 1 || le.u16(b, 0) === 2) && le.u16(b, 2) === 9) { p = 18; continue; }
    if (size < 6 || p + size > b.length + 2) break;
    let dibAt = -1;
    if (fn === 0x0f43) dibAt = p + 6 + 22;
    else if (fn === 0x0b41) dibAt = p + 6 + (size - 6 > 22 ? 20 : 18);
    else if (fn === 0x0940) dibAt = p + 6 + 16;
    if (dibAt > 0 && le.u32(b, dibAt) === 40) {
      const dib = b.subarray(dibAt, p + size);
      return dibToBmp(dib);
    }
    if (fn === 0) break;
    p += size;
  }
  return null;
}

/** Wrap a DIB (BITMAPINFOHEADER + palette + bits) in a BMP file header. */
export function dibToBmp(dib: Uint8Array): string | null {
  if (dib.length < 40 || le.u32(dib, 0) !== 40) return null;
  const bits = le.u16(dib, 14), clr = le.u32(dib, 32), comp = le.u32(dib, 16);
  const palette = (clr || (bits <= 8 ? 1 << bits : 0)) * 4 + (comp === 3 ? 12 : 0);
  const out = new Uint8Array(14 + dib.length);
  out[0] = 0x42; out[1] = 0x4d;
  const dv = new DataView(out.buffer);
  dv.setUint32(2, out.length, true);
  dv.setUint32(10, 14 + 40 + palette, true);
  out.set(dib, 14);
  return 'data:image/bmp;base64,' + bytesToBase64(out);
}

/** Word 2 CHPX: a prefix of the CHP structure, turned into equivalent sprms. */
function chp2Sprms(g: Uint8Array): Sprm[] {
  const out: Sprm[] = [];
  const one = (op: number, v: number) => out.push({ op, arg: new Uint8Array([v]) });
  if (g.length >= 1) {
    const f = g[0];
    one(0x0835, f & 1); one(0x0836, (f >> 1) & 1); one(0x0837, (f >> 2) & 1); one(0x0838, (f >> 3) & 1);
    one(0x083a, (f >> 5) & 1); one(0x083b, (f >> 6) & 1); one(0x083c, (f >> 7) & 1);
  }
  if (g.length >= 2 && g[1] & 2) out.push({ op: 0x0855, arg: new Uint8Array([1]) });
  if (g.length >= 4) out.push({ op: 0x4a3d, arg: g.subarray(2, 4) });
  if (g.length >= 5 && g[4]) out.push({ op: 0x4a43, arg: new Uint8Array([g[4], 0]) });
  if (g.length >= 6 && g[5]) out.push({ op: 0x4845, arg: new Uint8Array([g[5]]) });
  if (g.length >= 9) { const kul = g[8] & 7, ico = g[8] >> 3; one(0x2a3e, kul); if (ico) one(0x2a42, ico); }
  return out;
}

function openWin(data: ArrayBuffer | Uint8Array, want: Ver): WinWordReader {
  const u8 = u8a(data);
  const cfb = openCfb(u8);
  if (cfb) {
    const wd = cfb.read('WordDocument');
    if (!wd || wd.length < 0x100) throw new Error('No WordDocument stream');
    const nFib = le.u16(wd, 2);
    const ver: Ver = nFib >= 0x6a ? 8 : 6;
    if (want !== 8 && ver === 8 && want === 6) { /* opened by content anyway */ }
    if (ver === 8 && le.u16(wd, 0x0a) & 0x0100) throw new Error('This document is password-protected (encrypted)');
    if (ver === 6 && le.u16(wd, 0x0a) & 0x0100) throw new Error('This document is password-protected (encrypted)');
    const flags = le.u16(wd, 0x0a);
    const tbl = ver === 8 ? cfb.read(flags & 0x0200 ? '1Table' : '0Table') || cfb.read('1Table') || cfb.read('0Table') : null;
    if (ver === 8 && !tbl) throw new Error('The table stream is missing');
    return new WinWordReader(wd, tbl, cfb.read('Data'), ver);
  }
  const id = le.u16(u8, 0);
  if (id === 0xa59b || id === 0xa5db || id === 0xa5dc) return new WinWordReader(u8, null, null, 2);
  throw new Error('Not a Word for Windows document');
}

export async function importWord6(data: ArrayBuffer, name: string): Promise<PMNode> {
  const r = openWin(data, 6);
  const doc = r.build();
  void name;
  return doc;
}

export async function importWord97(data: ArrayBuffer, name: string): Promise<PMNode> {
  const r = openWin(data, 8);
  void name;
  return r.build();
}

export async function importWord2(data: ArrayBuffer, name: string): Promise<PMNode> {
  const u8 = u8a(data);
  if (openCfb(u8)) return importWord6(data, name);
  const r = new WinWordReader(u8, null, null, 2);
  return r.build();
}

// ---------------------------------------------------------------------------------------
// Word for DOS and Windows Write: 128-byte pages, CHP and PAP stored as structure prefixes.

interface DosChp { bold: boolean; italic: boolean; underline: boolean; ftc: number; hps: number; pos: number; strike: boolean; dul: boolean; caps: boolean; smallcaps: boolean; hidden: boolean; special: boolean }
interface DosPap { jc: number; dxaRight: number; dxaLeft: number; dxaLeft1: number; dyaLine: number; dyaBefore: number; dyaAfter: number; rhc: number; graphics: boolean; tabs: TabStop[]; inTable: boolean; style: number }

export function readDosWrite(u8: Uint8Array): DocBuilder {
  const b = new DocBuilder();
  const isWrite = !(/[\x21-\x7e]/.test(String.fromCharCode(u8[0x1e])) || /^[A-Z0-9_]{2,8}\0/i.test(String.fromCharCode(...u8.subarray(0x62, 0x6c))));
  const fcMac = le.u32(u8, 0x0e);
  const pnPara = le.u16(u8, 0x12), pnFntb = le.u16(u8, 0x14), pnSep = le.u16(u8, 0x16), pnFfntb = le.u16(u8, 0x1c);
  const textEnd = Math.min(fcMac, u8.length);
  const pnChar = Math.floor((fcMac + 127) / 128);
  // Fonts (Write) — font table of FFNs: cbFfn, family, name.
  const fonts: string[] = [];
  if (isWrite && pnFfntb && pnFfntb * 128 < u8.length) {
    let p = pnFfntb * 128 + 2;
    for (let k = 0; k < 256 && p + 3 < u8.length; k++) {
      const cb = le.u16(u8, p);
      if (cb === 0) break;
      if (cb === 0xffff) { p = (Math.floor(p / 128) + 1) * 128; continue; }
      let name = '';
      for (let i = p + 3; i < p + 2 + cb && u8[i]; i++) name += winChar(u8[i]);
      fonts.push(name);
      p += 2 + cb;
    }
  }
  const dosFonts = ['Courier New', 'Courier New', 'Arial', 'Times New Roman'];
  // Character runs
  const chps: { fc: number; fcEnd: number; chp: DosChp }[] = [];
  for (let pn = pnChar; pn < pnPara && pn * 128 + 128 <= u8.length; pn++) {
    const page = u8.subarray(pn * 128, pn * 128 + 128);
    const n = page[127];
    for (let k = 0; k < n && 4 + k * 6 + 6 <= 127; k++) {
      const fcEnd = le.u32(page, 4 + k * 6);
      const bf = le.u16(page, 8 + k * 6);
      const fc = k ? le.u32(page, 4 + (k - 1) * 6) : le.u32(page, 0);
      const chp: DosChp = { bold: false, italic: false, underline: false, ftc: 0, hps: 24, pos: 0, strike: false, dul: false, caps: false, smallcaps: false, hidden: false, special: false };
      if (bf !== 0xffff && 4 + bf < 127) {
        const cch = page[4 + bf];
        const p = page.subarray(5 + bf, 5 + bf + cch);
        if (cch >= 2) { chp.bold = !!(p[1] & 1); chp.italic = !!(p[1] & 2); chp.ftc = p[1] >> 2; }
        if (cch >= 3) chp.hps = p[2] || 24;
        if (cch >= 4) {
          chp.underline = !!(p[3] & 1);
          if (isWrite) chp.special = !!(p[3] & 0x40);
          else { chp.strike = !!(p[3] & 2); chp.dul = !!(p[3] & 4); chp.caps = !!(p[3] & 0x30) && (p[3] & 0x30) === 0x20; chp.smallcaps = (p[3] & 0x30) === 0x10; chp.hidden = !!(p[3] & 0x80); chp.special = !!(p[3] & 0x40); }
        }
        if (cch >= 5) chp.ftc |= (p[4] & 7) << 6;
        if (cch >= 6) chp.pos = p[5];
      }
      chps.push({ fc, fcEnd, chp });
    }
  }
  // Paragraph runs
  const paps: { fc: number; fcEnd: number; pap: DosPap }[] = [];
  const lastPara = (pnFntb || pnSep || pnFfntb || Math.ceil(u8.length / 128));
  for (let pn = pnPara; pn < lastPara && pn * 128 + 128 <= u8.length; pn++) {
    const page = u8.subarray(pn * 128, pn * 128 + 128);
    const n = page[127];
    for (let k = 0; k < n && 4 + k * 6 + 6 <= 127; k++) {
      const fcEnd = le.u32(page, 4 + k * 6);
      const bf = le.u16(page, 8 + k * 6);
      const fc = k ? le.u32(page, 4 + (k - 1) * 6) : le.u32(page, 0);
      const pap: DosPap = { jc: 0, dxaRight: 0, dxaLeft: 0, dxaLeft1: 0, dyaLine: 240, dyaBefore: 0, dyaAfter: 0, rhc: 0, graphics: false, tabs: [], inTable: false, style: 0 };
      if (bf !== 0xffff && 4 + bf < 127) {
        const cch = page[4 + bf];
        const p = page.subarray(5 + bf, 5 + bf + cch);
        if (cch >= 1 && !isWrite) pap.style = p[0];
        if (cch >= 2) pap.jc = p[1] & 3;
        if (cch >= 6) pap.dxaRight = le.i16(p, 4);
        if (cch >= 8) pap.dxaLeft = le.i16(p, 6);
        if (cch >= 10) pap.dxaLeft1 = le.i16(p, 8);
        if (cch >= 12) pap.dyaLine = le.u16(p, 10) || 240;
        if (cch >= 16 && !isWrite) { pap.dyaBefore = le.u16(p, 12); pap.dyaAfter = le.u16(p, 14); }
        if (cch >= 17) { pap.rhc = p[16] & 0x0f; pap.graphics = !!(p[16] & 0x10); }
        for (let t = 0; t < 14 && 22 + t * 4 + 2 <= cch; t++) {
          const pos = le.u16(p, 22 + t * 4);
          if (!pos) break;
          const jc = p[24 + t * 4] & 3;
          pap.tabs.push({ pos: tw(pos), align: jc === 3 ? 'decimal' : jc === 1 ? 'center' : jc === 2 ? 'right' : 'left' });
        }
      }
      paps.push({ fc, fcEnd, pap });
    }
  }
  // Section (page setup)
  if (pnSep && pnSep * 128 + 32 < u8.length && pnSep !== pnFfntb) {
    const p = u8.subarray(pnSep * 128);
    const cch = p[0];
    if (cch >= 22) {
      const ya = le.u16(p, 3), xa = le.u16(p, 5), top = le.u16(p, 9), dyaText = le.u16(p, 11), left = le.u16(p, 13), dxaText = le.u16(p, 15);
      if (xa > 1000 && ya > 1000) b.page({ width: tw(xa), height: tw(ya), top: tw(top), left: tw(left), right: tw(Math.max(0, xa - left - dxaText)), bottom: tw(Math.max(0, ya - top - dyaText)) });
    }
  } else b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 90, right: 90 });
  const fontOf = (ftc: number) => (isWrite ? fonts[ftc] || null : dosFonts[ftc & 3] || null);
  const chpAt = (fc: number) => { for (const c of chps) if (fc >= c.fc && fc < c.fcEnd) return c.chp; return null; };
  const papFor = (fc: number) => { for (const p of paps) if (fc >= p.fc && fc < p.fcEnd) return p.pap; return null; };
  const decode = (from: number, to: number) => (isWrite ? Array.from(u8.subarray(from, to), winChar).join('') : decodeDos(u8.subarray(from, to), 'cp850'));
  let fc = 128;
  while (fc < textEnd) {
    // One paragraph: up to and including the next CR LF / LF.
    let end = fc;
    while (end < textEnd && u8[end] !== 0x0a) end++;
    const pap = papFor(Math.min(end, textEnd - 1));
    if (pap && pap.graphics) {
      const img = writePicture(u8.subarray(fc, end + 1));
      if (img) b.image(img.src, { width: img.w, height: img.h });
      b.endParagraph({ align: (['left', 'center', 'right', 'justify'] as const)[pap.jc] });
      fc = end + 1;
      continue;
    }
    if (pap && pap.rhc & 0x06) {
      // Running head: bit 0 = footer, bit 3 (Write) shows on the first page.
      const t = decode(fc, end).replace(/\x01/g, '{PAGE}').replace(/[\r\n]/g, '');
      b.running(pap.rhc & 1 ? 'footer' : 'header', t, { align: pap.jc === 1 ? 'center' : pap.jc === 2 ? 'right' : 'left' });
      fc = end + 1;
      continue;
    }
    let i = fc;
    while (i < end) {
      const chp = chpAt(i);
      let j = i + 1;
      while (j < end && chpAt(j) === chp) j++;
      let s = decode(i, j).replace(/\r/g, '');
      if (chp?.special) s = s.replace(/\x01/g, '');
      s = s.replace(/\x0c/g, '\f').replace(/\x1f/g, '­').replace(/\x0b/g, '\n');
      const parts = s.split('\f');
      parts.forEach((t0, k) => {
        let t = t0;
        if (k > 0) { b.flush(); b.pageBreak(); }
        const fnt = chp ? fontOf(chp.ftc) : null;
        if (fnt && /symbol|wingdings|webdings/i.test(fnt)) t = Array.from(t, (x) => symbolChar(x.charCodeAt(0), fnt)).join('');
        if (t) b.text(t, chp ? { bold: chp.bold, italic: chp.italic, underline: chp.dul ? 'double' : chp.underline, strike: chp.strike, allcaps: chp.caps, smallcaps: chp.smallcaps, hidden: chp.hidden, size: chp.hps / 2, font: fontOf(chp.ftc), sup: chp.pos > 0 && chp.pos < 128, sub: chp.pos >= 128 } : null);
      });
      i = j;
    }
    if (pap) b.endParagraph({ align: (['left', 'center', 'right', 'justify'] as const)[pap.jc], indentLeft: tw(pap.dxaLeft), indentRight: tw(pap.dxaRight), indentFirst: tw(pap.dxaLeft1), lineHeight: pap.dyaLine && pap.dyaLine !== 240 ? String(Math.round(pap.dyaLine / 240 * 100) / 100) : null, spaceBefore: tw(pap.dyaBefore), spaceAfter: tw(pap.dyaAfter), tabs: pap.tabs });
    else b.endParagraph();
    fc = end + 1;
  }
  return b;
}

/** Write picture paragraph: 40-byte header (mm, extents, bitmap info), then the picture data. */
function writePicture(p: Uint8Array): { src: string; w: number | null; h: number | null } | null {
  if (p.length < 40) return null;
  const mm = le.u16(p, 0);
  const dxa = le.u16(p, 8), dya = le.u16(p, 10);
  const cbHeader = le.u16(p, 30) || 40, cbSize = le.u32(p, 32);
  const data = p.subarray(cbHeader, cbHeader + cbSize);
  const size = { w: dxa ? tw(dxa) : null, h: dya ? tw(dya) : null };
  if (mm === 0xe3) {
    // Device-dependent monochrome bitmap: BITMAP fields at 16..29.
    const w = le.u16(p, 18), h = le.u16(p, 20), wb = le.u16(p, 22), planes = p[24], bpp = p[25];
    if (!w || !h || planes !== 1 || (bpp !== 1 && bpp !== 4 && bpp !== 8 && bpp !== 24)) return null;
    const src = ddbToBmp(data, w, h, wb, bpp);
    return src ? { src, ...size } : null;
  }
  const img = findImage(data, mm);
  return img ? { src: img, ...size } : null;
}

function ddbToBmp(bits: Uint8Array, w: number, h: number, widthBytes: number, bpp: number): string | null {
  if (bpp !== 1) return null;
  const row = Math.ceil(w / 32) * 4;
  const hdr = 14 + 40 + 8;
  const out = new Uint8Array(hdr + row * h);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  dv.setUint32(2, out.length, true); dv.setUint32(10, hdr, true);
  dv.setUint32(14, 40, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 1, true);
  out.set([0, 0, 0, 0, 255, 255, 255, 0], 54);
  for (let y = 0; y < h; y++) out.set(bits.subarray(y * widthBytes, y * widthBytes + Math.min(widthBytes, row)), hdr + (h - 1 - y) * row);
  return 'data:image/bmp;base64,' + bytesToBase64(out);
}

export async function importWordDos(data: ArrayBuffer, name: string): Promise<PMNode> {
  const u8 = u8a(data);
  void name;
  const cfb = openCfb(u8);
  if (cfb) return importWord6(data, name);
  if (le.u16(u8, 0) !== 0xbe31 && le.u16(u8, 0) !== 0xbe32) throw new Error('Not a Word for DOS or Write document');
  return readDosWrite(u8).build();
}

// ---------------------------------------------------------------------------------------
// Word for Macintosh 1-5: the text block follows a 0x100-byte header (big-endian FIB).

export async function importWordMac(data: ArrayBuffer, name: string): Promise<PMNode> {
  const u8 = u8a(data);
  void name;
  const id = be.u16(u8, 0);
  if (id !== 0xfe32 && id !== 0xfe34 && id !== 0xfe37) throw new Error('Not a Word for Macintosh document');
  const b = new DocBuilder();
  // Text starts after the 256-byte header. Word 4/5 keep the end of all text at 0x18 and the main
  // story's length at 0x24; Word 1/3 keep the end of text at 0x0E (like Word for DOS).
  const start = 0x100;
  let stop = id === 0xfe37 ? be.u32(u8, 0x18) : be.u32(u8, 0x0e);
  if (id === 0xfe37) { const ccp = be.u32(u8, 0x24); if (ccp > 0 && start + ccp <= stop) stop = start + ccp; }
  if (!(stop > start && stop <= u8.length)) stop = Math.min(u8.length, start + 65536);
  const text = decodeMacRoman(u8.subarray(start, stop));
  emitPlain(b, text);
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 90, right: 90 });
  return b.build();
}

/** Plain text with Word's control characters into paragraphs (used by the fallback paths). */
export function emitPlain(b: DocBuilder, text: string): void {
  for (const para of resolveFieldsPlain(text).split(/\r\n?|\n/)) {
    const pieces = para.split('\f');
    pieces.forEach((t, k) => {
      if (k > 0) { b.flush(); b.pageBreak(); }
      b.text(t.replace(/[\x00-\x08\x0e-\x1f]/g, ''));
    });
    b.endParagraph();
  }
}

/** Format-aware text for the recovery report. */
export function extractText(u8: Uint8Array): string {
  try {
    const cfb = openCfb(u8);
    if (cfb) { const r = openWin(u8, 6); r.readPieces(); return resolveFieldsPlain(r.text.slice(0, r.ccp.text || r.text.length)).replace(/\r/g, '\n'); }
    const id = le.u16(u8, 0);
    if (id === 0xbe31 || id === 0xbe32) return decodeDos(u8.subarray(128, Math.min(u8.length, le.u32(u8, 0x0e)))).replace(/\r/g, '');
    if (be.u16(u8, 0) >> 8 === 0xfe) return decodeMacRoman(u8.subarray(0x100, Math.min(u8.length, (be.u16(u8, 0) === 0xfe37 ? be.u32(u8, 0x18) : be.u32(u8, 0x0e)) || u8.length))).replace(/\r/g, '\n');
    const r = new WinWordReader(u8, null, null, 2);
    r.readPieces();
    return resolveFieldsPlain(r.text).replace(/\r/g, '\n');
  } catch {
    return '';
  }
}
void macChar;

/** For tests and diagnostics. */
export const _openWordReader = (u8: Uint8Array) => (openCfb(u8) ? openWin(u8, 8) : new WinWordReader(u8, null, null, 2));
