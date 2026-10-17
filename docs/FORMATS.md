# File formats

Fidelity tiers used below:

- **full**: everything the format can express survives (within what the editor models).
- **high**: text, character and paragraph formatting, styles, lists, tables and the common page
  features; rarely used features are approximated or dropped.
- **basic**: text, paragraphs and the main character formatting (bold, italic, underline, size).
- **text**: text and paragraph breaks only.

## XML, archive and text formats

These formats are recognized by content (`src/io/sniff-b.ts`: XML root element and namespace, ZIP
`mimetype` entry or central-directory names, MIME headers, markup signatures), so a file opens with
the right reader whatever it is called; for the light markups, whose signatures are weak, the
extension decides when the content is ambiguous. Every reader is a clean-room implementation from
the publishers' specifications (ECMA-376 and ISO/IEC 29500, OASIS OpenDocument, the OpenOffice.org
1.x XML file format, the AbiWord, KWord and FictionBook schemas, KS X 6101 (OWPML), DocBook 4 and 5,
RFC 2557, the TIFF 6.0 specification, and the language references of LaTeX, reStructuredText,
Textile, AsciiDoc, Org and troff). Apple's IWA (Pages 5 and later) is undocumented; its reader
follows the publicly described container (Snappy-compressed protobuf archives) and was checked
against Pages files whose text is known.

Text without a declared encoding (plain text, Markdown and the other markups, HTML without a
charset) is decoded after detection: byte-order marks (UTF-8, UTF-16, UTF-32), BOM-less UTF-16,
strict UTF-8, then the East Asian multi-byte encodings (Shift_JIS, EUC-JP, GBK/GB18030, Big5,
EUC-KR) and the single-byte code pages (Windows-1250 to 1258, ISO-8859-x, KOI8-R, Mac OS Roman, and
the DOS code pages 437, 850 and 866), each scored on how plausible the decoded text is.

