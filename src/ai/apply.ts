/**
 * Applying AI output to the document.
 *
 * Replacements inside one paragraph are applied as a word-level diff, so formatting on the
 * words that did not change survives, inline objects (images, footnotes, fields) are never
 * deleted, and tracked changes show individual edits instead of one large replacement.
 * Multi-paragraph and structured output (lists, tables, headings) is parsed as Markdown.
 */
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { TextSelection, type Transaction } from 'prosemirror-state';
import type { App } from '../app';
import { schema } from '../editor/schema';
import { trackKey } from '../editor/plugins/trackChanges';

const S = schema;
const ATOM = '￼';

export interface TextRange { from: number; to: number; text: string; empty: boolean; block: boolean }

/** Plain text of a range: paragraphs separated by blank lines, inline objects dropped. */
export function rangeText(doc: PMNode, from: number, to: number): string {
  return doc.textBetween(from, to, '\n\n', (n) => (n.type === S.nodes.hard_break ? '\n' : '')).replace(/\n{3,}/g, '\n\n').trim();
}

/** The selection, or the paragraph at the cursor when nothing is selected. */
export function selectionOrParagraph(app: App, allowParagraph = true): TextRange | null {
  const st = app.state;
  const { from, to, empty, $from } = st.selection;
  if (!empty) return { from, to, text: rangeText(st.doc, from, to), empty: false, block: false };
  if (!allowParagraph) return null;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.isTextblock) {
      const start = $from.start(d), end = $from.end(d);
      if (!n.textContent.trim()) return null;
      return { from: start, to: end, text: rangeText(st.doc, start, end), empty: true, block: true };
    }
  }
  return null;
}

export function documentText(app: App, maxChars = 120000): { text: string; truncated: boolean; words: number } {
  const all = rangeText(app.state.doc, 0, app.state.doc.content.size);
  const words = all.split(/\s+/).filter(Boolean).length;
  if (all.length <= maxChars) return { text: all, truncated: false, words };
  const head = all.slice(0, Math.floor(maxChars * 0.8));
  const tail = all.slice(-Math.floor(maxChars * 0.2));
  return { text: `${head}\n\n[… ${(all.length - maxChars).toLocaleString()} characters omitted …]\n\n${tail}`, truncated: true, words };
}

/** Text before the cursor (for Continue Writing). */
export function textBefore(app: App, maxChars = 6000): string {
  const pos = app.state.selection.to;
  return rangeText(app.state.doc, Math.max(0, pos - maxChars * 2), pos).slice(-maxChars);
}

// ------------------------------------------------------------------------------------------
// Cleaning model output

