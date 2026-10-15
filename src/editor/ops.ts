/** Reusable editing operations used by commands. */
import { EditorState, TextSelection, NodeSelection, AllSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Fragment, Slice, type Mark, type MarkType, type Node as PMNode, type NodeType, type ResolvedPos } from 'prosemirror-model';
import { toggleMark as pmToggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { wrapInList, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { schema, PARA_DEFAULTS } from './schema';
import { resolveStyles, effectiveStyle } from './styles';
import { normalizeSettings, type DocSettings } from './settings';

export type Dispatch = (tr: Transaction) => void;
const S = schema;

export function settingsOf(state: EditorState): DocSettings {
  return normalizeSettings(state.doc.attrs.settings);
}

export function setSettings(view: EditorView, fn: (s: DocSettings) => DocSettings | void): void {
  const cur = settingsOf(view.state);
  const copy = JSON.parse(JSON.stringify(cur)) as DocSettings;
  const res = fn(copy) || copy;
  const tr = view.state.tr.setDocAttribute('settings', res);
  tr.setMeta('settingsChanged', true);
  view.dispatch(tr);
}

// --------------------------------------------------------------------------------------------
// Marks

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  let found = false;
  let allHave = true;
  let sawText = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) {
      sawText = true;
      if (type.isInSet(node.marks)) found = true; else allHave = false;
    }
  });
  return sawText ? allHave && found : false;
}

export function markAttr(state: EditorState, type: MarkType, attr: string): any {
  const { $from, from, to, empty } = state.selection;
  if (empty) {
    const m = type.isInSet(state.storedMarks || $from.marks());
    return m ? m.attrs[attr] : null;
  }
  let val: any = undefined;
  let mixed = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || mixed) return;
    const m = type.isInSet(node.marks);
    const v = m ? m.attrs[attr] : null;
    if (val === undefined) val = v; else if (val !== v) mixed = true;
  });
  return mixed ? null : val ?? null;
}

export function toggleMark(view: EditorView, type: MarkType, attrs?: Record<string, any>): boolean {
  return pmToggleMark(type, attrs)(view.state, view.dispatch);
}

/** Replace any existing mark of `type` in the selection with one having `attrs`. */
export function setMark(view: EditorView, type: MarkType, attrs: Record<string, any> | null): boolean {
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (empty) {
    let marks: readonly Mark[] = (state.storedMarks || state.selection.$from.marks()).filter((m) => m.type !== type);
    if (attrs) marks = type.create(attrs).addToSet(marks);
    view.dispatch(state.tr.setStoredMarks(marks));
    return true;
  }
  const tr = state.tr;
  forEachSelectedRange(state, (f, t) => {
    tr.removeMark(f, t, type);
    if (attrs) tr.addMark(f, t, type.create(attrs));
  });
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function removeMarks(view: EditorView, types: MarkType[]): void {
  const { state } = view;
  const tr = state.tr;
  if (state.selection.empty) {
    const marks = (state.storedMarks || state.selection.$from.marks()).filter((m) => !types.includes(m.type));
    view.dispatch(tr.setStoredMarks(marks));
    return;
  }
  forEachSelectedRange(state, (f, t) => { for (const ty of types) tr.removeMark(f, t, ty); });
  view.dispatch(tr);
}

export function forEachSelectedRange(state: EditorState, fn: (from: number, to: number) => void): void {
  for (const r of state.selection.ranges) fn(r.$from.pos, r.$to.pos);
}

const PRESERVED_MARKS = new Set(['link', 'comment', 'insertion', 'deletion', 'formatChange']);

export function clearCharFormatting(view: EditorView): void {
  const types = Object.values(S.marks).filter((m) => !PRESERVED_MARKS.has(m.name));
  removeMarks(view, types);
}

export function clearAllFormatting(view: EditorView): void {
  clearCharFormatting(view);
  setParaAttrs(view, () => ({ ...PARA_DEFAULTS, id: undefined }) as any);
}

// --------------------------------------------------------------------------------------------
// Paragraph attributes

export function selectedParagraphs(state: EditorState): { node: PMNode; pos: number }[] {
  const out: { node: PMNode; pos: number }[] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === S.nodes.paragraph) { out.push({ node, pos }); return false; }
    return true;
  });
  if (!out.length) {
    const $f = state.selection.$from;
    for (let d = $f.depth; d >= 0; d--) {
      const n = $f.node(d);
      if (n.type === S.nodes.paragraph) { out.push({ node: n, pos: $f.before(d) }); break; }
    }
  }
  return out;
}

