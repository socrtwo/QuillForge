/**
 * @vitest-environment-options { "url": "https://quillforge.test/" }
 */
// Regression tests for the core review findings (editor, AI, platform bridge, Android config).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { DOMParser as PMDOMParser, DOMSerializer, type Node as PMNode } from 'prosemirror-model';
import { Capacitor } from '@capacitor/core';

vi.mock('../../src/ai/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/ai/client')>();
  return { ...real, chat: vi.fn(real.chat) };
});

import { schema } from '../../src/editor/schema';
import { chartSvg, shapeSvg, diagramSvg, parseChartCsv, chartToCsv } from '../../src/editor/graphics';
import { stylesCss, cssValue } from '../../src/editor/styles';
import { normalizeSettings } from '../../src/editor/settings';
import { compareDocs } from '../../src/editor/compare';
import { buildNodeViews } from '../../src/editor/nodeviews';
import { trackKey, listChanges, resolveChanges } from '../../src/editor/plugins/trackChanges';
import { replaceRange, insertBelow, insertAtCursor, addComments, diffText, rangeText, anchorBelow, anchorSelection } from '../../src/ai/apply';
import { chat, AiError, type ChatRequest, type ChatResult } from '../../src/ai/client';
import { reloadAiSettings, setApiKey } from '../../src/ai/store';
import { isOurCallback, handleOAuthRedirect } from '../../src/ai/oauth';
import { providerById } from '../../src/ai/providers';
import { featureById } from '../../src/ai/features';
import { saveAs, writeBack } from '../../src/platform/native';
import { trackedEdit } from '../../src/commands/ai';
import { importDocx } from '../../src/io/docx-import';
import { App, type DocTab } from '../../src/app';

const S = schema;
const P = (...c: (string | PMNode)[]) => S.nodes.paragraph.create(null, c.filter((x) => x !== '').map((x) => (typeof x === 'string' ? S.text(x) : x)));
const doc = (...blocks: PMNode[]) => S.node('doc', null, blocks);
const realChat = (await vi.importActual<typeof import('../../src/ai/client')>('../../src/ai/client')).chat;

/** App with a stub shell, enough to create tabs and dispatch (as in fixes-core.test.ts). */
function makeApp(): App {
  const app = new App(document.createElement('div'));
  const noop = () => {};
  app.ui = new Proxy({
    mountTab(tab: DocTab) {
      tab.el = document.createElement('div');
      tab.page = document.createElement('div');
      tab.mount = document.createElement('div');
      tab.page.appendChild(tab.mount);
      tab.el.appendChild(tab.page);
      document.body.appendChild(tab.el);
    },
  } as any, { get: (t, k) => (k in t ? t[k] : noop) });
  app.prefs.spellcheck = false;
  app.prefs.grammar = false;
  return app;
}

/** Text as it reads after accepting every change. */
const accepted = (n: PMNode) => { let s = ''; n.descendants((c) => { if (c.isText && !c.marks.some((m) => m.type === S.marks.deletion)) s += c.text; return true; }); return s; };
const describeInline = (n: PMNode) => { const out: string[] = []; n.forEach((c) => out.push(c.isText ? `${c.text}${c.marks.length ? '[' + c.marks.map((m) => m.type.name).join(',') + ']' : ''}` : `<${c.type.name}>`)); return out.join('|'); };

