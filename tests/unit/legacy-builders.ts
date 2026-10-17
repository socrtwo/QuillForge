/**
 * Test helpers that write minimal, valid files in legacy formats directly from their published
 * specifications (no third-party files): a compound-file (MS-CFB) writer and builders for Word 6,
 * Word 2, Write, Word for DOS/Mac, WordPerfect 4.2/5.1/6, Works, Ami Pro, Word Pro, WordStar,
 * XyWrite, DCA-RFT, MultiMate, MacWrite, ClarisWorks, Hangul HWP 5, PowerPoint 97 text, dBASE,
 * Lotus 1-2-3, Outlook .msg and TNEF.
 */
import { deflateRawSync } from 'node:zlib';

export const enc = (s: string) => new TextEncoder().encode(s);
export const latin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
export const utf16 = (s: string) => { const u = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { u[i * 2] = s.charCodeAt(i) & 0xff; u[i * 2 + 1] = s.charCodeAt(i) >> 8; } return u; };
export const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function cat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const n = parts.reduce((k, p) => k + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export class W {
  b: number[] = [];
  u8(v: number) { this.b.push(v & 0xff); return this; }
  u16(v: number) { this.b.push(v & 0xff, (v >> 8) & 0xff); return this; }
  u16be(v: number) { this.b.push((v >> 8) & 0xff, v & 0xff); return this; }
  u32(v: number) { this.b.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); return this; }
  u32be(v: number) { this.b.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff); return this; }
  bytes(a: ArrayLike<number>) { for (let i = 0; i < a.length; i++) this.b.push(a[i] & 0xff); return this; }
  str(s: string) { return this.bytes(latin(s)); }
  pad(to: number, v = 0) { while (this.b.length < to) this.b.push(v); return this; }
  at(o: number) { return this.pad(o); }
  get length() { return this.b.length; }
  out() { return Uint8Array.from(this.b); }
}
function put16(u: Uint8Array, o: number, v: number) { u[o] = v & 0xff; u[o + 1] = (v >> 8) & 0xff; }
function put32(u: Uint8Array, o: number, v: number) { u[o] = v & 0xff; u[o + 1] = (v >> 8) & 0xff; u[o + 2] = (v >> 16) & 0xff; u[o + 3] = (v >>> 24) & 0xff; }

// ---------------------------------------------------------------------------------------
// Compound File Binary writer (MS-CFB version 3, 512-byte sectors, mini stream)

