# QuillForge

An original, open-source word processor for Android (and the web) whose goal is simple: **no missing commands**. Every feature is a command, and every command can be put on the Quick Access Bar, on your own tab, on a keyboard shortcut, or in a macro, which is the full-library customization that mobile and online office apps leave out.

- **746 commands** across File, Home, Insert, Draw, Design, Layout, References, Mailings, Review, View, Tools, Developer and Help, plus contextual Table Design, Table Layout and Picture Format tabs. See [docs/COMMANDS.md](docs/COMMANDS.md).
- **Quick Access Bar chooser** with the desktop-style categories: *Popular Commands*, *Commands Not in the Tabs*, *All Commands*, each tab, and *Macros*. You can add separators, reorder, reset, and import or export the layout. Long-press any ribbon button to add it, and the bar can sit at the top or at the bottom near the keyboard.
- **Customize Tabs:** create tabs and groups, put any command in them, rename, reorder or hide built-in tabs.
- **Customize Keyboard:** rebind any command, with conflict display.
- **Command search** (Alt+Q or the 🔍 button) across the whole library.

## Install (Android)

Download `QuillForge-<version>.apk` from the [Releases](../../releases) page and sideload it. You may need to allow "Install unknown apps" for your browser or file manager. Builds without a configured signing key are debug-signed and meant for testing; see [docs/ANDROID.md](docs/ANDROID.md) for Play-Store signing.

QuillForge registers for *Open with* and *Share to* on .docx, .odt, .rtf, .md, .txt, .html and .epub files. It uses the Android system file picker, so files on the device, SD card, Google Drive, Dropbox and similar providers all work. **Save** writes back to the same file.

## Features

**Writing and formatting.** You get a full character format set:
- underline styles and colours, double strikethrough, small and all caps, hidden text;
- character spacing, scale and position;
- OpenType ligatures, number forms, kerning and stylistic sets;
- text effects, character borders and shading, phonetic guides.

Paragraph controls cover alignment, indents, spacing, line rules, keep-with-next, keep-lines-together, page break before, widow/orphan control, borders and shading, tab stops and drop caps. Lists can be bulleted (custom bullets), numbered (many formats), multilevel outline, or checklists. A style system offers about 70 built-in styles, style sets (Classic, Modern, Elegant, Book, Manuscript, Academic, Technical, Newsletter, Typewriter) and themes. You can create, modify and inspect styles.

**Pages.** Print Layout shows real pages with:
- automatic pagination that splits paragraphs across pages and honours widow/orphan and keep rules;
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

**Files.** Import and export .docx, .odt, .fodt, .rtf, .html, Markdown (GFM), .txt, .epub, and the native .qfd format. AES-256 encrypted .qfde is also supported. PDF goes through the system print service ("Save as PDF"). Other features: autosave drafts with crash recovery, version history snapshots with compare and restore, document inspector, templates, and multiple open documents in tabs.

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

## Known limitations (0.1)

- Pagination splits paragraphs but does not split tables or images across pages. A block taller than a page overflows it. Section breaks do not change page size or orientation mid-document; one page setup applies to the whole document.
- Footnote, endnote and comment bodies are plain text.
- Formatting changes are not tracked as revisions; insertions and deletions are.
- The thesaurus, dictionary and translate commands need an internet connection. Spelling is offline (English).
- Charts and diagrams are stored as images with editable data. Other suites see them as pictures.
- DOCX fidelity was verified with LibreOffice, pandoc and python-docx. It has not been tested in Microsoft Word itself.

## Build

```bash
npm ci
npm run dev          # web app at http://localhost:5173
npm test             # unit tests (vitest)
npm run build        # production web build in dist/
npm run android:build   # build + cap sync + gradle assembleRelease (needs Android SDK)
```

CI (`.github/workflows/android.yml`) type-checks, tests, builds the web app, and produces a release APK and AAB on every push. Tags `v*` publish a GitHub Release. See [docs/ANDROID.md](docs/ANDROID.md).

Browser checks: `npm run build && npx vite preview --port 4173`, then `node tests/e2e/smoke.mjs`, `node tests/e2e/all-commands.mjs` (executes every command and menu variant), `node tests/e2e/visual.mjs` and `node tests/e2e/io.mjs`.

## Legal

QuillForge is an independent, clean-room project released under the MIT License. It is not affiliated with, endorsed by, or sponsored by Microsoft, Google, Apple, Corel, The Document Foundation, or any other vendor. Product names appear only to describe file-format compatibility or the origin of an idea (nominative use). The interface, icons (Material Symbols, Apache 2.0), templates, styles and text are original or openly licensed. See [docs/LEGAL.md](docs/LEGAL.md).
