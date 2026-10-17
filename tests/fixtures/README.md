# Test fixtures

## recovery/

Damaged-document samples used by `tests/unit/recover.test.ts`.

## formats/

Inputs for `tests/unit/formats-b.test.ts` (XML, archive and text-markup importers). All files
here were written for this project or generated from those files with locally installed tools;
none are third-party documents. `scripts/gen-format-fixtures.sh` regenerates the generated ones.

| File | Origin |
|---|---|
| `rich.fodt` | Hand-written OpenDocument flat XML exercising styles, lists, a table with merged cells, borders and shading, footnote/endnote, comment, tracked changes, picture, text frame, header/footer, page setup. |
| `rich.docx`, `rich.rtf`, `rich.html`, `rich-word2003.xml` | LibreOffice 24.2 exports of `rich.fodt` (filters "MS Word 2007 XML", "Rich Text Format", "HTML (StarWriter)", "MS Word 2003 XML"). |
| `source.md`, `swatch.png` | Hand-written Markdown and a 24×16 PNG made for these tests. |
| `sample.fb2`, `sample.dbk`, `sample-docbook5.xml`, `sample.tex`, `sample.rst`, `sample.textile`, `sample.adoc`, `sample.org`, `sample.man`, `sample.gfm.md`, `sample-epub2.epub` | pandoc 3.1 exports of `source.md`. |
| `textedit.rtf` | Hand-written RTF in the style macOS TextEdit writes (Cocoa control words, list table, `\NeXTGraphic` attachment). |
| `features.tex` | Hand-written LaTeX exercising tables with spans, accents, quotes, macros and page geometry. |

Formats no installed tool can write (OpenOffice.org 1.x `.sxw`, AbiWord, KWord, Hangul
`.hwpx`, Apple Pages '09 and Pages 5+ IWA, MHTML, Word 2003 XML as Word writes it) are built in
code by `tests/unit/helpers/samples-b.ts` from the published format descriptions.

Real-world Pages documents (Apache Tika's `testPages.pages` and `testPages2013.pages`, Apache
License 2.0) and LibreOffice's own `DocBookTemplate.stw` were used to verify the Pages and
StarOffice importers locally, with LibreOffice's text conversion as the reference; they are
not committed.