afterEach(() => {
  vi.mocked(chat).mockImplementation(realChat);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('1. editable graphics never inject markup', () => {
  it('a chart from an imported document cannot put elements into the edit preview', () => {
    const payload = { kind: 'column', title: 'Sales', categories: ['Q1'], series: [{ name: 'S1', values: [1] }], w: 300, h: 200, legend: true, labels: false, colors: ['"/><img src=x onerror="alert(1)"><rect fill="'] };
    const host = document.createElement('div');
    host.innerHTML = `<p><img src="data:image/png;base64,AAAA" data-edit-kind="chart" data-edit-data='${JSON.stringify(payload).replace(/'/g, '&#39;')}'></p>`;
    let attrs: any = null;
    PMDOMParser.fromSchema(S).parse(host).descendants((n) => { if (n.type === S.nodes.image) attrs = n.attrs; return true; });
    const d = JSON.parse(attrs.editData);
    // What editChart() previews when its dialog opens.
    const x = { kind: d.kind, title: d.title, csv: chartToCsv(d), legend: d.legend, labels: d.labels, w: d.w, h: d.h };
    const preview = document.createElement('div');
    preview.innerHTML = chartSvg({ ...d, ...x, ...parseChartCsv(x.csv) });
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.querySelector('[onerror]')).toBeNull();
    expect(preview.querySelectorAll('svg')).toHaveLength(1);
  });
  it('normalizes sizes and colors of shapes and diagrams too', () => {
    const evil = '1"><img src=x onerror=alert(1)><x a="';
    for (const svg of [
      shapeSvg({ kind: 'rect', fill: evil, stroke: evil, strokeWidth: evil as any, text: 'Hi', textColor: evil, w: evil as any, h: 50, fontSize: evil as any }),
      diagramSvg({ kind: 'process', items: ['A', 'B'], colors: [evil], w: evil as any, h: evil as any, textColor: evil }),
      chartSvg({ kind: 'pie', title: '', categories: [evil], series: [{ name: evil, values: [evil as any, 2] }], w: evil as any, h: 100, legend: true, labels: true, colors: [evil] }),
    ]) {
      const host = document.createElement('div');
      host.innerHTML = svg;
      expect(host.querySelector('img'), svg.slice(0, 80)).toBeNull();
    }
  });
});

describe('2. browser Save writes back to the right file', () => {
  it('keeps two same-named files in different folders apart, and reuses the id for the same file', async () => {
    const disk: Record<string, string> = {};
    let folder = 'A';
    const handle = (path: string) => ({
      name: path.split('/').pop(), path,
      isSameEntry: async (o: any) => o.path === path,
      createWritable: async () => { let buf = ''; return { write: async (b: Blob) => { buf += await b.text(); }, close: async () => { disk[path] = buf; } }; },
    });
    vi.stubGlobal('showSaveFilePicker', async ({ suggestedName }: any) => handle(`${folder}/${suggestedName}`));
    (window as any).showSaveFilePicker = (globalThis as any).showSaveFilePicker;
    folder = 'A'; const a = await saveAs(new Blob(['doc1 v1']), 'Report.docx');
    folder = 'B'; const b = await saveAs(new Blob(['doc2 v1']), 'Report.docx');
    expect(a!.uri).not.toBe(b!.uri);
    expect(await writeBack(a!.uri!, new Blob(['doc1 v2']))).toBe(true);
    expect(disk).toEqual({ 'A/Report.docx': 'doc1 v2', 'B/Report.docx': 'doc2 v1' });
    folder = 'A'; const again = await saveAs(new Blob(['doc1 v3']), 'Report.docx');
    expect(again!.uri).toBe(a!.uri);
    delete (window as any).showSaveFilePicker;
  });
});

/** chat() stand-in for Proofread: fixes "teh"/"recieve" in the text after the prompt. */
function fakeProofreader(onCall?: (n: number) => void, cut?: (text: string) => boolean) {
  let calls = 0;
  return async (req: ChatRequest): Promise<ChatResult> => {
    onCall?.(++calls);
    const text = String(req.messages[1].content).split('Return the full corrected text:\n\n')[1];
    const fixed = text.replace(/\bteh\b/g, 'the').replace(/\brecieve\b/g, 'receive');
    if (cut?.(text)) return { text: fixed.slice(0, Math.floor(fixed.length / 2)), model: 'm', provider: 'p', providerName: 'P', truncated: true };
    return { text: fixed, model: 'm', provider: 'p', providerName: 'P' };
  };
}
const filler = (n: number, seed: string) => (seed + ' lorem ipsum dolor sit amet. ').repeat(40).slice(0, n);

describe('3. Proofread applies every batch to the right paragraph', () => {
  const proofread = featureById('ai.proofread')!;
  it('corrects paragraphs after the first batch (the document grows with tracked changes)', async () => {
    const app = makeApp();
    const paras = Array.from({ length: 12 }, (_, i) => P(`Para ${i}: teh ` + filler(400, `p${i}`)));
    const tab = app.createTab(doc(...paras));
    vi.mocked(chat).mockImplementation(fakeProofreader());
    await trackedEdit(app, proofread, 'sys');
    const left: number[] = [];
    tab.view.state.doc.forEach((n, _o, i) => { if (/\bteh\b/.test(accepted(n))) left.push(i); });
    expect(left).toEqual([]);
  });
  it('never writes one paragraph\'s correction into another', async () => {
    const app = makeApp();
    const paras = [P('teh ' + filler(496, 'a')), P('recieve ' + filler(492, 'b'))];
    for (let i = 2; i < 7; i++) paras.push(P(filler(500, 'c' + i)));
    paras.push(P('teh cat.'), P('teh dog.'), P('teh owl.'));
    const tab = app.createTab(doc(...paras));
    vi.mocked(chat).mockImplementation(fakeProofreader());
    await trackedEdit(app, proofread, 'sys');
    const tail: string[] = [];
    tab.view.state.doc.forEach((n, _o, i) => { if (i >= 7) tail.push(accepted(n)); });
    expect(tail).toEqual(['the cat.', 'the dog.', 'the owl.']);
  });
  it('skips a paragraph the user edits while waiting, and keeps the other tab untouched', async () => {
    const app = makeApp();
    const paras = Array.from({ length: 10 }, (_, i) => P(`Para ${i}: teh ` + filler(400, `p${i}`)));
    const tab = app.createTab(doc(...paras));
    const other = app.createTab(doc(P('teh other document')));
    app.activate(tab);
    vi.mocked(chat).mockImplementation(fakeProofreader((n) => {
      if (n !== 2) return;
      // During the second request: the user types into paragraph 9 and switches documents.
      let pos = -1;
      tab.view.state.doc.forEach((node, off, i) => { if (i === 9) pos = off + 1; });
      tab.view.dispatch(tab.view.state.tr.insertText('USER ', pos));
      app.activate(other);
    }));
    await trackedEdit(app, proofread, 'sys');
    const texts: string[] = [];
    tab.view.state.doc.forEach((n) => texts.push(accepted(n)));
    expect(texts[9].startsWith('USER Para 9: teh ')).toBe(true);
    expect(texts.slice(0, 9).every((t) => !/\bteh\b/.test(t))).toBe(true);
    expect(other.view.state.doc.textContent).toBe('teh other document');
  });
});

describe('4/10. replacing a paragraph with AI text keeps what did not change', () => {
  it('an answer equal to the text changes nothing (formatting and footnotes stay)', async () => {
    const app = makeApp();
    const para = S.nodes.paragraph.create(null, [S.text('Hello', [S.marks.bold.create()]), S.nodes.footnote.create({ text: 'note', id: 'f1' }), S.text(' world.')]);
    const tab = app.createTab(doc(para));
    const before = tab.view.state.doc;
    const range = { from: 1, to: 1 + para.content.size };
    for (const track of [false, true]) {
      expect(await replaceRange(app, range, rangeText(before, range.from, range.to), { track, author: 'AI' })).toBe(false);
      expect(tab.view.state.doc.eq(before)).toBe(true);
    }
  });
  it('a change too large for a word diff is one edit that still keeps inline objects', async () => {
    const big = Array.from({ length: 2100 }, (_, i) => `w${i}`).join(' ');
    const edits = diffText(big, big.replace(/w(\d+)/g, 'v$1'));
    expect(edits).toHaveLength(1);
    const app = makeApp();
    const para = S.nodes.paragraph.create(null, [S.text('Start ', [S.marks.bold.create()]), S.nodes.footnote.create({ text: 'n', id: 'f' }), S.text(' ' + big)]);
    const tab = app.createTab(doc(para));
    await replaceRange(app, { from: 1, to: 1 + para.content.size }, 'Start  ' + big.replace(/w(\d+)/g, 'v$1'), { track: false, author: 'AI' });
    const p = tab.view.state.doc.firstChild!;
    let notes = 0; p.forEach((c) => { if (c.type === S.nodes.footnote) notes++; });
    expect(notes).toBe(1);
    expect(p.firstChild!.marks.some((m) => m.type === S.marks.bold)).toBe(true);
  });
  it('keeps line breaks (Shift+Enter) and turns new ones into line breaks', async () => {
    const app = makeApp();
    const para = S.nodes.paragraph.create(null, [S.text('12 Main Street'), S.nodes.hard_break.create(), S.text('Springfield')]);
    const tab = app.createTab(doc(para));
    await replaceRange(app, { from: 1, to: 1 + para.content.size }, '12 Main Street\nSpringfield, IL\nUSA', { track: false, author: 'AI' });
    expect(describeInline(tab.view.state.doc.firstChild!)).toBe('12 Main Street|<hard_break>|Springfield, IL|<hard_break>|USA');
  });
});

describe('5. untracked typing next to a tracked insertion stays untracked', () => {
  it('rejecting the insertion keeps text typed after it', () => {
    const app = makeApp();
    const ins = S.marks.insertion.create({ author: 'Alice', date: 1, id: 'cA' });
    const tab = app.createTab(doc(P('Intro ', S.text('added by Alice', [ins]))));
    const v = tab.view;
    for (const ch of ' and Bob') v.dispatch(v.state.tr.insertText(ch, v.state.doc.firstChild!.content.size + 1));
    const ch = listChanges(v.state.doc);
    expect(ch.map((c) => c.text)).toEqual(['added by Alice']);
    v.dispatch(resolveChanges(v.state, ch, false));
    expect(v.state.doc.textContent).toBe('Intro  and Bob');
  });
});

describe('6. document style data cannot break out of the stylesheet', () => {
  const sheetOf = (css: string) => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); const r = [...(st.sheet as CSSStyleSheet).cssRules] as CSSStyleRule[]; st.remove(); return r; };
  const rulesOf = (css: string) => sheetOf(css).map((x) => x.cssText);
  it('quotes hostile font names and drops unsafe values', () => {
    const font = 'Calibri"}.qf-del{display:none}body{background:url(https://tracker.example/opened)}x{y:"';
    const s = normalizeSettings({ styles: {
      Fancy: { name: 'Fancy', type: 'paragraph', basedOn: 'Normal', font, color: 'red;background:url(https://t.example/a)', borderBottom: '1px solid red}body{color:red' } as any,
      'Bad\nName': { name: 'Bad\nName', type: 'paragraph', font: 'Arial' } as any,
    }, theme: { name: 'x', headingFont: 'A', bodyFont: 'B', accent: ['#123456;}body{x:y'] } as any });
    const rules = sheetOf(stylesCss(s));
    expect(rules.length).toBeGreaterThan(10);
    // Every rule is a document rule: nothing got out to restyle the app (.qf-del, body...).
    for (const r of rules) expect(r.selectorText.startsWith('.qf-doc'), r.cssText).toBe(true);
    const fancy = rules.find((r) => r.selectorText.includes('Fancy'))!;
    expect(fancy.style.fontFamily).toContain('tracker.example'); // still just (part of) the font name
    expect([fancy.style.color, fancy.style.backgroundImage, fancy.style.borderBottom]).toEqual(['', '', '']);
    expect(rules.some((r) => r.selectorText.includes('Bad'))).toBe(true);
    expect(cssValue('1px solid var(--qf-accent1)')).toBe('1px solid var(--qf-accent1)');
    expect(cssValue('url(https://x)')).toBe('');
  });
  it('a .docx style font name stays one font name', async () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const evil = 'Calibri&quot;}.qf-del{display:none}x{y:&quot;';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Fancy"><w:name w:val="Fancy"/><w:rPr><w:rFonts w:ascii="${evil}" w:hAnsi="${evil}"/></w:rPr></w:style></w:styles>`);
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:pPr><w:pStyle w:val="Fancy"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${evil}"/></w:rPr><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`);
    const d = await importDocx(await zip.generateAsync({ type: 'arraybuffer' }), 'evil.docx');
    for (const r of rulesOf(stylesCss(normalizeSettings(d.attrs.settings)))) expect(r.startsWith('.qf-doc'), r).toBe(true);
    // The run's font mark: one declaration, the whole name as the family.
    const span = DOMSerializer.fromSchema(S).serializeFragment(d.firstChild!.content).firstChild as HTMLElement;
    const style = span.closest?.('span') ? span : (span as any);
    expect(style.style.length).toBe(1);
    expect(style.style.fontFamily).toContain('display:none');
  });
});

