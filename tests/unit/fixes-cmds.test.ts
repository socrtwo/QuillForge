import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';

vi.mock('../../src/ui/dialog', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/ui/dialog')>();
  return { ...orig, toast: vi.fn(), promptDialog: vi.fn(), confirmDialog: vi.fn(), openDialog: vi.fn() };
});

import '../../src/commands';
import { getCommand } from '../../src/commands/registry';
import { schema } from '../../src/editor/schema';
import { normalizeSettings } from '../../src/editor/settings';
import { replaceAll } from '../../src/commands/edit';
import { macroApi, validMacros } from '../../src/commands/developer';
import { sha } from '../../src/commands/review';
import { parseCsv, toCsv, mergeInto } from '../../src/commands/mailings';
import { parseBibtex, generateBlock } from '../../src/commands/references';
import * as dialog from '../../src/ui/dialog';

const N = schema.nodes;
const M = schema.marks;
const t = (s: string, marks?: any[]) => schema.text(s, marks);
const P = (...c: (PMNode | string)[]) => N.paragraph.create(null, c.map((x) => (typeof x === 'string' ? t(x) : x)));
const doc = (...blocks: PMNode[]) => schema.node('doc', null, blocks);
const toast = dialog.toast as unknown as ReturnType<typeof vi.fn>;
const promptDialog = dialog.promptDialog as unknown as ReturnType<typeof vi.fn>;
const confirmDialog = dialog.confirmDialog as unknown as ReturnType<typeof vi.fn>;
const openDialog = dialog.openDialog as unknown as ReturnType<typeof vi.fn>;

function mockApp(d: PMNode) {
  const view: any = { state: EditorState.create({ doc: d }), editable: true, dispatch(tr: any) { view.state = view.state.apply(tr); }, setProps() {} };
  const app: any = {
    view, get state() { return view.state; }, get settings() { return normalizeSettings(view.state.doc.attrs.settings); },
    tab: { viewMode: 'web', el: document.createElement('div'), readOnly: false }, prefs: { macros: [], author: 'Tester', qat: [], keymap: {} },
    updateSettings(fn: any) { const c = JSON.parse(JSON.stringify(app.settings)); fn(c); view.dispatch(view.state.tr.setDocAttribute('settings', c)); },
    updateFields() {}, refresh() {}, savePrefs() {}, ui: { status() {}, rebuild() {} },
    exec: (id: string, arg?: any) => getCommand(id)!.run(app, arg),
    selectPos(pos: number) { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))); },
  };
  return app;
}
const run = (app: any, id: string, arg?: any) => getCommand(id)!.run(app, arg);
const leaf = (n: PMNode) => `[${n.type.name}]`;
const text = (app: any) => app.state.doc.textBetween(0, app.state.doc.content.size, '|', leaf);
const withSettings = (s: any, ...blocks: PMNode[]) => schema.node('doc', { settings: normalizeSettings(s) }, blocks);

beforeEach(() => { toast.mockReset(); promptDialog.mockReset(); confirmDialog.mockReset(); openDialog.mockReset(); });

describe('replace all (regex / wildcards)', () => {
  const rep = (d: PMNode, o: any) => { const app = mockApp(d); const n = replaceAll(app, o); return { n, text: text(app) }; };
  it('keeps lookaround and \\B context', () => {
    expect(rep(doc(P('foobar foobaz')), { find: 'foo(?=bar)', replace: 'X', regex: true })).toEqual({ n: 1, text: 'Xbar foobaz' });
    expect(rep(doc(P('ab cb')), { find: '(?<=a)b', replace: 'X', regex: true })).toEqual({ n: 1, text: 'aX cb' });
    expect(rep(doc(P('foo')), { find: '\\Boo', replace: 'X', regex: true })).toEqual({ n: 1, text: 'fX' });
    expect(rep(doc(P('abc abd')), { find: '(ab)(?=c)', replace: '[\\1]', regex: true }).text).toBe('[ab]c abd');
  });
  it('skips matches spanning inline objects', () => {
    const r = rep(doc(P('x', N.image.create({ src: 'a.png' }), 'y')), { find: 'x.y', replace: '$&!', regex: true });
    expect(r).toEqual({ n: 0, text: 'x[image]y' });
    expect(String(toast.mock.calls.at(-1)?.[0])).toContain('1 skipped');
  });
  it('keeps line breaks inside regex matches and does not expand $ patterns in found text', () => {
    expect(rep(doc(P('a', N.hard_break.create(), 'b')), { find: 'a\\nb', replace: '[$&]', regex: true }).text).toBe('[a[hard_break]b]');
    expect(rep(doc(P('cost $& now')), { find: '$&', replace: '<^&>' }).text).toBe('cost <$&> now');
    expect(rep(doc(P("it's $' x")), { find: "$'", replace: '(^&)' }).text).toBe("it's ($') x");
  });
});

