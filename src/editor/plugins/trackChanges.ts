/**
 * Track Changes ("suggesting" mode).
 *
 * When tracking is on, every user transaction is post-processed: inserted text receives an
 * `insertion` mark and deleted content is re-inserted with a `deletion` mark instead of being
 * removed. Text that is already a tracked insertion is deleted for real (deleting your own
 * suggestion simply withdraws it). Paragraph joins/splits and structural edits pass through
 * untracked.
 */
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Fragment, Slice, type Mark, type Node as PMNode } from 'prosemirror-model';
import { ReplaceStep, ReplaceAroundStep, AddMarkStep, RemoveMarkStep, AttrStep, DocAttrStep, AddNodeMarkStep, RemoveNodeMarkStep } from 'prosemirror-transform';
import { ChangeSet, simplifyChanges } from 'prosemirror-changeset';
import { schema } from '../schema';

export interface TrackState { enabled: boolean; author: string; lockTracking: boolean }
export const trackKey = new PluginKey<TrackState>('track');

export function trackPlugin(initial: Partial<TrackState> = {}) {
  return new Plugin<TrackState>({
    key: trackKey,
    state: {
      init: () => ({ enabled: false, author: 'Author', lockTracking: false, ...initial }),
      apply(tr, v) {
        const m = tr.getMeta(trackKey);
        return m ? { ...v, ...m } : v;
      },
    },
  });
}

export function isTracking(state: EditorState): boolean {
  return !!trackKey.getState(state)?.enabled;
}