export function buildCfb(streams: Record<string, Uint8Array>, rootClsid?: number[]): Uint8Array {
  interface E { name: string; type: 1 | 2 | 5; data?: Uint8Array; kids: E[]; start: number; size: number; id: number }
  const root: E = { name: 'Root Entry', type: 5, kids: [], start: 0xfffffffe, size: 0, id: 0 };
  for (const [path, data] of Object.entries(streams)) {
    let cur = root;
    const parts = path.split('/');
    parts.forEach((p, i) => {
      let e = cur.kids.find((k) => k.name === p);
      if (!e) { e = { name: p, type: i === parts.length - 1 ? 2 : 1, kids: [], start: 0xfffffffe, size: 0, id: 0 }; cur.kids.push(e); }
      if (i === parts.length - 1) e.data = data;
      cur = e;
    });
  }
  const all: E[] = [];
  const visit = (e: E) => { e.id = all.length; all.push(e); e.kids.forEach(visit); };
  visit(root);
  const SS = 512, MS = 64;
  // Mini stream
  const mini: number[] = [];
  const miniFat: number[] = [];
  const big: E[] = [];
  for (const e of all) {
    if (e.type !== 2) continue;
    const d = e.data!;
    e.size = d.length;
    if (d.length === 0) { e.start = 0xfffffffe; continue; }
    if (d.length < 4096) {
      const first = mini.length / MS;
      const n = Math.ceil(d.length / MS);
      for (let k = 0; k < n; k++) { for (let i = 0; i < MS; i++) mini.push(d[k * MS + i] ?? 0); miniFat.push(k === n - 1 ? 0xfffffffe : first + k + 1); }
      e.start = first;
    } else big.push(e);
  }
  const dirSecs = Math.ceil(all.length * 128 / SS);
  const miniFatSecs = Math.ceil(miniFat.length * 4 / SS);
  const miniSecs = Math.ceil(mini.length / SS);
  const bigSecs = big.reduce((k, e) => k + Math.ceil(e.size / SS), 0);
  let fatSecs = 1;
  while (fatSecs * 128 < fatSecs + dirSecs + miniFatSecs + miniSecs + bigSecs) fatSecs++;
  const fat: number[] = [];
  for (let i = 0; i < fatSecs; i++) fat.push(0xfffffffd);
  const chain = (n: number) => { const s = fat.length; for (let i = 0; i < n; i++) fat.push(i === n - 1 ? 0xfffffffe : s + i + 1); return n ? s : 0xfffffffe; };
  const dirStart = chain(dirSecs);
  const miniFatStart = chain(miniFatSecs);
  const miniStart = chain(miniSecs);
  root.start = miniStart; root.size = mini.length;
  for (const e of big) e.start = chain(Math.ceil(e.size / SS));
  while (fat.length < fatSecs * 128) fat.push(0xffffffff);
  const out = new Uint8Array(SS * (1 + fat.length / 128 * 0 + fatSecs + dirSecs + miniFatSecs + miniSecs + bigSecs));
  const H = new W().bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).pad(24).u16(0x3e).u16(3).u16(0xfffe).u16(9).u16(6).pad(0x2c).u32(fatSecs).u32(dirStart).u32(0).u32(4096).u32(miniFatStart).u32(miniFatSecs).u32(0xfffffffe).u32(0);
  for (let i = 0; i < 109; i++) H.u32(i < fatSecs ? i : 0xffffffff);
  out.set(H.out(), 0);
  const sec = (n: number) => SS * (n + 1);
  fat.forEach((v, i) => put32(out, SS + i * 4, v));
  // Directory: siblings chained through the right pointer.
  const dir = new Uint8Array(dirSecs * SS);
  const right = new Map<number, number>();
  for (const e of all) e.kids.forEach((k, i) => right.set(k.id, i + 1 < e.kids.length ? e.kids[i + 1].id : 0xffffffff));
  for (const e of all) {
    const o = e.id * 128;
    const nm = e.name.slice(0, 31);
    for (let i = 0; i < nm.length; i++) put16(dir, o + i * 2, nm.charCodeAt(i));
    put16(dir, o + 0x40, (nm.length + 1) * 2);
    dir[o + 0x42] = e.type; dir[o + 0x43] = 1;
    put32(dir, o + 0x44, 0xffffffff);
    put32(dir, o + 0x48, right.get(e.id) ?? 0xffffffff);
    put32(dir, o + 0x4c, e.kids.length ? e.kids[0].id : 0xffffffff);
    if (e === root && rootClsid) rootClsid.forEach((v, i) => (dir[o + 0x50 + i] = v));
    put32(dir, o + 0x74, e.start);
    put32(dir, o + 0x78, e.size);
  }
  for (let i = all.length; i < dirSecs * 4; i++) { put32(dir, i * 128 + 0x44, 0xffffffff); put32(dir, i * 128 + 0x48, 0xffffffff); put32(dir, i * 128 + 0x4c, 0xffffffff); }
  out.set(dir, sec(dirStart));
  if (miniFatSecs) { const mf = new Uint8Array(miniFatSecs * SS).fill(0xff); miniFat.forEach((v, i) => put32(mf, i * 4, v)); out.set(mf, sec(miniFatStart)); }
  if (miniSecs) out.set(Uint8Array.from(mini), sec(miniStart));
  for (const e of big) out.set(e.data!, sec(e.start));
  return out;
}

// ---------------------------------------------------------------------------------------
// Word 6.0 (one-byte sprms; not complex: text at fcMin)

export interface WordRun { text: string; sprms?: number[] }
export interface WordPara { runs: WordRun[]; sprms?: number[]; istd?: number }

