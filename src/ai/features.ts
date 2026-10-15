/**
 * AI features as data. Collected from a survey of word processors and writing tools
 * (desktop and web office suites, note apps, writing assistants, fiction tools) and named
 * generically: no product's feature branding is used.
 *
 * Each feature says what it reads (input), what it produces (output), and how to prompt.
 */

export type AiInput = 'selection' | 'selectionOrParagraph' | 'selectionOrDocument' | 'document' | 'before' | 'prompt' | 'image' | 'comment' | 'none';
export type AiOutput = 'preview' | 'replace' | 'insertBelow' | 'cursor' | 'pane' | 'comments' | 'newDoc' | 'tracked';

export interface AiFeature {
  id: string;
  label: string;
  icon: string;
  group: string;
  tip: string;
  input: AiInput;
  output: AiOutput;
  tier?: 'fast' | 'quality';
  temperature?: number;
  /** Markdown structure allowed in the answer (lists, tables, headings). */
  markdown?: boolean;
  /** Ask for several alternatives (preview shows them). */
  alternatives?: boolean;
  /** Ask the user for extra text first. */
  ask?: { title: string; label: string; placeholder?: string; multiline?: boolean };
  /** Menu of variants passed as `arg`. */
  options?: { value: string; label: string }[];
  keys?: string[];
  popular?: boolean;
  keywords?: string;
  /** Build the instruction. `arg` is the chosen option, `extra` the asked text. */
  prompt: (ctx: { text: string; arg?: string; extra?: string; lang: string; n: number }) => string;
  /** Feature-specific system guidance appended to the base system prompt. */
  system?: string;
  maxTokens?: number;
}

export const BASE_SYSTEM = [
  'You are the writing assistant built into a word processor.',
  'Return only the requested text: no preamble, no explanation, no closing remarks, no surrounding quotation marks, and no code fences.',
  'Keep the language of the input unless asked to translate. Keep names, numbers, dates, quotations and facts unchanged unless asked to change them. Never invent facts, sources, statistics or quotations; where something is needed but unknown, write [placeholder] with a short description.',
  'Use plain paragraphs separated by a blank line. Use Markdown lists, tables or headings only when the task asks for structure.',
].join(' ');

const langNote = (lang: string) => (lang && lang !== 'auto' ? ` Write in ${lang}.` : '');

export const TONES = ['Professional', 'Formal', 'Casual', 'Friendly', 'Confident', 'Diplomatic', 'Enthusiastic', 'Neutral', 'Persuasive', 'Empathetic', 'Humorous', 'Respectful', 'Direct', 'Warm'];
export const STYLES = ['Simple', 'Business', 'Academic', 'Technical', 'Fluent', 'Creative', 'Journalistic', 'Legal', 'Plain language', 'Conversational', 'Literary', 'Scientific'];
export const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish', 'Czech', 'Hungarian', 'Romanian', 'Greek', 'Turkish', 'Russian', 'Ukrainian', 'Hebrew', 'Arabic', 'Persian', 'Hindi', 'Bengali', 'Urdu', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean', 'Vietnamese', 'Thai', 'Indonesian', 'Malay', 'Filipino', 'Swahili', 'Latin', 'Esperanto', 'Irish', 'Welsh', 'Yiddish'];
export const DETAILS = ['Example', 'Counterargument', 'Definition', 'Analogy', 'Supporting evidence placeholder', 'Quotation placeholder', 'Transition', 'Summary sentence', 'Rhetorical question', 'Anecdote'];
export const READERS = ['General reader', 'Subject expert', 'Copy editor', 'Skeptical reviewer', 'Hiring manager', 'Investor', 'Teacher grading the work', 'Student (age 14)', 'Non-native English speaker', 'Customer', 'Literary agent', 'Peer reviewer (academic)'];
export const TEMPLATES = ['Business letter', 'Cover letter', 'Memo', 'Email reply', 'Meeting agenda', 'Meeting minutes', 'Press release', 'Blog post', 'Newsletter article', 'Product description', 'Project proposal', 'Executive summary', 'Report outline', 'Résumé summary', 'Thank-you note', 'Complaint letter', 'Grant proposal outline', 'Lesson plan', 'Research abstract', 'Family history narrative', 'Biographical sketch', 'Obituary', 'Speech', 'Social media post', 'FAQ'];

