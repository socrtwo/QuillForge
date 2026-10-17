# File formats

QuillForge identifies every file by its **content**, not its name (`src/io/sniff.ts`): magic numbers,
compound-file (OLE2) stream names, ZIP entry names and `mimetype` entries, XML root elements and
namespaces, RTF/HTML/MIME headers, and text heuristics (byte-order marks, UTF-16 without a BOM,
UTF-8 validity, markup). The extension only breaks ties between equally likely formats. When the
content and the name disagree, the file opens by content and a short note says so, for example
"Opened as a WordPerfect 5.x document; the file name says .doc." A file with no extension opens the
same way.

Spreadsheets, presentations and email are not word-processing documents. Opening one asks whether
to hand it to the sister app that edits it natively (QuillGrid, QuillStage or QuillPost: on Android
through a view intent limited to that app's package, on the desktop through the system's registered
handler, on the web through a link), or to import it into a document: one table per sheet, one
section per slide, or a message with its header block, body and attachment list.

Fidelity tiers used below:

- **full**: everything the format can express survives (within what the editor models).
- **high**: text, character and paragraph formatting, styles, lists, tables and the common page
  features; rarely used features are approximated or dropped.
- **basic**: text, paragraphs and the main character formatting (bold, italic, underline, size).
- **text**: text and paragraph breaks only.

## Legacy and binary formats

All readers are clean-room implementations written from the publishers' format descriptions
(Microsoft's binary file format specifications and Open Specifications, WordPerfect Corporation's
developer documentation, Hancom's HWP 5.0 specification, Apple's MacWrite description, IBM's DCA
documentation). When a file's structure cannot be parsed, the recovery report adds a
format-aware text extraction ("Legacy word processor text") next to the generic methods.

| Program | Versions | Era | Extensions | Detection signature | Import fidelity | Known limitations |
| --- | --- | --- | --- | --- | --- | --- |
| Microsoft Word for Windows | 97, 2000, XP, 2003 | 1997-2007 | .doc .dot .wbk | OLE2 `WordDocument` stream, FIB magic A5EC, nFib ≥ 193 | high | Text boxes, shapes other than pictures, revision marks, comments and fields other than PAGE/hyperlinks are not imported; column layouts become one column. Encrypted files are refused with a message. |
| Microsoft Word for Windows | 6.0, 95 | 1993-1997 | .doc .dot | OLE2 `WordDocument`, nFib 101-105 | high | As for 97-2003; numbering comes from the ANLD outline information. East Asian (DBCS) text is decoded with the font character sets. |
| Microsoft Word for Windows | 1.x, 2.0 | 1989-1993 | .doc | FIB magic A59B / A5DB | basic | Character formatting and paragraph text; the style sheet is not read, so heading styles appear as their direct formatting only. |
| Microsoft Word for DOS | 3-6 | 1984-1993 | .doc | BE31 0000 AB00 header with a style-sheet or printer name | high | Styles from separate .STY files are not available; footnotes are not imported. |
| Microsoft Windows Write | 3.0, 3.1 | 1985-1995 | .wri | BE31/BE32 0000 AB00 header | high | OLE objects and metafile pictures are skipped (bitmaps import). |
| Microsoft Word for Macintosh | 1, 3, 4, 5 | 1985-1993 | (none) .doc .mcw | FE32 / FE34 / FE37 big-endian magic | text | Formatting is not read. |
| Kingsoft WPS Writer | 2002-current | 2002- | .wps .wpt | OLE2 `WordDocument` (Word-compatible) | high | Opens through the Word reader; the newer WPS formats are DOCX and open as such. |
| WordPerfect | 4.2 and earlier | 1986-1989 | .wp .doc .wpd | No header; bracketed function codes 0xC0-0xFE | basic | Bold and underline; other functions are skipped. |
| WordPerfect | 5.0, 5.1, 5.2 | 1988-1993 | .wp .wp5 .wpd .doc | `FF 57 50 43`, product 1, file type 0x0A, major version 0 | high | Tables and columns become paragraphs; fonts are reported by the printer setup and are not mapped. |
| WordPerfect | 6.0-X9, Office 20xx | 1993- | .wpd .wp6 .wpt | `FF 57 50 43`, product 1, file type 0x0A, major version 2 (also inside an OLE2 `PerfectOffice_MAIN` stream) | high | Tables and columns become paragraphs; styles are applied as direct formatting. Password-protected files are refused. |
| WordPerfect for Macintosh | 2.x, 3.x | 1990-1996 | (none) .wpd | `FF 57 50 43`, file type 0x2C | basic | Bold, italic and underline; other codes are skipped. |
| Microsoft Works | 4.5-9, Works Suite | 1997-2009 | .wps | OLE2 `CONTENTS` stream starting `CHNKWKS` / `CHNKINK` | text | Text, paragraphs and the default font; the chunk formatting tables are not read. |
| Microsoft Works | 3, 4 for Windows | 1993-1996 | .wps | OLE2 `MN0` stream | basic | Bold, italic, underline and size from the formatting pages. |
| Microsoft Works for DOS | 1-3 | 1987-1993 | .wps | `01 FE` header | text | |
| Lotus Word Pro | 96-9.8 | 1996-2014 | .lwp | `WordPro` at offset 0 | text | Paragraph text records only; formatting, frames, and compressed object streams are not decoded (some documents show only part of their text). |
| Lotus Ami Pro | 1.0-3.1 | 1988-1996 | .sam | `[ver]` section header (text) | high | Styles map to headings and lists by name; frames and drawings are skipped. |
| MacWrite | 2.2, 4.5, 5.0 | 1984-1989 | (none) .mcw | Version word 3 or 6 and the paragraph information array | text | Plain and nibble-compressed paragraphs; formatting runs are not read. |
| MacWrite II / Pro | 1.0-1.5 | 1989-1995 | (none) .mwp | Header pattern (weak; extension helps) | text | Best effort: text runs from the data fork. |
| WriteNow | 2-4 | 1986-1996 | (none) .wn | `WriteNow` (version 4) | text | Best effort; font and style names may appear as text. |
| ClarisWorks / AppleWorks | 1-6 | 1991-2004 | .cwk (none) | `BOBO` at offset 4 | text | Word-processing text; spreadsheet, database and drawing parts are not imported. |
| WordStar | 3.x-4.x, 5-7 | 1979-1992 | .ws .ws4-.ws7 .wsd (any) | WordStar 5-7 header `1D 7D`; otherwise high-bit word ends, soft returns `8D 0A`, dot commands | basic | Bold/italic/underline/super/subscript toggles, dot commands for page breaks, headers, footers, left margin and justification. |
| XyWrite | III, III+, 4 | 1982-1993 | .xy .xyw (any) | `«MD..»`, `«PG»` command pairs in CP437 text | basic | Modes, centering, flush right, page breaks, running heads and footnotes. |
| IBM DisplayWrite / DCA-RFT | 3-5 | 1985-1993 | .rft .dca | Structured field introducer `xx xx D3`, EBCDIC text | basic | Underline and bold control sequences; tables and fonts are not read. |
| MultiMate | 3.x, Advantage | 1982-1990 | .dox (any) | 0xAF paragraph marks (weak; extension helps) | text | |
| Hangul (Hancom Office) | 2002 and later (HWP 5) | 2002- | .hwp .hwt | OLE2 `FileHeader` stream `HWP Document File` | high | Text, character shapes (bold, italic, underline, strike, super/subscript, font, size, colour), paragraph shapes, tables with spans, page size and margins. Distribution (copy-protected) and password-protected documents are refused. |
| Hangul 97 | HWP 3 | 1997-2002 | .hwp | `HWP Document File V3` | — | Recognized; not imported (a different, older format). |