export function buildWord6(paras: WordPara[], opts: { footnote?: string; header?: string } = {}): Uint8Array {
  const fcMin = 0x300;
  // Text: paragraphs joined by CR; an optional footnote reference (0x02) ends the first paragraph's text.
  let text = '';
  const chp: { cp: number; end: number; sprms: number[] }[] = [];
  const pap: { end: number; istd: number; sprms: number[] }[] = [];
  let ftnRef = -1;
  paras.forEach((p, pi) => {
    for (const r of p.runs) { chp.push({ cp: text.length, end: text.length + r.text.length, sprms: r.sprms || [] }); text += r.text; }
    if (pi === 0 && opts.footnote) { ftnRef = text.length; chp.push({ cp: text.length, end: text.length + 1, sprms: [117, 1] }); text += '\x02'; }
    text += '\r';
    pap.push({ end: text.length, istd: p.istd || 0, sprms: p.sprms || [] });
  });
  const ccpText = text.length;
  let ccpFtn = 0;
  if (opts.footnote) { const ft = '\x02 ' + opts.footnote + '\r'; chp.push({ cp: text.length, end: text.length + 1, sprms: [117, 1] }); text += ft; ccpFtn = ft.length; }
  let ccpHdd = 0;
  if (opts.header) { const h = opts.header + '\r'; text += h; ccpHdd = h.length; pap.push({ end: text.length, istd: 0, sprms: [5, 1] }); }
  text += '\r';
  const fcMac = fcMin + text.length;
  const pnChp = Math.ceil(fcMac / 512), pnPap = pnChp + 1;
  const tail = (pnPap + 1) * 512;
  const s = new W().at(tail);
  // CHPX FKP
  const fkp = new Uint8Array(512);
  const runs = [{ cp: 0, end: 0, sprms: [] as number[] }, ...chp].filter((r) => r.end > r.cp);
  // Fill gaps with default runs.
  const full: typeof runs = [];
  let at = 0;
  for (const r of runs.sort((a, b) => a.cp - b.cp)) { if (r.cp > at) full.push({ cp: at, end: r.cp, sprms: [] }); full.push(r); at = r.end; }
  if (at < text.length) full.push({ cp: at, end: text.length, sprms: [] });
  full.forEach((r, k) => put32(fkp, k * 4, fcMin + r.cp));
  put32(fkp, full.length * 4, fcMin + text.length);
  let off = 511;
  full.forEach((r, k) => {
    if (!r.sprms.length) { fkp[(full.length + 1) * 4 + k] = 0; return; }
    off -= r.sprms.length + 1; off &= ~1;
    fkp[off] = r.sprms.length; fkp.set(r.sprms, off + 1);
    fkp[(full.length + 1) * 4 + k] = off / 2;
  });
  fkp[511] = full.length;
  // PAPX FKP (BX = offset byte + 6-byte PHE)
  const pk = new Uint8Array(512);
  let start = 0;
  pap.push({ end: text.length, istd: 0, sprms: [] });
  const pruns = pap.map((p) => { const r = { cp: start, end: p.end, istd: p.istd, sprms: p.sprms }; start = p.end; return r; }).filter((r) => r.end > r.cp);
  pruns.forEach((r, k) => put32(pk, k * 4, fcMin + r.cp));
  put32(pk, pruns.length * 4, fcMin + text.length);
  let poff = 511;
  pruns.forEach((r, k) => {
    const g = [r.istd & 0xff, r.istd >> 8, ...r.sprms];
    if (g.length % 2) g.push(0);
    poff -= g.length + 1; poff &= ~1;
    pk[poff] = g.length / 2; pk.set(g, poff + 1);
    pk[(pruns.length + 1) * 4 + k * 7] = poff / 2;
  });
  pk[511] = pruns.length;
  // Tables after the FKPs: STSH, PLCFs, SEPX
  const tables = new W();
  const tblBase = tail;
  const mark = () => tblBase + tables.length;
  // Style sheet: Normal and heading 1 (bold 16 pt)
  const stshAt = mark();
  const std = (name: string, base: number, chpx: number[]) => {
    const w = new W().u16(0).u16(1 | (base << 4)).u16(2).u16(0).u8(name.length).str(name).u8(0);
    if (w.length % 2) w.u8(0);
    w.u16(2).u16(0);
    w.u16(chpx.length).bytes(chpx);
    if (w.length % 2) w.u8(0);
    return w.out();
  };
  const s0 = std('Normal', 0xfff, []), s1 = std('heading 1', 0, [85, 1, 99, 32]);
  tables.u16(14).u16(2).u16(8).pad(tables.length + 10);
  tables.u16(s0.length).bytes(s0).u16(s1.length).bytes(s1);
  const stshLen = mark() - stshAt;
  const sedAt = mark();
  const sepxAt = sedAt + 4 * 2 + 12;
  tables.u32(0).u32(ccpText + ccpFtn + ccpHdd + 1).u16(0).u32(sepxAt).u16(0).u32(0);
  const sepx = [164, 0xd0, 0x2f, 165, 0xe0, 0x3d, 166, 0xa0, 0x05, 167, 0xa0, 0x05, 168, 0xd0, 0x02, 169, 0xd0, 0x02, ...(opts.header ? [153, 0x02] : [])];
  tables.u16(sepx.length).bytes(sepx);
  const sedLen = mark() - sedAt - 2 - sepx.length;
  const bteChpAt = mark(); tables.u32(fcMin).u32(fcMac).u16(pnChp);
  const btePapAt = mark(); tables.u32(fcMin).u32(fcMac).u16(pnPap);
  let fndRefAt = 0, fndTxtAt = 0, hddAt = 0;
  if (opts.footnote) { fndRefAt = mark(); tables.u32(ftnRef).u32(ccpText).u16(1); fndTxtAt = mark(); tables.u32(0).u32(ccpFtn).u32(ccpFtn + 1); }
  if (opts.header) { hddAt = mark(); tables.u32(0).u32(ccpHdd).u32(ccpHdd + 1); }
  const dopAt = mark(); tables.u16(0).pad(tables.length + 82);
  const ffnAt = mark();
  const ffn = new W().u8(0).u8(0x16).u16(400).u8(0).u8(0).str('Times New Roman').u8(0);
  const ffn2 = new W().u8(0).u8(0x26).u16(400).u8(0).u8(0).str('Arial').u8(0);
  const f1 = ffn.out(), f2 = ffn2.out();
  f1[0] = f1.length - 1; f2[0] = f2.length - 1;
  tables.u16(2 + f1.length + f2.length).bytes(f1).bytes(f2);
  const ffnLen = mark() - ffnAt;
  // FIB
  s.at(0);
  const fib = new W().u16(0xa5dc).u16(0x65).u16(0x6c).u16(0x409).u16(0).u16(0).u16(0x65).u32(0).u8(0).u8(0).u16(0).u16(0).u32(fcMin).u32(fcMac).u32(tail + tables.length)
    .pad(0x34).u32(ccpText).u32(ccpFtn).u32(ccpHdd).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0);
  const fl = (i: number, fc: number, lcb: number) => { fib.at(0x58 + i * 8); put32b(fib, 0x58 + i * 8, fc); put32b(fib, 0x5c + i * 8, lcb); };
  fib.pad(0x1a0);
  fl(0, stshAt, stshLen); fl(1, stshAt, stshLen); fl(6, sedAt, sedLen);
  if (opts.footnote) { fl(2, fndRefAt, 10); fl(3, fndTxtAt, 12); }
  if (opts.header) fl(11, hddAt, 12);
  fl(12, bteChpAt, 10); fl(13, btePapAt, 10); fl(15, ffnAt, ffnLen); fl(31, dopAt, 84);
  put16b(fib, 0x18e, 1); put16b(fib, 0x190, 1);
  const wd = new Uint8Array(tail + tables.length);
  wd.set(fib.out(), 0);
  wd.set(latin(text), fcMin);
  wd.set(fkp, pnChp * 512);
  wd.set(pk, pnPap * 512);
  wd.set(tables.out(), tail);
  return buildCfb({ WordDocument: wd });
}
function put32b(w: W, o: number, v: number) { w.pad(o + 4); w.b[o] = v & 0xff; w.b[o + 1] = (v >> 8) & 0xff; w.b[o + 2] = (v >> 16) & 0xff; w.b[o + 3] = (v >>> 24) & 0xff; }
function put16b(w: W, o: number, v: number) { w.pad(o + 2); w.b[o] = v & 0xff; w.b[o + 1] = (v >> 8) & 0xff; }

