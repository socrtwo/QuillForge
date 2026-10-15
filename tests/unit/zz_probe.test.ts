import { test } from 'vitest';
import JSZip from 'jszip';
import { schema as S } from '../../src/editor/schema';
import { defaultSettings } from '../../src/editor/settings';
import { docToMarkdown } from '../../src/io/markdown';
import { docToRtf } from '../../src/io/rtf';
import { exportOdtBytes } from '../../src/io/odt';
const p = (c: any[], a: any = {}) => S.nodes.paragraph.create(a, c.map((x) => (typeof x === 'string' ? S.text(x) : x)));
test('probe', async () => {
  const nested = S.nodes.ordered_list.create(null, [S.nodes.list_item.create(null, [p(['Sub one'])]), S.nodes.list_item.create(null, [p(['Sub two'])])]);
  const doc = S.node('doc', { settings: defaultSettings() }, [
    p(['Title here'], { style: 'Title' }),
    p(['Intro ', S.text('bold ', [S.marks.bold.create()]), S.text('both', [S.marks.bold.create(), S.marks.italic.create()]), ' x ', S.text('code`tick', [S.marks.code.create()]), S.nodes.footnote.create({ text: 'N' })]),
    S.nodes.bullet_list.create(null, [S.nodes.list_item.create(null, [p(['Item one']), nested]), S.nodes.list_item.create(null, [p(['Item two']), p(['second para'])])]),
    S.nodes.table.create({ headerRows: 1 }, [
      S.nodes.table_row.create(null, [S.nodes.table_header.create({ colspan: 2 }, p(['Wide']))]),
      S.nodes.table_row.create(null, [S.nodes.table_cell.create(null, p(['a'])), S.nodes.table_cell.create(null, p(['b']))]),
    ]),
    p(['Quote me'], { style: 'Quote' }),
  ]);
  console.log(docToMarkdown(doc));
  const rtf = docToRtf(doc, { fileName: 'a', author: 'b' });
  console.log(rtf.slice(rtf.indexOf('\\pard\\plain\\s0'), rtf.indexOf('\\pard\\plain\\s0') + 3000));
  const z = await JSZip.loadAsync(await exportOdtBytes(doc, { fileName: 'a', author: 'b' }));
  const c = await z.file('content.xml')!.async('string');
  console.log(c.slice(c.indexOf('<office:body>')).slice(0, 3000));
});
