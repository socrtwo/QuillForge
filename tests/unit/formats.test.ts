import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../src/editor/schema';
import { defaultSettings } from '../../src/editor/settings';
import { blobToBytes, blobToText, toArrayBuffer, finishDoc, newSettings } from '../../src/io/serialize';
import { cleanPastedHtml, docToHtml, exportHtml, importHtml } from '../../src/io/html';
import { docToMarkdown, exportMarkdown, importMarkdown, markdownToBlocks } from '../../src/io/markdown';
import { docToText, exportText, importText } from '../../src/io/text';
import { docToRtf, exportRtf, importRtf, rtfToDoc } from '../../src/io/rtf';
import { exportFodt, exportOdt, importFodt, importOdt } from '../../src/io/odt';
import { exportEpub, importEpub } from '../../src/io/epub';

const S = schema;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const OPTS = { fileName: 'sample.doc', author: 'Tester' };

const enc = (s: string) => toArrayBuffer(new TextEncoder().encode(s));
const p = (content: (PMNode | string)[], attrs: Record<string, any> = {}) =>
  S.nodes.paragraph.create(attrs, content.map((c) => (typeof c === 'string' ? S.text(c) : c)));
const t = (text: string, ...marks: string[]) => S.text(text, marks.map((m) => S.marks[m].create()));

function sampleDoc(): PMNode {
  const settings = defaultSettings();
  settings.properties.title = 'Sample Title';
  settings.properties.author = 'Ada';
  settings.header = { left: 'Left side', center: '', right: 'Page {PAGE}' };
  const link = S.text('a link', [S.marks.link.create({ href: 'https://example.com/x' })]);
  const fn = S.nodes.footnote.create({ text: 'Footnote body.' });
  const img = S.nodes.image.create({ src: PNG, alt: 'dot', width: 12, height: 12 });
  const nested = S.nodes.ordered_list.create(null, [
    S.nodes.list_item.create(null, [p(['Sub one'])]),
    S.nodes.list_item.create(null, [p(['Sub two'])]),
  ]);
  const list = S.nodes.bullet_list.create(null, [
    S.nodes.list_item.create(null, [p(['Item one']), nested]),
    S.nodes.list_item.create(null, [p(['Item two'])]),
  ]);
  const cell = (txt: string, header = false) => (header ? S.nodes.table_header : S.nodes.table_cell).create(null, p([txt]));
  const table = S.nodes.table.create({ headerRows: 1 }, [
    S.nodes.table_row.create(null, [cell('H1', true), cell('H2', true)]),
    S.nodes.table_row.create(null, [cell('A1'), cell('B1')]),
  ]);
  return S.node('doc', { settings }, [
    p(['Main Heading'], { style: 'Heading 1' }),
    p(['Intro with ', t('bold', 'bold'), ', ', t('italic', 'italic'), ', ', t('under', 'underline'), ' and ', link, ' plus a note', fn, '.']),
    p(['Second level'], { style: 'Heading 2' }),
    list,
    table,
    p(['Picture: ', img]),
    p(['Tail text café ✓'])
  ]);
}

interface Summary {
  headings: string[]; bold: boolean; italic: boolean; underline: boolean; links: string[]; footnotes: string[]; images: number;
  listDepth: number; listTexts: string[]; table: { rows: number; cols: number; texts: string[] } | null; text: string;
}

function summarize(doc: PMNode): Summary {
  const s: Summary = { headings: [], bold: false, italic: false, underline: false, links: [], footnotes: [], images: 0, listDepth: 0, listTexts: [], table: null, text: doc.textContent };
  const walk = (n: PMNode, depth: number) => {
    if (n.type.name === 'paragraph' && /^Heading \d$/.test(n.attrs.style)) s.headings.push(`${n.attrs.style}:${n.textContent}`);
    if (n.isText) {
      for (const m of n.marks) {
        if (m.type.name === 'bold') s.bold = true;
        if (m.type.name === 'italic') s.italic = true;
        if (m.type.name === 'underline') s.underline = true;
        if (m.type.name === 'link' && !s.links.includes(m.attrs.href)) s.links.push(m.attrs.href);
      }
    }
    if (n.type.name === 'footnote') s.footnotes.push(n.attrs.text);
    if (n.type.name === 'image') s.images++;
    const isList = /bullet_list|ordered_list|task_list/.test(n.type.name);
    if (isList) { s.listDepth = Math.max(s.listDepth, depth + 1); n.forEach((it) => s.listTexts.push(it.firstChild?.textContent || '')); }
    if (n.type.name === 'table' && !s.table) {
      const texts: string[] = [];
      n.descendants((c) => { if (c.type.name === 'table_cell' || c.type.name === 'table_header') { texts.push(c.textContent.trim()); return false; } return true; });
      s.table = { rows: n.childCount, cols: n.firstChild ? n.firstChild.childCount : 0, texts };
    }
    n.forEach((c) => walk(c, isList ? depth + 1 : depth));
  };
  walk(doc, 0);
  return s;
}

