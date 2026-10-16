/**
 * Applying AI output to the document.
 *
 * Replacements inside one paragraph are applied as a word-level diff, so formatting on the
 * words that did not change survives, inline objects (images, footnotes, fields) are never
 * deleted, and tracked changes show individual edits instead of one large replacement.
 * Multi-paragraph and structured output (lists, tables, headings) is parsed as Markdown.
 *
 * Answers arrive after a network wait, while the user may keep typing or switch documents, so
 * edits go to the tab the command started in, at positions found again by the blocks that held
 * them (see Anchor); when such a block was edited meanwhile, the edit is not applied.
 */
import { Fragment, Slice, type Mark, type Node as PMNode } from 'prosemirror-model';
import { NodeSelection, TextSelection, type EditorState, type Selection, type Transaction } from 'prosemirror-state';
import type { App, DocTab } from '../app';
import { schema } from '../editor/schema';
import { normalizeSettings } from '../editor/settings';
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
// Where answers go

export interface AiEditOpts {
  track: boolean; author: string; markdown?: boolean;
  /** Default: the active tab. */
  tab?: DocTab;
  /** The text is one paragraph's new text (line breaks are its line breaks): never split blocks. */
  inBlock?: boolean;
}

const viewOf = (app: App, tab?: DocTab) => (tab || app.tab).view;

/** A position remembered by the block that holds it, so it can be found again after edits elsewhere. */
export interface Anchor { doc: PMNode; pos: number; node: PMNode | null; nodePos: number }

/** Remember `pos`, held by the node at `depth` (default: its parent textblock). */
export function anchorAt(doc: PMNode, pos: number, depth?: number): Anchor {
  const $p = doc.resolve(pos);
  const d = depth ?? $p.depth;
  return d > 0 ? { doc, pos, node: $p.node(d), nodePos: $p.before(d) } : { doc, pos, node: null, nodePos: 0 };
}

/** Position of `node` (by identity) in `doc`, the occurrence nearest `near` when it appears twice. */
export function findNode(doc: PMNode, node: PMNode, near = 0): number | null {
  let best: number | null = null;
  doc.descendants((n, pos) => {
    if (n === node) { if (best == null || Math.abs(pos - near) < Math.abs(best - near)) best = pos; return false; }
    return !n.isTextblock && !n.isLeaf;
  });
  return best;
}

/**
 * The anchor's position in `doc`, or null when the block holding it was edited or removed since.
 * Unchanged nodes keep their identity across transactions, so no step mapping is needed.
 */
export function resolveAnchor(doc: PMNode, a: Anchor): number | null {
  if (doc === a.doc) return a.pos;
  if (!a.node) return null;
  const at = findNode(doc, a.node, a.nodePos);
  return at == null ? null : at + (a.pos - a.nodePos);
}

/** A selection to apply an answer at later, wherever the caret is by then. */
export interface SelectionAnchor { sel: Selection; from: Anchor; to: Anchor }

export function anchorSelection(state: EditorState): SelectionAnchor {
  const sel = state.selection, doc = state.doc;
  if (sel instanceof NodeSelection && !sel.node.isInline) {
    const a: Anchor = { doc, pos: sel.from, node: sel.node, nodePos: sel.from };
    return { sel, from: a, to: { ...a, pos: sel.to } };
  }
  return { sel, from: anchorAt(doc, sel.from), to: anchorAt(doc, sel.to) };
}

export function resolveSelection(doc: PMNode, s: SelectionAnchor): Selection | null {
  if (doc === s.sel.$from.doc) return s.sel;
  const f = resolveAnchor(doc, s.from), t = resolveAnchor(doc, s.to);
  if (f == null || t == null) return null;
  try {
    if (s.sel instanceof NodeSelection) return NodeSelection.create(doc, f);
    if (s.sel instanceof TextSelection) return TextSelection.create(doc, s.sel.anchor === s.sel.from ? f : t, s.sel.anchor === s.sel.from ? t : f);
  } catch { /* no longer a valid place */ }
  return null;
}

/** A range remembered with its content: found again only while that content is unchanged. */
export interface RangeAnchor { doc: PMNode; from: Anchor; to: Anchor; content: Fragment }

export function anchorRange(doc: PMNode, range: { from: number; to: number }): RangeAnchor {
  return { doc, from: anchorAt(doc, range.from), to: anchorAt(doc, range.to), content: doc.slice(range.from, range.to).content };
}

export function resolveRange(doc: PMNode, a: RangeAnchor): { from: number; to: number } | null {
  const f = resolveAnchor(doc, a.from), t = resolveAnchor(doc, a.to);
  if (f == null || t == null || t < f) return null;
  return doc === a.doc || doc.slice(f, t).content.eq(a.content) ? { from: f, to: t } : null;
}

