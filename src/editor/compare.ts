/** Legal-blackline style document comparison producing tracked changes. */
import type { Node as PMNode, Mark } from 'prosemirror-model';
import { schema } from './schema';

function lcsTable<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Uint32Array[] {
  const t: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  return t;
}

type Op<T> = { op: 'eq' | 'del' | 'ins'; a?: T; b?: T };
export function diff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Op<T>[] {
  // Trim common prefix/suffix to keep the table small.
  let pre = 0;
  while (pre < a.length && pre < b.length && eq(a[pre], b[pre])) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && eq(a[a.length - 1 - suf], b[b.length - 1 - suf])) suf++;
  const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
  const out: Op<T>[] = a.slice(0, pre).map((x, i) => ({ op: 'eq', a: x, b: b[i] }));
  if (am.length * bm.length > 9_000_000) {
    for (const x of am) out.push({ op: 'del', a: x });
    for (const y of bm) out.push({ op: 'ins', b: y });
  } else {
    const t = lcsTable(am, bm, eq);
    let i = 0, j = 0;
    while (i < am.length && j < bm.length) {
      if (eq(am[i], bm[j])) { out.push({ op: 'eq', a: am[i], b: bm[j] }); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) out.push({ op: 'del', a: am[i++] });
      else out.push({ op: 'ins', b: bm[j++] });
    }
    while (i < am.length) out.push({ op: 'del', a: am[i++] });
    while (j < bm.length) out.push({ op: 'ins', b: bm[j++] });
  }
  for (let k = 0; k < suf; k++) out.push({ op: 'eq', a: a[a.length - suf + k], b: b[b.length - suf + k] });
  return out;
}

function tokens(node: PMNode): { text: string; marks: readonly Mark[] }[] {
  const out: { text: string; marks: readonly Mark[] }[] = [];
  node.forEach((c) => {
    if (c.isText) for (const t of c.text!.match(/\s+|[\p{L}\p{N}'’]+|[^\s\p{L}\p{N}]/gu) || []) out.push({ text: t, marks: c.marks });
    else out.push({ text: '￼', marks: c.marks });
  });
  return out;
}

/** Compare two documents; returns the revised document with insertions and deletions marked. */
export function compareDocs(original: PMNode, revised: PMNode, author: string): PMNode {
  const date = Date.now();
  const ins = schema.marks.insertion.create({ author, date, id: 'cmp-i' });
  const del = schema.marks.deletion.create({ author, date, id: 'cmp-d' });
  const A: PMNode[] = []; original.forEach((n) => A.push(n));
  const B: PMNode[] = []; revised.forEach((n) => B.push(n));
  const ops = diff(A, B, (x, y) => x.eq(y) || (x.isTextblock && y.isTextblock && x.textContent === y.textContent && x.attrs.style === y.attrs.style));
  const out: PMNode[] = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o.op === 'eq') { out.push(o.b!); continue; }
    // Pair a deleted paragraph with a following inserted paragraph for a word-level diff.
    if (o.op === 'del' && ops[k + 1]?.op === 'ins' && o.a!.isTextblock && ops[k + 1].b!.isTextblock) {
      const a = o.a!, b = ops[k + 1].b!;
      const ta = tokens(a), tb = tokens(b);
      const wops = diff(ta, tb, (x, y) => x.text === y.text);
      const content: PMNode[] = [];
      for (const w of wops) {
        const t = w.op === 'del' ? w.a! : w.b!;
        if (t.text === '￼') continue;
        const marks = w.op === 'eq' ? t.marks : w.op === 'del' ? del.addToSet(t.marks) : ins.addToSet(t.marks);
        const last = content[content.length - 1];
        if (last && last.isText && last.marks.length === marks.length && last.marks.every((m, i) => m.eq(marks[i]))) content[content.length - 1] = schema.text(last.text! + t.text, marks);
        else content.push(schema.text(t.text, marks));
      }
      out.push(b.type.create(b.attrs, content));
      k++;
      continue;
    }
    if (o.op === 'del') { out.push(o.a!.isTextblock ? markText(o.a!, del) : o.a!); continue; }
    out.push(o.b!.isTextblock ? markText(o.b!, ins) : markText(o.b!, ins));
  }
  return schema.node('doc', revised.attrs, out.length ? out : [schema.nodes.paragraph.create()]);
}

function markText(node: PMNode, mark: Mark): PMNode {
  if (node.isTextblock) {
    const kids: PMNode[] = [];
    node.forEach((c) => kids.push(c.mark(mark.addToSet(c.marks))));
    return node.type.create(node.attrs, kids, node.marks);
  }
  if (node.isLeaf) return node;
  const kids: PMNode[] = [];
  node.forEach((c) => kids.push(markText(c, mark)));
  return node.type.create(node.attrs, kids, node.marks);
}