function expectRichRoundTrip(back: PMNode, opts: { underline?: boolean; images?: boolean; footnoteText?: boolean } = {}) {
  back.check();
  const s = summarize(back);
  expect(s.headings).toContain('Heading 1:Main Heading');
  expect(s.headings).toContain('Heading 2:Second level');
  expect(s.bold).toBe(true);
  expect(s.italic).toBe(true);
  if (opts.underline !== false) expect(s.underline).toBe(true);
  expect(s.links).toContain('https://example.com/x');
  expect(s.footnotes.length).toBe(1);
  if (opts.footnoteText !== false) expect(s.footnotes[0]).toBe('Footnote body.');
  expect(s.listDepth).toBeGreaterThanOrEqual(2);
  expect(s.listTexts).toEqual(expect.arrayContaining(['Item one', 'Item two', 'Sub one', 'Sub two']));
  expect(s.table).not.toBeNull();
  expect(s.table!.rows).toBe(2);
  expect(s.table!.cols).toBe(2);
  expect(s.table!.texts).toEqual(['H1', 'H2', 'A1', 'B1']);
  if (opts.images !== false) expect(s.images).toBe(1);
  expect(s.text).toContain('Tail text café ✓');
}

async function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  return toArrayBuffer(await blobToBytes(blob));
}

// =============================================================================================