/** Remove chatty preambles, wrapping quotes and code fences the model was asked not to add. */
export function cleanOutput(raw: string, opts: { keepMarkdown?: boolean } = {}): string {
  let t = (raw || '').replace(/\r\n?/g, '\n').trim();
  t = t.replace(/^<think>[\s\S]*?<\/think>\s*/i, '');
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(t);
  if (fence) t = fence[1].trim();
  const lines = t.split('\n');
  if (lines.length > 1 && /^(sure|certainly|of course|here(?:'s| is| are)|below is|okay|ok)\b.{0,120}[:：]\s*$/i.test(lines[0])) t = lines.slice(1).join('\n').trim();
  if (/^["“].*["”]$/s.test(t) && !/["“”]/.test(t.slice(1, -1))) t = t.slice(1, -1);
  if (!opts.keepMarkdown) t = t.replace(/^\*\*(.+)\*\*$/s, '$1');
  return t;
}

/** Split "version 1 --- version 2 --- version 3" style output. */
export function splitAlternatives(raw: string): string[] {
  const parts = raw.split(/\n\s*(?:-{3,}|={3,}|\*{3,})\s*\n/).map((p) => cleanOutput(p.replace(/^\s*(?:version|option|alternative)\s*\d+\s*[:.)-]\s*/i, '').replace(/^\s*\d+[.)]\s+(?=\S)/, ''))).filter(Boolean);
  return parts.length ? parts : [cleanOutput(raw)];
}

export function looksLikeMarkdown(t: string): boolean {
  return /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|\|.+\||>\s)/m.test(t) || /\*\*[^*]+\*\*|`[^`]+`/.test(t);
}

// ------------------------------------------------------------------------------------------
// Building blocks

export async function blocksFromText(text: string, markdown: boolean): Promise<PMNode[]> {
  if (markdown && looksLikeMarkdown(text)) {
    const { importMarkdown } = await import('../io/markdown');
    const doc = await importMarkdown(new TextEncoder().encode(text).buffer as ArrayBuffer, 'ai.md');
    const out: PMNode[] = [];
    doc.forEach((n) => out.push(n));
    if (out.length) return out;
  }
  return text.split(/\n{2,}/).map((p) => {
    const inl: PMNode[] = [];
    p.split('\n').forEach((line, i) => {
      if (i) inl.push(S.nodes.hard_break.create());
      if (line) inl.push(S.text(line));
    });
    return S.nodes.paragraph.create(null, inl);
  });
}

// ------------------------------------------------------------------------------------------
// Tracked AI edits

/** Run a document change attributed to "AI (model)" as a tracked change, then restore tracking. */
export function dispatchAiEdit(app: App, build: (tr: Transaction) => Transaction | null, opts: { track: boolean; author: string }): boolean {
  const view = app.tab.view;
  const prev = trackKey.getState(view.state);
  if (opts.track) view.dispatch(view.state.tr.setMeta(trackKey, { enabled: true, author: opts.author }).setMeta('addToHistory', false));
  let ok = false;
  try {
    const tr = build(view.state.tr);
    if (tr && tr.docChanged) { view.dispatch(tr.setMeta('trackWords', true).scrollIntoView()); ok = true; }
  } finally {
    if (opts.track) view.dispatch(view.state.tr.setMeta(trackKey, { enabled: !!prev?.enabled, author: prev?.author || app.prefs.author }).setMeta('addToHistory', false));
  }
  return ok;
}

// ------------------------------------------------------------------------------------------
// Word-level diff

const tokenize = (s: string) => s.match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}]/gu) || [];

interface Edit { from: number; to: number; insert: string }

/** Minimal token edits turning a into b (LCS). Offsets are character offsets into a. */
export function diffText(a: string, b: string): Edit[] | null {
  const A = tokenize(a), B = tokenize(b);
  if (A.length * B.length > 4_000_000) return null;
  const n = A.length, m = B.length;
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i * (m + 1) + j] = A[i] === B[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
  }
  const edits: Edit[] = [];
  let i = 0, j = 0, off = 0;
  let cur: Edit | null = null;
  const flush = () => { if (cur && (cur.to > cur.from || cur.insert)) edits.push(cur); cur = null; };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); off += A[i].length; i++; j++; continue; }
    if (!cur) cur = { from: off, to: off, insert: '' };
    if (j < m && (i >= n || dp[i * (m + 1) + j + 1] >= dp[(i + 1) * (m + 1) + j])) { cur.insert += B[j]; j++; }
    else { off += A[i].length; cur.to = off; i++; }
  }
  flush();
  return edits;
}

/** Map character offsets of a textblock's text (atoms as U+FFFC, hard breaks as \n) to positions. */
function blockIndex(block: PMNode, start: number): { text: string; pos: (o: number) => number; atomAt: Set<number> } {
  let text = '';
  const starts: number[] = [];
  const atomAt = new Set<number>();
  block.forEach((child, offset) => {
    const p = start + offset;
    if (child.isText) { for (let k = 0; k < child.text!.length; k++) starts.push(p + k); text += child.text; }
    else { starts.push(p); if (child.type !== S.nodes.hard_break) atomAt.add(text.length); text += child.type === S.nodes.hard_break ? '\n' : ATOM; }
  });
  const end = start + block.content.size;
  return { text, pos: (o) => (o < starts.length ? starts[o] : end), atomAt };
}

/** Replace a single textblock's range text with new text via minimal edits. */
function applyDiffInBlock(tr: Transaction, blockPos: number, block: PMNode, fromOff: number, toOff: number, newText: string): boolean {
  const idx = blockIndex(block, blockPos + 1);
  const oldText = idx.text.slice(fromOff, toOff);
  const target = newText.replace(/\n+/g, ' ');
  const edits = diffText(oldText.replace(new RegExp(ATOM, 'g'), ''), target);
  if (!edits) return false;
  // Offsets above are into the atom-free text; translate back to block offsets, preserving atoms.
  const map: number[] = [];
  for (let k = 0; k < oldText.length; k++) if (oldText[k] !== ATOM) map.push(fromOff + k);
  map.push(toOff);
  for (let e = edits.length - 1; e >= 0; e--) {
    const ed = edits[e];
    const a = map[ed.from] ?? toOff, b = ed.to > ed.from ? (map[ed.to - 1] ?? toOff - 1) + 1 : a;
    // Delete text pieces between atoms, never the atoms themselves.
    const pieces: [number, number][] = [];
    let s = a;
    for (let k = a; k < b; k++) if (idx.atomAt.has(k)) { if (k > s) pieces.push([s, k]); s = k + 1; }
    if (b > s) pieces.push([s, b]);
    const fromPos = tr.mapping.map(idx.pos(a));
    if (ed.insert) {
      const marks = tr.doc.resolve(fromPos).marks().filter((m) => !['insertion', 'deletion', 'comment'].includes(m.type.name));
      const firstPiece = pieces.shift();
      if (firstPiece) tr.replaceWith(tr.mapping.map(idx.pos(firstPiece[0])), tr.mapping.map(idx.pos(firstPiece[1])), S.text(ed.insert, marks));
      else tr.insert(fromPos, S.text(ed.insert, marks));
    }
    for (const [x, y] of pieces.reverse()) tr.delete(tr.mapping.map(idx.pos(x)), tr.mapping.map(idx.pos(y)));
  }
  return true;
}

/**
 * Replace a range with AI text. Within one paragraph: minimal word edits. Otherwise the range
 * is replaced with parsed blocks (Markdown when the text has structure).
 */
export async function replaceRange(app: App, range: { from: number; to: number }, text: string, opts: { track: boolean; author: string; markdown?: boolean }): Promise<boolean> {
  const st = app.state;
  const $a = st.doc.resolve(range.from), $b = st.doc.resolve(range.to);
  const sameBlock = $a.parent === $b.parent && $a.parent.isTextblock;
  const multiPara = /\n{2,}/.test(text.trim()) || (opts.markdown && looksLikeMarkdown(text));
  if (sameBlock && !multiPara) {
    const depth = $a.depth;
    const blockPos = $a.before(depth);
    const block = $a.parent;
    const idx = blockIndex(block, blockPos + 1);
    const toOff = (o: number) => { let k = 0; while (k < idx.text.length && idx.pos(k) < o) k++; return k; };
    const fromOff = toOff(range.from), endOff = toOff(range.to);
    const done = dispatchAiEdit(app, (tr) => (applyDiffInBlock(tr, blockPos, block, fromOff, endOff, text.trim()) ? tr : null), opts);
    if (done) return true;
  }
  const blocks = await blocksFromText(text.trim(), opts.markdown !== false);
  return dispatchAiEdit(app, (tr) => {
    if (sameBlock && blocks.length === 1 && blocks[0].type === S.nodes.paragraph) {
      tr.replaceWith(range.from, range.to, blocks[0].content);
    } else if ($a.parentOffset === 0 && $b.parentOffset === $b.parent.content.size && $a.depth === $b.depth && $a.depth > 0 && $a.node(-1) === $b.node(-1)) {
      // Whole paragraphs selected: swap the blocks themselves (no empty paragraphs left behind).
      tr.replaceWith($a.before(), $b.after(), blocks);
    } else {
      tr.replaceRange(range.from, range.to, new Slice(Fragment.fromArray(blocks), 0, 0));
    }
    return tr;
  }, opts);
}

/** Insert AI blocks after the top-level block holding the selection end. */
export async function insertBelow(app: App, text: string, opts: { track: boolean; author: string; markdown?: boolean; heading?: string }): Promise<boolean> {
  const st = app.state;
  const $to = st.selection.$to;
  const pos = $to.depth >= 1 ? $to.after(1) : st.doc.content.size;
  let blocks = await blocksFromText(text.trim(), opts.markdown !== false);
  if (opts.heading) blocks = [S.nodes.paragraph.create({ style: 'Heading 3' }, S.text(opts.heading)), ...blocks];
  return dispatchAiEdit(app, (tr) => {
    tr.insert(pos, blocks);
    const sel = TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)));
    return tr.setSelection(sel);
  }, opts);
}

/** Insert at the cursor (inline when the text is a single paragraph). */
export async function insertAtCursor(app: App, text: string, opts: { track: boolean; author: string; markdown?: boolean }): Promise<boolean> {
  const t = text.trim();
  const st = app.state;
  if (!/\n/.test(t) && !(opts.markdown && looksLikeMarkdown(t)) && st.selection.$from.parent.isTextblock) {
    return dispatchAiEdit(app, (tr) => tr.insertText(t, st.selection.from, st.selection.to), opts);
  }
  const blocks = await blocksFromText(t, opts.markdown !== false);
  // Paragraph edges merge into the current paragraph; tables, lists and headings stay whole.
  const open = (n?: PMNode) => (n && n.type === S.nodes.paragraph && !n.attrs.style ? 1 : 0);
  return dispatchAiEdit(app, (tr) => tr.replaceSelection(new Slice(Fragment.fromArray(blocks), open(blocks[0]), open(blocks[blocks.length - 1]))), opts);
}

// ------------------------------------------------------------------------------------------
// Comments

/** Attach comments to the first occurrence of each quoted excerpt. Returns how many were placed. */
export function addComments(app: App, items: { quote: string; comment: string }[], author: string): number {
  const st = app.state;
  const s = JSON.parse(JSON.stringify(app.settings));
  const tr = st.tr.setMeta('comment', true).setMeta('trackSkip', true);
  let placed = 0;
  const blocks: { pos: number; node: PMNode }[] = [];
  st.doc.descendants((n, pos) => { if (n.isTextblock) { blocks.push({ pos, node: n }); return false; } return true; });
  const used = new Set<string>();
  for (const it of items) {
    const q = (it.quote || '').trim().replace(/\s+/g, ' ');
    if (!q || !it.comment) continue;
    for (const b of blocks) {
      const idx = blockIndex(b.node, b.pos + 1);
      const flat = idx.text.replace(/\s+/g, ' ');
      let at = flat.indexOf(q);
      if (at < 0) at = flat.toLowerCase().indexOf(q.toLowerCase());
      if (at < 0 || flat.length !== idx.text.length) {
        if (at < 0) continue;
      }
      const key = `${b.pos}:${at}`;
      if (used.has(key)) continue;
      used.add(key);
      const from = idx.pos(at), to = idx.pos(Math.min(idx.text.length, at + q.length - 1)) + 1;
      const id = `cm${Date.now().toString(36)}${placed}`;
      s.comments[id] = { id, author, date: Date.now(), text: it.comment, resolved: false, replies: [] };
      tr.addMark(from, to, S.marks.comment.create({ id }));
      placed++;
      break;
    }
  }
  if (placed) app.tab.view.dispatch(tr.setDocAttribute('settings', s));
  return placed;
}
