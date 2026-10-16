# QuillForge

An original, open-source word processor for Android (and the web) whose goal is simple: **no missing commands**. Every feature is a command, and every command can be put on the Quick Access Bar, on your own tab, on a keyboard shortcut, or in a macro, which is the full-library customization that mobile and online office apps leave out.

- **817 commands** across File, Home, Insert, Draw, Design, Layout, References, Mailings, Review, View, Tools, **AI**, Developer and Help, plus contextual Table Design, Table Layout and Picture Format tabs. See [docs/COMMANDS.md](docs/COMMANDS.md).
- **Opens damaged documents** with the [Word Recovery](https://github.com/socrtwo/wordrecovery-SF) engine: byte-level ZIP salvage, XML repair, Word 97–2003 binary text, and Open and Repair / Recover Text from Any File. See [docs/RECOVERY.md](docs/RECOVERY.md).
- **AI tab** with 67 commands surveyed from other word processors and writing tools. It offers a free on-device model (no account) and a setup wizard for free and paid providers that opens the right page in your browser and picks up the key. See [docs/AI.md](docs/AI.md).
- **Quick Access Bar chooser** with the desktop-style categories: *Popular Commands*, *Commands Not in the Tabs*, *All Commands*, each tab, and *Macros*. You can add separators, reorder, reset, and import or export the layout. Long-press any ribbon button to add it, and the bar can sit at the top or at the bottom near the keyboard.
- **Customize Tabs:** create tabs and groups, put any command in them, rename, reorder or hide built-in tabs.
- **Customize Keyboard:** rebind any command, with conflict display.
- **Command search** (Alt+Q or the 🔍 button) across the whole library.

## Install (Android)

Download `QuillForge-<version>.apk` from the [Releases](../../releases) page and sideload it. You may need to allow "Install unknown apps" for your browser or file manager. Builds without a configured signing key are debug-signed and meant for testing; see [docs/ANDROID.md](docs/ANDROID.md) for Play-Store signing.

QuillForge registers for *Open with* and *Share to* on .docx, .doc, .odt, .rtf, .md, .txt, .html and .epub files. It uses the Android system file picker, so files on the device, SD card, Google Drive, Dropbox and similar providers all work. **Save** writes back to the same file.

## Features

**Writing and formatting.** You get a full character format set:
- underline styles and colors, double strikethrough, small and all caps, hidden text;
- character spacing, scale and position;
- OpenType ligatures, number forms, kerning and stylistic sets;
- text effects, character borders and shading, phonetic guides.

Paragraph controls cover alignment, indents, spacing, line rules, keep-with-next, keep-lines-together, page break before, widow/orphan control, borders and shading, tab stops and drop caps. Lists can be bulleted (custom bullets), numbered (many formats), multilevel outline, or checklists. A style system offers about 70 built-in styles, style sets (Classic, Modern, Elegant, Book, Manuscript, Academic, Technical, Newsletter, Typewriter) and themes. You can create, modify and inspect styles.

**Pages.** Print Layout shows real pages with:
- automatic pagination that splits paragraphs across pages and honors widow/orphan and keep rules;
- headers and footers with fields, first-page and odd/even variants;
- footnotes at the foot of each page;
- watermarks, page borders and line numbers;
- multi-column sections, section/page/column breaks, page sizes and margins, and mirrored margins.

Mobile View reflows text at real font sizes for phones. There are also Web Layout, Read Mode, Outline (collapsible headings, promote and demote, move sections), Draft, and Focus views.

**Insert.** Tables (including quick tables), pictures with resize, rotate, crop and filters, 42 shapes, diagrams, charts, icons, equations (LaTeX via KaTeX), symbols and emoji, links, bookmarks, cross-references, fields, text boxes and sidebars, building blocks, signature lines, cover pages, smart chips, and content controls.

**References.** Table of contents, footnotes and endnotes, citations with a source manager (APA, MLA, Chicago, Turabian, Harvard, IEEE, ISO 690, GB 7714; BibTeX import and export), bibliography, captions, table of figures, index and concordance auto-marking, and a table of authorities.

**Mailings.** Mail merge from typed lists, CSV/TSV files or an in-document table. Address block, greeting line, IF / Fill-in / record rules, preview, finishing to a merged document, envelopes and labels.

**Review.** Track changes (accept or reject by change, by reviewer, or all), simple/all/no-markup/original views, threaded comments with replies, reactions and resolve, compare and combine documents, spelling (offline Hunspell dictionary) and grammar checks, an online thesaurus and dictionary, word count, readability statistics, an accessibility checker, read aloud, dictation, Restrict Editing, and Mark as Final.

**Developer.** Macro recorder (records commands and typing), a JavaScript macro editor with a document API, and content controls with form protection and CSV export of form data.

**Files.** Import and export .docx, .odt, .fodt, .rtf, .html, Markdown (GFM), .txt, .epub, and the native .qfd format. Word 97–2003 .doc (plus .dot, .wbk and .asd) files open as text. AES-256 encrypted .qfde is also supported. PDF goes through the system print service ("Save as PDF"). Other features: autosave drafts with crash recovery, version history snapshots with compare and restore, document inspector, templates, and multiple open documents in tabs.

### Innovations from other word processors

| Feature | Inspired by |
|---|---|
| Reveal Codes pane | WordPerfect |
| Navigator-style outline with move up/down/promote/demote, chapter (heading) numbering, hidden paragraphs, style inspector, regex find and replace, word completion | LibreOffice Writer |
| Smart chips, suggesting-mode workflow, Markdown auto-formatting, version history, voice typing | Online document editors |
| Focus mode (sentence/paragraph/line), typewriter scrolling, writing goals | iA Writer, Ulysses, Scrivener |
| Snapshots and compare | Scrivener |
| Slash (/) command menu, checklists | Notion and note-taking apps |
| Writing-style highlighting (long sentences, adverbs, passive voice, weak phrases) | Hemingway-style editors |
| Teleprompter, distraction-free mode | Presenter and writing apps |
| Spike, Calculate, Extend selection (F8) | Classic desktop word processors |
| OCR clean-up (join broken lines, de-hyphenate, strip running heads and page numbers, ligature fixes), typographic clean-up, sort/dedupe/extract tools | Publishing and OCR workflows |
| Metric-compatible open fonts substituted for Calibri, Cambria, Times New Roman, Arial, Courier New, Georgia and Garamond | Document-fidelity practice in open-source suites |

**Recovery.** When a document is damaged, QuillForge recovers it instead of refusing to open it. The engine is the Word Recovery pipeline: S2 file identification, local-header ZIP salvage with ImmortalInflate, CRC checks, InvalidTags → ValidTags fixes, XML healing, an RTF parser, Word 97 piece-table text, and a strings scan. A repaired package re-opens with its formatting, and the recovery report lists what each method found.

**AI.** The AI tab can draft, continue writing and rewrite (with alternatives), change tone or style, edit by instruction, shorten, expand, and turn text into lists or tables. It also proofreads and repairs OCR as tracked changes, and gives clarity and style-guide notes as comments. It can summarize, list action items and answer questions about the document. It translates a selection, a whole document or side-by-side. It suggests sources and flags claims to verify. It gives editor feedback, reader reactions and rubric grades, writes alt text, transcribes images, keeps story notes, and has a prompt library.

Providers:
- An on-device model (free, private, offline after one download).
- Chrome's built-in model.
- Free tiers: OpenRouter, Gemini, Groq, Mistral, Cerebras, SambaNova, Z.ai, NVIDIA, Cloudflare.
- Ollama or LM Studio on your computer.
- Paid keys: OpenAI, Anthropic, DeepSeek, xAI, Perplexity, Together, Fireworks, Hugging Face, Moonshot, Qwen, Azure, Bedrock, or any OpenAI-compatible service.

Keys are stored encrypted on the device (Android Keystore), and nothing is sent until you use an AI command.

## Known limitations (0.2)

- Pagination splits paragraphs but does not split tables or images across pages. A block taller than a page overflows it. Section breaks do not change page size or orientation mid-document; one page setup applies to the whole document.
- Footnote, endnote and comment bodies are plain text.
- Formatting changes are not tracked as revisions; insertions and deletions are.
- The thesaurus, dictionary and translate commands need an internet connection. Spelling is offline (English).
- Charts and diagrams are stored as images with editable data. Other suites see them as pictures.
- DOCX fidelity was verified with LibreOffice, pandoc and python-docx. It has not been tested in Microsoft Word itself.
- .doc files open as text and paragraph structure only (no character or paragraph formatting).
- Recovery: text after a damage point inside one deflate stream is unreliable and is set apart as "unverified". Encrypted Office files are detected, not decrypted.
- AI: the on-device model, Android OAuth listener and native clipboard and Keystore code have not yet been tried on a physical device. The AI request formats, streaming, errors and the wizard are tested against a mock server.

## Build

```bash
npm ci
npm run dev          # web app at http://localhost:5173
npm test             # unit tests (vitest)
npm run build        # production web build in dist/
npm run android:build   # build + cap sync + gradle assembleRelease (needs Android SDK)
```

CI (`.github/workflows/android.yml`) type-checks, tests, builds the web app, and produces a release APK and AAB on every push. Tags `v*` publish a GitHub Release. See [docs/ANDROID.md](docs/ANDROID.md).

Browser checks: `npm run build && npx vite preview --port 4173`, then `node tests/e2e/smoke.mjs`, `node tests/e2e/all-commands.mjs` (executes every command and menu variant), `node tests/e2e/visual.mjs`, `node tests/e2e/io.mjs` and `node tests/e2e/ai.mjs` (AI features against a mock OpenAI/Anthropic/Gemini server).

## Project language

The interface, code comments and documentation use American English. The app itself treats all varieties of English as correct by default, as described above.

## Legal

QuillForge is an independent, clean-room project released under the MIT License. It is not affiliated with, endorsed by, or sponsored by Microsoft, Google, Apple, Corel, The Document Foundation, any AI provider, or any other vendor. Product names appear only to describe file-format compatibility or the origin of an idea (nominative use). The interface, icons (Material Symbols, Apache 2.0), templates, styles and text are original or openly licensed. See [docs/LEGAL.md](docs/LEGAL.md).
