import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import '../../src/commands';
import { allCommands, getCommand } from '../../src/commands/registry';
import { DEFAULT_TABS } from '../../src/ui/ribbonLayout';
import { canonicalKey } from '../../src/editor/setup';
import { schema } from '../../src/editor/schema';
import { trackPlugin, trackKey, trackTransaction, listChanges, resolveChanges } from '../../src/editor/plugins/trackChanges';
import { compareDocs } from '../../src/editor/compare';
import { evalFormula, formatDate, formatNumberPicture, computeFields, expandTokens } from '../../src/editor/fields';
import { transformCase } from '../../src/editor/ops';
import { parseCsv, mergeInto } from '../../src/commands/mailings';
import { defaultSettings, normalizeSettings } from '../../src/editor/settings';
import { stylesCss, resolveStyles, effectiveStyle } from '../../src/editor/styles';
import { parseBibtex, formatBibEntry, formatInText } from '../../src/commands/references';
import { TEMPLATES } from '../../src/templates';
import { diagramSvg, chartSvg, shapeSvg, SHAPES, DIAGRAMS, CHARTS } from '../../src/editor/graphics';

const P = (t: string) => schema.nodes.paragraph.create(null, t ? schema.text(t) : null);

describe('command registry', () => {
  const cmds = allCommands();
  it('has a large library of commands', () => {
    expect(cmds.length).toBeGreaterThan(650);
  });
  it('has unique ids and complete metadata', () => {
    const ids = new Set<string>();
    for (const c of cmds) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      expect(c.label, c.id).toBeTruthy();
      expect(c.tab, c.id).toBeTruthy();
      expect(typeof c.run, c.id).toBe('function');
    }
  });
  it('has no conflicting default keyboard shortcuts', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const c of cmds) for (const k of c.keys || []) {
      const ck = canonicalKey(k);
      if (seen.has(ck)) conflicts.push(`${ck}: ${seen.get(ck)} vs ${c.id}`);
      seen.set(ck, c.id);
    }
    expect(conflicts).toEqual([]);
  });
  it('ribbon tabs reference only existing commands', () => {
    const missing: string[] = [];
    for (const t of DEFAULT_TABS) for (const g of t.groups) for (const id of g.items) if (!getCommand(id)) missing.push(`${t.id}/${g.id}/${id}`);
    expect(missing).toEqual([]);
  });
  it('menu entries reference existing commands', () => {
    const missing: string[] = [];
    // Menus needing app state are skipped; static menus are checked.
    for (const c of cmds) {
      if (!c.menu) continue;
      let entries: any[] = [];
      try { entries = c.menu({ settings: normalizeSettings({}), prefs: { recent: [], snippets: [], macros: [], qat: [] }, state: undefined, tab: {} } as any); } catch { continue; }
      const walk = (list: any[]) => { for (const e of list) { if (e.id && !getCommand(e.id) && !e.id.startsWith('__') && e.id !== 'x') missing.push(`${c.id} -> ${e.id}`); if (e.submenu) walk(e.submenu); } };
      walk(entries);
    }
    expect(missing).toEqual([]);
  });
});