### Spreadsheets, presentations and email (imported as documents)

| Program | Versions | Extensions | Detection signature | Import | Known limitations |
| --- | --- | --- | --- | --- | --- |
| Microsoft Excel | 2007-current | .xlsx .xlsm .xltx | ZIP with `xl/workbook.xml` | One table per sheet, values as displayed (numbers, text, booleans, dates) | Formulas show their cached values; cell formatting, charts and merged cells are not kept. 5,000 rows × 64 columns per sheet. |
| Microsoft Excel | 2.x-2003 (BIFF2-BIFF8), Works spreadsheets | .xls .xlt .xlr | OLE2 `Workbook` / `Book`, or a BIFF2-4 BOF record | As above | As above. Password-protected workbooks are refused. |
| Excel binary workbook | 2007-current | .xlsb | ZIP with `xl/workbook.bin` | Recognized | Not importable; open in QuillGrid. |
| OpenDocument spreadsheet | 1.0-1.3 | .ods .ots .fods | `mimetype` / `office:mimetype` | One table per sheet | As for Excel. |
| CSV / TSV | RFC 4180 | .csv .tsv .tab (any) | Consistent delimiter counts in text | One table (`,` `;` `|` or tab detected) | |
| dBASE / FoxPro | III-7 | .dbf | Version byte, date and header length | One table with field names | Memo fields are not read. |
| Lotus 1-2-3 | 1A-97 | .wk1 .wks .wk3 .wk4 .123 | BOF record (00 00, version) | Values of all sheets | Formulas show their cached values. |
| Quattro Pro, Apple Numbers, Gnumeric, SYLK, DIF, Excel 2003 XML, StarCalc | various | .qpw .wb1-3 .wq1-2 .numbers .gnumeric .slk .dif .xml .sdc .sxc | Container and header signatures | Recognized | Open in QuillGrid. |
| Microsoft PowerPoint | 2007-current | .pptx .pptm .ppsx .potx | ZIP with `ppt/presentation.xml` | One section per slide: title as Heading 1, text with bullet levels, tables, pictures, speaker notes | Slide layout, theme and animations are not kept. |
| OpenDocument presentation | 1.0-1.3 | .odp .otp .fodp | `mimetype` | As above | As above. |
| Microsoft PowerPoint | 97-2003 | .ppt .pps .pot | OLE2 `PowerPoint Document` | Titles and body text per slide | Pictures and tables are not read. PowerPoint 2-4 files are recognized but not imported. |
| Apple Keynote, Corel Presentations, Lotus Freelance, StarImpress | various | .key .shw .prz .sdd .sxi | Container signatures (Freelance: extension only) | Recognized | Open in QuillStage. |
| Internet email | RFC 822/5322, MIME | .eml .msg (text) .nws | RFC 5322 header block | Header block (subject, from, to, cc, date), HTML or text body with inline pictures, attachment list (pictures shown) | Encrypted or signed (S/MIME, PGP) bodies show as attachments. |
| Apple Mail | 2-current | .emlx | Byte count line, then RFC 5322 | As above | |
| mbox mailboxes | all | .mbox .mbx (none) | `From ` separator lines | Each message in its own section (up to 500) | |
| MHTML web archives | | .mht .mhtml | MIME `multipart/related` with `Content-Location` | The page with its pictures | |
| Microsoft Outlook message | 97-current | .msg .oft | OLE2 `__substg1.0_*` property streams | As for email; HTML, plain or compressed RTF body | |
| TNEF (winmail.dat) | | .dat | `78 9F 3E 22` | Subject, sender, date, body and attachment names | |
| Outlook data files, Outlook Express folders | | .pst .ost .dbx | `!BDN`, `CF AD 12 FE` | Recognized | Open in QuillPost. |