describe('7. Stop works on the native HTTP path', () => {
  beforeEach(() => { reloadAiSettings(); });
  it('rejects at once and drops the late answer', async () => {
    localStorage.setItem('quillforge.ai.v1', JSON.stringify({ active: 'perplexity', providers: { perplexity: { id: 'perplexity', model: 'sonar' } } }));
    reloadAiSettings();
    await setApiKey('perplexity', 'pplx-test');
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    let sawSignal = false;
    vi.stubGlobal('fetch', (_u: string, init: any) => { sawSignal ||= !!init?.signal; return new Promise((res) => setTimeout(() => res(new Response(JSON.stringify({ choices: [{ message: { content: 'LATE' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })), 300)); });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 30);
    const t0 = Date.now();
    const err = await chat({ messages: [{ role: 'user', content: 'hi' }], signal: ctl.signal }).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe('aborted');
    expect(Date.now() - t0).toBeLessThan(250);
    expect(sawSignal).toBe(false); // the native layer cannot cancel: chat() stops waiting instead
  });
});

describe('8. dragging an image handle resizes the image', () => {
  it('commits the new size', () => {
    const img = S.nodes.image.create({ src: 'data:image/png;base64,AAAA', width: 100, height: 50 });
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc: doc(P('a', img)) }),
      nodeViews: buildNodeViews({ editMath: () => {}, controlClick: () => {}, imageEdit: () => {}, genBlockClick: () => {} }),
    });
    const wrap = view.nodeDOM(2) as HTMLElement;
    const pic = wrap.querySelector('img')!;
    Object.defineProperty(pic, 'offsetWidth', { get: () => 200 });
    Object.defineProperty(pic, 'offsetHeight', { get: () => 100 });
    wrap.querySelector('.qf-h-se')!.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    expect(() => window.dispatchEvent(new MouseEvent('pointerup'))).not.toThrow();
    expect(view.state.doc.nodeAt(2)!.attrs.width).toBe(150);
    view.destroy();
  });
});

