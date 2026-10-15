# Clean-room, trademark and licensing notes

This file records how QuillForge provides a complete word-processing command set while avoiding other vendors' trademarks and copyrights. It is a summary of the project's practice, not legal advice.

## What is reproduced, and why it is safe

- **Functionality and command names.** Word-processing operations (Bold, Insert Table, Track Changes, Mail Merge, and so on) are functional ideas. Their names are ordinary descriptive words used across the industry. Functionality is not protected by copyright, and descriptive terms are not trademarks for those functions.
- **Tab and group organization.** Grouping commands under tabs such as Home, Insert and Layout is a common, functional arrangement used by many suites. QuillForge's grouping, ordering, labels and descriptions were written for this project.
- **File formats.** .docx (ECMA-376 / ISO/IEC 29500 Office Open XML), .odt (ISO/IEC 26300 OpenDocument), RTF, HTML, Markdown and EPUB are public specifications. The converters were written from those specifications and tested against open-source tools.

## What is deliberately not reproduced

- No vendor logos, icons, splash screens, color schemes or trade dress. Icons are Google's Material Symbols (Apache 2.0). The app icon and visual design are original.
- No vendor product names in the app's own name or UI. Trademarked feature names are replaced with generic terms:

| Vendor term | QuillForge term |
|---|---|
| WordArt | Decorative Text |
| SmartArt | Diagram |
| Quick Parts / AutoText | Building Blocks (Snippets) |
| Tell Me / Search | Search Commands |
| Ribbon | Tabs / ribbon used generically |
| Smart Lookup / Researcher / Editor / Copilot | not used |

- No copied help text, tooltips, templates, sample documents, clip art or dictionaries. Templates and placeholder text are original. The spelling dictionary is SCOWL en_US (BSD-style license).
- No proprietary fonts are bundled. Documents that name Calibri, Cambria, Times New Roman, Arial, Courier New, Georgia or Garamond render with metric-compatible open fonts: Carlito, Caladea, Tinos, Arimo, Cousine, Gelasio and EB Garamond (SIL OFL / Apache 2.0). A locally installed original is preferred when one is present.
- References to other products ("inspired by WordPerfect Reveal Codes") are nominative use describing where an idea came from. They do not imply endorsement.

## Third-party components

| Component | License |
|---|---|
| ProseMirror (model, state, view, transform, commands, history, keymap, inputrules, schema-list, dropcursor, gapcursor, tables, changeset) | MIT |
| JSZip | MIT (dual MIT/GPLv3; used under MIT) |
| KaTeX | MIT |
| nspell | MIT |
| dictionary-en (SCOWL) | MIT and BSD-style |
| Material Symbols | Apache 2.0 |
| Capacitor | MIT |
| Fonts: Carlito, Caladea, Gelasio, EB Garamond, Courier Prime, Libre Baskerville, Lato, Merriweather, Open Sans | SIL Open Font License 1.1 |
| Fonts: Tinos, Arimo, Cousine | Apache 2.0 |

Online services that are called only when the user invokes the matching command: Datamuse (thesaurus), Free Dictionary API (definitions), Google Translate (opened in the browser).
