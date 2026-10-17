/**
 * WordPerfect documents, written from WordPerfect Corporation's published file format
 * descriptions (developer toolkit documentation):
 *
 *   - 4.2 and earlier: no header; one-byte codes 0x80-0xBF and bracketed functions 0xC0-0xFE
 *     whose first and last byte are the same code.
 *   - 5.0/5.1: "FF WPC" prefix (16 bytes), prefix packets, then the document area. Fixed-length
 *     functions 0xC0-0xCF; variable-length functions 0xD0-0xFF ([code][subcode][len][…][len][subcode][code]).
 *   - 6.x-X9 (and later; one format since 1993): "FF WPC" prefix with an index of prefix packets
 *     (fonts, text blocks for headers/footers/notes); variable functions 0xD0-0xEF with a
 *     size word, fixed functions 0xF0-0xFF.
 *   - WordPerfect for Macintosh 2-3: text with the codes skipped (basic).
 *
 * Imported: text, extended characters (multinational and typographic sets), bold/italic/underline
 * and the other attributes, font changes and sizes (6+), justification, margins, line spacing,
 * tabs, hard page breaks, headers/footers and footnotes/endnotes.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { openCfb, le } from '../cfb';
import { DocBuilder, type CharProps, type ParaProps } from './builder';

const u8a = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));
const WPU = 1200; // WordPerfect units per inch
const wpu = (n: number) => (n / WPU) * 72;

// Extended character sets. Set 1: multinational; set 4: typographic symbols; set 8: Greek; set 10: Cyrillic.
// Set 1 (multinational): 0-22 spacing diacritics, 23 ß, then letters in upper/lower pairs from 26.
const SET1 = ['`', '´', '^', '¨', '~', 'ˇ', '˘', '˝', '¸', '’', '˙', '¯', '°', '‚', '‛', '´', '´', '`', 'ˇ', '˘', '·', '¸', '˛', 'ß', '', '', ...'ÁáÂâÄäÀàÅåÆæÇçÉéÊêËëÈèÍíÎîÏïÌìÑñÓóÔôÖöÒòÚúÛûÜüÙùŸÿÃãĐđØøÕõÝýÐðÞþĂăĀāĄąĆćČčĈĉĊċĎďĚěĖėĒēĘęĜĝĞğĠġĢģĤĥĦħİiĪīĮįĨĩĲĳĴĵĶķĹĺĽľĻļĿŀŁłŃńŇňŅņŐőŌōŒœŔŕŘřŖŗŚśŠšŞşŜŝŤťŢţŦŧŬŭŰűŪūŲųŮůŨũŴŵŶŷŹźŽžŻż'];
const SET4 = '•◦■•*¶§¡¿«»£¥₧ƒªº½¼¢²ⁿ®©¤¾³‛’‘‟”“–—‹›○□†‡™℠℞●○■□▪▫―ﬁﬂ…$₣₤₧₩‰₠₡₢';
const SET8 = 'ΑαΒβΒβΓγΔδΕεΖζΗηΘθΙιΚκΛλΜμΝνΞξΟοΠπΡρΣσςΤτΥυΦφΧχΨψΩω';
const SET10 = 'АаБбВвГгДдЕеЁёЖжЗзИиЙйКкЛлМмНнОоПпРрСсТтУуФфХхЦцЧчШшЩщЪъЫыЬьЭэЮюЯя';

export function wpChar(set: number, ch: number): string {
  const pick = (s: string) => (ch < s.length ? s[ch] : '');
  switch (set) {
    case 0: return ch >= 0x20 && ch < 0x7f ? String.fromCharCode(ch) : '';
    case 1: return SET1[ch] || '?';
    case 4: return pick(SET4) || '•';
    case 5: return ['♥', '♦', '♣', '♠', '♂', '♀', '☼', '☺', '☻', '♪', '♫', '‼', '⌂', '▲', '▼', '►', '◄', '↕', '↔', '↑', '↓', '→', '←'][ch] || '•';
    case 6: return ['−', '±', '≤', '≥', '∝', '/', '∕', '∣', '⟨', '⟩', '∼', '≈', '≡', '∈', '∩', '∥', '∑', '∞', '¬', '→', '←', '↑', '↓', '↔', '↕'][ch] || '?';
    case 8: return pick(SET8) || '?';
    case 10: return pick(SET10) || '?';
    default: return '?';
  }
}

/** Attribute numbers (shared by 5.x and 6+). */
function applyAttr(cp: CharProps, attr: number, on: boolean): void {
  switch (attr) {
    case 0: cp.size = on ? 24 : null; break; // extra large
    case 1: cp.size = on ? 20 : null; break; // very large
    case 2: cp.size = on ? 16 : null; break; // large
    case 3: cp.size = on ? 10 : null; break; // small
    case 4: cp.size = on ? 8 : null; break; // fine
    case 5: cp.sup = on; break;
    case 6: cp.sub = on; break;
    case 7: cp.outline = on; break;
    case 8: cp.italic = on; break;
    case 9: cp.shadow = on; break;
    case 10: cp.color = on ? '#c00000' : null; break; // redline
    case 11: cp.underline = on ? 'double' : false; break;
    case 12: cp.bold = on; break;
    case 13: cp.strike = on; break;
    case 14: cp.underline = on ? 'single' : false; break;
    case 15: cp.smallcaps = on; break;
  }
}