// ---------------------------------------------------------------------------------------
// Windows Write / Word for DOS (128-byte pages)

export function buildWrite(paras: { text: string; bold?: boolean; center?: boolean; size?: number }[], opts: { dos?: boolean; fonts?: string[] } = {}): Uint8Array {
  let text = '';
  const chps: { end: number; bold: boolean; size: number }[] = [];
  const paps: { end: number; center: boolean }[] = [];
  for (const p of paras) { text += p.text + '\r\n'; chps.push({ end: 128 + text.length, bold: !!p.bold, size: p.size || 12 }); paps.push({ end: 128 + text.length, center: !!p.center }); }
  const fcMac = 128 + text.length;
  const pnChar = Math.ceil(fcMac / 128);
  const pnPara = pnChar + 1, pnFfntb = pnPara + 1, pnMac = pnFfntb + 1;
  const out = new Uint8Array(pnMac * 128);
  const h = new W().u16(0xbe31).u16(0).u16(0xab00).pad(0x0e).u32(fcMac).u16(pnPara).u16(pnFfntb).u16(pnFfntb).u16(pnFfntb).u16(pnFfntb).u16(pnFfntb);
  if (opts.dos) { h.at(0x1e).str('NORMAL.STY'); h.at(0x62).str('HPLASMS'); }
  h.at(0x60);
  if (!opts.dos) put16b(h, 0x60, pnMac);
  h.pad(128);
  out.set(h.out(), 0);
  out.set(latin(text), 128);
  // Character page: FODs (fcLim, bfprop) then properties from the top.
  const cp = new Uint8Array(128);
  put32(cp, 0, 128);
  let fprop = 120;
  chps.forEach((c, k) => {
    put32(cp, 4 + k * 6, c.end);
    fprop -= 4;
    cp[4 + fprop] = 3; cp[5 + fprop] = 1; cp[6 + fprop] = c.bold ? 1 : 0; cp[7 + fprop] = c.size * 2;
    put16(cp, 8 + k * 6, fprop);
  });
  cp[127] = chps.length;
  out.set(cp, pnChar * 128);
  const pp = new Uint8Array(128);
  put32(pp, 0, 128);
  let pprop = 120;
  paps.forEach((p, k) => {
    put32(pp, 4 + k * 6, p.end);
    pprop -= 4;
    pp[4 + pprop] = 2; pp[5 + pprop] = 61; pp[6 + pprop] = p.center ? 1 : 0;
    put16(pp, 8 + k * 6, pprop);
  });
  pp[127] = paps.length;
  out.set(pp, pnPara * 128);
  const fonts = opts.fonts || ['Arial'];
  const ft = new W().u16(fonts.length);
  for (const f of fonts) ft.u16(f.length + 2).u8(0x20).str(f).u8(0);
  ft.u16(0);
  out.set(ft.out().subarray(0, 128), pnFfntb * 128);
  return out;
}