describe('9. cut-off answers are not treated as complete', () => {
  beforeEach(() => {
    localStorage.setItem('quillforge.ai.v1', JSON.stringify({ active: 'groq', providers: { groq: { id: 'groq', model: 'openai/gpt-oss-120b' } } }));
    reloadAiSettings();
  });
  it('flags finish_reason "length" and in-stream errors', async () => {
    await setApiKey('groq', 'gsk_test');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: 'The quick brown fox' }, finish_reason: 'length' }] }), { status: 200 }));
    expect((await chat({ messages: [{ role: 'user', content: 'x' }] })).truncated).toBe(true);
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"error":{"message":"Provider disconnected"}}\n\n')); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await expect(chat({ messages: [{ role: 'user', content: 'x' }], onToken: () => {} })).rejects.toThrow(/Provider disconnected/);
  });
  it('Proofread leaves a paragraph alone when its answer is cut off', async () => {
    const app = makeApp();
    const tab = app.createTab(doc(P('The quick brown fox jumps over teh lazy dog.')));
    vi.mocked(chat).mockImplementation(fakeProofreader(undefined, () => true));
    await trackedEdit(app, featureById('ai.proofread')!, 'sys');
    expect(listChanges(tab.view.state.doc)).toHaveLength(0);
  });
});

