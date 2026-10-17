/**
 * Default arrangement of commands into tabs and groups. Every entry is a command id, so users
 * can rearrange, hide, or create tabs (Customize Tabs) and the Quick Access Bar chooser can
 * list "Commands Not in the Tabs" by diffing this layout against the registry.
 */
import type { App } from '../app';
import { isInTable } from 'prosemirror-tables';
import { NodeSelection } from 'prosemirror-state';
import { schema } from '../editor/schema';

export interface RibbonGroup { id: string; label: string; items: string[]; launcher?: string }
export interface RibbonTab { id: string; label: string; groups: RibbonGroup[]; contextual?: (app: App) => boolean; accent?: string; custom?: boolean }

const G = (id: string, label: string, items: string[], launcher?: string): RibbonGroup => ({ id, label, items, launcher });

export const DEFAULT_TABS: RibbonTab[] = [
  {
    id: 'home', label: 'Home', groups: [
      G('clipboard', 'Clipboard', ['edit.paste', 'edit.cut', 'edit.copy', 'fmt.painter', 'edit.clipboardPane'], 'edit.clipboardPane'),
      G('font', 'Font', ['fmt.font', 'fmt.size', 'fmt.grow', 'fmt.shrink', 'fmt.changeCase', 'fmt.clear', 'fmt.bold', 'fmt.italic', 'fmt.underline', 'fmt.strike', 'fmt.sub', 'fmt.sup', 'fmt.effects', 'fmt.highlight', 'fmt.color'], 'fmt.fontDialog'),
      G('paragraph', 'Paragraph', ['list.bullets', 'list.numbering', 'list.multilevel', 'list.checklist', 'para.outdent', 'para.indent', 'tools.sort', 'view.formattingMarks', 'para.align.left', 'para.align.center', 'para.align.right', 'para.align.justify', 'para.lineSpacing', 'para.shading', 'para.borders'], 'para.dialog'),
      G('styles', 'Styles', ['style.apply', 'style.pane'], 'style.pane'),
      G('editing', 'Editing', ['edit.find', 'edit.replace', 'nav.goto', 'edit.selectAll', 'edit.selectSimilar']),
      G('voice', 'Voice', ['review.dictate', 'review.readAloud']),
    ],
  },
  {
    id: 'insert', label: 'Insert', groups: [
      G('pages', 'Pages', ['insert.coverPage', 'insert.blankPage', 'insert.pageBreak']),
      G('tables', 'Tables', ['insert.table']),
      G('illustrations', 'Illustrations', ['insert.picture', 'insert.shapes', 'insert.icons', 'insert.diagram', 'insert.chart', 'draw.canvas']),
      G('links', 'Links', ['insert.link', 'insert.bookmark', 'refs.crossReference']),
      G('comments', 'Comments', ['review.newComment']),
      G('hf', 'Header & Footer', ['insert.header', 'insert.footer', 'insert.pageNumber']),
      G('text', 'Text', ['insert.textBox', 'insert.snippets', 'insert.decorativeText', 'para.dropCap', 'insert.signatureLine', 'insert.dateTime', 'insert.field', 'insert.chip', 'insert.checkbox', 'insert.object', 'insert.textFromFile', 'insert.hr', 'insert.codeBlock']),
      G('symbols', 'Symbols', ['insert.equation', 'insert.symbol', 'insert.emoji']),
    ],
  },
  {
    id: 'draw', label: 'Draw', groups: [
      G('tools', 'Drawing Tools', ['draw.pen', 'draw.pencil', 'draw.highlighter', 'draw.penSettings']),
      G('drawing', 'Drawing', ['draw.canvas', 'draw.graphPaper', 'draw.signature', 'draw.shapes', 'draw.editDrawing']),
    ],
  },
  {
    id: 'design', label: 'Design', groups: [
      G('formatting', 'Document Formatting', ['design.themes', 'design.styleSet', 'design.colors', 'design.fonts', 'design.paragraphSpacing', 'design.effects', 'design.setDefault']),
      G('background', 'Page Background', ['design.watermark', 'design.pageColor', 'design.pageBorders']),
    ],
  },
  {
    id: 'layout', label: 'Layout', groups: [
      G('pageSetup', 'Page Setup', ['layout.margins', 'layout.orientation', 'layout.size', 'layout.columns', 'layout.breaks', 'layout.lineNumbers', 'layout.hyphenation', 'layout.textDirection'], 'layout.pageSetup'),
      G('paragraph', 'Paragraph', ['layout.indentLeft', 'layout.indentRight', 'layout.spaceBefore', 'layout.spaceAfter', 'para.keepNext', 'para.keepLines', 'para.pageBreakBefore', 'para.widow'], 'para.dialog'),
      G('arrange', 'Arrange', ['layout.wrapText', 'layout.position', 'layout.bringForward', 'layout.sendBackward', 'layout.selectionPane', 'layout.align', 'layout.rotate']),
    ],
  },
  {
    id: 'references', label: 'References', groups: [
      G('toc', 'Table of Contents', ['refs.toc', 'refs.addText', 'refs.updateToc']),
      G('footnotes', 'Footnotes', ['refs.footnote', 'refs.endnote', 'nav.nextFootnote', 'refs.showNotes'], 'refs.footnoteOptions'),
      G('citations', 'Citations & Bibliography', ['refs.insertCitation', 'refs.manageSources', 'refs.citationStyle', 'refs.bibliography']),
      G('captions', 'Captions', ['refs.caption', 'refs.tof', 'refs.updateTof', 'refs.crossReference']),
      G('index', 'Index', ['refs.markEntry', 'refs.insertIndex', 'refs.updateIndex']),
      G('toa', 'Table of Authorities', ['refs.markCitation', 'refs.insertToa', 'refs.updateToa']),
    ],
  },
  {
    id: 'mailings', label: 'Mailings', groups: [
      G('create', 'Create', ['mail.envelopes', 'mail.labels']),
      G('start', 'Start Mail Merge', ['mail.start', 'mail.selectRecipients', 'mail.editRecipients']),
      G('fields', 'Write & Insert Fields', ['mail.highlightFields', 'mail.addressBlock', 'mail.greetingLine', 'mail.insertField', 'mail.rules']),
      G('preview', 'Preview Results', ['mail.preview', 'mail.first', 'mail.prev', 'mail.next', 'mail.last', 'mail.findRecipient', 'mail.checkErrors']),
      G('finish', 'Finish', ['mail.finish']),
    ],
  },
  {
    id: 'review', label: 'Review', groups: [
      G('proofing', 'Proofing', ['review.spelling', 'review.thesaurus', 'review.wordCount', 'review.readability', 'review.styleCoach']),
      G('speech', 'Speech', ['review.readAloud']),
      G('accessibility', 'Accessibility', ['review.accessibility']),
      G('language', 'Language', ['review.translate', 'fmt.language', 'review.spellDialect', 'review.dictionaries']),
      G('comments', 'Comments', ['review.newComment', 'review.deleteComment', 'review.prevComment', 'review.nextComment', 'review.showComments']),
      G('tracking', 'Tracking', ['review.trackChanges', 'review.markupView', 'review.showMarkup', 'review.reviewingPane']),
      G('changes', 'Changes', ['review.accept', 'review.reject', 'review.prevChange', 'review.nextChange']),
      G('compare', 'Compare', ['review.compare', 'review.combine']),
      G('protect', 'Protect', ['review.restrictEditing', 'review.markFinal']),
      G('ink', 'Ink', ['review.hideInk']),
    ],
  },
  {
    id: 'view', label: 'View', groups: [
      G('views', 'Views', ['view.read', 'view.print', 'view.mobile', 'view.web', 'view.outline', 'view.draft', 'view.focus']),
      G('immersive', 'Immersive', ['view.immersiveReader', 'view.teleprompter', 'view.distractionFree']),
      G('show', 'Show', ['view.ruler', 'view.gridlines', 'view.navPane', 'view.formattingMarks', 'view.revealCodes']),
      G('zoom', 'Zoom', ['view.zoom', 'view.zoom100', 'view.onePage', 'view.multiplePages', 'view.pageWidth']),
      G('writing', 'Writing', ['view.focusMode', 'view.typewriter', 'view.writingGoal']),
      G('window', 'Window', ['view.newWindow', 'view.switchWindows', 'view.fullScreen', 'view.darkMode']),
      G('macros', 'Macros', ['dev.macros', 'dev.recordMacro']),
    ],
  },
  {
    id: 'tools', label: 'Tools', groups: [
      G('cleanup', 'Clean Up', ['tools.ocrCleanup', 'tools.unwrapLines', 'tools.removeEmpty', 'tools.collapseSpaces', 'tools.removeLineBreaks', 'tools.dehyphenate']),
      G('typography', 'Typography', ['tools.typographer', 'tools.smartQuotes', 'tools.straightQuotes', 'tools.dashes', 'tools.autoFormatNow']),
      G('text', 'Text', ['tools.sort', 'tools.dedupe', 'tools.reverse', 'tools.prefixSuffix', 'tools.extract']),
      G('analyze', 'Analyze', ['tools.wordFrequency', 'tools.repeatedPhrases', 'tools.statistics', 'tools.calculate']),
    ],
  },
  {
    id: 'ai', label: 'AI', groups: [
      G('assistant', 'Assistant', ['ai.chat', 'ai.ask', 'ai.command', 'ai.setup', 'ai.runPrompt', 'ai.prompts', 'ai.settings', 'ai.privacy', 'ai.stop'], 'ai.settings'),
      G('providers', 'Providers', ['ai.chooseProvider', 'ai.providers', 'ai.ensembleMode', 'ai.ensembleMembers', 'ai.showDeliberation'], 'ai.ensembleMembers'),
      G('write', 'Write', ['ai.draft', 'ai.continue', 'ai.fromTemplate', 'ai.createDocument', 'ai.brainstorm', 'ai.outline', 'ai.titles']),
      G('rewrite', 'Rewrite', ['ai.rewrite', 'ai.improve', 'ai.tone', 'ai.style', 'ai.edit', 'ai.simplify', 'ai.natural', 'ai.matchVoice']),
      G('length', 'Length & Structure', ['ai.shorten', 'ai.expand', 'ai.bullets', 'ai.table', 'ai.keyPoints', 'ai.addDetail', 'ai.headings']),
      G('proof', 'Proofing', ['ai.proofread', 'ai.clarity', 'ai.styleGuide', 'ai.ocrFix']),
      G('analyze', 'Summarize & Analyze', ['ai.summarize', 'ai.summaryTop', 'ai.actionItems', 'ai.explain', 'ai.analyze', 'ai.faq', 'ai.extractData']),
      G('translate', 'Translate', ['ai.translate', 'ai.translateDoc', 'ai.bilingual', 'ai.detectLanguage']),
      G('research', 'Research', ['ai.findSources', 'ai.flagClaims', 'ai.citation']),
      G('review', 'Review', ['ai.feedback', 'ai.readerView', 'ai.grade', 'ai.critique', 'ai.summarizeComments', 'ai.draftReply', 'ai.reviewEdits']),
      G('media', 'Pictures', ['ai.altText', 'ai.imageToText', 'ai.describeImage', 'ai.generateImage']),
      G('creative', 'Creative', ['ai.describe', 'ai.names', 'ai.dialogue', 'ai.storyNotes', 'ai.clearLocal']),
    ],
  },
  {
    id: 'developer', label: 'Developer', groups: [
      G('code', 'Code', ['dev.macros', 'dev.recordMacro', 'dev.pauseRecording', 'dev.stopRecording', 'dev.newScript', 'dev.runScript']),
      G('controls', 'Controls', ['dev.control.rich', 'dev.control.text', 'dev.control.picture', 'dev.control.checkbox', 'dev.control.combo', 'dev.control.dropdown', 'dev.control.date', 'dev.designMode', 'dev.controlProperties']),
      G('protect', 'Protect', ['dev.restrictEditing', 'dev.fillForms', 'dev.exportFormData']),
      G('templates', 'Templates', ['dev.documentTemplate', 'dev.documentPanel']),
    ],
  },
  {
    id: 'help', label: 'Help', groups: [
      G('help', 'Help', ['view.commandSearch', 'help.shortcuts', 'help.commands', 'help.tour', 'help.whatsNew', 'help.feedback', 'help.notices', 'help.about']),
    ],
  },
  {
    id: 'tableDesign', label: 'Table Design', accent: '#7a4ab0', contextual: (app) => isInTable(app.state), groups: [
      G('options', 'Table Style Options', ['table.toggleHeaderRow', 'table.totalRow', 'table.bandedRows', 'table.toggleHeaderCol', 'table.lastCol', 'table.bandedCols']),
      G('styles', 'Table Styles', ['table.style', 'table.shading']),
      G('borders', 'Borders', ['table.borders', 'para.borderStyle']),
    ],
  },
  {
    id: 'tableLayout', label: 'Table Layout', accent: '#7a4ab0', contextual: (app) => isInTable(app.state), groups: [
      G('table', 'Table', ['table.selectTable', 'table.selectRow', 'table.selectCol', 'table.selectCell', 'table.gridlines', 'table.properties']),
      G('rows', 'Rows & Columns', ['table.deleteMenu', 'table.insertRowAbove', 'table.insertRowBelow', 'table.insertColLeft', 'table.insertColRight']),
      G('merge', 'Merge', ['table.merge', 'table.split', 'table.splitTable']),
      G('size', 'Cell Size', ['table.autofit', 'table.distributeRows', 'table.distributeCols']),
      G('align', 'Alignment', ['table.align', 'table.textDirection', 'table.cellMargins']),
      G('data', 'Data', ['table.sort', 'table.repeatHeader', 'table.toText', 'table.formula']),
    ],
  },
  {
    id: 'picture', label: 'Picture Format', accent: '#b05a2a', contextual: (app) => { const s = app.state.selection; return s instanceof NodeSelection && s.node.type === schema.nodes.image; }, groups: [
      G('adjust', 'Adjust', ['picture.removeBackground', 'picture.corrections', 'picture.filter', 'picture.compress', 'picture.change', 'picture.reset', 'picture.editGraphic']),
      G('styles', 'Picture Styles', ['picture.styles', 'picture.border', 'picture.shadow']),
      G('accessibility', 'Accessibility', ['picture.altText']),
      G('arrange', 'Arrange', ['picture.wrap', 'picture.rotate', 'picture.flipH', 'picture.flipV']),
      G('size', 'Size', ['picture.crop', 'picture.size']),
    ],
  },
];

export const BACKSTAGE_ITEMS = ['file.new', 'file.open', 'file.save', 'file.saveAs', 'file.print', 'file.share', 'file.exportPdf', 'file.properties', 'file.versions', 'file.close', 'file.options'];

export function tabsFor(app: App): RibbonTab[] {
  const custom: RibbonTab[] = app.prefs.customTabs.filter((t) => !t.hidden).map((t) => ({ id: t.id, label: t.label, groups: t.groups.map((g) => ({ id: g.id, label: g.label, items: g.items })), custom: true }));
  const builtins = DEFAULT_TABS.filter((t) => !app.prefs.hiddenTabs.includes(t.id));
  const all = [...builtins, ...custom];
  if (app.prefs.tabOrder.length) all.sort((a, b) => { const ia = app.prefs.tabOrder.indexOf(a.id), ib = app.prefs.tabOrder.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
  return all;
}

export function idsInTabs(): Set<string> {
  const s = new Set<string>();
  for (const t of DEFAULT_TABS) for (const g of t.groups) for (const i of g.items) s.add(i);
  for (const i of BACKSTAGE_ITEMS) s.add(i);
  return s;
}