// ---------------------------------------------------------------------------------------
// WordPerfect

export function buildWp5(body: Uint8Array): Uint8Array {
  const hdr = new W().u8(0xff).str('WPC').u32(16).u8(1).u8(0x0a).u8(0).u8(1).u16(0).u16(0);
  return cat(hdr.out(), body);
}
/** A WordPerfect 5 variable-length function: code, subcode, length, data, length, subcode, code. */
export function wp5Fn(code: number, sub: number, data: number[]): number[] {
  const len = data.length + 4;
  return [code, sub, len & 0xff, len >> 8, ...data, len & 0xff, len >> 8, sub, code];
}
export function buildWp6(body: Uint8Array, opts: { header?: string; font?: string } = {}): Uint8Array {
  // Prefix packet index at 0x200: entry 0 = index header; 1 = font typeface; 2 = text block (header text).
  const packets: { type: number; data: Uint8Array }[] = [];
  const font = opts.font || 'Times New Roman';
  packets.push({ type: 0x55, data: cat(new Uint8Array(20), [font.length * 2 + 2, 0], utf16(font), [0, 0]) });
  if (opts.header) {
    const t = cat(latin(opts.header.replace(/ /g, '\x80')), [0xcc]);
    packets.push({ type: 0x08, data: cat(new W().u16(1).u32(10).u32(t.length).out(), t) });
  }
  const idxAt = 0x200;
  const dataAt = idxAt + (packets.length + 1) * 14;
  const idx = new W().u8(2).u8(0).u16(packets.length + 1).u16(0).u32(0).u32(0);
  let p = dataAt;
  for (const pk of packets) { idx.u8(8).u8(pk.type).u16(1).u16(0).u32(pk.data.length).u32(p); p += pk.data.length; }
  const docAt = p;
  const hdr = new W().u8(0xff).str('WPC').u32(docAt).u8(1).u8(0x0a).u8(2).u8(1).u16(0).u16(idxAt).at(idxAt).bytes(idx.out());
  return cat(hdr.out(), ...packets.map((x) => x.data), body);
}
/** A WordPerfect 6 variable-length function. */
export function wp6Fn(code: number, sub: number, data: number[], pids: number[] = []): number[] {
  const flags = pids.length ? 0x80 : 0;
  const pidBytes = pids.length ? [pids.length, ...pids.flatMap((x) => [x & 0xff, x >> 8])] : [];
  const size = 1 + 1 + 2 + 1 + pidBytes.length + 2 + data.length + 2 + 1;
  return [code, sub, size & 0xff, size >> 8, flags, ...pidBytes, data.length & 0xff, data.length >> 8, ...data, size & 0xff, size >> 8, code];
}