export function currentParagraph(state: EditorState): PMNode | null {
  const $f = state.selection.$from;
  for (let d = $f.depth; d >= 0; d--) {
    const n = $f.node(d);
    if (n.type === S.nodes.paragraph) return n;
  }
  if (state.selection instanceof NodeSelection && state.selection.node.type === S.nodes.paragraph) return state.selection.node;
  return null;
}

export function paraAttr(state: EditorState, key: string): any {
  const p = currentParagraph(state);
  return p ? p.attrs[key] : null;
}

/** Effective (style-resolved) paragraph property at the cursor. */
export function effectiveParaProp(state: EditorState, key: string): any {
  const p = currentParagraph(state);
  if (!p) return null;
  if (p.attrs[key] != null && p.attrs[key] !== false) return p.attrs[key];
  const map = resolveStyles(settingsOf(state));
  const st = effectiveStyle(map, p.attrs.style || 'Normal') as any;
  return st[key] ?? null;
}

export function setParaAttrs(view: EditorView, patch: Record<string, any> | ((attrs: Record<string, any>, node: PMNode) => Record<string, any>)): boolean {
  const { state } = view;
  const tr = state.tr;
  for (const { node, pos } of selectedParagraphs(state)) {
    const next = typeof patch === 'function' ? { ...node.attrs, ...patch(node.attrs, node) } : { ...node.attrs, ...patch };
    tr.setNodeMarkup(pos, undefined, next, node.marks);
  }
  if (!tr.docChanged) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function setParagraphStyle(view: EditorView, style: string): boolean {
  const map = resolveStyles(settingsOf(view.state));
  const def = map[style];
  if (def && def.type === 'character') {
    return setMark(view, S.marks.charStyle, { name: style });
  }
  const { state } = view;
  // Convert code blocks back to paragraphs first.
  const $f = state.selection.$from;
  if ($f.parent.type === S.nodes.code_block) {
    setBlockType(S.nodes.paragraph, { style })(state, view.dispatch);
    return true;
  }
  return setParaAttrs(view, (a) => ({ style, outlineLevel: null }));
}

// --------------------------------------------------------------------------------------------
// Lists

export function findListAncestor(state: EditorState): { node: PMNode; pos: number; depth: number } | null {
  const $f = state.selection.$from;
  for (let d = $f.depth; d > 0; d--) {
    const n = $f.node(d);
    if (n.type === S.nodes.bullet_list || n.type === S.nodes.ordered_list || n.type === S.nodes.task_list) return { node: n, pos: $f.before(d), depth: d };
  }
  return null;
}

export function toggleList(view: EditorView, listType: NodeType, attrs: Record<string, any> = {}): boolean {
  const { state } = view;
  const anc = findListAncestor(state);
  const itemType = listType === S.nodes.task_list ? S.nodes.task_item : S.nodes.list_item;
  if (anc) {
    if (anc.node.type === listType) {
      const sameAttrs = Object.entries(attrs).every(([k, v]) => anc.node.attrs[k] === v);
      if (sameAttrs || !Object.keys(attrs).length) {
        const curItem = anc.node.type === S.nodes.task_list ? S.nodes.task_item : S.nodes.list_item;
        return liftListItem(curItem)(state, view.dispatch);
      }
      view.dispatch(state.tr.setNodeMarkup(anc.pos, undefined, { ...anc.node.attrs, ...attrs }));
      return true;
    }
    // Convert list type, including item types for task lists.
    const tr = state.tr;
    const items: PMNode[] = [];
    anc.node.forEach((item) => {
      items.push(itemType.create(itemType === S.nodes.task_item ? { checked: false } : null, item.content, item.marks));
    });
    tr.replaceWith(anc.pos, anc.pos + anc.node.nodeSize, listType.create(attrs, items));
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(state.selection.from, tr.doc.content.size))));
    view.dispatch(tr);
    return true;
  }
  return wrapInList(listType, attrs)(state, view.dispatch);
}