const JUST: ParaProps['align'][] = ['left', 'justify', 'center', 'right', 'justify'];

class Emitter {
  b: DocBuilder;
  cp: CharProps = {};
  pp: ParaProps = {};
  baseSize: number | null = null;
  constructor(b: DocBuilder) { this.b = b; }
  text(s: string): void { this.b.text(s, { ...this.cp, size: this.cp.size ?? this.baseSize }); }
  para(): void { this.b.endParagraph({ ...this.pp }); this.pp = { ...this.pp, pageBreakBefore: false }; }
  page(): void { this.b.flush({ ...this.pp }); this.b.pageBreak(); }
}

// ---------------------------------------------------------------------------------------
// 5.x

function decodeWp5(b: Uint8Array, from: number, to: number, em: Emitter, plain?: { out: string }): void {
  const put = (s: string) => (plain ? (plain.out += s) : em.text(s));
  for (let i = from; i < to; ) {
    const c = b[i];
    if (c >= 0x20 && c < 0x7f) {
      let j = i + 1;
      while (j < to && b[j] >= 0x20 && b[j] < 0x7f) j++;
      put(String.fromCharCode(...b.subarray(i, j)));
      i = j;
      continue;
    }
    if (c < 0x20) {
      if (c === 0x0a) { if (plain) plain.out += '\n'; else em.para(); }
      else if (c === 0x0d) put(' ');
      else if (c === 0x0c) { if (plain) plain.out += '\n'; else em.page(); }
      else if (c === 0x09) put('\t');
      i++;
      continue;
    }
    if (c < 0xc0) {
      if (c === 0x8c || c === 0x99) { if (plain) plain.out += '\n'; else em.para(); }
      else if (c === 0xa0) put(' ');
      else if (c === 0xa9 || c === 0xaa) put('-');
      else if (c === 0x90) put(' ');
      i++;
      continue;
    }
    if (c < 0xd0) {
      // Fixed-length functions: find the closing copy of the code.
      const len: Record<number, number> = { 0xc0: 4, 0xc1: 9, 0xc2: 11, 0xc3: 3, 0xc4: 3, 0xc5: 5, 0xc6: 6, 0xc7: 7 };
      let end = len[c] ? i + len[c] - 1 : -1;
      if (end < 0 || b[end] !== c) { end = b.indexOf(c, i + 1); if (end < 0 || end - i > 64) { i++; continue; } }
      if (c === 0xc0) put(wpChar(b[i + 2], b[i + 1]));
      else if (c === 0xc1) {
        // Tab / center / flush right: the flag byte tells which.
        const f = b[i + 1];
        if ((f & 0xe0) === 0xe0 || (f & 0xc0) === 0x40) em.pp.align = em.pp.align === 'left' || !em.pp.align ? (f & 0x40 && !(f & 0x80) ? 'right' : 'center') : em.pp.align;
        else put('\t');
      } else if (c === 0xc2) put('\t');
      else if (c === 0xc3 || c === 0xc4) { if (!plain) applyAttr(em.cp, b[i + 1], c === 0xc3); }
      i = end + 1;
      continue;
    }
    // Variable-length: [code][sub][len lo][len hi] data … [len][sub][code]
    const sub = b[i + 1], len = le.u16(b, i + 2);
    const start = i + 4, end = Math.min(to, start + len);
    if (len < 4 || start + len > to + 4) { i++; continue; }
    const data = b.subarray(start, end - 4);
    if (!plain) {
      if (c === 0xd0 && sub === 0x01 && data.length >= 8) {
        // Left/right margins (old L, old R, new L, new R): the first set before any text becomes the page margins.
        const l = le.u16(data, 4), r = le.u16(data, 6);
        if (!em.b.hasInline && l < 12000 && r < 12000) em.b.page({ left: wpu(l), right: wpu(r) });
      } else if (c === 0xd0 && sub === 0x05 && data.length >= 8) {
        const t = le.u16(data, 4), bo = le.u16(data, 6);
        if (t < 12000 && bo < 12000) em.b.page({ top: wpu(t), bottom: wpu(bo) });
      } else if (c === 0xd0 && sub === 0x02 && data.length >= 4) {
        const v = le.u16(data, 2) / 256;
        em.pp.lineHeight = v > 0.5 && v < 5 && Math.abs(v - 1) > 0.01 ? String(Math.round(v * 100) / 100) : null;
      } else if (c === 0xd0 && sub === 0x06 && data.length >= 2) em.pp.align = JUST[data[1]] || 'left';
      else if (c === 0xd5 && sub <= 3) {
        // Header A/B, footer A/B: formatted text follows the occurrence bytes.
        const p = { out: '' };
        decodeWp5(data, Math.min(data.length, 7), data.length, em, p);
        if (p.out.trim()) em.b.running(sub >= 2 ? 'footer' : 'header', p.out.replace(/\^B|\x02/g, '{PAGE}'));
      } else if (c === 0xd6 && sub <= 1) {
        const p = { out: '' };
        decodeWp5(data, Math.min(data.length, 7), data.length, em, p);
        em.b.footnote(p.out.trim(), sub === 1 ? 'end' : 'foot');
      }
    }
    i = start + len;
  }
}