describe('11. Compare marks deleted and inserted block-level objects', () => {
  it('lists them, and Accept/Reject remove or keep them', () => {
    const original = doc(P('Intro.'), S.nodes.math_block.create({ latex: 'E=mc^2' }), S.nodes.page_break.create(), P('Body.'));
    const revised = doc(P('Intro.'), P('Body.'), S.nodes.horizontal_rule.create());
    const cmp = compareDocs(original, revised, 'Reviewer');
    const ch = listChanges(cmp);
    expect(ch.map((c) => `${c.kind}:${c.text}`)).toEqual(['deletion:[math block]', 'deletion:[page break]', 'insertion:[horizontal rule]']);
    const names = (d: PMNode) => d.content.content.map((n) => n.type.name);
    const st = EditorState.create({ doc: cmp });
    expect(names(st.apply(resolveChanges(st, ch, true)).doc)).toEqual(['paragraph', 'paragraph', 'horizontal_rule']);
    const rej = st.apply(resolveChanges(st, ch, false)).doc;
    expect(names(rej)).toEqual(['paragraph', 'math_block', 'page_break', 'paragraph']);
    expect(listChanges(rej)).toHaveLength(0);
    // The change survives an HTML round trip (data-change).
    const html = document.createElement('div');
    html.appendChild(DOMSerializer.fromSchema(S).serializeFragment(cmp.content));
    expect(listChanges(PMDOMParser.fromSchema(S).parse(html)).filter((c) => c.block)).toHaveLength(3);
  });
});

