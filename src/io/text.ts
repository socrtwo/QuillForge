/**
 * Plain text import / export.
 *
 * Import: every line becomes a paragraph (tabs preserved), form feeds become page breaks.
 * .csv / .tsv files become a table.
 * Export: paragraphs separated by "\n"; list items prefixed with "• " / "1. " and indented two
 * spaces per level; tables as tab-separated rows; footnotes as [n] with the notes appended;
 * page breaks as form feeds; fields rendered as their values; tracked deletions dropped.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { formatNumber } from '../editor/plugins/decorations';
import type { ExportOptions } from './index';
import { S, collectFootnotes, decodeTextBytes, finishDoc, htmlToTextLines, inlineAtomText, listStart, makeBlob, newSettings, para, prepareDoc, type NoteInfo } from './serialize';

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g;

function lineToPara(line: string): PMNode {
  const t = line.replace(CONTROL, '');
  return para(t ? [S.text(t)] : []);
}

/** Parse CSV/TSV with quoted fields. */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let quoted = false;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function tableFromRows(rows: string[][]): PMNode {
  const width = Math.max(1, ...rows.map((r) => r.length));
  return S.nodes.table.create({ headerRows: 1 }, rows.map((r, ri) => S.nodes.table_row.create(null,
    Array.from({ length: width }, (_, ci) => (ri === 0 ? S.nodes.table_header : S.nodes.table_cell).create(null, lineToPara((r[ci] ?? '').replace(/\r?\n/g, ' ')))))));
}

export function textToBlocks(text: string): PMNode[] {
  const norm = text.replace(/\r\n?/g, '\n');
  const lines = norm.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const blocks: PMNode[] = [];
  for (const raw of lines) {
    const parts = raw.split('\f');
    parts.forEach((p, i) => {
      if (i) blocks.push(S.nodes.page_break.create());
      if (i === 0 ? p !== '' || parts.length === 1 : p !== '') blocks.push(lineToPara(p));
    });
  }
  return blocks;
}

export async function importText(data: ArrayBuffer, name: string): Promise<PMNode> {
  const settings = newSettings();
  let blocks: PMNode[] = [];
  try {
    const text = decodeTextBytes(data).replace(/^﻿/, '');
    const lower = (name || '').toLowerCase();
    if ((lower.endsWith('.csv') || lower.endsWith('.tsv')) && text.length < 5_000_000) {
      const rows = parseDelimited(text, lower.endsWith('.tsv') ? '\t' : (text.split('\n')[0].includes(';') && !text.split('\n')[0].includes(',') ? ';' : ','));
      const trimmed = rows.filter((r, i) => !(i === rows.length - 1 && r.length === 1 && r[0] === ''));
      if (trimmed.length && trimmed.length <= 5000 && Math.max(...trimmed.map((r) => r.length)) <= 200) blocks = [tableFromRows(trimmed)];
      else blocks = textToBlocks(text);
    } else blocks = textToBlocks(text);
  } catch { /* produce an empty document */ }
  return finishDoc(blocks, settings);
}

// ---------------------------------------------------------------------------------------------
// Export

interface Ctx { notes: Map<PMNode, NoteInfo>; indent: string }

function inlineToText(node: PMNode, ctx: Ctx): string {
  let s = '';
  node.forEach((c) => {
    if (c.isText) s += c.text;
    else if (c.type === S.nodes.hard_break) s += '\n' + ctx.indent;
    else if (c.type === S.nodes.footnote) s += `[${ctx.notes.get(c)?.label ?? '*'}]`;
    else if (c.type === S.nodes.image) s += c.attrs.alt ? `[${c.attrs.alt}]` : '';
    else s += inlineAtomText(c);
  });
  return s;
}

function blocksToLines(node: PMNode, ctx: Ctx, out: string[]): void {
  const t = node.type;
  if (t === S.nodes.paragraph) { out.push(ctx.indent + inlineToText(node, ctx)); return; }
  if (t === S.nodes.code_block) { for (const l of node.textContent.split('\n')) out.push(ctx.indent + l); return; }
  if (t === S.nodes.horizontal_rule) { out.push(ctx.indent + '* * *'); return; }
  if (t === S.nodes.page_break || (t === S.nodes.section_break && node.attrs.kind !== 'continuous')) { out.push('\f'); return; }
  if (t === S.nodes.math_block) { out.push(ctx.indent + node.attrs.latex); return; }
  if (t === S.nodes.gen_block) { for (const l of htmlToTextLines(node.attrs.cache || '')) out.push(ctx.indent + l); return; }
  if (t === S.nodes.bullet_list || t === S.nodes.ordered_list || t === S.nodes.task_list) {
    let n = t === S.nodes.ordered_list ? listStart(node.attrs.order) : 1;
    node.forEach((item) => {
      let prefix = '• ';
      if (t === S.nodes.ordered_list) prefix = `${formatNumber(n++, node.attrs.format || 'decimal')}${node.attrs.suffix ?? '.'} `;
      if (t === S.nodes.task_list || item.attrs.checked != null) prefix = item.attrs.checked ? '☑ ' : '☐ ';
      const sub: string[] = [];
      const inner: Ctx = { ...ctx, indent: ctx.indent + '  ' };
      item.forEach((b) => blocksToLines(b, inner, sub));
      if (!sub.length) sub.push(inner.indent);
      // First line: replace the item indentation with the marker.
      sub[0] = ctx.indent + prefix + sub[0].slice(inner.indent.length);
      out.push(...sub);
    });
    return;
  }
  if (t === S.nodes.table) {
    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => {
        const parts: string[] = [];
        cell.forEach((b) => { const l: string[] = []; blocksToLines(b, { ...ctx, indent: '' }, l); parts.push(...l.filter((x) => x.trim())); });
        cells.push(parts.join(' ').replace(/[\t\n]+/g, ' '));
        for (let i = 1; i < (cell.attrs.colspan || 1); i++) cells.push('');
      });
      out.push(ctx.indent + cells.join('\t'));
    });
    return;
  }
  if (node.isLeaf) return;
  node.forEach((c) => blocksToLines(c, ctx, out));
}

export function docToText(doc: PMNode): string {
  const prepared = prepareDoc(doc);
  const notes = collectFootnotes(prepared);
  const ctx: Ctx = { notes: new Map(notes.map((n) => [n.node, n])), indent: '' };
  const lines: string[] = [];
  prepared.forEach((b) => blocksToLines(b, ctx, lines));
  let text = lines.join('\n').replace(/\n\f\n/g, '\n\f').replace(/^\f\n/, '\f').replace(/\n\f$/, '\n\f');
  if (notes.length) {
    text += '\n\n' + notes.map((n) => `[${n.label}] ${n.text.replace(/\n+/g, ' ')}`).join('\n');
  }
  return text + '\n';
}

export async function exportText(doc: PMNode, opts: ExportOptions): Promise<Blob> {
  void opts;
  return makeBlob(docToText(doc), 'text/plain;charset=utf-8');
}