describe('protection', () => {
  const tracked = () => P('a', t('new', [M.insertion.create({ author: 'A', id: 'i1' })]));
  it('Accept/Reject refuse while the document is protected', () => {
    for (const mode of ['comments', 'tracked', 'forms', 'readonly']) {
      const app = mockApp(withSettings({ protection: { mode } }, tracked()));
      run(app, 'review.acceptAll');
      run(app, 'review.reject', 'all');
      expect(text(app)).toBe('anew');
      expect(app.state.doc.firstChild!.lastChild!.marks.length, mode).toBe(1);
    }
    const app = mockApp(withSettings({}, tracked()));
    run(app, 'review.acceptAll');
    expect(app.state.doc.firstChild!.lastChild!.marks.length).toBe(0);
  });
  it('Document Inspector refuses while protected or marked final', async () => {
    for (const s of [{ protection: { mode: 'readonly' } }, { markedFinal: true }]) {
      const app = mockApp(withSettings(s, tracked()));
      await run(app, 'file.inspect');
      expect(openDialog).not.toHaveBeenCalled();
    }
  });
  it('Protect for Form Filling needs the password and keeps the hash', async () => {
    const hash = await sha('pw');
    const app = mockApp(withSettings({ protection: { mode: 'readonly', hash } }, P('x')));
    promptDialog.mockResolvedValueOnce('wrong');
    await run(app, 'dev.fillForms');
    expect(app.settings.protection).toEqual({ mode: 'readonly', hash });
    promptDialog.mockResolvedValueOnce('pw');
    await run(app, 'dev.fillForms');
    expect(app.settings.protection).toEqual({ mode: 'forms', hash });
    promptDialog.mockResolvedValueOnce(null);
    await run(app, 'dev.fillForms');
    expect(app.settings.protection.mode).toBe('forms');
    // Unprotected documents toggle without a prompt.
    const app2 = mockApp(withSettings({}, P('x')));
    await run(app2, 'dev.fillForms');
    expect(app2.settings.protection.mode).toBe('forms');
    expect(promptDialog).toHaveBeenCalledTimes(3);
  });
});

describe('tools', () => {
  it('AutoFormat Now handles several # headings', () => {
    const app = mockApp(doc(P('# One'), P('## Two'), P('### Three')));
    run(app, 'tools.autoFormatNow');
    const out: string[] = [];
    app.state.doc.forEach((n: PMNode) => out.push(`${n.attrs.style}:${n.textContent}`));
    expect(out).toEqual(['Heading 1:One', 'Heading 2:Two', 'Heading 3:Three']);
  });
  it('Join Broken Lines treats manual line breaks as line ends', async () => {
    openDialog.mockResolvedValueOnce({ dehyph: true, keepIndent: true, shortLine: 0 });
    const app = mockApp(doc(P('first line of', N.hard_break.create(), 'the sen-', N.hard_break.create(), 'tence.')));
    await run(app, 'tools.unwrapLines');
    expect(text(app)).toBe('first line of the sentence.');
  });
});