describe('12. continuous typing and deleting is one tracked change', () => {
  it('merges keystrokes by the same author', () => {
    const app = makeApp();
    const tab = app.createTab(doc(P('Start. ')));
    const v = tab.view;
    v.dispatch(v.state.tr.setMeta(trackKey, { enabled: true, author: 'Me' }));
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 8)));
    for (const ch of 'hello') v.dispatch(v.state.tr.insertText(ch, v.state.selection.from));
    expect(listChanges(v.state.doc).map((c) => c.text)).toEqual(['hello']);
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 7)));
    for (let i = 0; i < 3; i++) { const p = v.state.selection.from; v.dispatch(v.state.tr.delete(p - 1, p).setMeta('trackDir', 'back')); }
    expect(listChanges(v.state.doc).filter((c) => c.kind === 'deletion').map((c) => c.text)).toEqual(['rt.']);
  });
});

describe('13. local AI servers: plain http only on this device', () => {
  const read = (p: string) => readFileSync(`${process.cwd()}/android/app/src/main/${p}`, 'utf8');
  it('the Android app permits cleartext for localhost addresses only', () => {
    expect(read('AndroidManifest.xml')).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    const nsc = read('res/xml/network_security_config.xml');
    expect(nsc).toMatch(/<base-config cleartextTrafficPermitted="false"/);
    expect([...nsc.matchAll(/<domain[^>]*>([^<]+)<\/domain>/g)].map((m) => m[1])).toEqual(['localhost', '127.0.0.1', '10.0.2.2']);
  });
  it('the help text and the error say so', async () => {
    expect(providerById('ollama')!.fields![0].help).not.toMatch(/OLLAMA_HOST=0\.0\.0\.0/);
    expect(providerById('ollama')!.fields![0].help).toMatch(/only for a server on this device/);
    localStorage.setItem('quillforge.ai.v1', JSON.stringify({ active: 'ollama', providers: { ollama: { id: 'ollama', model: 'qwen3', baseUrl: 'http://192.168.1.5:11434/v1' } } }));
    reloadAiSettings();
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/only for a server on this device/);
  });
});

describe('14. AI comments anchor on the quoted words', () => {
  it('matches across runs of whitespace', () => {
    const app = makeApp();
    const tab = app.createTab(doc(P('First sentence.  The quick\tbrown fox jumps.')));
    app.createTab(doc(P('another document')));
    expect(addComments(app, [{ quote: 'quick brown fox', comment: 'note' }], 'AI', tab)).toBe(1);
    let marked = '';
    tab.view.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type === S.marks.comment)) marked += n.text; return true; });
    expect(marked).toBe('quick\tbrown fox');
    expect(Object.keys(tab.settings.comments)).toHaveLength(1);
  });
});