// ---------------------------------------------------------------------------------------
// Works 4.5+ (CONTENTS chunks) and Works 3/4 (MN0)

export function buildWorksContents(text: string): Uint8Array {
  const t = utf16(text);
  const dir = new W().str('CHNKWKS ').u16(4).u16(8).u16(1).u16(0x300).u16(0x200).u16(0).u16(0x10).u16(0).u16(0x1f8).u16(1).u32(0xffffffff);
  dir.at(0x20).u16(0x18).str('TEXT').u16(0).u32(1).str('TEXT').u32(0x200).u32(t.length);
  dir.pad(0x200).bytes(t).pad(0x400);
  return buildCfb({ CONTENTS: dir.out() });
}
export function buildWorksMn0(text: string): Uint8Array {
  const body = latin(text);
  const mn = new W().u16(0xfe01).u16(0x0400).pad(0x22).u32(0x100).u32(0x100 + body.length).pad(0x100).bytes(body).pad(0x100 + body.length + 128);
  return buildCfb({ MN0: mn.out(), MM: new Uint8Array(14) });
}

// ---------------------------------------------------------------------------------------
// Hangul HWP 5

function hwpRec(tag: number, level: number, data: Uint8Array): Uint8Array {
  const h = tag | (level << 10) | (Math.min(data.length, 0xfff) << 20);
  return data.length >= 0xfff ? cat(new W().u32(tag | (level << 10) | (0xfff << 20)).u32(data.length).out(), data) : cat(new W().u32(h >>> 0).out(), data);
}
export function buildHwp(paras: { text: string; bold?: boolean; center?: boolean }[]): Uint8Array {
  const fh = new W().str('HWP Document File').pad(32).u32(0x05000000).u32(1).pad(256).out();
  const face = cat([0], new W().u16(5).out(), utf16('Batang'));
  const shape = (bold: boolean) => new W().pad(42).u32(1200).u32(bold ? 2 : 0).pad(56).out();
  const pshape = (center: boolean) => new W().u32(center ? 3 << 2 : 1 << 2).pad(54).out();
  const docinfo = cat(hwpRec(0x13, 1, face), hwpRec(0x15, 1, shape(false)), hwpRec(0x15, 1, shape(true)), hwpRec(0x19, 1, pshape(false)), hwpRec(0x19, 1, pshape(true)));
  const body: Uint8Array[] = [];
  for (const p of paras) {
    body.push(hwpRec(0x42, 0, new W().u32(p.text.length + 1).u32(0).u16(p.center ? 1 : 0).u8(0).u8(0).pad(22).out()));
    body.push(hwpRec(0x43, 1, cat(utf16(p.text), [13, 0])));
    body.push(hwpRec(0x44, 1, new W().u32(0).u32(p.bold ? 1 : 0).out()));
  }
  return buildCfb({ FileHeader: fh, DocInfo: new Uint8Array(deflateRawSync(docinfo)), 'BodyText/Section0': new Uint8Array(deflateRawSync(cat(...body))) });
}

