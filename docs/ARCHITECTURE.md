# Architecture

QuillForge is a TypeScript web application. The Android release packages it with Capacitor, and the same build runs in a desktop browser.

```
src/
  main.ts                 entry: fonts, command registry, App + Shell, launch-file handling, back button
  app.ts                  App (document tabs, dispatch pipeline, exec(), settings, zoom, autosave) and DocTab
  prefs.ts                per-device preferences: QAT, custom tabs, keymap, macros, AutoCorrect, building blocks
  templates.ts            built-in templates
  editor/
    schema.ts             ProseMirror schema: paragraph with a `style` attribute, plus lists, tables, breaks,
                          sections, text boxes, generated blocks, fields, footnotes, math, controls, chips.
                          Marks cover character formatting, comments and revisions.
    settings.ts           DocSettings stored in doc.attrs.settings (page setup, headers/footers, comments,
                          sources, styles, theme, merge data, protection). Undoable and saved with the document.
    styles.ts             built-in styles, style sets, themes, basedOn resolution, CSS generation
    ops.ts                editing helpers used by commands (marks, paragraph attributes, lists, case, selection)
    setup.ts              plugin assembly, keymaps, smart Enter, key-name normalization
    autoformat.ts         AutoCorrect replacement list, smart quotes, Markdown shortcuts, capitalization
    fields.ts             field engine (DATE, PAGE, SEQ, REF, MERGEFIELD, = formulas…), header/footer tokens
    nodeviews.ts          images (resize/rotate), KaTeX math, content controls, generated blocks
    graphics.ts           SVG generators for shapes, diagrams and charts
    compare.ts            LCS-based document compare that emits tracked changes
    plugins/
      trackChanges.ts     suggesting mode: rewrites each transaction into insertion/deletion marks
      pagination.ts       Print Layout: measures blocks and line boxes, inserts page-gap widgets
                          (splits paragraphs, footnotes, headers, footers)
      decorations.ts      footnote numbering, find, focus mode, word completion, proofing, outline folding,
                          style coach, placeholder, active comment
  commands/
    registry.ts           Command interface and registry (the single source for QAT, tabs, keys, macros, search)
    *.ts                  command modules by area (file, edit, format, insert, draw, layout/design, references,
                          mailings, review, view, developer, table, picture, tools)
  ui/
    shell.ts              title bar, QAT, tabs/ribbon, status bar, ruler, context menu, mini toolbar, slash menu,
                          command palette, overlays (watermark, page borders, line numbers)
    ribbonLayout.ts       default tab and group arrangement (command ids only)
    customize.ts          Customize QAT / Tabs / Keyboard dialogs
    backstage.ts          File screen
    panes.ts              task panes (navigation, styles, find, comments, revisions, spelling, Reveal Codes…)
    dialog.ts             declarative dialog builder, menus, color pickers, toasts
  io/                     format converters: docx, odt/fodt, rtf, html, markdown, text, epub, native
  proof/                  spelling worker (nspell + SCOWL) and grammar rules
  platform/native.ts      JS side of the QuillNative Capacitor plugin, with browser fallbacks
android/                  Capacitor project + QuillNativePlugin.java (SAF open/save/write-back, print, share, intents)
```

## Key design decisions

- **Commands are data.** The ribbon, the Quick Access Bar, context menus, shortcuts, macros and search all refer to command ids, so every feature is customizable in every place. `npm run catalog` regenerates `docs/COMMANDS.md`.
- **Styles are an attribute, not node types.** Headings are paragraphs whose style is "Heading n". This keeps style application, outline levels, the table of contents and DOCX/ODT mapping uniform.
- **Spacing uses padding.** Paragraph space before/after renders as padding, so it adds up the way desktop word processors do and block heights can be summed exactly for pagination.
- **Settings live in the document.** Page setup, headers/footers, comments and sources are part of `doc.attrs.settings`. They undo and redo with the text and travel with the file.
- **Tracked changes are transaction post-processing.** User transactions are diffed with prosemirror-changeset. Deleted ranges are re-inserted with a deletion mark, and inserted ranges get an insertion mark.
- **Pagination is decoration-based.** No layout engine is reimplemented. The browser lays out a page-width column, and the pagination plugin measures it and inserts gap widgets, so editing stays native and fast.