describe('track changes', () => {
  const mk = (text: string) => EditorState.create({ doc: schema.node('doc', { settings: defaultSettings() }, [P(text)]), plugins: [trackPlugin({ enabled: true, author: 'Tester' })] });
  it('marks insertions', () => {
    const s = mk('Hello world');
    const tr = s.tr.insertText(' big', 6);
    const t = trackTransaction(tr, s);
    const next = s.apply(t);
    const ch = listChanges(next.doc);
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe('insertion');
    expect(ch[0].text).toBe(' big');
    expect(ch[0].author).toBe('Tester');
  });
  it('keeps deleted text as a deletion', () => {
    const s = mk('Hello world');
    const t = trackTransaction(s.tr.delete(7, 12), s);
    const next = s.apply(t);
    expect(next.doc.textContent).toBe('Hello world');
    const ch = listChanges(next.doc);
    expect(ch[0].kind).toBe('deletion');
    expect(ch[0].text).toBe('world');
    // accept deletion removes the text
    const acc = next.apply(resolveChanges(next, ch, true));
    expect(acc.doc.textContent).toBe('Hello ');
    // reject keeps it unmarked
    const rej = next.apply(resolveChanges(next, ch, false));
    expect(rej.doc.textContent).toBe('Hello world');
    expect(listChanges(rej.doc)).toHaveLength(0);
  });
  it('withdraws own insertions when deleted', () => {
    let s = mk('ab');
    s = s.apply(trackTransaction(s.tr.insertText('XYZ', 2), s));
    s = s.apply(trackTransaction(s.tr.delete(2, 5), s));
    expect(s.doc.textContent).toBe('ab');
    expect(listChanges(s.doc)).toHaveLength(0);
  });
  it('does nothing when tracking is off', () => {
    const s = EditorState.create({ doc: schema.node('doc', null, [P('abc')]), plugins: [trackPlugin({ enabled: false })] });
    const tr = s.tr.delete(1, 2);
    expect(trackTransaction(tr, s)).toBe(tr);
    expect(trackKey.getState(s)!.enabled).toBe(false);
  });
});

describe('compare documents', () => {
  it('produces word-level insertions and deletions', () => {
    const a = schema.node('doc', null, [P('The quick brown fox'), P('Unchanged line')]);
    const b = schema.node('doc', null, [P('The slow brown fox jumps'), P('Unchanged line')]);
    const out = compareDocs(a, b, 'Cmp');
    const ch = listChanges(out);
    expect(ch.some((c) => c.kind === 'deletion' && c.text.includes('quick'))).toBe(true);
    expect(ch.some((c) => c.kind === 'insertion' && c.text.includes('slow'))).toBe(true);
    expect(ch.some((c) => c.kind === 'insertion' && c.text.includes('jumps'))).toBe(true);
    expect(out.child(1).textContent).toBe('Unchanged line');
  });
});