describe('HTML', () => {
  it('round-trips the sample document', async () => {
    const blob = await exportHtml(sampleDoc(), OPTS);
    const html = await blobToText(blob);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>Sample Title</title>');
    expect(html).toContain('<meta name="author" content="Ada">');
    expect(html).toContain('data-style="Heading 1"');
    expect(html).toContain('section class="footnotes"');
    expect(html).not.toContain('contenteditable');
    expect(html).toContain(PNG);
    const back = await importHtml(await bytesOf(blob), 'x.html');
    expectRichRoundTrip(back);
    expect(back.attrs.settings.properties.title).toBe('Sample Title');
    expect(back.attrs.settings.properties.author).toBe('Ada');
  });

  it('drops tracked deletions, keeps insertions, renders fields and math', () => {
    const del = S.text('gone', [S.marks.deletion.create({ author: 'x' })]);
    const ins = S.text('kept', [S.marks.insertion.create({ author: 'x' })]);
    const field = S.nodes.field.create({ type: 'PAGE', value: '7' });
    const math = S.nodes.math_inline.create({ latex: 'x^2' });
    const doc = S.node('doc', { settings: defaultSettings() }, [p([del, ins, ' ', field, ' ', math]), S.nodes.gen_block.create({ kind: 'toc', cache: '<p>Contents line</p>' })]);
    const html = docToHtml(doc, OPTS);
    expect(html).not.toContain('gone');
    expect(html).toContain('kept');
    expect(html).not.toContain('<ins');
    expect(html).toMatch(/kept 7 <span class="math" data-latex="x\^2">\\\(x\^2\\\)<\/span>/);
    expect(html).toContain('Contents line');
  });

  it('cleans Google Docs pasted HTML', async () => {
    const gdocs = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent;font-weight:700;font-style:normal;vertical-align:baseline;white-space:pre-wrap;">Bold</span><span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent;font-weight:400;font-style:italic;white-space:pre-wrap;"> italic</span></p><ul><li dir="ltr" aria-level="1"><p dir="ltr"><span>One</span></p></li><ul><li aria-level="2"><p><span>Nested</span></p></li></ul></ul></b>';
    const cleaned = cleanPastedHtml(gdocs);
    expect(cleaned).not.toContain('docs-internal-guid');
    expect(cleaned).not.toContain('#000000');
    const doc = await importHtml(enc(gdocs), 'paste.html');
    doc.check();
    const first = doc.firstChild!;
    expect(first.textContent).toBe('Bold italic');
    expect(first.firstChild!.marks.map((m) => m.type.name)).toContain('bold');
    expect(first.lastChild!.marks.map((m) => m.type.name)).toContain('italic');
    expect(first.lastChild!.marks.map((m) => m.type.name)).not.toContain('bold');
    const s = summarize(doc);
    expect(s.listDepth).toBe(2);
    expect(s.listTexts).toEqual(['One', 'Nested']);
  });

  it('cleans MS Word HTML (lists, footnotes, junk)', async () => {
    const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style><!--[if gte mso 9]><xml><o:DocumentProperties/></xml><![endif]--></head>
<body lang=EN-US><div class=WordSection1>
<p class=MsoTitle>Report<o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>Alpha<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span><![endif]>Beta<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>·<span>&nbsp;</span></span><![endif]>Gamma<o:p></o:p></p>
<p class=MsoNormal>Text<a style='mso-footnote-id:ftn1' href="#_ftn1" name="_ftnref1" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><![if !supportFootnotes]>[1]<![endif]></span></span></a> end.</p>
<script>alert(1)</script>
</div>
<div style='mso-element:footnote-list'><![if !supportFootnotes]><br clear=all><hr align=left size=1 width="33%"><![endif]>
<div style='mso-element:footnote' id=ftn1><p class=MsoFootnoteText><a style='mso-footnote-id:ftn1' href="#_ftnref1" name="_ftn1" title=""><span class=MsoFootnoteReference>[1]</span></a> The Word note.</p></div></div>
</body></html>`;
    const cleaned = cleanPastedHtml(word);
    expect(cleaned).not.toMatch(/<script|<o:p|mso-list|<style/i);
    const doc = await importHtml(enc(word), 'word.htm');
    doc.check();
    expect(doc.firstChild!.attrs.style).toBe('Title');
    const s = summarize(doc);
    expect(s.listTexts).toEqual(['Alpha', 'Gamma', 'Beta']);
    expect(s.listDepth).toBe(2);
    let ordered = false;
    doc.descendants((n) => { if (n.type.name === 'ordered_list') ordered = true; });
    expect(ordered).toBe(true);
    expect(s.footnotes).toEqual(['The Word note.']);
    expect(s.text).not.toContain('alert');
    expect(s.text).not.toContain('[1]');
  });

  it('handles task lists, KaTeX and blockquotes with paragraphs', async () => {
    const html = '<ul class="contains-task-list"><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>' +
      '<blockquote><p>Quoted</p><p>Two</p></blockquote><p><span class="katex"><annotation encoding="application/x-tex">a+b</annotation>a+b</span></p>';
    const doc = await importHtml(enc(html), 'x.html');
    doc.check();
    const task = doc.firstChild!;
    expect(task.type.name).toBe('task_list');
    expect(task.child(0).attrs.checked).toBe(true);
    expect(task.child(1).attrs.checked).toBe(false);
    expect(doc.child(1).attrs.style).toBe('Quote');
    expect(doc.child(2).attrs.style).toBe('Quote');
    let latex = '';
    doc.descendants((n) => { if (n.type.name === 'math_inline') latex = n.attrs.latex; });
    expect(latex).toBe('a+b');
  });
});

// =============================================================================================

describe('Markdown', () => {
  it('round-trips the sample document', async () => {
    const blob = await exportMarkdown(sampleDoc(), OPTS);
    const md = await blobToText(blob);
    expect(md).toContain('# Main Heading');
    expect(md).toContain('## Second level');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('<u>under</u>');
    expect(md).toContain('[a link](https://example.com/x)');
    expect(md).toContain('[^1]');
    expect(md).toContain('[^1]: Footnote body.');
    expect(md).toContain('| H1 | H2 |');
    expect(md).toContain('![dot](data:image/png;base64,');
    const back = await importMarkdown(await bytesOf(blob), 'x.md');
    expectRichRoundTrip(back);
  });

  it('parses a CommonMark/GFM sample', async () => {
    const md = `---
title: Front Matter Title
author: Grace
---

Setext Heading
==============

Sub heading
-----------

Text with *em*, __strong__, ~~gone~~, ==marked==, \`co*de\`, a [ref link][r1], <https://auto.link>, www.bare.org and\\
a hard break. Escaped \\*stars\\* and $e^{i\\pi}$.

[r1]: http://ref.example "Ref Title"

> Quote line
> > nested quote

1. one
2. two
   - sub a
   - sub b

- [ ] todo
- [x] done

| Left | Center | Right |
|:-----|:------:|------:|
| a    | b      | c     |
| d \\| e | f | g |

\`\`\`python
print("hi")
\`\`\`

    indented code

***

Note ref[^n].

[^n]: Note *text* here.

<div>raw <b>html</b> block</div>

$$
\\int_0^1 x\\,dx
$$
`;
    const settings = newSettings();
    const doc = finishDoc(markdownToBlocks(md, settings), settings);
    doc.check();
    expect(settings.properties.title).toBe('Front Matter Title');
    expect(settings.properties.author).toBe('Grace');
    const blocks: PMNode[] = [];
    doc.forEach((b) => blocks.push(b));
    expect(blocks[0].attrs.style).toBe('Heading 1');
    expect(blocks[0].textContent).toBe('Setext Heading');
    expect(blocks[1].attrs.style).toBe('Heading 2');
    const para = blocks[2];
    const marksOf = (txt: string) => {
      let names: string[] = [];
      para.forEach((n) => { if (n.isText && n.text === txt) names = n.marks.map((m) => m.type.name); });
      return names;
    };
    expect(marksOf('em')).toEqual(['italic']);
    expect(marksOf('strong')).toEqual(['bold']);
    expect(marksOf('gone')).toEqual(['strike']);
    expect(marksOf('marked')).toEqual(['highlight']);
    expect(marksOf('co*de')).toEqual(['code']);
    const links: string[] = [];
    para.forEach((n) => n.marks.forEach((m) => { if (m.type.name === 'link') links.push(m.attrs.href); }));
    expect(links).toEqual(['http://ref.example', 'https://auto.link', 'http://www.bare.org']);
    let hasBreak = false, math = '';
    para.forEach((n) => { if (n.type.name === 'hard_break') hasBreak = true; if (n.type.name === 'math_inline') math = n.attrs.latex; });
    expect(hasBreak).toBe(true);
    expect(math).toBe('e^{i\\pi}');
    expect(para.textContent).toContain('Escaped *stars*');
    expect(blocks[3].attrs.style).toBe('Quote');
    expect(blocks[4].attrs.style).toBe('Quote');
    expect(blocks[4].textContent).toBe('nested quote');
    expect(blocks[5].type.name).toBe('ordered_list');
    expect(blocks[5].child(1).child(1).type.name).toBe('bullet_list');
    expect(blocks[6].type.name).toBe('task_list');
    expect(blocks[6].child(0).attrs.checked).toBe(false);
    expect(blocks[6].child(1).attrs.checked).toBe(true);
    const table = blocks[7];
    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(3);
    expect(table.child(0).child(1).firstChild!.attrs.align).toBe('center');
    expect(table.child(0).child(2).firstChild!.attrs.align).toBe('right');
    expect(table.child(2).child(0).textContent).toBe('d | e');
    expect(blocks[8].type.name).toBe('code_block');
    expect(blocks[8].attrs.language).toBe('python');
    expect(blocks[9].type.name).toBe('code_block');
    expect(blocks[9].textContent).toBe('indented code');
    expect(blocks[10].type.name).toBe('horizontal_rule');
    let note = '';
    blocks[11].forEach((n) => { if (n.type.name === 'footnote') note = n.attrs.text; });
    expect(note).toBe('Note text here.');
    expect(blocks[12].textContent).toContain('raw html block');
    expect(blocks[13].type.name).toBe('math_block');
    expect(blocks[13].attrs.latex).toBe('\\int_0^1 x\\,dx');
  });

  it('escapes special characters and page breaks on export', async () => {
    const doc = S.node('doc', { settings: defaultSettings() }, [
      p(['# not a heading *x* _y_ [z] 1. a|b $5']),
      S.nodes.page_break.create(),
      p([t('hi', 'highlight'), ' ', t('up', 'sup'), ' ', S.nodes.field.create({ type: 'DATE', value: '1/2/2030' })]),
    ]);
    const md = docToMarkdown(doc);
    expect(md).toContain('\\# not a heading \\*x\\* \\_y\\_ \\[z\\] 1. a\\|b \\$5');
    expect(md).toContain('<!-- pagebreak -->\n\n---');
    expect(md).toContain('==hi== <sup>up</sup> 1/2/2030');
    const back = await importMarkdown(enc(md), 'x.md');
    back.check();
    expect(back.firstChild!.textContent).toBe('# not a heading *x* _y_ [z] 1. a|b $5');
    expect(back.child(1).type.name).toBe('page_break');
    expect(back.childCount).toBe(3);
  });

  it('never throws on garbage', async () => {
    const junk = '***\n> > > [\n|\n|-|\n```\n<div\n[^x]:\n- [ \n\t\t* \u0000 $$ ` ** __ ~~ ==';
    const doc = await importMarkdown(enc(junk), 'j.md');
    doc.check();
    let s = '';
    for (let i = 0; i < 300; i++) s += '[*_`<!$~=>#-|'[i % 13] + (i % 7 === 0 ? '\n' : ' ');
    (await importMarkdown(enc(s), 'k.md')).check();
  });
});