// ---------------------------------------------------------------------------------------
// PowerPoint 97 text atoms

function pptRec(verInst: number, type: number, data: Uint8Array): Uint8Array { return cat(new W().u16(verInst).u16(type).u32(data.length).out(), data); }
export function buildPpt(slides: { title: string; body: string[] }[]): Uint8Array {
  const atoms: Uint8Array[] = [];
  slides.forEach((s, i) => {
    atoms.push(pptRec(0, 0x03f3, new W().u32(i + 1).u32(0).u32(2).u32(256 + i).u32(0).out()));
    atoms.push(pptRec(0, 0x0f9f, new W().u32(0).out()));
    atoms.push(pptRec(0, 0x0fa0, utf16(s.title)));
    atoms.push(pptRec(0, 0x0f9f, new W().u32(1).out()));
    atoms.push(pptRec(0, 0x0fa8, latin(s.body.join('\r'))));
  });
  const list = pptRec(0x000f, 0x0ff0, cat(...atoms));
  const doc = pptRec(0x000f, 0x03e8, list);
  return buildCfb({ 'PowerPoint Document': doc, 'Current User': new Uint8Array(32) });
}

// ---------------------------------------------------------------------------------------
// Outlook .msg and TNEF

export function buildMsg(m: { subject: string; from: string; to: string; body: string; attachment?: { name: string; data: Uint8Array } }): Uint8Array {
  const props = new W().pad(32);
  const streams: Record<string, Uint8Array> = {
    '__substg1.0_0037001F': utf16(m.subject), '__substg1.0_0C1A001F': utf16(m.from), '__substg1.0_0E04001F': utf16(m.to), '__substg1.0_1000001F': utf16(m.body),
    '__substg1.0_007D001F': utf16('Date: Tue, 05 Mar 2024 10:00:00 +0000\r\n'),
  };
  if (m.attachment) {
    streams['__attach_version1.0_#00000000/__substg1.0_3707001F'] = utf16(m.attachment.name);
    streams['__attach_version1.0_#00000000/__substg1.0_37010102'] = m.attachment.data;
    streams['__attach_version1.0_#00000000/__properties_version1.0'] = new Uint8Array(8);
  }
  streams['__properties_version1.0'] = props.out();
  return buildCfb(streams, [0x0b, 0x0d, 0x02, 0, 0, 0, 0, 0, 0xc0, 0, 0, 0, 0, 0, 0, 0x46]);
}

export function buildTnef(m: { subject: string; body: string; attachment: string }): Uint8Array {
  const attr = (level: number, id: number, data: Uint8Array) => { let sum = 0; for (const x of data) sum = (sum + x) & 0xffff; return cat(new W().u8(level).u32(id).u32(data.length).out(), data, new W().u16(sum).out()); };
  return cat(new W().u32(0x223e9f78).u16(1).out(),
    attr(1, 0x00018004, latin(m.subject + '\0')), attr(1, 0x0002800c, latin(m.body + '\0')),
    attr(2, 0x00069002, new Uint8Array(8)), attr(2, 0x00018010, latin(m.attachment + '\0')), attr(2, 0x0006800f, latin('hello')));
}