/** The top-level block holding the selection end, to insert below it later. */
export function anchorBelow(state: EditorState): Anchor {
  const { $to } = state.selection;
  const doc = state.doc;
  if ($to.depth >= 1) return { doc, pos: $to.after(1), node: $to.node(1), nodePos: $to.before(1) };
  const before = $to.nodeBefore;
  return before ? { doc, pos: $to.pos, node: before, nodePos: $to.pos - before.nodeSize } : { doc, pos: doc.content.size, node: null, nodePos: 0 };
}

// ------------------------------------------------------------------------------------------
// Tracked AI edits

/** Run a document change attributed to "AI (model)" as a tracked change, then restore tracking. */
export function dispatchAiEdit(app: App, build: (tr: Transaction) => Transaction | null, opts: { track: boolean; author: string; tab?: DocTab }): boolean {
  const view = viewOf(app, opts.tab);
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

/**
 * Minimal token edits turning a into b (LCS). Offsets are character offsets into a. When the
 * changed middle is too large for a word diff, it becomes one edit (never a whole-text swap).
 */
export function diffText(a: string, b: string): Edit[] {
  const A = tokenize(a), B = tokenize(b);
  let pre = 0, off = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) off += A[pre++].length;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const Am = A.slice(pre, A.length - suf), Bm = B.slice(pre, B.length - suf);
  if (!Am.length && !Bm.length) return [];
  const n = Am.length, m = Bm.length;
  if (n * m > 4_000_000) return [{ from: off, to: off + Am.join('').length, insert: Bm.join('') }];
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i * (m + 1) + j] = Am[i] === Bm[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
  }
  const edits: Edit[] = [];
  let i = 0, j = 0;
  let cur: Edit | null = null;
  const flush = () => { if (cur && (cur.to > cur.from || cur.insert)) edits.push(cur); cur = null; };
  while (i < n || j < m) {
    if (i < n && j < m && Am[i] === Bm[j]) { flush(); off += Am[i].length; i++; j++; continue; }
    if (!cur) cur = { from: off, to: off, insert: '' };
    if (j < m && (i >= n || dp[i * (m + 1) + j + 1] >= dp[(i + 1) * (m + 1) + j])) { cur.insert += Bm[j]; j++; }
    else { off += Am[i].length; cur.to = off; i++; }
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

/** Text with line breaks as hard_break nodes. */
function inlineContent(s: string, marks: readonly Mark[]): PMNode[] {
  const out: PMNode[] = [];
  s.split('\n').forEach((part, i) => { if (i) out.push(S.nodes.hard_break.create(null, null, marks)); if (part) out.push(S.text(part, marks)); });
  return out;
}

/** Edits turning a textblock range's text into newText; offsets are into the atom-free text. */
function blockEdits(idx: ReturnType<typeof blockIndex>, fromOff: number, toOff: number, newText: string): Edit[] {
  return diffText(idx.text.slice(fromOff, toOff).replace(new RegExp(ATOM, 'g'), ''), newText);
}

/** Apply blockEdits() to a textblock range via minimal steps that keep inline objects. */
function applyDiffInBlock(tr: Transaction, idx: ReturnType<typeof blockIndex>, fromOff: number, toOff: number, edits: Edit[]): void {
  const oldText = idx.text.slice(fromOff, toOff);
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
      if (firstPiece) tr.replaceWith(tr.mapping.map(idx.pos(firstPiece[0])), tr.mapping.map(idx.pos(firstPiece[1])), inlineContent(ed.insert, marks));
      else tr.insert(fromPos, inlineContent(ed.insert, marks));
    }
    for (const [x, y] of pieces.reverse()) tr.delete(tr.mapping.map(idx.pos(x)), tr.mapping.map(idx.pos(y)));
  }
}

/**
 * Replace a range with AI text. Within one paragraph: minimal word edits (an answer equal to the
 * text changes nothing). Otherwise the range is replaced with parsed blocks (Markdown when the
 * text has structure). Returns whether the document changed.
 */