function readWp5(u8: Uint8Array): DocBuilder {
  const b = new DocBuilder();
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  const em = new Emitter(b);
  em.pp.align = 'justify'; // WordPerfect 5 defaults to full justification
  const ptr = le.u32(u8, 4);
  decodeWp5(u8, Math.min(ptr, u8.length), u8.length, em);
  b.flush(em.pp);
  return b;
}

// ---------------------------------------------------------------------------------------
// 6.x and later

interface Wp6Packets { types: number[]; data: Uint8Array[] }

function wp6Packets(u8: Uint8Array): Wp6Packets {
  const out: Wp6Packets = { types: [], data: [] };
  let p = le.u16(u8, 14);
  if (!p || p + 14 > u8.length) return out;
  const count = le.u16(u8, p + 2);
  for (let k = 0; k < Math.min(count, 5000) && p + 14 <= u8.length; k++, p += 14) {
    const type = u8[p + 1], size = le.u32(u8, p + 6), off = le.u32(u8, p + 10);
    out.types.push(type);
    out.data.push(off > 0 && off + size <= u8.length ? u8.subarray(off, off + size) : new Uint8Array(0));
  }
  return out;
}

function wp6PacketText(pk: Wp6Packets, pid: number, em: Emitter): string {
  const d = pk.data[pid];
  if (!d || d.length < 10 || pk.types[pid] !== 0x08) return '';
  const n = le.u16(d, 0);
  let s = '';
  for (let k = 0; k < Math.min(n, 16); k++) {
    const off = le.u32(d, 2 + k * 8), size = le.u32(d, 6 + k * 8);
    const p = { out: '' };
    decodeWp6(d, Math.min(off, d.length), Math.min(d.length, off + size), em, pk, p);
    s += p.out;
  }
  return s.trim();
}

function wp6FontName(pk: Wp6Packets, pid: number): string | null {
  const d = pk.data[pid];
  if (!d || pk.types[pid] !== 0x55 || d.length < 24) return null;
  const nameLen = le.u16(d, 20);
  let s = '';
  for (let i = 22; i + 1 < Math.min(d.length, 22 + nameLen); i += 2) { const c = le.u16(d, i); if (!c) break; s += String.fromCharCode(c); }
  return s.replace(/\s+(Regular|Standard|Roman|Normal|Plain)$/i, '').trim() || null;
}