// =============================================================================================

describe('Plain text', () => {
  it('exports structure as text', async () => {
    const blob = await exportText(sampleDoc(), OPTS);
    const txt = await blobToText(blob);
    expect(txt).toContain('Main Heading\n');
    expect(txt).toContain('• Item one\n  1. Sub one\n  2. Sub two\n• Item two');
    expect(txt).toContain('H1\tH2\nA1\tB1');
    expect(txt).toContain('plus a note[1].');
    expect(txt).toContain('\n[1] Footnote body.');
    const back = await importText(await bytesOf(blob), 'x.txt');
    back.check();
    expect(back.textContent).toContain('Item one');
  });

  it('imports lines, tabs and form feeds', async () => {
    const doc = await importText(enc('a\tb\r\nsecond\n\fthird\n'), 'x.txt');
    doc.check();
    expect(doc.childCount).toBe(4);
    expect(doc.child(0).textContent).toBe('a\tb');
    expect(doc.child(2).type.name).toBe('page_break');
    expect(doc.child(3).textContent).toBe('third');
    const exported = docToText(doc);
    expect(exported).toBe('a\tb\nsecond\n\fthird\n');
  });

  it('imports CSV as a table', async () => {
    const doc = await importText(enc('name,qty\n"Smith, J",3\nDoe,"4"\n'), 'data.csv');
    doc.check();
    const table = doc.firstChild!;
    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(3);
    expect(table.child(1).child(0).textContent).toBe('Smith, J');
  });
});