describe('15. OpenRouter sign-in accepts only its own redirect', () => {
  it('checks the loopback nonce path', () => {
    expect(isOurCallback('http://127.0.0.1:5555/callback/n0nce?code=abc', '/callback/n0nce')).toBe(true);
    expect(isOurCallback('http://127.0.0.1:5555/?code=junk', '/callback/n0nce')).toBe(false);
    expect(isOurCallback('http://127.0.0.1:5555/callback/other?code=junk', '/callback/n0nce')).toBe(false);
  });
  it('the browser callback needs the state of the sign-in this browser started', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ key: 'sk-or-v1-x' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('quillforge.oauth.openrouter', JSON.stringify({ verifier: 'v', nonce: 'RIGHT' }));
    const saved: string[] = [];
    history.replaceState(null, '', '/?qf-oauth=openrouter&code=C&qf-state=WRONG');
    expect(await handleOAuthRedirect(async (k) => { saved.push(k); })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    history.replaceState(null, '', '/?qf-oauth=openrouter&code=C&qf-state=RIGHT');
    expect(await handleOAuthRedirect(async (k) => { saved.push(k); })).toBe(true);
    expect(saved).toEqual(['sk-or-v1-x']);
  });
});

describe('answers go to the document and place the command started from', () => {
  it('inserts below the remembered block after edits elsewhere, in the original tab', async () => {
    const app = makeApp();
    const tab = app.createTab(doc(P('one'), P('two')));
    tab.view.dispatch(tab.view.state.tr.setSelection(TextSelection.create(tab.view.state.doc, 2)));
    const below = anchorBelow(tab.view.state);
    tab.view.dispatch(tab.view.state.tr.insert(0, P('zero')).insertText('!', 15));
    app.createTab(doc(P('other')));
    expect(await insertBelow(app, 'NEW', { track: false, author: 'AI', tab, below })).toBe(true);
    const texts: string[] = []; tab.view.state.doc.forEach((n) => texts.push(n.textContent));
    expect(texts).toEqual(['zero', 'one', 'NEW', 'two!']);
    expect(app.tab.view.state.doc.textContent).toBe('other');
  });
  it('does not apply when the remembered paragraph itself was edited', async () => {
    const app = makeApp();
    const tab = app.createTab(doc(P('one'), P('two')));
    tab.view.dispatch(tab.view.state.tr.setSelection(TextSelection.create(tab.view.state.doc, 3)));
    const below = anchorBelow(tab.view.state), at = anchorSelection(tab.view.state);
    tab.view.dispatch(tab.view.state.tr.insertText('X', 2));
    const before = tab.view.state.doc;
    expect(await insertBelow(app, 'NEW', { track: false, author: 'AI', tab, below })).toBe(false);
    expect(await insertAtCursor(app, 'NEW', { track: false, author: 'AI', tab, at })).toBe(false);
    expect(tab.view.state.doc.eq(before)).toBe(true);
  });
  it('inserts at the remembered caret, not where the caret is now', async () => {
    const app = makeApp();
    const tab = app.createTab(doc(P('abcd'), P('xyz')));
    tab.view.dispatch(tab.view.state.tr.setSelection(TextSelection.create(tab.view.state.doc, 3)));
    const at = anchorSelection(tab.view.state);
    const tr = tab.view.state.tr.insertText('Q', 8);
    tab.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1)));
    expect(await insertAtCursor(app, '-', { track: false, author: 'AI', tab, at })).toBe(true);
    const texts: string[] = []; tab.view.state.doc.forEach((n) => texts.push(n.textContent));
    expect(texts).toEqual(['ab-cd', 'xQyz']);
  });
});

describe('ordered list start', () => {
  it('parses a non-numeric start as 1 and never writes start="NaN"', () => {
    const host = document.createElement('div');
    host.innerHTML = '<ol start="abc"><li><p>x</p></li></ol><ol start="3"><li><p>y</p></li></ol>';
    const d = PMDOMParser.fromSchema(S).parse(host);
    expect([d.child(0).attrs.order, d.child(1).attrs.order]).toEqual([1, 3]);
    const ol = S.nodes.ordered_list.create({ order: NaN }, S.nodes.list_item.create(null, P('z')));
    const el = DOMSerializer.fromSchema(S).serializeNode(ol) as HTMLElement;
    expect(el.hasAttribute('start')).toBe(false);
  });
});