function decodeWp6(b: Uint8Array, from: number, to: number, em: Emitter, pk: Wp6Packets, plain?: { out: string }): void {
  const put = (s: string) => (plain ? (plain.out += s) : em.text(s));
  const brk = () => { if (plain) plain.out += '\n'; else em.para(); };
  let undo = 0;
  for (let i = from; i < to; ) {
    const c = b[i];
    if (c >= 0x21 && c < 0x7f || c === 0x20) {
      let j = i + 1;
      while (j < to && b[j] >= 0x20 && b[j] < 0x7f) j++;
      if (!undo) put(String.fromCharCode(...b.subarray(i, j)));
      i = j;
      continue;
    }
    if (c < 0x20) { i++; continue; }
    if (c < 0xd0) {
      if (!undo) {
        if (c === 0x80) put(' ');
        else if (c === 0x81) put(' ');
        else if (c === 0x83 || c === 0x84 || c === 0x85) put('-');
        else if (c === 0xcc) brk();
        else if (c === 0xc7 || c === 0xc8 || c === 0xca) put(' ');
      }
      i++;
      continue;
    }
    if (c >= 0xf0) {
      // Fixed-length functions, closed by the same code.
      let end = c === 0xf0 || c === 0xf1 ? i + 3 : c === 0xf2 || c === 0xf3 ? i + 2 : -1;
      if (end < 0 || b[end] !== c) { end = b.indexOf(c, i + 1); if (end < 0 || end - i > 32) { i++; continue; } }
      if (c === 0xf0 && !undo) put(wpChar(b[i + 2], b[i + 1]));
      else if (c === 0xf1) { if (b[i + 1] === 0) undo++; else if (b[i + 1] === 1 && undo) undo--; }
      else if ((c === 0xf2 || c === 0xf3) && !plain) applyAttr(em.cp, b[i + 1], c === 0xf2);
      i = end + 1;
      continue;
    }
    // Variable-length: [code][sub][size 2][flags][PIDs?][non-deletable size 2][data] … [size 2][code]
    const sub = b[i + 1], size = le.u16(b, i + 2);
    if (size < 8 || i + size > to + 1) { i++; continue; }
    const flags = b[i + 4];
    let p = i + 5;
    const pids: number[] = [];
    if (flags & 0x80) { const n = b[p]; p++; for (let k = 0; k < n; k++) pids.push(le.u16(b, p + k * 2)); p += n * 2; }
    const nd = le.u16(b, p); p += 2;
    const data = b.subarray(p, Math.min(i + size, p + nd + 16));
    if (!undo) {
      if (c === 0xd0) {
        if (sub <= 3) put(' ');
        else if (sub === 0x09 || sub === 0x0c || sub === 0x0d) { if (plain) plain.out += '\n'; else em.page(); }
        else brk();
      } else if (!plain) {
        if (c === 0xd3 && sub === 0x05 && data.length >= 1) em.pp.align = JUST[data[0]] || 'left';
        else if (c === 0xd3 && sub === 0x01 && data.length >= 2) {
          const v = le.u16(data, 0) / 256; // line spacing (8.8 fixed point)
          em.pp.lineHeight = v > 0.5 && v < 5 && Math.abs(v - 1) > 0.01 ? String(Math.round(v * 100) / 100) : null;
        } else if (c === 0xd2 && (sub === 0 || sub === 1) && data.length >= 4) {
          const v = le.u16(data, data.length >= 4 ? 2 : 0);
          if (!em.b.hasInline && v < 12000) em.b.page(sub === 0 ? { left: wpu(v) } : { right: wpu(v) });
        } else if (c === 0xd1 && (sub === 0 || sub === 1) && data.length >= 4) {
          const v = le.u16(data, 2);
          if (v < 12000) em.b.page(sub === 0 ? { top: wpu(v) } : { bottom: wpu(v) });
        } else if (c === 0xd4 && sub === 0x1a && pids.length) {
          em.cp.font = wp6FontName(pk, pids[0]) || em.cp.font;
        } else if (c === 0xd4 && sub === 0x1b && data.length >= 2) {
          const pt = le.u16(data, 0) / 50; // font size in 1/3600 inch → points
          if (pt >= 3 && pt <= 400) em.cp.size = Math.round(pt * 2) / 2;
        } else if (c === 0xd6 && sub <= 3 && pids.length) {
          const t = wp6PacketText(pk, pids[0], em);
          if (t) em.b.running(sub >= 2 ? 'footer' : 'header', t);
        } else if (c === 0xd7 && sub <= 1 && pids.length) {
          em.b.footnote(wp6PacketText(pk, pids[0], em), sub === 1 ? 'end' : 'foot');
        } else if (c === 0xe0) put('\t');
      } else if (c === 0xe0) put('\t');
    }
    i += size;
  }
}