| Program | Versions | Era | Extensions | Detection signature | Import fidelity | Known limitations |
| --- | --- | --- | --- | --- | --- | --- |
| Microsoft Word (Office Open XML) | 2007-current, Transitional and Strict | 2006- | .docx .docm .dotx .dotm | ZIP with `word/document.xml` | full | Text boxes anchored in drawing canvases are placed at their anchor paragraph; Where a file offers alternate content (SmartArt, charts, equations) the fallback is used. EMF/WMF pictures are kept in the document but browsers cannot draw them, so they show as empty frames. |
| Microsoft Word 2003 XML | 2003, 2007 ("Word XML Document") | 2003-2010 | .xml .wml | `<w:wordDocument>` root in the `schemas.microsoft.com/office/word/2003/wordml` namespace | high | Converted to Office Open XML in memory and read by the DOCX reader: styles, numbering, footnotes and endnotes, comments, tracked changes, headers and footers, sections, embedded pictures (`w:binData`), hyperlinks, shading. VML shapes other than pictures are dropped. |
| Microsoft Word Flat OPC | 2007-current | 2007- | .xml | `<pkg:package>` root with a `/word/document.xml` part | full | As for DOCX (the package parts are rebuilt into a ZIP). |
| OpenDocument text | 1.0-1.3 | 2005- | .odt .ott .fodt | `mimetype` `application/vnd.oasis.opendocument.text`; flat XML `office:document` with that `office:mimetype` | full | Text frames become text boxes (width, wrap side, fill, border); cell borders kept. Drawing shapes other than frames and pictures are dropped. |
| OpenOffice.org / StarOffice Writer XML | OpenOffice.org 1.x, StarOffice 6-7 | 2002-2005 | .sxw .stw .sxg | `mimetype` `application/vnd.sun.xml.writer` (also `-template`, `-global`); single `office:document` with the `openoffice.org/2000/office` namespace | high | Translated to OpenDocument and read by the ODT reader: styles, lists, tables, frames, pictures, notes, annotations, tracked changes, page layout, headers and footers. Master documents (.sxg) import their own text only, not the linked sub-documents. |
| Rich Text Format | 1.0-1.9.1 (Word, WordPad, LibreOffice, TextEdit) | 1987- | .rtf | `{\rtf` | high | Comments, tracked changes (author and date), list tables (with or without `\*`), custom paragraph styles, shapes with text (text boxes) and pictures (`\shppict`, `\pict`), paragraph and cell borders, merged cells. Drawing objects other than text boxes and pictures are dropped; OLE objects show their result picture. |
| TextEdit RTFD | Mac OS X-current | 2001- | .rtfd (bundle saved as a ZIP or folder upload) | ZIP with `TXT.rtf` and attachments | high | Attached pictures are inserted where `\NeXTGraphic` names them; TIFF attachments are converted (baseline TIFF: uncompressed, PackBits, LZW). Other attachment types are listed by name. |
| Web page (HTML, XHTML) | HTML 3.2-5, XHTML 1.x | 1995- | .html .htm .xhtml .xht | `<!DOCTYPE html`, `<html`, common tags | high | Document style sheets with simple selectors (tag, class, id) are applied, so LibreOffice, Word ("Web Page") and Google Docs exports keep their formatting and paragraph styles; `@page` size and margins, LibreOffice and Word header/footer divisions, footnotes. Complex selectors, floats and positioning are ignored. |
| Web archive (MHTML) | IE 5-11, Word "Single File Web Page", Chrome, Opera | 1999- | .mht .mhtml | MIME `multipart/related` with an HTML part | high | As for HTML; pictures and style sheets come from the archive (Content-Location and cid: references, base64 and quoted-printable). |
| AbiWord | 1.x-3.x | 1998- | .abw .zabw .awt | `<abiword` root (also gzip-compressed) | high | Styles, lists, tables with spans and borders, pictures, footnotes and endnotes, annotations, tracked revisions, headers and footers, page size and margins, metadata. Positioned frames other than text and pictures are dropped. |
| KWord / Calligra Words | KWord 1.x (KOffice 1.x) | 1999-2010 | .kwd .kwt | ZIP (or tar.gz) with `maindoc.xml` whose root is `<DOC ... editor="KWord">`; `mimetype` `application/x-kword` | high | Paper, styles, lists (counters), tables (frame groups), pictures, footnotes, headers and footers, metadata. Later Calligra Words files are OpenDocument and open as such. |
| Apple Pages | '09 (4.x) | 2009-2013 | .pages | ZIP with `index.xml` in the `apple.com/namespaces/sl` namespace (also gzip-compressed index) | high | Paragraph and character styles with inheritance, lists, tables, pictures, headers and footers, footnotes, comments, page size and margins. Shapes and text boxes become paragraphs at their anchor. |
| Apple Pages | 5.0-current (IWA) | 2013- | .pages (package folder saved as a ZIP) | ZIP with `Index/Document.iwa` (or a nested `Index.zip`) | basic | Body text with paragraph styles (headings, alignment, spacing), character runs (bold, italic, underline, strike, font, size, colour), lists, tables (text and numbers) and pictures. Headers, footers, footnotes and comments are not read (IWA is undocumented). Password-protected documents show their preview picture (`preview.jpg`) and a note that the text is encrypted. |
| Hangul (HWPX / OWPML) | Hancom Office 2010-current | 2010- | .hwpx .hwpt | `mimetype` `application/hwp+zip`, `Contents/section0.xml` | high | Character and paragraph shapes, numbering and bullets, styles, tables with spans and fills, pictures, headers, footers, footnotes, hyperlinks, page size and margins. Drawing objects other than pictures are dropped. |
| FictionBook | 2.0-2.1 | 2004- | .fb2 .fbz | `<FictionBook>` root (also inside a ZIP) | high | Title information (title, author, annotation, cover), sections as headings, epigraphs, poems, citations, tables, pictures, notes bodies as footnotes. |
| DocBook | 4.x (SGML-free XML) and 5.x | 1999- | .dbk .docbook .xml | `<book>`, `<article>` and friends in the `docbook.org/ns/docbook` namespace or with a DocBook DOCTYPE | high | Sections, admonitions and sidebars (as text boxes), lists, variable lists, CALS and HTML tables with spans, program listings, figures with embedded pictures, equations (TeX alternatives), footnotes, links and cross-references. Pictures referenced by path are not available (only the file is opened). |
| EPUB | 2.0, 3.x | 2007- | .epub | `mimetype` `application/epub+zip` | high | Chapters in spine order with pictures, footnotes and links between chapters; title, author and language from the package. The book's own style sheets are not applied; fixed-layout positioning is not kept. |
| Markdown | CommonMark, GitHub, pandoc | 2004- | .md .markdown .mdown .mkd | Markdown block syntax in text | high | Tables, task lists, footnotes, math, fenced code. Raw HTML blocks are imported as HTML. |
| LaTeX | LaTeX 2e | 1994- | .tex .latex .ltx | `\documentclass`, `\begin{document}` | high | Title block, sectioning, lists (with enumitem labels), tabular with `\multicolumn`/`\multirow`, figures, footnotes, verbatim and listings, math (kept as LaTeX), page geometry, accents and symbols, simple `\newcommand` macros. Packages are not executed; unknown commands keep their arguments as text. Pictures loaded from separate files are not available. |
| reStructuredText | Docutils 0.x | 2002- | .rst .rest | Section underlines, directives (`.. name::`) | high | Sections, lists, field and option lists, grid, simple and list tables, admonitions, code, math, footnotes, links. Extension directives and roles are shown as text. |
| Textile | 2.x | 2003- | .textile | Block signatures (`h1.`, `p.`, `bq.`, `bc.`) | high | Headings, paragraphs with alignment and classes, lists, tables with spans, quotes, code, footnotes, inline formatting, HTML blocks, links and pictures (inline data only). |
| AsciiDoc | Asciidoctor 1.5-2.x | 2002- | .adoc .asciidoc .asc | Document header (`= Title`, `:attr:`), delimited blocks | high | Header and attributes, sections, lists, description lists, admonitions, delimited blocks, tables with spans, footnotes, links. Includes are not followed. |
| Org mode | 8-9 | 2003- | .org | `#+TITLE:`, `* ` headlines, `#+BEGIN_` blocks | high | Headlines (with TODO keywords and tags as text), lists, tables, blocks, footnotes, links, emphasis. Babel code is not executed; drawers are dropped. |
| troff / man / mdoc | Unix man(7), mdoc(7), tbl | 1971- | .man .roff .mdoc .1-.9 .n | `.TH`, `.SH`, `.Dd`/`.Dt` request lines | high | man and mdoc macros (sections, paragraphs, lists, fonts, synopsis), tbl tables (including `T{ T}` blocks). Arbitrary troff requests, macros defined in the file, eqn and pic are not interpreted. |
| Plain text | any | 1960s- | .txt (any) | Text without markup | text | Encoding detected as above; DOS box drawing (code pages 437/850) decodes correctly. |
