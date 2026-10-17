/**
 * Lotus word processors.
 *
 * Ami Pro (.sam) is a text format: bracketed sections ([ver], [sty], [edoc] …), paragraph styles
 * as @Style Name@ at the start of a paragraph, and inline codes such as <+!> / <-!> (bold
 * on/off), <+"> italic, <+#> underline, <+'> strike-through, <+&> superscript, <+%> subscript,
 * <+*> double underline, <:f…> font changes and <:R…> rulers. Paragraphs are separated by a
 * blank line; single line breaks inside a paragraph are wraps.
 *
 * Lotus Word Pro (.lwp) stores its object stream with literal runs; the paragraph text records
 * are decoded (text and paragraph structure; character formatting is not read).
 */
import type { Node as PMNode } from 'prosemirror-model';
import { DocBuilder, type CharProps, type ParaProps } from './builder';
import { decodeWin1252 } from './codepage';

const u8a = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

// ---------------------------------------------------------------------------------------
// Ami Pro

const AMI_ATTR: Record<string, keyof CharProps | 'dul'> = { '!': 'bold', '"': 'italic', '#': 'underline', '$': 'underline', '&': 'sup', '%': 'sub', "'": 'strike', '(': 'smallcaps', '*': 'dul', ')': 'allcaps' };

function amiStyleName(s: string): string {
  const t = s.trim();
  if (/^title$/i.test(t)) return 'Title';
  const h = /^(?:heading|subhead)\s*(\d)?$/i.exec(t);
  if (h) return `Heading ${h[1] || (/subhead/i.test(t) ? 2 : 1)}`;
  if (/^body text$/i.test(t)) return 'Normal';
  if (/^(bullet|number) list/i.test(t)) return 'List Paragraph';
  return t || 'Normal';
}

export function parseAmiPro(text: string, b: DocBuilder): void {
  // Sections
  const sec = (name: string) => {
    const m = new RegExp(`^\\[${name}\\][ \\t]*\\r?\\n([\\s\\S]*?)(?=^\\[[a-z]+\\][ \\t]*\\r?$|$(?![\\s\\S]))`, 'im').exec(text);
    return m ? m[1] : '';
  };
  const doc = sec('edoc') || text.replace(/^\[[\s\S]*?\n(?=@|\S)/, '');
  // Page layout from [lay]: margins in twips after "+++" style records are not reliable; keep defaults.
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  const cp: CharProps = {};
  let dul = false;
  const paras = doc.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  for (const raw of paras) {
    let p = raw.replace(/\n/g, ' ');
    if (!p.trim() && raw.indexOf('\n') < 0 && !raw) continue;
    const pp: ParaProps = {};
    const sm = /^@([^@]{1,60})@/.exec(p);
    if (sm) { pp.style = amiStyleName(sm[1]); p = p.slice(sm[0].length); }
    if (/^bullet/i.test(sm?.[1] || '')) pp.list = { ordered: false };
    else if (/^number/i.test(sm?.[1] || '')) pp.list = { ordered: true };
    const re = /<([+-])([!"#$%&'()*])>|<:f(\d+),?\d*([^>]*)>|<:#(\d+),\d+>|<:([A-Za-z])[^>]*>|<\/?[^<>]{0,80}>|<<|>>|<\[>|\[>/g;
    let last = 0;
    for (let m: RegExpExecArray | null; (m = re.exec(p)); ) {
      if (m.index > last) b.text(p.slice(last, m.index), { ...cp, underline: dul ? 'double' : cp.underline });
      last = m.index + m[0].length;
      if (m[1]) {
        const k = AMI_ATTR[m[2]];
        const on = m[1] === '+';
        if (k === 'dul') dul = on;
        else if (k === 'underline') cp.underline = on;
        else if (k) (cp as any)[k] = on;
      } else if (m[3]) {
        const size = parseInt(m[3], 10) / 20;
        if (size >= 4 && size <= 200) cp.size = size;
        const fam = (m[4] || '').replace(/^[\d,]*/, '').trim();
        if (fam) cp.font = fam;
      } else if (m[0] === '<<') b.text('<', cp);
      else if (m[0] === '>>') b.text('>', cp);
    }
    if (last < p.length) b.text(p.slice(last).replace(/^\s+$/, ''), { ...cp, underline: dul ? 'double' : cp.underline });
    b.endParagraph(pp);
  }
}

export async function importAmiPro(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const b = new DocBuilder();
  parseAmiPro(decodeWin1252(u8a(data)), b);
  return b.build();
}

export function extractAmiProText(u8: Uint8Array): string {
  const t = decodeWin1252(u8);
  const m = /\[edoc\]\s*\r?\n([\s\S]*)/i.exec(t);
  return (m ? m[1] : t).replace(/<[^<>]{0,80}>/g, '').replace(/^@[^@]{1,60}@/gm, '').replace(/\r/g, '');
}

// ---------------------------------------------------------------------------------------
// Word Pro

/**
 * Paragraph text records: a chain of literal runs, each introduced by a byte whose low six bits
 * give the run length minus one, ending with the record terminator 01 02.
 */
export function wordProParagraphs(u8: Uint8Array): string[] {
  const out: string[] = [];
  const n = u8.length;
  for (let i = 16; i < n - 3; i++) {
    const c = u8[i];
    if (c < 0x40) continue;
    let p = i, text = '', ok = false;
    for (let guard = 0; guard < 400 && p < n; guard++) {
      const code = u8[p];
      if (code < 0x40) break;
      const len = (code & 0x3f) + 1;
      const run = u8.subarray(p + 1, p + 1 + len);
      if (run.length < len) break;
      const endsRecord = run[len - 2] === 0x01 && run[len - 1] === 0x02;
      const body = endsRecord ? run.subarray(0, len - 2) : run;
      // A run that holds an inline code (control byte) ends the decodable part of the record.
      let printable = true;
      for (const x of body) if (x < 0x20 && x !== 0x09) { printable = false; break; }
      if (!printable) break;
      text += decodeWin1252(body);
      p += 1 + len;
      if (endsRecord) { ok = true; break; }
    }
    if (ok && text.length >= 1 && /[\p{L}\p{N}]/u.test(text)) { out.push(text); i = p - 1; }
  }
  return out;
}

export async function importWordPro(data: ArrayBuffer, name: string): Promise<PMNode> {
  void name;
  const u8 = u8a(data);
  if (String.fromCharCode(...u8.subarray(0, 7)) !== 'WordPro') throw new Error('Not a Lotus Word Pro document');
  const paras = wordProParagraphs(u8);
  if (!paras.length) throw new Error('No text records were found (the document may use compressed storage)');
  const b = new DocBuilder();
  b.page({ width: 612, height: 792, top: 72, bottom: 72, left: 72, right: 72 });
  for (const p of paras) { b.text(p); b.endParagraph(); }
  return b.build();
}

export function extractWordProText(u8: Uint8Array): string {
  return wordProParagraphs(u8).join('\n');
}