describe('links, lists, covers', () => {
  it('Remove Link with a collapsed cursor removes the whole link', () => {
    const link = M.link.create({ href: 'http://x' });
    for (const pos of [3, 5, 7]) { // start, middle, end of "LINK"
      const app = mockApp(doc(P('ab', t('LINK', [link]), 'cd', t('OTHER', [M.link.create({ href: 'http://y' })]))));
      app.view.dispatch(app.state.tr.setSelection(TextSelection.create(app.state.doc, pos)));
      run(app, 'insert.removeLink');
      const linked: string[] = [];
      app.state.doc.descendants((n: PMNode) => { if (n.isText && M.link.isInSet(n.marks)) linked.push(n.text!); return true; });
      expect(linked, String(pos)).toEqual(['OTHER']);
    }
  });
  it('Continue Numbering ignores nested sublists', () => {
    const LI = (...c: PMNode[]) => N.list_item.create(null, c);
    const listA = N.ordered_list.create({ order: 1 }, [LI(P('a1')), LI(P('a2')), LI(P('a3'), N.ordered_list.create({ order: 1 }, [LI(P('s1')), LI(P('s2'))]))]);
    const app = mockApp(doc(listA, P('between'), N.ordered_list.create({ order: 1 }, [LI(P('b1'))])));
    let pos = -1; app.state.doc.descendants((n: PMNode, p: number) => { if (n.isText && n.text === 'b1') pos = p; return true; });
    app.view.dispatch(app.state.tr.setSelection(TextSelection.create(app.state.doc, pos)));
    run(app, 'list.continue');
    expect(app.state.doc.lastChild!.attrs.order).toBe(4);
  });
  it('Remove Cover Page only removes a real cover without asking', async () => {
    const plain = mockApp(doc(P('body')));
    await run(plain, 'insert.removeCover');
    expect(text(plain)).toBe('body');
    expect(toast).toHaveBeenCalledWith('No cover page.');

    const unmarked = mockApp(doc(P('one'), P('two'), N.page_break.create(), P('body')));
    confirmDialog.mockResolvedValueOnce(false);
    await run(unmarked, 'insert.removeCover');
    expect(String(confirmDialog.mock.calls[0][1])).toContain('2 paragraph');
    expect(unmarked.state.doc.childCount).toBe(4);

    const covered = mockApp(doc(P('body')));
    run(covered, 'insert.coverPage', 'classic');
    expect(covered.state.doc.childCount).toBeGreaterThan(2);
    await run(covered, 'insert.removeCover');
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(text(covered)).toBe('body');
  });
});

describe('mail merge', () => {
  const F = (arg: string) => N.field.create({ type: 'MERGEFIELD', arg });
  it('keeps containers valid when every paragraph is dropped', () => {
    const cell = doc(N.table.create(null, [N.table_row.create(null, [N.table_cell.create(null, [P(F('A2'))]), N.table_cell.create(null, [P('x')])])]), P('end'));
    expect(() => schema.node('doc', null, mergeInto(cell, { A2: '' }, 0)).check()).not.toThrow();
    const list = doc(N.bullet_list.create(null, [N.list_item.create(null, [P(F('A2'))])]));
    expect(() => schema.node('doc', null, mergeInto(list, {}, 0)).check()).not.toThrow();
    const only = schema.node('doc', null, mergeInto(doc(P(F('A2'))), {}, 0));
    expect(only.childCount).toBe(1);
    expect(() => only.check()).not.toThrow();
  });
  it('turns multi-line values into line breaks', () => {
    const out = schema.node('doc', null, mergeInto(doc(P('To: ', F('Addr'))), { Addr: '1 Main\r\nApt 2' }, 0));
    expect(out.textBetween(0, out.content.size, '|', leaf)).toBe('To: 1 Main[hard_break]Apt 2');
    expect(out.textContent).not.toContain('\n');
  });
  it('parses CSV with a BOM, quoted delimiters and CR round trips', () => {
    expect(parseCsv('﻿"First Name","Email"\r\n"Ann","a@x"\r\n')[0]).toEqual(['First Name', 'Email']);
    expect(parseCsv('"Last, First"\tEmail\nSmith, J\tj@x')).toEqual([['Last, First', 'Email'], ['Smith, J', 'j@x']]);
    expect(parseCsv(toCsv(['A', 'B'], [['x\ry', 'z']]))).toEqual([['A', 'B'], ['x\ry', 'z']]);
  });
});

