// Writes sample files for tests/e2e/legacy-open.mjs (built from the published formats by the unit-test builders).
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildWp5, wp5Fn, buildWord6, buildWrite, buildWorksContents, buildHwp, cat, latin, enc } from '../unit/legacy-builders';

const dir = process.argv[2] || resolve(process.cwd(), 'build/legacy-e2e');
mkdirSync(dir, { recursive: true });
const fx = resolve(__dirname, '../fixtures/legacy');
// A WordPerfect 5.1 letter saved with a .doc name (content disagrees with the extension).
writeFileSync(resolve(dir, 'letter.doc'), buildWp5(cat(
  wp5Fn(0xd0, 0x06, [1, 2]), latin('WordPerfect Letter\n'), wp5Fn(0xd0, 0x06, [2, 1]),
  latin('Dear reader, this paragraph has '), [0xc3, 12, 0xc3], latin('bold'), [0xc4, 12, 0xc4], latin(', '), [0xc3, 8, 0xc3], latin('italic'), [0xc4, 8, 0xc4],
  latin(' and '), [0xc3, 14, 0xc3], latin('underlined'), [0xc4, 14, 0xc4], latin(' words, a footnote'), wp5Fn(0xd6, 0, [0, 1, 0, 0, 0, 0, 0, ...latin('Footnote from WordPerfect.')]),
  latin(' and an accented caf'), [0xc0, 41, 1, 0xc0], latin('.\n\nSincerely,\nThe Sender\n'),
)));
// A Word 6.0 memo with no extension at all.
writeFileSync(resolve(dir, 'memo'), buildWord6([
  { runs: [{ text: 'Word 6.0 Memo' }], istd: 1 },
  { runs: [{ text: 'This memo has ' }, { text: 'bold', sprms: [85, 1] }, { text: ' text and ' }, { text: 'Arial 14 point', sprms: [93, 1, 0, 99, 28] }, { text: '.' }] },
  { runs: [{ text: 'A centered closing line.' }], sprms: [5, 1] },
], { footnote: 'A Word 6 footnote.', header: 'Memo header' }));
writeFileSync(resolve(dir, 'notes.wri'), buildWrite([{ text: 'Windows Write Notes', bold: true, center: true, size: 18 }, { text: 'Written in Windows 3.1 Write, with an Arial font table.' }], { fonts: ['Arial'] }));
writeFileSync(resolve(dir, 'report.wps'), buildWorksContents('Microsoft Works Report\rThe Works 4.5 to 9 word processor keeps its text in a TEXT chunk.\r'));
writeFileSync(resolve(dir, 'hangul.hwp'), buildHwp([{ text: '한글 문서 제목', center: true }, { text: 'Bold Hangul body text', bold: true }]));
writeFileSync(resolve(dir, 'mail.eml'), enc(['From: Ann Writer <ann@example.com>', 'To: team@example.com', 'Subject: Project update', 'Date: Tue, 05 Mar 2024 10:00:00 +0000', 'Content-Type: text/html; charset=utf-8', '', '<p>Hello team,</p><p>The <b>new release</b> is ready.</p>'].join('\r\n')));
copyFileSync(resolve(fx, 'word97.doc'), resolve(dir, 'word97.doc'));
copyFileSync(resolve(fx, 'sheet.xlsx'), resolve(dir, 'budget.xlsx'));
console.log(dir);
