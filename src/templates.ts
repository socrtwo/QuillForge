/** Built-in document templates (all original content). */
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from './editor/schema';
import { defaultSettings, type DocSettings } from './editor/settings';
import { createTable } from './commands/insert';

const N = schema.nodes;
const M = schema.marks;
const P = (text = '', attrs: Record<string, any> = {}, marks: any[] = []) => N.paragraph.create(attrs, text ? schema.text(text, marks) : null);
const B = () => [M.bold.create()];
const F = (type: string, arg?: string, format?: string) => N.field.create({ type, arg: arg || null, format: format || null });

export interface Template { id: string; name: string; category: string; description: string; build: (author: string) => PMNode }

function doc(blocks: PMNode[], tweak?: (s: DocSettings) => void): PMNode {
  const s = defaultSettings();
  tweak?.(s);
  return schema.node('doc', { settings: s }, blocks);
}

export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank Document', category: 'General', description: 'An empty page.', build: () => doc([P()]) },
  {
    id: 'letter', name: 'Business Letter (Block)', category: 'Letters', description: 'Full-block business letter with date field.',
    build: (author) => doc([
      P(author, {}, B()), P('Street Address', { style: 'No Spacing' }), P('City, State ZIP', { style: 'No Spacing' }), P(),
      N.paragraph.create(null, [F('DATE', undefined, 'MMMM d, yyyy')]), P(),
      P('Recipient Name', { style: 'No Spacing' }), P('Title', { style: 'No Spacing' }), P('Company', { style: 'No Spacing' }), P('Street Address', { style: 'No Spacing' }), P('City, State ZIP', { style: 'No Spacing' }), P(),
      P('Dear Recipient Name:', { style: 'Salutation' }),
      P('State the purpose of your letter in the first paragraph. Keep it brief and direct.'),
      P('Use the middle paragraphs to give supporting details, facts, or requests.'),
      P('Close with a summary of what happens next and thank the reader.'),
      P('Sincerely,', { style: 'Closing', indentLeft: null }), P(), P(), P(author, { style: 'Signature', indentLeft: null }),
    ]),
  },
  {
    id: 'memo', name: 'Memo', category: 'Business', description: 'Interoffice memorandum.',
    build: (author) => doc([
      P('MEMORANDUM', { style: 'Title' }),
      N.paragraph.create({ tabs: JSON.stringify([{ pos: 72, align: 'left', leader: 'none' }]) }, [schema.text('TO:', B()), schema.text('\tName')]),
      N.paragraph.create(null, [schema.text('FROM:', B()), schema.text(`\t${author}`)]),
      N.paragraph.create(null, [schema.text('DATE:', B()), schema.text('\t'), F('DATE', undefined, 'MMMM d, yyyy')]),
      N.paragraph.create({ border: JSON.stringify({ bottom: '1.5pt solid #000' }) }, [schema.text('RE:', B()), schema.text('\tSubject')]),
      P('Summary of the topic.'), P('Details', { style: 'Heading 2' }), P('Supporting information.'), P('Action Items', { style: 'Heading 2' }),
      N.task_list.create(null, [N.task_item.create(null, P('First action')), N.task_item.create(null, P('Second action'))]),
    ]),
  },
  {
    id: 'report', name: 'Report', category: 'Business', description: 'Title, contents, numbered sections.',
    build: (author) => doc([
      P('Report Title', { style: 'Title' }), P('Subtitle or short description', { style: 'Subtitle' }), N.paragraph.create(null, [schema.text(`${author} · `), F('DATE', undefined, 'MMMM d, yyyy')]),
      N.gen_block.create({ kind: 'toc', options: { levels: 2, title: 'Contents' } }), N.page_break.create(),
      P('Executive Summary', { style: 'Heading 1' }), P('Summarize the findings and recommendations.'),
      P('Background', { style: 'Heading 1' }), P('Describe the context.'),
      P('Findings', { style: 'Heading 1' }), P('Key finding', { style: 'Heading 2' }), P('Discussion of the finding.'),
      P('Recommendations', { style: 'Heading 1' }), N.ordered_list.create(null, [N.list_item.create(null, P('First recommendation')), N.list_item.create(null, P('Second recommendation'))]),
    ], (s) => { s.footer = { left: '{TITLE}', center: '', right: 'Page {PAGE} of {NUMPAGES}' }; s.properties.title = 'Report Title'; }),
  },
  {
    id: 'resume', name: 'Résumé', category: 'Personal', description: 'Clean single-column résumé.',
    build: (author) => doc([
      P(author, { style: 'Title', align: 'center' }), P('City, State · phone · email · website', { align: 'center', style: 'Subtitle' }),
      P('Summary', { style: 'Heading 1' }), P('Two or three sentences describing your experience and goals.'),
      P('Experience', { style: 'Heading 1' }), N.paragraph.create({ tabs: JSON.stringify([{ pos: 468, align: 'right', leader: 'none' }]) }, [schema.text('Job Title, Company', B()), schema.text('\t2020 – Present')]),
      N.bullet_list.create(null, [N.list_item.create(null, P('Accomplishment with a measurable result')), N.list_item.create(null, P('Another accomplishment'))]),
      P('Education', { style: 'Heading 1' }), P('Degree, Institution, Year'),
      P('Skills', { style: 'Heading 1' }), P('Skill · Skill · Skill · Skill'),
    ], (s) => { s.page.margin = { top: 54, bottom: 54, left: 54, right: 54 }; s.styleSet = 'Modern'; }),
  },
  {
    id: 'manuscript', name: 'Manuscript (Standard Format)', category: 'Publishing', description: '12 pt, double-spaced, 1" margins, running header with surname/title/page.',
    build: (author) => doc([
      P(author), P('Address'), P('City, State ZIP'), P('Email · Phone'), P('About 80,000 words', { align: 'right' }), P(), P(), P(), P(),
      P('TITLE OF THE WORK', { align: 'center', indentFirst: 0 }), P(`by ${author}`, { align: 'center', indentFirst: 0 }), N.page_break.create(),
      P('Chapter One', { style: 'Heading 1', pageBreakBefore: false }), P('Begin your story here. Paragraphs are indented half an inch and double-spaced.'),
      P('#', { align: 'center', indentFirst: 0 }), P('Use a centered # to mark scene breaks.'),
    ], (s) => { s.styleSet = 'Manuscript'; s.header = { left: '', center: '', right: `${author.split(' ').pop()} / TITLE / {PAGE}` }; s.differentFirst = true; }),
  },
  {
    id: 'book', name: 'Book Interior (6×9)', category: 'Publishing', description: 'Trade paperback page with mirrored margins and book style set.',
    build: () => doc([
      P('Book Title', { style: 'Title' }), N.page_break.create(), P('Chapter 1', { style: 'Heading 1' }),
      P('The first paragraph of a chapter is not indented in traditional book typography.', { indentFirst: 0 }),
      P('Subsequent paragraphs carry a small first-line indent and no space between them, set justified with hyphenation on.'),
    ], (s) => { s.page = { ...s.page, sizeName: 'Trade 6x9', width: 432, height: 648, margin: { top: 54, bottom: 54, left: 63, right: 45 }, mirror: true }; s.styleSet = 'Book'; s.hyphenation = true; s.footer = { left: '', center: '{PAGE}', right: '' }; s.differentFirst = true; }),
  },
  {
    id: 'screenplay', name: 'Screenplay', category: 'Publishing', description: 'Industry-style screenplay styles (scene, action, character, dialogue).',
    build: () => doc([
      P('FADE IN:', { style: 'Screenplay Transition', align: 'left' }),
      P('INT. KITCHEN - NIGHT', { style: 'Screenplay Scene' }),
      P('A single bulb sways over a table covered with papers.', { style: 'Screenplay Action' }),
      P('ALEX', { style: 'Screenplay Character' }), P('(quietly)', { style: 'Screenplay Parenthetical' }), P('We should have left an hour ago.', { style: 'Screenplay Dialogue' }),
      P('CUT TO:', { style: 'Screenplay Transition' }),
    ], (s) => { s.page.margin = { top: 72, bottom: 72, left: 108, right: 72 }; s.header = { left: '', center: '', right: '{PAGE}.' }; s.differentFirst = true; s.styles['Screenplay Scene'] = { name: 'Screenplay Scene', type: 'paragraph', basedOn: 'Normal', next: 'Screenplay Action', font: 'Courier Prime', size: 12, caps: true, spaceBefore: 12, spaceAfter: 12 } as any; s.styles['Screenplay Character'] = { name: 'Screenplay Character', type: 'paragraph', basedOn: 'Normal', next: 'Screenplay Dialogue', font: 'Courier Prime', size: 12, caps: true, indentLeft: 158, spaceAfter: 0 } as any; s.styles['Screenplay Dialogue'] = { name: 'Screenplay Dialogue', type: 'paragraph', basedOn: 'Normal', next: 'Screenplay Action', font: 'Courier Prime', size: 12, indentLeft: 72, indentRight: 108, spaceAfter: 12 } as any; }),
  },
  {
    id: 'apa', name: 'Academic Paper (APA-style)', category: 'Academic', description: 'Title page, running head, double spacing, references.',
    build: (author) => doc([
      P(), P(), P(), P('Title of the Paper', { align: 'center', indentFirst: 0 }, B()), P(), P(author, { align: 'center', indentFirst: 0 }), P('Institution', { align: 'center', indentFirst: 0 }), P('Course', { align: 'center', indentFirst: 0 }), P('Instructor', { align: 'center', indentFirst: 0 }), N.paragraph.create({ align: 'center', indentFirst: 0 }, [F('DATE', undefined, 'MMMM d, yyyy')]),
      N.page_break.create(), P('Abstract', { style: 'Heading 1' }), P('A 150–250 word summary of the paper.', { indentFirst: 0 }), N.page_break.create(),
      P('Title of the Paper', { style: 'Heading 1' }), P('Introduction text.'), P('Method', { style: 'Heading 1' }), P('Participants', { style: 'Heading 2' }), P('Text.'),
      P('Results', { style: 'Heading 1' }), P('Text.'), P('Discussion', { style: 'Heading 1' }), P('Text.'), N.page_break.create(),
      N.gen_block.create({ kind: 'bibliography', options: { title: 'References' } }),
    ], (s) => { s.styleSet = 'Academic'; s.citationStyle = 'APA'; s.header = { left: '', center: '', right: '{PAGE}' }; }),
  },
  {
    id: 'minutes', name: 'Meeting Minutes', category: 'Business', description: 'Attendees, agenda, decisions, action items.',
    build: () => doc([
      P('Meeting Minutes', { style: 'Title' }), N.paragraph.create(null, [schema.text('Date: ', B()), F('DATE', undefined, 'MMMM d, yyyy'), schema.text('   Time:   Location:')]),
      P('Attendees', { style: 'Heading 2' }), P('Names'), P('Agenda', { style: 'Heading 2' }),
      N.ordered_list.create(null, [N.list_item.create(null, P('Item one')), N.list_item.create(null, P('Item two'))]),
      P('Decisions', { style: 'Heading 2' }), P('Record decisions here.'), P('Action Items', { style: 'Heading 2' }),
      createTable(4, 3, { header: true, data: [['Action', 'Owner', 'Due'], ['', '', ''], ['', '', ''], ['', '', '']], style: 'Grid Table Light' }),
    ]),
  },
  {
    id: 'newsletter', name: 'Newsletter (2 columns)', category: 'Business', description: 'Masthead and two-column body.',
    build: () => doc([
      P('THE NEWSLETTER', { style: 'Title', align: 'center' }), N.paragraph.create({ align: 'center', border: JSON.stringify({ top: '1.5pt solid #000', bottom: '1.5pt solid #000' }) }, [schema.text('Volume 1 · Issue 1 · '), F('DATE', undefined, 'MMMM yyyy')]),
      N.column_section.create({ count: 2, gap: 24, rule: true }, [P('Lead Story', { style: 'Heading 1' }), P('Write the main article here. The text flows from the first column into the second.'), P('Second Story', { style: 'Heading 2' }), P('More content.'), P('Upcoming Events', { style: 'Heading 2' }), N.bullet_list.create(null, [N.list_item.create(null, P('Event, date')), N.list_item.create(null, P('Event, date'))])]),
    ], (s) => { s.styleSet = 'Newsletter'; }),
  },
  {
    id: 'invoice', name: 'Invoice', category: 'Business', description: 'Itemized invoice with formula total.',
    build: (author) => doc([
      P('INVOICE', { style: 'Title', align: 'right' }), P(author, {}, B()), P('Address · Phone · Email', { style: 'No Spacing' }), P(),
      N.paragraph.create(null, [schema.text('Invoice #: ', B()), schema.text('0001   '), schema.text('Date: ', B()), F('DATE', undefined, 'M/d/yyyy')]),
      P('Bill To:', {}, B()), P('Client name and address'),
      createTable(6, 4, { header: true, style: 'List Table Accent', data: [['Description', 'Qty', 'Unit Price', 'Amount'], ['Service', '1', '100.00', '100.00'], ['', '', '', ''], ['', '', '', ''], ['', '', 'Subtotal', ''], ['', '', 'Total', '']] }),
      P('Thank you for your business!', { align: 'center' }),
    ]),
  },
  {
    id: 'familyGroup', name: 'Family Group Sheet', category: 'Genealogy', description: 'Husband, wife and children with vital events and sources.',
    build: () => doc([
      P('Family Group Sheet', { style: 'Title' }),
      createTable(10, 3, { header: true, style: 'Table Grid', data: [['', 'Husband', 'Wife'], ['Full name', '', ''], ['Born (date, place)', '', ''], ['Christened', '', ''], ['Married (date, place)', '', ''], ['Died (date, place)', '', ''], ['Buried', '', ''], ['Father', '', ''], ['Mother', '', ''], ['Other spouses', '', '']] }),
      P('Children', { style: 'Heading 2' }),
      createTable(6, 5, { header: true, style: 'Table Grid', data: [['#', 'Name (sex)', 'Born (date, place)', 'Married (spouse, date)', 'Died (date, place)'], ['1', '', '', '', ''], ['2', '', '', '', ''], ['3', '', '', '', ''], ['4', '', '', '', ''], ['5', '', '', '', '']] }),
      P('Sources', { style: 'Heading 2' }), N.ordered_list.create(null, [N.list_item.create(null, P('Citation'))]), P('Research Notes', { style: 'Heading 2' }), P(),
    ], (s) => { s.page.orientation = 'landscape'; s.page.margin = { top: 36, bottom: 36, left: 36, right: 36 }; }),
  },
  {
    id: 'researchLog', name: 'Research Log', category: 'Genealogy', description: 'Repository, source, search goal and results for each search.',
    build: () => doc([
      P('Research Log', { style: 'Title' }), P('Objective: ', {}, B()), P('Ancestor / Family: ', {}, B()),
      createTable(8, 6, { header: true, style: 'Grid Table Light', data: [['Date', 'Repository / Call #', 'Source (title, author, year)', 'Searched for', 'Result', 'Notes / Next step'], ...Array.from({ length: 7 }, () => ['', '', '', '', '', ''])] }),
    ], (s) => { s.page.orientation = 'landscape'; s.page.margin = { top: 36, bottom: 36, left: 36, right: 36 }; }),
  },
  {
    id: 'recipe', name: 'Recipe Card', category: 'Personal', description: 'Ingredients checklist and numbered steps.',
    build: () => doc([
      P('Recipe Name', { style: 'Title' }), P('Serves 4 · Prep 15 min · Cook 30 min', { style: 'Subtitle' }), P('Ingredients', { style: 'Heading 2' }),
      N.task_list.create(null, [N.task_item.create(null, P('1 cup ingredient')), N.task_item.create(null, P('2 tbsp ingredient'))]),
      P('Directions', { style: 'Heading 2' }), N.ordered_list.create(null, [N.list_item.create(null, P('First step')), N.list_item.create(null, P('Second step'))]), P('Notes', { style: 'Heading 2' }), P(),
    ], (s) => { s.page = { ...s.page, sizeName: 'Index Card 4x6', width: 288, height: 432, orientation: 'landscape', margin: { top: 24, bottom: 24, left: 24, right: 24 } }; }),
  },
  {
    id: 'fax', name: 'Cover Sheet', category: 'Business', description: 'Transmittal cover sheet.',
    build: (author) => doc([
      P('COVER SHEET', { style: 'Title', align: 'center' }),
      createTable(6, 2, { style: 'Plain Table Lines', data: [['To:', ''], ['From:', author], ['Date:', ''], ['Pages (incl. cover):', ''], ['Re:', ''], ['CC:', '']] }),
      P('☐ Urgent   ☐ For Review   ☐ Please Comment   ☐ Please Reply'), P('Comments', { style: 'Heading 2' }), P(),
    ]),
  },
];