// ---------------------------------------------------------------------------------------
// dBASE, Lotus 1-2-3

export function buildDbf(fields: { name: string; type: 'C' | 'N' | 'D'; len: number }[], rows: string[][]): Uint8Array {
  const hlen = 32 + fields.length * 32 + 1, rlen = 1 + fields.reduce((k, f) => k + f.len, 0);
  const w = new W().u8(3).u8(124).u8(3).u8(15).u32(rows.length).u16(hlen).u16(rlen).pad(29).u8(0x03).pad(32);
  for (const f of fields) w.str(f.name.padEnd(11, '\0').slice(0, 11)).str(f.type).u32(0).u8(f.len).u8(0).pad(w.length + 14);
  w.u8(0x0d);
  for (const r of rows) { w.u8(0x20); fields.forEach((f, i) => w.str((f.type === 'N' ? r[i].padStart(f.len) : r[i].padEnd(f.len)).slice(0, f.len))); }
  w.u8(0x1a);
  return w.out();
}
export function buildWk1(cells: { r: number; c: number; v: string | number }[]): Uint8Array {
  const w = new W().u16(0).u16(2).u16(0x0406);
  for (const x of cells) {
    if (typeof x.v === 'number') { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x.v, true); w.u16(0x0e).u16(13).u8(0xff).u16(x.c).u16(x.r).bytes(new Uint8Array(d.buffer)); }
    else { const s = "'" + x.v + '\0'; w.u16(0x0f).u16(5 + s.length).u8(0xff).u16(x.c).u16(x.r).str(s); }
  }
  w.u16(1).u16(0);
  return w.out();
}

// ---------------------------------------------------------------------------------------
// MacWrite 5 (nibble-compressed paragraphs, paragraph array), ClarisWorks, Word Pro

const NIB = ' etnroaisdlhcfp';
function nibbleEncode(s: string): Uint8Array {
  const n: number[] = [];
  for (const ch of s) { const i = NIB.indexOf(ch); if (i >= 0) n.push(i); else { const c = ch.charCodeAt(0); n.push(15, c >> 4, c & 15); } }
  if (n.length % 2) n.push(0);
  const out = new Uint8Array(n.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (n[i * 2] << 4) | n[i * 2 + 1];
  return out;
}
export function buildMacWrite(paras: string[]): Uint8Array {
  const w = new W().u16be(6).u16be(paras.length).pad(0x100);
  const arrayAt = 0x100, dataAt = arrayAt + paras.length * 16 + 16;
  const offs: number[] = [];
  const data = new W();
  paras.forEach((p, i) => {
    offs.push(dataAt + data.length);
    const t = p + '\r';
    data.u16be(t.length).bytes(i % 2 ? nibbleEncode(t) : latin(t));
    if (data.length % 2) data.u8(0);
  });
  for (const o of offs) w.u16be(o).u16be(0).u8(0x32).pad(w.length + 11);
  w.pad(dataAt).bytes(data.out());
  return w.out();
}
export function buildClarisWorks(text: string): Uint8Array {
  return new W().u8(6).u8(7).u8(0xce).u8(0).str('BOBO').u8(6).u8(7).pad(0x100).str(text).u8(0).pad(0x200).out();
}
export function buildWordPro(paras: string[]): Uint8Array {
  const w = new W().str('WordPro').pad(0x40);
  for (const p of paras) {
    const body = latin(p + '\x01\x02');
    w.u8(0x00).u8(0x00);
    for (let i = 0; i < body.length; i += 64) { const chunk = body.subarray(i, i + 64); w.u8(0x80 | (chunk.length - 1)).bytes(chunk); }
    w.str('SSEnd').u8(0);
  }
  return w.out();
}