export async function replaceRange(app: App, range: { from: number; to: number }, text: string, opts: AiEditOpts): Promise<boolean> {
  const view = viewOf(app, opts.tab);
  const st = view.state;
  const $a = st.doc.resolve(range.from), $b = st.doc.resolve(range.to);
  const sameBlock = $a.parent === $b.parent && $a.parent.isTextblock;
  const multiPara = !opts.inBlock && (/\n{2,}/.test(text.trim()) || (opts.markdown && looksLikeMarkdown(text)));
  if (sameBlock && !multiPara) {
    const idx = blockIndex($a.parent, $a.start());
    const toOff = (o: number) => { let k = 0; while (k < idx.text.length && idx.pos(k) < o) k++; return k; };
    const fromOff = toOff(range.from), endOff = toOff(range.to);
    const edits = blockEdits(idx, fromOff, endOff, text.trim());
    if (!edits.length) return false;
    return dispatchAiEdit(app, (tr) => { applyDiffInBlock(tr, idx, fromOff, endOff, edits); return tr; }, opts);
  }
  const blocks = await blocksFromText(text.trim(), opts.markdown !== false);
  // The range belongs to the document as it was before the wait for the Markdown parser.
  if (view.state.doc !== st.doc) return false;
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

/** Insert AI blocks after the top-level block holding the selection end (or `below`, from anchorBelow()). */
export async function insertBelow(app: App, text: string, opts: AiEditOpts & { heading?: string; below?: Anchor }): Promise<boolean> {
  let blocks = await blocksFromText(text.trim(), opts.markdown !== false);
  if (opts.heading) blocks = [S.nodes.paragraph.create({ style: 'Heading 3' }, S.text(opts.heading)), ...blocks];
  const view = viewOf(app, opts.tab);
  const a = opts.below || anchorBelow(view.state);
  const at = a.node ? findNode(view.state.doc, a.node, a.nodePos) : null;
  if (a.node && at == null) return false;
  const pos = at != null ? at + a.node!.nodeSize : view.state.doc.content.size;
  return dispatchAiEdit(app, (tr) => {
    tr.insert(pos, blocks);
    const sel = TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)));
    return tr.setSelection(sel);
  }, opts);
}

/** Insert at the cursor, or at `at` (from anchorSelection()); inline when the text is a single paragraph. */
export async function insertAtCursor(app: App, text: string, opts: AiEditOpts & { at?: SelectionAnchor }): Promise<boolean> {
  const t = text.trim();
  const inline = !/\n/.test(t) && !(opts.markdown && looksLikeMarkdown(t));
  const blocks = inline ? [] : await blocksFromText(t, opts.markdown !== false);
  const view = viewOf(app, opts.tab);
  const sel = opts.at ? resolveSelection(view.state.doc, opts.at) : view.state.selection;
  if (!sel) return false;
  if (inline && sel.$from.parent.isTextblock) return dispatchAiEdit(app, (tr) => tr.insertText(t, sel.from, sel.to), opts);
  const content = inline ? await blocksFromText(t, opts.markdown !== false) : blocks;
  if (view.state.doc !== sel.$from.doc) return false;
  // Paragraph edges merge into the current paragraph; tables, lists and headings stay whole.
  const open = (n?: PMNode) => (n && n.type === S.nodes.paragraph && !n.attrs.style ? 1 : 0);
  return dispatchAiEdit(app, (tr) => tr.setSelection(sel).replaceSelection(new Slice(Fragment.fromArray(content), open(content[0]), open(content[content.length - 1]))), opts);
}

// ------------------------------------------------------------------------------------------
// Comments

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Attach comments to the first unused occurrence of each quoted excerpt. Returns how many were placed. */
export function addComments(app: App, items: { quote: string; comment: string }[], author: string, tab?: DocTab): number {
  const view = viewOf(app, tab);
  const st = view.state;
  const s = JSON.parse(JSON.stringify(normalizeSettings(st.doc.attrs.settings)));
  const tr = st.tr.setMeta('comment', true).setMeta('trackSkip', true);
  let placed = 0;
  const blocks: { pos: number; node: PMNode }[] = [];
  st.doc.descendants((n, pos) => { if (n.isTextblock) { blocks.push({ pos, node: n }); return false; } return true; });
  const used = new Set<string>();
  for (const it of items) {
    const q = (it.quote || '').trim().replace(/\s+/g, ' ');
    if (!q || !it.comment) continue;
    // Spaces in the quote match any run of whitespace (double spaces, tabs, line breaks) in the text.
    const src = q.split(' ').map(escRe).join('\\s+');
    let hit: { b: { pos: number; node: PMNode }; idx: ReturnType<typeof blockIndex>; at: number; len: number } | null = null;
    for (const flags of ['gu', 'giu']) {
      for (const b of blocks) {
        const idx = blockIndex(b.node, b.pos + 1);
        const re = new RegExp(src, flags);
        let m: RegExpExecArray | null;
        while ((m = re.exec(idx.text))) {
          if (!used.has(`${b.pos}:${m.index}`)) { hit = { b, idx, at: m.index, len: m[0].length }; break; }
        }
        if (hit) break;
      }
      if (hit) break;
    }
    if (!hit) continue;
    used.add(`${hit.b.pos}:${hit.at}`);
    const from = hit.idx.pos(hit.at), to = hit.idx.pos(hit.at + hit.len - 1) + 1;
    const id = `cm${Date.now().toString(36)}${placed}`;
    s.comments[id] = { id, author, date: Date.now(), text: it.comment, resolved: false, replies: [] };
    tr.addMark(from, to, S.marks.comment.create({ id }));
    placed++;
  }
  if (placed) view.dispatch(tr.setDocAttribute('settings', s));
  return placed;
}