const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

export const FEATURES: AiFeature[] = [
  // ---------------------------------------------------------------- Write
  {
    id: 'ai.draft', label: 'Draft with AI…', icon: 'edit_note', group: 'Write', tip: 'Write new text at the cursor from a description', input: 'prompt', output: 'preview', tier: 'quality', temperature: 0.7, markdown: true, popular: true, keys: ['Mod-Alt-j'],
    ask: { title: 'Draft with AI', label: 'What should be written?', placeholder: 'e.g. A friendly two-paragraph invitation to our family reunion on June 12 at the county park', multiline: true },
    prompt: ({ extra, text, lang }) => `Write the following for a document.${langNote(lang)}\n\nRequest: ${extra}${text ? `\n\nSurrounding text for context (do not repeat it):\n${text}` : ''}`,
  },
  {
    id: 'ai.continue', label: 'Continue Writing', icon: 'keyboard_double_arrow_right', group: 'Write', tip: 'Write the next sentences in the same voice', input: 'before', output: 'preview', tier: 'quality', temperature: 0.8, keys: ['Mod-Alt-Shift-.'], popular: true,
    prompt: ({ text }) => `Continue this text with one or two new paragraphs in the same voice, tense and style. Do not repeat or summarize what is already written.\n\n${text}`,
  },
  {
    id: 'ai.fromTemplate', label: 'Draft from Template', icon: 'description', group: 'Write', tip: 'Draft a common document type from a few details', input: 'prompt', output: 'newDoc', tier: 'quality', temperature: 0.6, markdown: true, options: opt(TEMPLATES),
    ask: { title: 'Draft from Template', label: 'Details to include (names, dates, purpose, length)…', multiline: true },
    prompt: ({ arg, extra, lang }) => `Draft a complete ${arg || 'document'} using these details:\n${extra || '(none given; use [placeholders])'}\nUse headings and lists only where that kind of document normally has them.${langNote(lang)}`,
  },
  {
    id: 'ai.createDocument', label: 'Create Document from Brief…', icon: 'note_add', group: 'Write', tip: 'Produce a full multi-section document in a new window from a brief', input: 'prompt', output: 'newDoc', tier: 'quality', temperature: 0.6, markdown: true, maxTokens: 6000,
    ask: { title: 'Create Document', label: 'Describe the document (purpose, audience, sections, length)', multiline: true },
    prompt: ({ extra, lang }) => `Write a complete, well-organized document from this brief. Use Markdown headings for sections.${langNote(lang)}\n\nBrief:\n${extra}`,
  },
  {
    id: 'ai.brainstorm', label: 'Brainstorm Ideas…', icon: 'lightbulb', group: 'Write', tip: 'List ideas, angles or names for a topic', input: 'prompt', output: 'pane', tier: 'fast', temperature: 0.9, markdown: true,
    ask: { title: 'Brainstorm', label: 'Topic or question', placeholder: 'e.g. Titles for a chapter about our grandparents\' farm' },
    prompt: ({ extra, text }) => `Brainstorm 12 varied, specific ideas for: ${extra}\nReturn a Markdown bulleted list, one idea per bullet.${text ? `\n\nDocument context:\n${text.slice(0, 4000)}` : ''}`,
  },
  {
    id: 'ai.outline', label: 'Generate Outline…', icon: 'format_list_numbered', group: 'Write', tip: 'Insert a structured outline for a topic or for the selection', input: 'prompt', output: 'insertBelow', tier: 'quality', temperature: 0.5, markdown: true,
    ask: { title: 'Generate Outline', label: 'Topic (leave empty to outline the selected text)' },
    prompt: ({ extra, text }) => (extra ? `Write a detailed outline for: ${extra}` : `Write an outline of the main points of this text:\n\n${text}`) + '\nUse a nested Markdown numbered list.',
  },
  {
    id: 'ai.titles', label: 'Suggest Titles', icon: 'title', group: 'Write', tip: 'Suggest titles or headings for the selection or document', input: 'selectionOrDocument', output: 'pane', tier: 'fast', temperature: 0.8, markdown: true,
    prompt: ({ text }) => `Suggest 8 titles for this text, from plain to catchy. Markdown bulleted list only.\n\n${text}`,
  },
  {
    id: 'ai.command', label: 'Inline AI Command…', icon: 'bolt', group: 'Write', tip: 'Type an instruction and insert the answer at the cursor', input: 'prompt', output: 'cursor', tier: 'fast', temperature: 0.5, keys: ['Mod-Alt-Shift-i'], markdown: true,
    ask: { title: 'AI Command', label: 'Instruction', placeholder: 'e.g. a haiku about autumn, a table of US time zones, the formula for compound interest' },
    prompt: ({ extra, text }) => `${extra}${text ? `\n\nSelected text:\n${text}` : ''}`,
  },
  // ---------------------------------------------------------------- Rewrite
  {
    id: 'ai.rewrite', label: 'Rewrite', icon: 'autorenew', group: 'Rewrite', tip: 'Offer several rewordings of the selection to choose from', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.8, alternatives: true, popular: true, keys: ['Mod-Alt-Shift-r'],
    prompt: ({ text, n }) => `Rewrite the text below in ${n} different ways that keep its meaning, facts and length. Separate the versions with a line containing only ---.\n\n${text}`,
  },
  {
    id: 'ai.improve', label: 'Improve Writing', icon: 'auto_fix_high', group: 'Rewrite', tip: 'Polish clarity, flow and word choice', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.4,
    prompt: ({ text }) => `Improve the clarity, flow and word choice of this text without changing its meaning, voice or facts:\n\n${text}`,
  },
  {
    id: 'ai.tone', label: 'Change Tone', icon: 'theater_comedy', group: 'Rewrite', tip: 'Rewrite the selection in another tone', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.6, options: opt(TONES),
    prompt: ({ text, arg }) => `Rewrite this text in a ${String(arg || 'professional').toLowerCase()} tone, keeping its meaning and facts:\n\n${text}`,
  },
  {
    id: 'ai.style', label: 'Change Style', icon: 'style', group: 'Rewrite', tip: 'Rewrite for a register: simple, business, academic…', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.5, options: opt(STYLES),
    prompt: ({ text, arg }) => `Rewrite this text in a ${String(arg || 'simple').toLowerCase()} style, keeping its meaning and facts:\n\n${text}`,
  },
  {
    id: 'ai.edit', label: 'Edit with Instruction…', icon: 'edit', group: 'Rewrite', tip: 'Describe a change and apply it to the selection', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.4, keys: ['Mod-Alt-e'], popular: true,
    ask: { title: 'Edit with AI', label: 'How should the text change?', placeholder: 'e.g. Make it suitable for a church bulletin; use American spelling; turn it into first person' },
    prompt: ({ text, extra }) => `Apply this change to the text: ${extra}\n\nText:\n${text}`,
  },
  {
    id: 'ai.simplify', label: 'Simplify', icon: 'child_care', group: 'Rewrite', tip: 'Rewrite in plain language anyone can read', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.3,
    prompt: ({ text }) => `Rewrite in plain language (short sentences, common words, about an 8th-grade reading level), keeping every fact:\n\n${text}`,
  },
  {
    id: 'ai.natural', label: 'Make It Sound Natural', icon: 'record_voice_over', group: 'Rewrite', tip: 'Remove stiff or machine-like phrasing', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.6,
    prompt: ({ text }) => `Rewrite this so it reads like natural writing by a thoughtful person: vary sentence length, remove clichés and filler, keep the meaning:\n\n${text}`,
  },
  {
    id: 'ai.matchVoice', label: 'Match My Voice', icon: 'fingerprint', group: 'Rewrite', tip: 'Rewrite the selection in the voice described in AI Settings (or another open document)', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.5,
    prompt: ({ text, extra }) => `Rewrite the text in this voice and style:\n${extra}\n\nText:\n${text}`,
  },
  // ---------------------------------------------------------------- Length & structure
  {
    id: 'ai.shorten', label: 'Shorten', icon: 'compress', group: 'Length', tip: 'Make the selection more concise', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.3, popular: true,
    prompt: ({ text }) => `Make this text about 40% shorter while keeping every important point:\n\n${text}`,
  },
  {
    id: 'ai.expand', label: 'Expand', icon: 'expand', group: 'Length', tip: 'Elaborate with more detail and explanation', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.6,
    prompt: ({ text }) => `Expand this text to about twice its length with relevant detail and explanation. Do not invent facts; mark anything that needs a source as [citation needed]:\n\n${text}`,
  },
  {
    id: 'ai.bullets', label: 'Make Bulleted List', icon: 'format_list_bulleted', group: 'Length', tip: 'Turn prose into a bulleted list', input: 'selectionOrParagraph', output: 'preview', tier: 'fast', temperature: 0.2, markdown: true,
    prompt: ({ text }) => `Turn this text into a concise Markdown bulleted list (use nested bullets where helpful):\n\n${text}`,
  },
  {
    id: 'ai.table', label: 'Convert to Table', icon: 'table_chart', group: 'Length', tip: 'Organize the selection as a table', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.2, markdown: true, popular: true,
    prompt: ({ text }) => `Organize the information in this text as a Markdown table with a header row. Choose sensible columns. Output only the table:\n\n${text}`,
  },
  {
    id: 'ai.keyPoints', label: 'Key Points', icon: 'checklist', group: 'Length', tip: 'Insert the key points of the selection or document', input: 'selectionOrDocument', output: 'insertBelow', tier: 'quality', temperature: 0.2, markdown: true,
    prompt: ({ text }) => `List the key points of this text as a short Markdown bulleted list:\n\n${text}`,
  },
  {
    id: 'ai.addDetail', label: 'Add Detail', icon: 'add_notes', group: 'Length', tip: 'Add an example, counterargument, definition, analogy…', input: 'selectionOrParagraph', output: 'insertBelow', tier: 'quality', temperature: 0.7, options: opt(DETAILS),
    prompt: ({ text, arg }) => `Write one short paragraph that adds a ${String(arg || 'example').toLowerCase()} to support or develop this passage. Never invent statistics or quotations; use [placeholder] where a real source is needed:\n\n${text}`,
  },
  {
    id: 'ai.headings', label: 'Add Headings', icon: 'segment', group: 'Length', tip: 'Break long text into sections with headings', input: 'selection', output: 'preview', tier: 'quality', temperature: 0.3, markdown: true,
    prompt: ({ text }) => `Insert Markdown headings (## level) to divide this text into logical sections. Do not change any of the text itself:\n\n${text}`,
  },
  // ---------------------------------------------------------------- Proofing
  {
    id: 'ai.proofread', label: 'Proofread with AI', icon: 'spellcheck', group: 'Proof', tip: 'Correct spelling, grammar and punctuation as tracked changes', input: 'selectionOrDocument', output: 'tracked', tier: 'quality', temperature: 0, popular: true, keys: ['Mod-Alt-p'],
    prompt: ({ text }) => `Correct spelling, grammar, punctuation and obvious typos in the text. Change nothing else: keep wording, style, line breaks and paragraph breaks exactly. Return the full corrected text:\n\n${text}`,
  },
  {
    id: 'ai.clarity', label: 'Clarity Suggestions', icon: 'tips_and_updates', group: 'Proof', tip: 'Flag wordiness, passive voice, clichés and unclear sentences as comments', input: 'selectionOrDocument', output: 'comments', tier: 'quality', temperature: 0.2,
    prompt: ({ text }) => `Find up to 15 places in this text that are wordy, vague, passive, clichéd, or hard to follow. ${COMMENT_JSON}\n\n${text}`,
  },
  {
    id: 'ai.styleGuide', label: 'Check Against Style Guide', icon: 'rule', group: 'Proof', tip: 'Flag text that breaks your style guide (set in AI Settings)', input: 'selectionOrDocument', output: 'comments', tier: 'quality', temperature: 0.1,
    prompt: ({ text, extra }) => `Style guide:\n${extra || '(no style guide set: use the Chicago Manual of Style)'}\n\nFind places in the text that break the style guide. ${COMMENT_JSON}\n\n${text}`,
  },
  {
    id: 'ai.ocrFix', label: 'Fix OCR Errors', icon: 'document_scanner', group: 'Proof', tip: 'Repair scanning errors (rn→m, broken words, stray symbols) as tracked changes', input: 'selectionOrDocument', output: 'tracked', tier: 'quality', temperature: 0,
    prompt: ({ text }) => `This text came from OCR. Fix recognition errors only: misread letters (rn/m, cl/d, 1/l, 0/O), split or joined words, stray symbols, broken hyphenation. Do not modernize spelling or change wording. Keep the paragraph breaks. Return the full corrected text:\n\n${text}`,
  },
  // ---------------------------------------------------------------- Summarize & analyze
  {
    id: 'ai.summarize', label: 'Summarize', icon: 'summarize', group: 'Analyze', tip: 'Summarize the selection, or the whole document', input: 'selectionOrDocument', output: 'pane', tier: 'quality', temperature: 0.2, popular: true, keys: ['Mod-Alt-Shift-u'],
    options: [{ value: 'paragraph', label: 'Short paragraph' }, { value: 'bullets', label: 'Bulleted list' }, { value: 'tldr', label: 'One sentence' }, { value: 'headline', label: 'Headline' }, { value: 'detailed', label: 'Detailed (by section)' }],
    markdown: true,
    prompt: ({ text, arg }) => {
      const how: Record<string, string> = { paragraph: 'in one short paragraph', bullets: 'as a Markdown bulleted list of the main points', tldr: 'in a single sentence', headline: 'as a headline of at most 12 words', detailed: 'section by section, with a Markdown heading for each section' };
      return `Summarize this text ${how[arg || 'paragraph'] || how.paragraph}:\n\n${text}`;
    },
  },
  {
    id: 'ai.summaryTop', label: 'Insert Summary at Top', icon: 'vertical_align_top', group: 'Analyze', tip: 'Insert an executive summary at the start of the document', input: 'document', output: 'pane', tier: 'quality', temperature: 0.2,
    prompt: ({ text }) => `Write an executive summary (3–5 sentences) of this document:\n\n${text}`,
  },
  {
    id: 'ai.actionItems', label: 'Action Items', icon: 'task_alt', group: 'Analyze', tip: 'Extract tasks, decisions and owners as a checklist', input: 'selectionOrDocument', output: 'insertBelow', tier: 'quality', temperature: 0.1, markdown: true,
    prompt: ({ text }) => `Extract the action items, decisions and open questions from this text. Use Markdown: a heading "Action items" with a task list ("- [ ] task — owner, due date if stated"), then "Decisions" and "Open questions" lists if any:\n\n${text}`,
  },
  {
    id: 'ai.explain', label: 'Explain', icon: 'help', group: 'Analyze', tip: 'Explain or define the selected text', input: 'selection', output: 'pane', tier: 'quality', temperature: 0.3, markdown: true,
    prompt: ({ text }) => `Explain this clearly for a general reader: what it means, any terms or references, and why it matters:\n\n${text}`,
  },
  {
    id: 'ai.analyze', label: 'Analyze Text', icon: 'analytics', group: 'Analyze', tip: 'Themes, tone, audience, structure and keywords', input: 'selectionOrDocument', output: 'pane', tier: 'quality', temperature: 0.2, markdown: true,
    prompt: ({ text }) => `Analyze this text. Use Markdown with these headings: Main themes; Tone and voice; Intended audience; Structure; Strengths; Weaknesses; Keywords.\n\n${text}`,
  },
  {
    id: 'ai.faq', label: 'Generate FAQ', icon: 'quiz', group: 'Analyze', tip: 'Questions and answers drawn from the document', input: 'selectionOrDocument', output: 'insertBelow', tier: 'quality', temperature: 0.3, markdown: true,
    prompt: ({ text }) => `Write a FAQ of 6–10 questions a reader would ask, answered only from this text. Use "### Question" headings followed by the answer:\n\n${text}`,
  },
  {
    id: 'ai.extractData', label: 'Extract Names, Dates & Places', icon: 'person_search', group: 'Analyze', tip: 'Table of the people, dates, places and events mentioned (genealogy and research)', input: 'selectionOrDocument', output: 'insertBelow', tier: 'quality', temperature: 0, markdown: true,
    prompt: ({ text }) => `Extract every person, date, place and event mentioned in this text into a Markdown table with columns: Name | Role or relationship | Date(s) | Place | Event | Quote from the text. Only include what the text actually says:\n\n${text}`,
  },
  // ---------------------------------------------------------------- Ask
  {
    id: 'ai.ask', label: 'Ask About Document…', icon: 'forum', group: 'Assistant', tip: 'Ask a question answered from this document', input: 'document', output: 'pane', tier: 'quality', temperature: 0.2, markdown: true, popular: true, keys: ['Mod-Alt-q'],
    ask: { title: 'Ask About This Document', label: 'Question', placeholder: 'e.g. What dates are mentioned for the move to Ohio?' },
    system: 'Answer using only the document. Quote the relevant passage in quotation marks. If the document does not contain the answer, say so.',
    prompt: ({ text, extra }) => `Document:\n${text}\n\nQuestion: ${extra}`,
  },
  // ---------------------------------------------------------------- Translate
  {
    id: 'ai.translate', label: 'Translate Selection', icon: 'translate', group: 'Translate', tip: 'Translate the selection into another language', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.2, options: opt(LANGUAGES), popular: true,
    prompt: ({ text, arg }) => `Translate this text into ${arg || 'English'}. Keep formatting, names and numbers. Output only the translation:\n\n${text}`,
  },
  {
    id: 'ai.translateDoc', label: 'Translate Document', icon: 'g_translate', group: 'Translate', tip: 'Translate the whole document into a new document', input: 'document', output: 'newDoc', tier: 'quality', temperature: 0.2, options: opt(LANGUAGES), markdown: true, maxTokens: 8000,
    prompt: ({ text, arg }) => `Translate this document into ${arg || 'English'}. Keep the structure (headings, lists, tables) using Markdown. Output only the translation:\n\n${text}`,
  },
  {
    id: 'ai.bilingual', label: 'Side-by-Side Translation', icon: 'view_column', group: 'Translate', tip: 'New document with the original and the translation in two columns', input: 'selectionOrDocument', output: 'newDoc', tier: 'quality', temperature: 0.2, options: opt(LANGUAGES), markdown: true, maxTokens: 8000,
    prompt: ({ text, arg }) => `Make a two-column Markdown table: column 1 "Original", column 2 "${arg || 'English'}". One row per paragraph of the text, with its translation beside it:\n\n${text}`,
  },
  {
    id: 'ai.detectLanguage', label: 'Detect Language', icon: 'language', group: 'Translate', tip: 'Identify the language and dialect of the selection', input: 'selectionOrParagraph', output: 'pane', tier: 'fast', temperature: 0,
    prompt: ({ text }) => `Which language (and regional variety, if clear) is this text written in? Answer in one line, then give a literal English gloss of the first sentence:\n\n${text.slice(0, 2000)}`,
  },
  // ---------------------------------------------------------------- Research
  {
    id: 'ai.findSources', label: 'Suggest Sources', icon: 'menu_book', group: 'Research', tip: 'Suggest where to look for sources (verify everything)', input: 'selectionOrParagraph', output: 'pane', tier: 'quality', temperature: 0.2, markdown: true,
    system: 'You cannot browse unless the service you run on provides web results. Never fabricate citations. Prefer naming kinds of sources, archives, databases and search terms; give full citations only when you are certain they exist, and mark every one "verify before citing".',
    prompt: ({ text }) => `Suggest sources and research leads that could support or check this passage: kinds of records, archives, databases, search terms, and well-known works if you are certain they exist:\n\n${text}`,
  },
  {
    id: 'ai.flagClaims', label: 'Flag Claims to Verify', icon: 'fact_check', group: 'Research', tip: 'Comment on statements that need a citation or a fact check', input: 'selectionOrDocument', output: 'comments', tier: 'quality', temperature: 0.1,
    prompt: ({ text }) => `Find factual claims in this text that a careful editor would want sourced or checked (dates, numbers, names, causal claims). For each, say what should be verified. ${COMMENT_JSON}\n\n${text}`,
  },
  {
    id: 'ai.citation', label: 'Format Citation…', icon: 'format_quote', group: 'Research', tip: 'Turn source details into a formatted citation', input: 'prompt', output: 'cursor', tier: 'fast', temperature: 0,
    options: opt(['APA', 'MLA', 'Chicago (notes)', 'Chicago (author-date)', 'Harvard', 'IEEE', 'Turabian', 'Evidence Explained (genealogy)']),
    ask: { title: 'Format Citation', label: 'Source details (author, title, publisher, year, URL, page…)', multiline: true },
    prompt: ({ extra, arg }) => `Format this source as a ${arg || 'Chicago (notes)'} citation. Use only the details given; put [missing: field] for required fields that are absent:\n\n${extra}`,
  },
  // ---------------------------------------------------------------- Review & feedback
  {
    id: 'ai.feedback', label: 'Feedback as Comments', icon: 'rate_review', group: 'Review', tip: 'An editor\'s notes on the document, attached as comments', input: 'selectionOrDocument', output: 'comments', tier: 'quality', temperature: 0.3, popular: true,
    prompt: ({ text }) => `Act as a thoughtful editor. Give up to 12 specific, constructive notes on structure, argument, clarity and style. ${COMMENT_JSON}\n\n${text}`,
  },
  {
    id: 'ai.readerView', label: 'Reader Reaction', icon: 'groups', group: 'Review', tip: 'How a chosen kind of reader would react to the text', input: 'selectionOrDocument', output: 'pane', tier: 'quality', temperature: 0.5, options: opt(READERS), markdown: true,
    prompt: ({ text, arg }) => `You are a ${String(arg || 'general reader').toLowerCase()}. Read the text and report honestly: first impression, what is clear, what is confusing, what you would want added, and whether you would keep reading. Use Markdown headings.\n\n${text}`,
  },
  {
    id: 'ai.grade', label: 'Grade Against Rubric…', icon: 'grading', group: 'Review', tip: 'Score the document against criteria you provide', input: 'document', output: 'pane', tier: 'quality', temperature: 0.1, markdown: true,
    ask: { title: 'Grade Against Rubric', label: 'Rubric or criteria (one per line)', multiline: true, placeholder: 'Thesis is clear (20)\nEvidence supports claims (30)\nOrganization (20)\nGrammar and style (30)' },
    prompt: ({ text, extra }) => `Grade the document against this rubric. For each criterion give a score, a one-sentence justification quoting the text, and how to improve. End with the total. Use a Markdown table.\n\nRubric:\n${extra}\n\nDocument:\n${text}`,
  },
  {
    id: 'ai.critique', label: 'Manuscript Critique', icon: 'auto_stories', group: 'Review', tip: 'Developmental feedback: plot, character, pacing, voice', input: 'selectionOrDocument', output: 'pane', tier: 'quality', temperature: 0.4, markdown: true, maxTokens: 3000,
    prompt: ({ text }) => `Give developmental-edit feedback on this manuscript excerpt: premise, structure and pacing, characters, point of view, dialogue, voice, and the three most valuable revisions. Use Markdown headings.\n\n${text}`,
  },
  {
    id: 'ai.summarizeComments', label: 'Summarize Comments', icon: 'chat', group: 'Review', tip: 'Summarize open comment threads and unresolved issues', input: 'comment', output: 'pane', tier: 'fast', temperature: 0.2, markdown: true,
    prompt: ({ text }) => `Summarize these document comments: the main themes, decisions reached, and unresolved issues (who raised them):\n\n${text}`,
  },
  {
    id: 'ai.draftReply', label: 'Draft Comment Reply', icon: 'reply', group: 'Review', tip: 'Suggest a reply to the comment at the cursor', input: 'comment', output: 'pane', tier: 'fast', temperature: 0.5,
    prompt: ({ text }) => `Draft a short, courteous reply to the last comment in this thread, addressing its point:\n\n${text}`,
  },
  // ---------------------------------------------------------------- Images & accessibility
  {
    id: 'ai.altText', label: 'Generate Alt Text', icon: 'image_search', group: 'Media', tip: 'Describe the selected picture for screen readers (needs a model that accepts images)', input: 'image', output: 'pane', tier: 'quality', temperature: 0.2,
    prompt: () => 'Write alt text for this image for a screen reader: one or two sentences, objective, no "image of". If it contains text, include the text.',
  },
  {
    id: 'ai.imageToText', label: 'Image to Text (OCR)', icon: 'text_snippet', group: 'Media', tip: 'Transcribe the text in the selected picture (needs a model that accepts images)', input: 'image', output: 'insertBelow', tier: 'quality', temperature: 0, markdown: true,
    prompt: () => 'Transcribe all text in this image exactly, preserving line breaks and reading order. Use a Markdown table for tabular content. Mark illegible words as [illegible].',
  },
  {
    id: 'ai.describeImage', label: 'Describe Picture', icon: 'photo', group: 'Media', tip: 'Detailed description of the selected picture (genealogy: clothing, setting, era clues)', input: 'image', output: 'pane', tier: 'quality', temperature: 0.3, markdown: true,
    prompt: () => 'Describe this image in detail: people and their apparent ages, clothing, setting, objects, any text, and clues to the era or place. Separate what is visible from what is inferred.',
  },
  // ---------------------------------------------------------------- Creative
  {
    id: 'ai.describe', label: 'Describe (Sensory Detail)', icon: 'visibility', group: 'Creative', tip: 'Add sight, sound, smell, taste and touch details for the selected noun or scene', input: 'selectionOrParagraph', output: 'pane', tier: 'quality', temperature: 0.9, markdown: true,
    prompt: ({ text }) => `For fiction writing: give vivid sensory details for "${text.slice(0, 400)}" under the headings Sight, Sound, Smell, Taste, Touch, and Metaphor. Two or three short phrases each.`,
  },
  {
    id: 'ai.names', label: 'Name Generator…', icon: 'badge', group: 'Creative', tip: 'Character, place or product names', input: 'prompt', output: 'pane', tier: 'fast', temperature: 1, markdown: true,
    ask: { title: 'Name Generator', label: 'What needs a name?', placeholder: 'e.g. a 1890s Kentucky riverboat captain; a fantasy mountain town' },
    prompt: ({ extra }) => `Suggest 15 fitting names for: ${extra}. Markdown bulleted list with a few words on each.`,
  },
  {
    id: 'ai.dialogue', label: 'Polish Dialogue', icon: 'forum', group: 'Creative', tip: 'Make dialogue sound like real speech, keeping each voice distinct', input: 'selectionOrParagraph', output: 'preview', tier: 'quality', temperature: 0.7,
    prompt: ({ text }) => `Revise the dialogue in this passage so it sounds like real speech and each character's voice stays distinct. Keep the plot events unchanged:\n\n${text}`,
  },
  {
    id: 'ai.storyNotes', label: 'Story Notes…', icon: 'sticky_note_2', group: 'Creative', tip: 'Characters, setting and style notes sent with every AI request for this document', input: 'none', output: 'pane', prompt: () => '',
  },
];

export const COMMENT_JSON = 'Respond with JSON only: an array of objects {"quote": "exact excerpt from the text, 3-12 words", "comment": "your note"}. Quote the text exactly.';

export function featureById(id: string): AiFeature | undefined {
  return FEATURES.find((f) => f.id === id);
}

/** Parse the comment JSON the comment features ask for (tolerates code fences and prose). */
export function parseCommentJson(raw: string): { quote: string; comment: string }[] {
  const t = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = t.indexOf('['), end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.quote === 'string' && typeof x.comment === 'string') : [];
  } catch {
    return [];
  }
}