function readWp6(u8: Uint8Array): DocBuilder {
  const b = new DocBuilder();
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  const em = new Emitter(b);
  const pk = wp6Packets(u8);
  // Initial font: the first typeface packet.
  const fontPid = pk.types.indexOf(0x55);
  if (fontPid >= 0) b.defaultFont = wp6FontName(pk, fontPid);
  const ptr = le.u32(u8, 4);
  decodeWp6(u8, Math.min(ptr, u8.length), u8.length, em, pk);
  b.flush(em.pp);
  return b;
}

// ---------------------------------------------------------------------------------------
// 4.2 and WordPerfect for Macintosh (codes skipped)

function readWp42(u8: Uint8Array, mac: boolean): DocBuilder {
  const b = new DocBuilder();
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  const em = new Emitter(b);
  const start = mac ? le.u32(u8, 4) : 0;
  for (let i = start; i < u8.length; ) {
    const c = u8[i];
    if (c >= 0x20 && c < 0x7f) {
      let j = i + 1;
      while (j < u8.length && u8[j] >= 0x20 && u8[j] < 0x7f) j++;
      em.text(String.fromCharCode(...u8.subarray(i, j)));
      i = j;
      continue;
    }
    if (c === 0x0a || (mac && c === 0x0d)) em.para();
    else if (c === 0x0d) em.text(' ');
    else if (c === 0x0c) em.page();
    else if (c === 0x09) em.text('\t');
    else if (!mac && c === 0x9d) em.cp.bold = true;
    else if (!mac && c === 0x9c) em.cp.bold = false;
    else if (!mac && c === 0x94) em.cp.underline = 'single';
    else if (!mac && c === 0x95) em.cp.underline = false;
    else if (!mac && (c === 0xa9 || c === 0xaa)) em.text('-');
    else if (!mac && c === 0xa0) em.text(' ');
    else if (c >= 0xc0 && c < 0xff) {
      const end = u8.indexOf(c, i + 1);
      if (end > 0 && end - i < (mac ? 4096 : 300)) {
        if (mac && (c === 0xc3) && end - i === 3) { const a = u8[i + 1], on = u8[i + 2] & 1; if (a === 0) em.cp.bold = !!on; else if (a === 1) em.cp.italic = !!on; else if (a === 2) em.cp.underline = on ? 'single' : false; }
        i = end + 1;
        continue;
      }
    }
    i++;
  }
  b.flush(em.pp);
  return b;
}

export function wpVersion(u8: Uint8Array): { kind: '42' | '5' | '6' | 'mac'; data: Uint8Array } {
  let d = u8;
  const cfb = openCfb(u8);
  if (cfb) { const m = cfb.read('PerfectOffice_MAIN'); if (m) d = m; }
  if (d[0] === 0xff && d[1] === 0x57 && d[2] === 0x50 && d[3] === 0x43) {
    if (le.u16(d, 12)) throw new Error('This WordPerfect document is password-protected');
    if (d[9] === 0x2c) return { kind: 'mac', data: d };
    return { kind: d[10] >= 2 ? '6' : '5', data: d };
  }
  return { kind: '42', data: d };
}

export async function importWordPerfect(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const { kind, data: d } = wpVersion(u8a(data));
  const b = kind === '6' ? readWp6(d) : kind === '5' ? readWp5(d) : readWp42(d, kind === 'mac');
  return b.build();
}

/** Text only (recovery). */
export function extractText(u8: Uint8Array): string {
  try {
    const { kind, data: d } = wpVersion(u8);
    const em = new Emitter(new DocBuilder());
    const p = { out: '' };
    if (kind === '6') decodeWp6(d, le.u32(d, 4), d.length, em, wp6Packets(d), p);
    else if (kind === '5') decodeWp5(d, le.u32(d, 4), d.length, em, p);
    else {
      for (let i = kind === 'mac' ? le.u32(d, 4) : 0; i < d.length; i++) {
        const c = d[i];
        if (c >= 0x20 && c < 0x7f) p.out += String.fromCharCode(c);
        else if (c === 0x0a || c === 0x0d) p.out += '\n';
        else if (c >= 0xc0 && c < 0xff) { const e = d.indexOf(c, i + 1); if (e > 0 && e - i < 300) i = e; }
      }
    }
    return p.out;
  } catch { return ''; }
}
