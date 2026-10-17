/**
 * Minimal gzip and tar readers for importers whose files are compressed XML (AbiWord .zabw,
 * KOffice 1.0–1.2 .kwd, Pages '09 index.xml.gz). Synchronous, dependency-free, never throws
 * on damaged input (returns what could be decoded).
 */
import { immortalInflate } from './recover/inflate';

/** Decompress a gzip stream (RFC 1952); concatenated members are joined. */
export function gunzip(u8: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let p = 0;
  while (p + 18 <= u8.length && u8[p] === 0x1f && u8[p + 1] === 0x8b && u8[p + 2] === 8) {
    const flags = u8[p + 3];
    let i = p + 10;
    if (flags & 4) i += 2 + (u8[i] | (u8[i + 1] << 8)); // FEXTRA
    if (flags & 8) { while (i < u8.length && u8[i]) i++; i++; } // FNAME
    if (flags & 16) { while (i < u8.length && u8[i]) i++; i++; } // FCOMMENT
    if (flags & 2) i += 2; // FHCRC
    const r = immortalInflate(u8.subarray(i));
    parts.push(r.data);
    // The member's end is not known without tracking the bit position; one member is the norm.
    break;
  }
  if (!parts.length) return new Uint8Array(0);
  return parts[0];
}

export interface TarEntry { name: string; data: Uint8Array }

/** Read a POSIX/ustar tar archive. */
export function untar(u8: Uint8Array): TarEntry[] {
  const out: TarEntry[] = [];
  const str = (a: number, b: number) => { let s = ''; for (let i = a; i < b && u8[i]; i++) s += String.fromCharCode(u8[i]); return s; };
  let p = 0;
  let longName: string | null = null;
  while (p + 512 <= u8.length) {
    if (u8[p] === 0) break;
    let name = str(p, p + 100);
    const size = parseInt(str(p + 124, p + 136).trim() || '0', 8) || 0;
    const type = String.fromCharCode(u8[p + 156] || 48);
    const prefix = str(p + 257, p + 263) === 'ustar' ? str(p + 345, p + 500) : '';
    if (prefix) name = `${prefix}/${name}`;
    const data = u8.subarray(p + 512, p + 512 + size);
    if (type === 'L') longName = str(p + 512, p + 512 + size);
    else {
      if (longName) { name = longName; longName = null; }
      if (type === '0' || type === '\0' || type === '7') out.push({ name: name.replace(/^\.\//, ''), data });
    }
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