describe('references', () => {
  const p = (s: string) => parseBibtex(s).map((x) => ({ id: x.id, title: x.title, year: x.year, author: x.author, publisher: x.publisher }));
  it('parses awkward BibTeX', () => {
    expect(p('@article{a1, author={Smith, J}, title={First}, year=2001}\n@book{b2, title={Second}, year=2002}\n').map((x) => x.id)).toEqual(['a1', 'b2']);
    expect(p('@string{acm = "ACM Press"}\n\n@book{k1,\n  title = {T1},\n  publisher = acm # " NY",\n  year = 2000\n}\n')).toEqual([{ id: 'k1', title: 'T1', year: '2000', author: '', publisher: 'ACM Press NY' }]);
    expect(p('@comment{jabref-meta: x;}\n@preamble{"\\newcommand{\\noop}[1]{}"}\n@book{k2,\n  title={X},\n  year={1999}\n}\n').map((x) => x.id)).toEqual(['k2']);
    const [k3] = p('@article{k3,\n  title = {The {{RNA}} {W}orld {\\"{u}}ber},\n  author = {M{\\"u}ller, Hans and Doe, Jane},\n  year = {2010}\n}\n');
    expect(k3).toMatchObject({ title: 'The RNA World über', author: 'Müller, Hans; Doe, Jane', year: '2010' });
    expect(p('@book{k4,\n  title={A},\n  }\n@book{k5,\n  title={B}\n}\n').map((x) => x.title)).toEqual(['A', 'B']);
    expect(p('@misc{k6,\n  note = {see title = {Bogus}},\n  title = "Real {Title}"\n}\n')[0].title).toBe('Real Title');
  });
  it('numbers uncited sources after cited ones in numeric styles', () => {
    const s = { citationStyle: 'IEEE', sources: [{ id: 'a', type: 'Book', title: 'A', author: 'X, Y' }, { id: 'b', type: 'Book', title: 'B', author: 'Z, W' }, { id: 'c', type: 'Book', title: 'C', author: 'Q, R' }] };
    const html = generateBlock(mockApp(withSettings(s, P('x', N.citation.create({ sources: 'b' })))), 'bibliography', { all: true });
    const nums = [...html.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
    expect(nums).toEqual(['1', '2', '3']);
    expect(html.indexOf('<i>B</i>')).toBeLessThan(html.indexOf('<i>A</i>'));
    expect(html).not.toContain('[0]');
  });
  it('caption cross-references link to an anchor Go to Anchor resolves', async () => {
    const cap = N.paragraph.create({ style: 'Caption' }, [t('Figure '), N.field.create({ type: 'SEQ', arg: 'Figure', value: '#' }), t(': A cat')]);
    const app = mockApp(doc(P('see '), cap, P('end')));
    app.view.dispatch(app.state.tr.setSelection(TextSelection.create(app.state.doc, 5)));
    openDialog.mockResolvedValueOnce({ type: 'Caption', what: 'text', target: 'c0', link: true });
    await run(app, 'refs.crossReference');
    let href = '';
    app.state.doc.descendants((n: PMNode) => { const m = M.link.isInSet(n.marks); if (m) href = m.attrs.href; return true; });
    expect(href.startsWith('#')).toBe(true);
    app.selectPos(1);
    run(app, 'nav.gotoAnchor', href.slice(1));
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(app.state.selection.$from.parent.attrs.style).toBe('Caption');
  });
});

describe('macros', () => {
  it('setStyle ignores an out-of-range index', () => {
    const app = mockApp(doc(P('first'), P('second')));
    macroApi(app).setStyle(99, 'Heading 1');
    expect(app.state.doc.firstChild!.attrs.style).toBe('Normal');
    macroApi(app).setStyle(1, 'Heading 1');
    expect(app.state.doc.lastChild!.attrs.style).toBe('Heading 1');
  });
  it('imported macro lists keep only well-formed entries', () => {
    const list = validMacros([{ name: 'ok', steps: [{ id: 'fmt.bold' }] }, { name: 'bad' }, { name: 3, steps: [] }, null, { name: 'bad2', steps: [null] }, 'x']);
    expect(list.map((m) => m.name)).toEqual(['ok']);
    expect(typeof list[0].created).toBe('number');
    expect(() => validMacros({ name: 'x' })).toThrow();
  });
});