export function listIndent(view: EditorView, dir: 1 | -1): boolean {
  const { state } = view;
  const anc = findListAncestor(state);
  if (anc) {
    const item = anc.node.type === S.nodes.task_list ? S.nodes.task_item : S.nodes.list_item;
    return dir > 0 ? sinkListItem(item)(state, view.dispatch) : liftListItem(item)(state, view.dispatch);
  }
  return setParaAttrs(view, (a) => ({ indentLeft: Math.max(0, (a.indentLeft || 0) + dir * 36) || null }));
}

// --------------------------------------------------------------------------------------------
// Text helpers

export function selectedText(state: EditorState): string {
  const { from, to } = state.selection;
  return state.doc.textBetween(from, to, '\n', (n) => (n.type === S.nodes.hard_break ? '\n' : n.isLeaf ? '' : ''));
}

export function insertText(view: EditorView, text: string): void {
  const { state } = view;
  view.dispatch(state.tr.insertText(text, state.selection.from, state.selection.to).scrollIntoView());
}

export function insertInline(view: EditorView, node: PMNode, selectAfter = true): void {
  const { state } = view;
  const tr = state.tr.replaceSelectionWith(node, true);
  if (selectAfter) {
    const pos = tr.mapping.map(state.selection.to);
    try { tr.setSelection(TextSelection.near(tr.doc.resolve(pos))); } catch { /* */ }
  }
  view.dispatch(tr.scrollIntoView());
}

export function insertBlock(view: EditorView, node: PMNode | PMNode[]): void {
  const { state } = view;
  const nodes = Array.isArray(node) ? node : [node];
  const { $to } = state.selection;
  // Insert after the current top-level block when the cursor is in an empty paragraph replace it.
  let tr = state.tr;
  const par = $to.parent;
  if (par.type === S.nodes.paragraph && par.content.size === 0 && $to.depth >= 1) {
    const start = $to.before($to.depth), end = $to.after($to.depth);
    tr = tr.replaceWith(start, end, nodes);
    const after = start + nodes.reduce((a, n) => a + n.nodeSize, 0);
    if (after >= tr.doc.content.size || !tr.doc.resolve(after).nodeAfter) tr.insert(after, S.nodes.paragraph.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size))));
  } else {
    tr = tr.replaceSelectionWith(nodes.length === 1 ? nodes[0] : nodes[0]);
    if (nodes.length > 1) {
      let p = tr.mapping.map(state.selection.to);
      for (const n of nodes.slice(1)) { tr.insert(p, n); p += n.nodeSize; }
    }
  }
  view.dispatch(tr.scrollIntoView());
}

export type CaseMode = 'upper' | 'lower' | 'sentence' | 'title' | 'capitalize' | 'toggle' | 'alternating';

const SMALL_WORDS = new Set('a an and as at but by for from in into nor of on or per the to vs via with'.split(' '));

