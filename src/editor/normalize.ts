/** Structural normalization applied to every document entering or leaving the editor. */
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { fixTables } from 'prosemirror-tables';

/**
 * Make every table rectangular (fill short rows, resolve overlapping spans). Imported tables
 * with w:gridBefore/w:gridAfter or ragged rows otherwise leave holes in the TableMap, which
 * exporters would resolve to the wrong node.
 */
export function normalizeTables(doc: PMNode): PMNode {
  let has = false;
  doc.descendants((n) => {
    if (has) return false;
    if (n.type.spec.tableRole === 'table') has = true;
    return !has;
  });
  if (!has) return doc;
  try {
    const tr = fixTables(EditorState.create({ doc }));
    return tr ? tr.doc : doc;
  } catch {
    return doc;
  }
}