describe('fields', () => {
  it('evaluates formulas safely', () => {
    expect(evalFormula('2*(3+4)')).toBe(14);
    expect(evalFormula('SUM(1,2,3)/2')).toBe(3);
    expect(evalFormula('ROUND(2.345,2)')).toBe(2.35);
    expect(evalFormula('50%')).toBe(0.5);
    expect(() => evalFormula('alert(1)')).toThrow();
  });
  it('formats dates and numbers', () => {
    const d = new Date(2024, 0, 5, 14, 7);
    expect(formatDate(d, 'MMMM d, yyyy')).toBe('January 5, 2024');
    expect(formatDate(d, 'yyyy-MM-dd')).toBe('2024-01-05');
    expect(formatDate(d, 'h:mm am/pm')).toBe('2:07 pm');
    expect(formatNumberPicture(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(formatNumberPicture(0.25, '0%')).toBe('25%');
  });
  it('numbers SEQ fields and expands header tokens', () => {
    const f = (arg: string) => schema.nodes.field.create({ type: 'SEQ', arg });
    const doc = schema.node('doc', { settings: defaultSettings() }, [
      schema.nodes.paragraph.create(null, [schema.text('Figure '), f('Figure')]),
      schema.nodes.paragraph.create(null, [schema.text('Table '), f('Table')]),
      schema.nodes.paragraph.create(null, [schema.text('Figure '), f('Figure')]),
    ]);
    const vals = computeFields({ settings: defaultSettings(), fileName: 'x.docx', userName: 'U', userInitials: 'U', pageOf: () => 1, pages: 1, doc });
    expect(vals.map((v) => v.value)).toEqual(['1', '1', '2']);
    const s = defaultSettings();
    expect(expandTokens('Page {PAGE} of {NUMPAGES}', { page: 2, pages: 9, settings: s, fileName: 'f', userName: 'u' })).toBe('Page 2 of 9');
  });
});

describe('text utilities', () => {
  it('changes case', () => {
    expect(transformCase('the lord of the rings', 'title')).toBe('The Lord of the Rings');
    expect(transformCase('HELLO world. again', 'sentence')).toBe('Hello world. Again');
    expect(transformCase('aBc', 'toggle')).toBe('AbC');
  });
});

describe('mail merge', () => {
  it('parses CSV with quotes and merges records', () => {
    const rows = parseCsv('First,Last,City\n"Ann","O""Neil","Paris, TX"\nBob,Smith,\n');
    expect(rows).toEqual([['First', 'Last', 'City'], ['Ann', 'O"Neil', 'Paris, TX'], ['Bob', 'Smith', '']]);
    const F = (n: string) => schema.nodes.field.create({ type: 'MERGEFIELD', arg: n });
    const doc = schema.node('doc', null, [schema.nodes.paragraph.create(null, [schema.text('Dear '), F('First'), schema.text(' '), F('Last')]), schema.nodes.paragraph.create(null, [F('City')])]);
    const out = mergeInto(doc, { First: 'Bob', Last: 'Smith', City: '' }, 1);
    expect(out.childCount).toBe(1); // empty address line suppressed
    expect(out.child(0).textContent).toBe('Dear Bob Smith');
  });
});

describe('styles and settings', () => {
  it('resolves basedOn chains and builds CSS', () => {
    const s = defaultSettings();
    const map = resolveStyles(s);
    expect(effectiveStyle(map, 'Heading 2').keepNext).toBe(true);
    s.styleSet = 'Manuscript';
    expect(effectiveStyle(resolveStyles(s), 'Normal').lineHeight).toBe('2');
    const css = stylesCss(s);
    expect(css).toContain('[data-style="Heading 1"]');
  });
  it('normalizes partial settings', () => {
    const s = normalizeSettings({ page: { margin: { top: 10 } } } as any);
    expect(s.page.margin.top).toBe(10);
    expect(s.page.margin.left).toBe(72);
    expect(s.header).toEqual({ left: '', center: '', right: '' });
  });
});

describe('references', () => {
  it('parses BibTeX and formats citations', () => {
    const [src] = parseBibtex(`@book{knuth1984,\n  author = {Knuth, Donald E.},\n  title = {The TeXbook},\n  year = {1984},\n  publisher = {Addison-Wesley}\n}`);
    expect(src.author).toContain('Knuth');
    expect(formatBibEntry(src, 'APA')).toContain('(1984)');
    expect(formatInText([src], 'APA', null, () => 1)).toBe('(Knuth, 1984)');
    expect(formatInText([src], 'IEEE', null, () => 3)).toBe('[3]');
  });
});

describe('templates and graphics', () => {
  it('builds every template as a valid document', () => {
    for (const t of TEMPLATES) {
      const d = t.build('Test Author');
      expect(() => d.check(), t.id).not.toThrow();
    }
  });
  it('renders all shapes, diagrams and charts as SVG', () => {
    for (const s of SHAPES) expect(shapeSvg({ kind: s.kind, fill: '#f00', stroke: '#000', strokeWidth: 1, text: 'x', textColor: '#fff', w: 100, h: 80 })).toMatch(/^<svg/);
    for (const d of DIAGRAMS) expect(diagramSvg({ kind: d.kind, items: ['A', '-B', 'C'], colors: ['#111', '#222'], w: 300, h: 200 })).toMatch(/^<svg/);
    for (const c of CHARTS) expect(chartSvg({ kind: c.kind, title: 'T', categories: ['a', 'b'], series: [{ name: 's', values: [1, 2] }], w: 300, h: 200, legend: true, labels: true })).toMatch(/^<svg/);
  });
});

void TextSelection;