export function transformCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper': return text.toUpperCase();
    case 'lower': return text.toLowerCase();
    case 'toggle': return [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
    case 'alternating': { let i = 0; return [...text].map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join(''); }
    case 'capitalize': return text.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    case 'sentence': return text.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    case 'title': {
      let idx = 0;
      return text.toLowerCase().replace(/[\p{L}\p{N}'’]+/gu, (w, off: number) => {
        const first = idx++ === 0 || /[:.!?]\s*$/.test(text.slice(0, off));
        if (!first && SMALL_WORDS.has(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      });
    }
  }
}

/** Apply a text transform to every text node in the selection, preserving marks. */
export function mapSelectedText(view: EditorView, fn: (text: string) => string, wholeRange = false): boolean {
  const { state } = view;
  let { from, to } = state.selection;
  if (from === to) {
    const w = wordAt(state.selection.$from);
    if (!w) return false;
    from = w.from; to = w.to;
  }
  const tr = state.tr;
  if (wholeRange) {
    // Transform the selection as one string (needed for sentence/title case context).
    const pieces: { pos: number; len: number; node: PMNode }[] = [];
    state.doc.nodesBetween(from, to, (n, pos) => { if (n.isText) pieces.push({ pos, len: n.nodeSize, node: n }); });
    const segs = pieces.map((p) => {
      const s = Math.max(from, p.pos), e = Math.min(to, p.pos + p.len);
      return { s, e, text: p.node.text!.slice(s - p.pos, e - p.pos), marks: p.node.marks };
    });
    const joined = segs.map((s) => s.text).join('\u0000');
    const outText = fn(joined).split('\u0000');
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (outText[i] !== undefined && outText[i] !== seg.text && outText[i].length > 0) tr.replaceWith(seg.s, seg.e, S.text(outText[i], seg.marks));
    }
  } else {
    const segs: { s: number; e: number; text: string; marks: readonly Mark[] }[] = [];
    state.doc.nodesBetween(from, to, (n, pos) => {
      if (!n.isText) return;
      const s = Math.max(from, pos), e = Math.min(to, pos + n.nodeSize);
      segs.push({ s, e, text: n.text!.slice(s - pos, e - pos), marks: n.marks });
    });
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      const t = fn(seg.text);
      if (t !== seg.text) {
        if (t.length) tr.replaceWith(seg.s, seg.e, S.text(t, seg.marks)); else tr.delete(seg.s, seg.e);
      }
    }
  }
  if (!tr.docChanged) return false;
  const nf = tr.mapping.map(from, -1), nt = tr.mapping.map(to, 1);
  tr.setSelection(TextSelection.create(tr.doc, nf, nt));
  view.dispatch(tr);
  return true;
}

export function wordAt($pos: ResolvedPos): { from: number; to: number; text: string } | null {
  const par = $pos.parent;
  if (!par.isTextblock) return null;
  const text = par.textBetween(0, par.content.size, '\u0001', '\u0001');
  const off = $pos.parentOffset;
  const re = /[\p{L}\p{N}_'’-]/u;
  let s = off, e = off;
  while (s > 0 && re.test(text[s - 1])) s--;
  while (e < text.length && re.test(text[e])) e++;
  if (s === e) return null;
  const start = $pos.start();
  return { from: start + s, to: start + e, text: text.slice(s, e) };
}

export function sentenceAt($pos: ResolvedPos): { from: number; to: number } | null {
  const par = $pos.parent;
  if (!par.isTextblock) return null;
  const text = par.textBetween(0, par.content.size, '\u0001', '\u0001');
  const off = $pos.parentOffset;
  let s = off, e = off;
  while (s > 0 && !/[.!?]/.test(text[s - 1])) s--;
  while (s < off && /\s/.test(text[s])) s++;
  while (e < text.length && !/[.!?]/.test(text[e])) e++;
  if (e < text.length) e++;
  const start = $pos.start();
  return { from: start + s, to: start + e };
}

export function selectRange(view: EditorView, from: number, to: number, scroll = true): void {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
  view.dispatch(scroll ? tr.scrollIntoView() : tr);
}

export function selectParagraph(view: EditorView): void {
  const $f = view.state.selection.$from;
  selectRange(view, $f.start(), $f.end());
}

export function selectAll(view: EditorView): void {
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
}

/** Top-level block index range covered by the selection. */
export function topLevelRange(state: EditorState): { start: number; end: number; from: number; to: number } {
  const { $from, $to } = state.selection;
  const start = $from.index(0), end = $to.index(0);
  const from = $from.depth === 0 ? $from.pos : $from.before(1);
  const to = $to.depth === 0 ? $to.pos : $to.after(1);
  return { start, end, from, to };
}

/** Move the top-level blocks containing the selection up or down by one block. */
export function moveBlocks(view: EditorView, dir: -1 | 1): boolean {
  const { state } = view;
  const { start, end, from, to } = topLevelRange(state);
  const doc = state.doc;
  if (dir < 0 && start === 0) return false;
  if (dir > 0 && end >= doc.childCount - 1) return false;
  const tr = state.tr;
  const slice = doc.slice(from, to);
  const sel = state.selection;
  if (dir < 0) {
    const prev = doc.child(start - 1);
    const target = from - prev.nodeSize;
    tr.delete(from, to);
    tr.insert(target, slice.content);
    const shift = -prev.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, sel.from + shift, sel.to + shift));
  } else {
    const next = doc.child(end + 1);
    tr.delete(from, to);
    const target = from + next.nodeSize;
    tr.insert(target, slice.content);
    const shift = next.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, sel.from + shift, sel.to + shift));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlocks(view: EditorView): void {
  const { state } = view;
  const { from, to } = topLevelRange(state);
  const slice = state.doc.slice(from, to);
  view.dispatch(state.tr.insert(to, slice.content).scrollIntoView());
}

