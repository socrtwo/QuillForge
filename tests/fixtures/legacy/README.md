# Legacy-format test fixtures

All files here were made for this project; none comes from a third party.

| File | How it was made |
| --- | --- |
| `source.fodt`, `source.fods`, `source.fodp` | Written by hand for these tests (the PNG pictures inside are generated 16×16 squares). |
| `word97.doc` | `soffice --headless --convert-to "doc:MS Word 97" source.fodt` (LibreOffice 24.2) |
| `sheet.xls`, `sheet.xlsx`, `sheet.ods` | `soffice --headless --convert-to` `"xls:MS Excel 97"`, `"xlsx:Calc MS Excel 2007 XML"`, `ods` from `source.fods` |
| `slides.pptx`, `slides.odp` | `soffice --headless --convert-to` `"pptx:Impress MS PowerPoint 2007 XML"`, `odp` from `source.fodp` |

Files in formats that no installed tool writes (Word 2/6/95, Word for DOS, Write, Word for Mac,
WordPerfect, Works, Ami Pro, Word Pro, MacWrite, ClarisWorks, WordStar, XyWrite, DCA-RFT,
MultiMate, HWP 5, PowerPoint 97 text, dBASE, Lotus 1-2-3, Outlook .msg, TNEF) are built at test time
from the published format descriptions by `tests/unit/legacy-builders.ts`.

LibreOffice 24.2 can no longer write Word 6.0/95 files, so those are built by `buildWord6()`.
During development the importers were also compared, for local verification only, with
LibreOffice's text and HTML conversions of public sample files from the Apache Tika, Apache POI and
LibreOffice test suites; those files are not part of this repository.