// =============================================================================================

describe('RTF', () => {
  it('round-trips the sample document', async () => {
    const blob = await exportRtf(sampleDoc(), OPTS);
    const rtf = await blobToText(blob);
    expect(rtf.startsWith('{\\rtf1\\ansi')).toBe(true);
    expect(rtf).toContain('{\\fonttbl');
    expect(rtf).toContain('{\\colortbl');
    expect(rtf).toContain('heading 1;}');
    expect(rtf).toContain('\\listtable');
    expect(rtf).toContain('\\trowd');
    expect(rtf).toContain('\\pngblip');
    expect(rtf).toContain('{\\footnote');
    expect(rtf).toContain('HYPERLINK "https://example.com/x"');
    expect(rtf).toContain('caf\\u233?');
    expect(rtf).toContain('{\\header');
    expect(rtf).toContain('\\chpgn');
    const back = await importRtf(await bytesOf(blob), 'x.rtf');
    expectRichRoundTrip(back);
    const st = back.attrs.settings;
    expect(st.header.left).toBe('Left side');
    expect(st.header.right).toBe('Page {PAGE}');
    expect(st.properties.title).toBe('Sample Title');
    expect(st.page.width).toBe(612);
    let img: PMNode | null = null;
    back.descendants((n) => { if (n.type.name === 'image') img = n; });
    expect((img as unknown as PMNode).attrs.width).toBe(12);
    expect((img as unknown as PMNode).attrs.src.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('parses unicode, code pages, styles and old-style lists', () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0\uc1{\fonttbl{\f0\froman Times New Roman;}{\f1\fswiss\fcharset0 Arial;}{\f2\fnil\fcharset2 Symbol;}}
{\colortbl;\red255\green0\blue0;\red0\green0\blue255;}
{\stylesheet{\s0 Normal;}{\s1\outlinelevel0 heading 1;}{\s2 Quote;}}
{\info{\title RTF Title}{\author Bob}}
\paperw11906\paperh16838\margl1134\margr1134
\pard\s1\qc\b Heading\b0\par
\pard\plain Caf\'e9 \u8364?uro \u-10179?\u-8704? {\cf1 red} {\i\ul it} {\super 2} \tab tab\line next\par
\pard{\pntext\f2\'b7\tab}{\*\pn\pnlvlblt\pnf2\pnindent0{\pntxtb\'b7}}\fi-360\li720 bullet one\par
{\pntext\f2\'b7\tab}bullet two\par
\pard{\pntext 1.\tab}{\*\pn\pnlvlbody\pndec\pnstart1}\fi-360\li720 first\par
\pard\plain{\field{\*\fldinst{HYPERLINK "http://rtf.example"}}{\fldrslt{\ul\cf2 click}}} and {\field{\*\fldinst PAGE}{\fldrslt 3}}\par
\pard\s2 Quoted text\par
\pard\qj Last{\*\unknowndest garbage}\u233\'3f!\par}`;
    const doc = rtfToDoc(rtf);
    doc.check();
    const st = doc.attrs.settings;
    expect(st.properties.title).toBe('RTF Title');
    expect(st.properties.author).toBe('Bob');
    expect(st.page.sizeName).toBe('A4');
    expect(st.page.margin.left).toBeCloseTo(56.7, 1);
    const blocks: PMNode[] = [];
    doc.forEach((b) => blocks.push(b));
    expect(blocks[0].attrs.style).toBe('Heading 1');
    expect(blocks[0].attrs.align).toBe('center');
    expect(blocks[0].firstChild!.marks.some((m) => m.type.name === 'bold')).toBe(true);
    const text = blocks[1].textContent;
    expect(text).toContain('Café €uro 😀');
    expect(text).toContain('\ttab');
    let red = false, sup = false, ul = false, br = false;
    blocks[1].forEach((n) => {
      if (n.marks.some((m) => m.type.name === 'color' && m.attrs.color === '#ff0000') && n.text === 'red') red = true;
      if (n.marks.some((m) => m.type.name === 'sup')) sup = true;
      if (n.marks.some((m) => m.type.name === 'underline')) ul = true;
      if (n.type.name === 'hard_break') br = true;
    });
    expect([red, sup, ul, br]).toEqual([true, true, true, true]);
    expect(blocks[2].type.name).toBe('bullet_list');
    expect(blocks[2].childCount).toBe(2);
    expect(blocks[2].child(1).textContent).toBe('bullet two');
    expect(blocks[3].type.name).toBe('ordered_list');
    let href = '', field: PMNode | null = null;
    blocks[4].descendants((n) => { n.marks.forEach((m) => { if (m.type.name === 'link') href = m.attrs.href; }); if (n.type.name === 'field') field = n; });
    expect(href).toBe('http://rtf.example');
    expect((field as unknown as PMNode).attrs.type).toBe('PAGE');
    expect((field as unknown as PMNode).attrs.value).toBe('3');
    expect(blocks[5].attrs.style).toBe('Quote');
    expect(blocks[6].textContent).toBe('Lasté!');
    expect(blocks[6].textContent).not.toContain('garbage');
  });

  it('parses tables with merged cells', () => {
    const rtf = String.raw`{\rtf1\ansi
\trowd\clmgf\cellx2000\clmrg\cellx4000\cellx6000
\pard\intbl Wide\cell\pard\intbl\cell\pard\intbl C\cell\row
\trowd\clvmgf\cellx2000\cellx4000\cellx6000
\pard\intbl V\cell\pard\intbl B2\cell\pard\intbl C2\cell\row
\trowd\clvmrg\cellx2000\cellx4000\cellx6000
\pard\intbl\cell\pard\intbl B3\cell\pard\intbl C3\cell\row
\pard After\par}`;
    const doc = rtfToDoc(rtf);
    doc.check();
    const table = doc.firstChild!;
    expect(table.type.name).toBe('table');
    expect(table.child(0).child(0).attrs.colspan).toBe(2);
    expect(table.child(1).child(0).attrs.rowspan).toBe(2);
    expect(table.child(2).childCount).toBe(2);
    expect(table.child(1).child(0).attrs.colwidth).toEqual([133]);
    expect(doc.lastChild!.textContent).toBe('After');
  });

  it('never throws on malformed input', async () => {
    for (const bad of ['{\\rtf1 {\\b unclosed', '{\\rtf1 }}}}} text \\par', '{\\rtf1\\u', '{\\rtf1 \\cell\\row\\cell', 'not rtf at all', '{\\rtf1{\\pict\\pngblip zzzz}}', '{\\rtf1\\bin5 ab']) {
      const doc = await importRtf(enc(bad), 'bad.rtf');
      doc.check();
    }
  });
});

// =============================================================================================

describe('ODT / FODT', () => {
  it('round-trips the sample document (ODT)', async () => {
    const blob = await exportOdt(sampleDoc(), OPTS);
    const bytes = await blobToBytes(blob);
    // mimetype must be the first entry, stored uncompressed.
    expect(String.fromCharCode(...bytes.subarray(30, 38))).toBe('mimetype');
    expect(bytes[8]).toBe(0);
    expect(String.fromCharCode(...bytes.subarray(38, 38 + 39))).toBe('application/vnd.oasis.opendocument.text');
    const zip = await JSZip.loadAsync(bytes);
    for (const f of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) expect(zip.file(f)).not.toBeNull();
    const content = await zip.file('content.xml')!.async('string');
    const styles = await zip.file('styles.xml')!.async('string');
    for (const xml of [content, styles, await zip.file('meta.xml')!.async('string')]) {
      expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length).toBe(0);
    }
    expect(content).toContain('text:outline-level="1"');
    expect(content).toContain('<text:note ');
    expect(styles).toContain('style:name="Heading_20_1"');
    expect(styles).toContain('<text:page-number');
    expect(Object.keys(zip.files).some((f) => f.startsWith('Pictures/'))).toBe(true);
    const back = await importOdt(toArrayBuffer(bytes), 'x.odt');
    expectRichRoundTrip(back);
    const st = back.attrs.settings;
    expect(st.properties.title).toBe('Sample Title');
    expect(st.properties.author).toBe('Ada');
    expect(st.header.left).toBe('Left side');
    expect(st.header.right).toBe('Page {PAGE}');
    expect(st.page.margin.top).toBeCloseTo(72, 0);
  });

  it('round-trips the sample document (FODT)', async () => {
    const blob = await exportFodt(sampleDoc(), OPTS);
    const xml = await blobToText(blob);
    expect(xml).toContain('office:mimetype="application/vnd.oasis.opendocument.text"');
    expect(xml).toContain('<office:binary-data>');
    expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length).toBe(0);
    const back = await importFodt(await bytesOf(blob), 'x.fodt');
    expectRichRoundTrip(back);
  });

  it('keeps comments, tracked changes and page breaks', async () => {
    const settings = defaultSettings();
    settings.comments = { c1: { id: 'c1', author: 'Rev', date: Date.UTC(2024, 0, 2), text: 'Check this', resolved: false, replies: [] } };
    const doc = S.node('doc', { settings }, [
      p([S.text('commented', [S.marks.comment.create({ id: 'c1' })]), ' ', S.text('new', [S.marks.insertion.create({ author: 'Ed', date: Date.UTC(2024, 0, 3), id: 'i1' })]), S.text('old', [S.marks.deletion.create({ author: 'Ed', id: 'd1' })])]),
      S.nodes.page_break.create(),
      p(['After break']),
    ]);
    const back = await importOdt(await bytesOf(await exportOdt(doc, OPTS)), 'x.odt');
    back.check();
    const comments = Object.values(back.attrs.settings.comments) as any[];
    expect(comments.length).toBe(1);
    expect(comments[0].text).toBe('Check this');
    expect(comments[0].author).toBe('Rev');
    const kinds: string[] = [];
    back.firstChild!.forEach((n) => kinds.push(`${n.text}:${n.marks.map((m) => m.type.name).join('+')}`));
    expect(kinds).toContain('commented:comment');
    expect(kinds).toContain('new:insertion');
    expect(kinds).toContain('old:deletion');
    expect(back.child(1).type.name).toBe('page_break');
    expect(back.child(2).textContent).toBe('After break');
  });

  it('imports a hand-written LibreOffice-style document', async () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3">
<office:automatic-styles>
  <style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center" fo:margin-left="0.5in"/><style:text-properties fo:color="#ff0000"/></style:style>
  <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold" style:text-position="super 58%"/></style:style>
  <style:style style:name="T2" style:family="text"><style:text-properties style:text-underline-style="wave" fo:font-size="14pt" fo:background-color="#ffff00"/></style:style>
  <style:style style:name="P2" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:break-before="page"/></style:style>
  <text:list-style style:name="L1"><text:list-level-style-number text:level="1" style:num-format="i" style:num-suffix="."/><text:list-level-style-bullet text:level="2" text:bullet-char="-"/></text:list-style>
</office:automatic-styles>
<office:body><office:text>
  <text:h text:style-name="Heading_20_2" text:outline-level="2">Chapter</text:h>
  <text:p text:style-name="P1">Hello<text:s text:c="2"/>world <text:span text:style-name="T1">sup</text:span> <text:span text:style-name="T2">wavy</text:span><text:tab/>end<text:line-break/>x<text:note text:id="n1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p>End note</text:p></text:note-body></text:note><text:bookmark text:name="bm1"/> <text:a xlink:href="https://lo.example">go</text:a> page <text:page-number>4</text:page-number></text:p>
  <text:list text:style-name="L1"><text:list-item><text:p>Roman</text:p><text:list><text:list-item><text:p>Dash</text:p></text:list-item></text:list></text:list-item></text:list>
  <table:table table:name="T"><table:table-column table:number-columns-repeated="2"/><table:table-row><table:table-cell table:number-columns-spanned="2"><text:p>Span</text:p></table:table-cell><table:covered-table-cell/></table:table-row><table:table-row><table:table-cell><text:p>a</text:p></table:table-cell><table:table-cell><text:p>b</text:p></table:table-cell></table:table-row></table:table>
  <text:p text:style-name="P2">Body text on new page</text:p>
</office:text></office:body></office:document-content>`;
    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    zip.file('content.xml', content);
    const doc = await importOdt(toArrayBuffer(await zip.generateAsync({ type: 'uint8array' })), 'lo.odt');
    doc.check();
    const blocks: PMNode[] = [];
    doc.forEach((b) => blocks.push(b));
    expect(blocks[0].attrs.style).toBe('Heading 2');
    const p1 = blocks[1];
    expect(p1.attrs.align).toBe('center');
    expect(p1.attrs.indentLeft).toBe(36);
    expect(p1.textContent).toBe('Hello  world sup wavy\tendx go page ');
    expect(p1.lastChild!.type.name).toBe('field');
    expect(p1.lastChild!.attrs).toMatchObject({ type: 'PAGE', value: '4' });
    const marks = (txt: string) => { let r: string[] = []; p1.forEach((n) => { if (n.text === txt) r = n.marks.map((m) => m.type.name + (m.type.name === 'underline' ? ':' + m.attrs.style : '')); }); return r; };
    expect(marks('sup')).toEqual(expect.arrayContaining(['bold', 'sup', 'color']));
    expect(marks('wavy')).toEqual(expect.arrayContaining(['underline:wavy', 'size', 'highlight']));
    const types: string[] = [];
    p1.forEach((n) => types.push(n.type.name));
    expect(types).toEqual(expect.arrayContaining(['hard_break', 'footnote', 'bookmark', 'field']));
    let note: PMNode | null = null;
    p1.forEach((n) => { if (n.type.name === 'footnote') note = n; });
    expect((note as unknown as PMNode).attrs.kind).toBe('end');
    expect((note as unknown as PMNode).attrs.text).toBe('End note');
    expect(blocks[2].type.name).toBe('ordered_list');
    expect(blocks[2].attrs.format).toBe('lower-roman');
    expect(blocks[2].child(0).child(1).type.name).toBe('bullet_list');
    expect(blocks[2].child(0).child(1).attrs.bullet).toBe('-');
    expect(blocks[3].type.name).toBe('table');
    expect(blocks[3].child(0).child(0).attrs.colspan).toBe(2);
    expect(blocks[4].type.name).toBe('page_break');
    expect(blocks[5].attrs.style).toBe('Body Text');
  });
});

// =============================================================================================

describe('EPUB', () => {
  it('exports a valid EPUB 3 package and round-trips', async () => {
    const doc = sampleDoc();
    const blob = await exportEpub(doc, OPTS);
    const bytes = await blobToBytes(blob);
    expect(String.fromCharCode(...bytes.subarray(30, 38))).toBe('mimetype');
    expect(bytes[8]).toBe(0);
    const zip = await JSZip.loadAsync(bytes);
    const files = Object.keys(zip.files);
    expect(files).toEqual(expect.arrayContaining(['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'OEBPS/styles.css', 'OEBPS/chapter1.xhtml']));
    expect(files.some((f) => /^OEBPS\/images\/image1\.png$/.test(f))).toBe(true);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>Sample Title</dc:title>');
    expect(opf).toContain('<dc:creator id="creator">Ada</dc:creator>');
    expect(opf).toMatch(/<dc:identifier id="bookid">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/);
    expect(opf).toMatch(/<meta property="dcterms:modified">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/meta>/);
    expect(opf).toContain('media-type="image/png"');
    for (const f of files.filter((f) => /\.(xhtml|opf|ncx)$/.test(f))) {
      const xml = await zip.file(f)!.async('string');
      expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length, f).toBe(0);
    }
    const ch = await zip.file('OEBPS/chapter1.xhtml')!.async('string');
    expect(ch).toContain('epub:type="noteref"');
    expect(ch).toContain('<aside epub:type="footnote" id="fn1"');
    expect(ch).toContain('src="images/image1.png"');
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toContain('Main Heading');
    expect(nav).toContain('Second level');
    const back = await importEpub(toArrayBuffer(bytes), 'x.epub');
    expectRichRoundTrip(back);
    expect(back.attrs.settings.properties.title).toBe('Sample Title');
  });

  it('splits chapters at Heading 1', async () => {
    const doc = S.node('doc', { settings: defaultSettings() }, [
      p(['Preface text']),
      p(['One'], { style: 'Heading 1' }), p(['Body one']),
      p(['Two'], { style: 'Heading 1' }), p(['Body two']),
    ]);
    const zip = await JSZip.loadAsync(await blobToBytes(await exportEpub(doc, OPTS)));
    expect(zip.file('OEBPS/chapter3.xhtml')).not.toBeNull();
    const c2 = await zip.file('OEBPS/chapter2.xhtml')!.async('string');
    expect(c2).toContain('Body one');
    expect(c2).not.toContain('Body two');
    const back = await importEpub(toArrayBuffer(await zip.generateAsync({ type: 'uint8array' })), 'x.epub');
    back.check();
    expect(back.textContent).toBe('Preface textOneBody oneTwoBody two');
  });
});

// =============================================================================================

describe('robustness', () => {
  const rand = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  it('importers never throw on random input', async () => {
    const r = rand(42);
    const alphabet = ['{', '}', '\\', '\\par ', '\\b ', '\\u8364?', "\\'e9", '\\trowd\\cellx100 ', '\\cell ', '\\row ', '\\intbl ', '{\\*\\x ', '{\\field{\\*\\fldinst HYPERLINK "a"}{\\fldrslt b}}',
      '<p>', '</p>', '<li>', '<table><tr><td>', '</td>', '*', '_', '`', '[', '](', ')', '|', '-', '#', '>', '\n', '  ', '$', '~~', 'text ', '<!--', '-->', '<b>', '\t', '&amp;', '&#x1F600;', '\u0000'];
    for (let k = 0; k < 40; k++) {
      let s = k % 2 ? '{\\rtf1 ' : '';
      const n = 50 + Math.floor(r() * 400);
      for (let i = 0; i < n; i++) s += alphabet[Math.floor(r() * alphabet.length)];
      const data = enc(s);
      for (const imp of [importRtf, importHtml, importMarkdown, importText]) {
        const doc = await imp(data, 'fuzz');
        doc.check();
      }
    }
    for (const imp of [importOdt, importFodt, importEpub]) (await imp(enc('<garbage>'), 'x')).check();
  }, 30000); // slow under a loaded parallel run, not stuck

  it('page and section breaks survive RTF and ODT', async () => {
    const doc = S.node('doc', { settings: defaultSettings() }, [p(['one']), S.nodes.page_break.create(), p(['two']), S.nodes.section_break.create({ kind: 'continuous' }), p(['three'])]);
    const r = rtfToDoc(docToRtf(doc, OPTS));
    r.check();
    expect(r.toJSON().content.map((n: any) => n.type)).toEqual(['paragraph', 'page_break', 'paragraph', 'section_break', 'paragraph']);
    expect(r.child(3).attrs.kind).toBe('continuous');
    const o = await importOdt(await bytesOf(await exportOdt(doc, OPTS)), 'x.odt');
    o.check();
    expect(o.toJSON().content.map((n: any) => n.type)).toEqual(['paragraph', 'page_break', 'paragraph', 'paragraph']);
  });
});