export function deleteBlocks(view: EditorView): void {
  const { state } = view;
  const { from, to } = topLevelRange(state);
  const tr = state.tr.delete(from, to);
  if (tr.doc.childCount === 0) tr.insert(0, S.nodes.paragraph.create());
  view.dispatch(tr.scrollIntoView());
}

/** Iterate over all text in a doc with absolute positions (one entry per textblock). */
export function textblocks(doc: PMNode): { node: PMNode; pos: number; text: string }[] {
  const out: { node: PMNode; pos: number; text: string }[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      out.push({ node, pos, text: node.textBetween(0, node.content.size, '￼', '￼') });
      return false;
    }
    return true;
  });
  return out;
}

/** Map an offset within a textblock's text (as produced by textblocks()) back to a doc position. */
export function textOffsetToPos(block: { node: PMNode; pos: number }, offset: number): number {
  // textBetween with leaf text '￼' gives exactly one char per inline leaf node and per text char.
  let pos = block.pos + 1;
  let remaining = offset;
  let result = -1;
  block.node.forEach((child, childOffset) => {
    if (result >= 0) return;
    const len = child.isText ? child.text!.length : 1;
    if (remaining <= len) { result = block.pos + 1 + childOffset + (child.isText ? remaining : remaining > 0 ? child.nodeSize : 0); return; }
    remaining -= len;
  });
  return result >= 0 ? result : block.pos + 1 + block.node.content.size;
  void pos;
}

export function docText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, '\n', (n) => (n.type === S.nodes.hard_break ? '\n' : ''));
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return m ? m.length : 0;
}

export function wrapSelectionIn(view: EditorView, type: NodeType, attrs?: Record<string, any>): boolean {
  return wrapIn(type, attrs)(view.state, view.dispatch);
}

export function liftSelection(view: EditorView): boolean {
  return lift(view.state, view.dispatch);
}

export function fragmentFromText(text: string, marks?: readonly Mark[]): Fragment {
  const paras = text.split(/\r?\n/);
  return Fragment.fromArray(paras.map((p) => S.nodes.paragraph.create(null, p ? S.text(p, marks) : null)));
}

export function sliceFromText(text: string): Slice {
  const lines = text.split(/\r?\n/);
  if (lines.length === 1) return new Slice(Fragment.from(S.text(text || ' ')), 0, 0);
  return new Slice(fragmentFromText(text), 1, 1);
}

export function getSelectionSlice(state: EditorState): Slice {
  return state.selection.content();
}

export function docFromParagraphTexts(texts: string[]): PMNode {
  return S.node('doc', null, texts.map((t) => S.nodes.paragraph.create(null, t ? S.text(t) : null)));
}

export function isEditable(view: EditorView): boolean {
  return view.editable;
}

export function cursorCoords(view: EditorView) {
  return view.coordsAtPos(view.state.selection.head);
}

export function newState(doc: PMNode, plugins: EditorState['plugins']): EditorState {
  return EditorState.create({ doc, plugins });
}