let idCounter = 0;
export function newChangeId(): string {
  return `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}

function markFragment(frag: Fragment, del: Mark): Fragment {
  const out: PMNode[] = [];
  frag.forEach((node) => {
    if (node.isText) {
      if (node.marks.some((m) => m.type === schema.marks.insertion)) return; // withdraw own insertions
      if (node.marks.some((m) => m.type === schema.marks.deletion)) { out.push(node); return; }
      out.push(node.mark(del.addToSet(node.marks)));
    } else if (node.isInline) {
      if (node.marks.some((m) => m.type === schema.marks.insertion)) return;
      out.push(node.mark(del.addToSet(node.marks)));
    } else {
      out.push(node.copy(markFragment(node.content, del)));
    }
  });
  return Fragment.fromArray(out);
}

function hasInlineContent(frag: Fragment): boolean {
  let found = false;
  frag.descendants((n) => {
    if (found) return false;
    if (n.isInline && !(n.type === schema.nodes.hard_break)) {
      if (!n.isText || n.text) found = true;
    }
    return !found;
  });
  return found;
}

/**
 * Convert a user transaction into a tracked one. Returns the transaction to dispatch.
 * `dir` is 'back' when the edit was a Backspace so the caret ends before the deleted text.
 */
export function trackTransaction(tr: Transaction, oldState: EditorState, force = false): Transaction {
  const ts = trackKey.getState(oldState);
  if (!(ts?.enabled || force) || !tr.docChanged || tr.getMeta('trackSkip') || tr.getMeta('history$')) return tr;
  if (tr.steps.some((s) => s instanceof ReplaceAroundStep)) return tr;
  const passthrough = (s: unknown) => s instanceof AddMarkStep || s instanceof RemoveMarkStep || s instanceof AttrStep || s instanceof DocAttrStep || s instanceof AddNodeMarkStep || s instanceof RemoveNodeMarkStep;
  if (!tr.steps.every((s) => s instanceof ReplaceStep || passthrough(s))) return tr;
  if (!tr.steps.some((s) => s instanceof ReplaceStep)) return tr;

  const author = ts?.author || 'Author';
  const date = Date.now();
  const id = newChangeId();
  const insMark = schema.marks.insertion.create({ author, date, id });
  const delMark = schema.marks.deletion.create({ author, date, id });

  let cs = ChangeSet.create(oldState.doc);
  cs = cs.addSteps(tr.doc, tr.mapping.maps, null);
  // 'trackWords' (AI edits): present whole-word changes, as reviewers expect, instead of minimal character runs.
  const changes = tr.getMeta('trackWords') ? simplifyChanges(cs.changes, tr.doc) : [...cs.changes];
  if (!changes.length) return tr;

  const out = tr; // append steps to the same transaction so undo treats it as one unit
  const dir = tr.getMeta('trackDir') as 'back' | 'forward' | undefined;
  const selBefore = out.selection;
  let caret: number | null = selBefore.empty ? selBefore.head : null;

  for (let i = changes.length - 1; i >= 0; i--) {
    const c = changes[i];
    // Mark inserted inline content.
    if (c.toB > c.fromB) {
      out.doc.nodesBetween(c.fromB, c.toB, (node, pos) => {
        if (node.isInline) {
          const from = Math.max(pos, c.fromB);
          const to = Math.min(pos + node.nodeSize, c.toB);
          if (to > from && !node.marks.some((m) => m.type === schema.marks.deletion)) out.addMark(from, to, insMark);
        }
        return true;
      });
    }
    // Re-insert deleted content, marked as a deletion, before the inserted text.
    if (c.toA > c.fromA) {
      const slice = oldState.doc.slice(c.fromA, c.toA);
      if (!hasInlineContent(slice.content)) continue; // structural join: allow untracked
      const marked = new Slice(markFragment(slice.content, delMark), slice.openStart, slice.openEnd);
      if (!hasInlineContent(marked.content)) continue; // only withdrew own insertions
      const before = out.doc.content.size;
      try {
        out.replace(c.fromB, c.fromB, marked);
      } catch {
        continue;
      }
      const added = out.doc.content.size - before;
      if (caret != null) {
        if (caret > c.fromB) caret += added;
        else if (caret === c.fromB && dir !== 'back') caret += added;
      }
    }
  }
  if (caret != null) {
    const pos = Math.max(0, Math.min(caret, out.doc.content.size));
    try { out.setSelection(TextSelection.near(out.doc.resolve(pos), dir === 'back' ? -1 : 1)); } catch { /* keep mapped selection */ }
  }
  out.setMeta('tracked', true);
  return out;
}

export interface ChangeInfo { kind: 'insertion' | 'deletion' | 'format'; id: string; author: string; date: number; from: number; to: number; text: string }

/** List tracked changes in document order, merging adjacent ranges with the same id/kind. */
export function listChanges(doc: PMNode): ChangeInfo[] {
  const out: ChangeInfo[] = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    for (const m of node.marks) {
      const kind = m.type === schema.marks.insertion ? 'insertion' : m.type === schema.marks.deletion ? 'deletion' : m.type === schema.marks.formatChange ? 'format' : null;
      if (!kind) continue;
      const last = out[out.length - 1];
      const text = node.isText ? node.text! : node.type.name === 'image' ? '[image]' : `[${node.type.name}]`;
      if (last && last.kind === kind && last.id === m.attrs.id && last.to === pos) {
        last.to = pos + node.nodeSize;
        last.text += text;
      } else {
        out.push({ kind, id: m.attrs.id, author: m.attrs.author, date: m.attrs.date, from: pos, to: pos + node.nodeSize, text });
      }
    }
    return false;
  });
  return out;
}

/** Accept or reject the given changes. Returns a transaction (untracked). */
export function resolveChanges(state: EditorState, changes: ChangeInfo[], accept: boolean): Transaction {
  const tr = state.tr;
  tr.setMeta('trackSkip', true);
  const sorted = [...changes].sort((a, b) => b.from - a.from);
  for (const c of sorted) {
    const from = tr.mapping.map(c.from), to = tr.mapping.map(c.to);
    if (c.kind === 'format') { tr.removeMark(from, to, schema.marks.formatChange); continue; }
    const removeText = (c.kind === 'insertion') !== accept; // reject insertion or accept deletion
    if (removeText) tr.delete(from, to);
    else tr.removeMark(from, to, c.kind === 'insertion' ? schema.marks.insertion : schema.marks.deletion);
  }
  return tr;
}

export function changesInRange(doc: PMNode, from: number, to: number): ChangeInfo[] {
  return listChanges(doc).filter((c) => c.to > from && c.from < to || (from === to && c.from <= from && c.to >= to));
}
