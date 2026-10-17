/**
 * Import-only formats: historical word processors (legacy/), and spreadsheets, presentations
 * and email that open as documents (convert/). Each id equals the format id that sniff()
 * returns for the file, so detection and import line up without a mapping table.
 */
import type { FormatDef } from './index';

const word = () => import('./legacy/word');
const sheets = () => import('./convert/sheets');
const slides = () => import('./convert/slides');
const email = () => import('./convert/email');

export const LEGACY_FORMATS: FormatDef[] = [
  { id: 'doc6', label: 'Word 6.0/95 Document (.doc)', ext: ['doc', 'dot'], mime: 'application/msword', canImport: true, canExport: false, fidelity: 'high',
    import: async (d, n) => (await word()).importWord6(d, n), note: 'Text, character and paragraph formatting, styles, tables, notes, headers and footers' },
  { id: 'word2', label: 'Word for Windows 1.x/2.0 Document (.doc)', ext: ['doc', 'dot'], mime: 'application/msword', canImport: true, canExport: false, fidelity: 'basic',
    import: async (d, n) => (await word()).importWord2(d, n) },
  { id: 'worddos', label: 'Word for DOS Document (.doc)', ext: ['doc'], mime: 'application/msword', canImport: true, canExport: false, fidelity: 'high',
    import: async (d, n) => (await word()).importWordDos(d, n) },
  { id: 'wri', label: 'Windows Write Document (.wri)', ext: ['wri'], mime: 'application/x-mswrite', canImport: true, canExport: false, fidelity: 'high',
    import: async (d, n) => (await word()).importWordDos(d, n) },
  { id: 'wordmac', label: 'Word for Macintosh Document', ext: ['doc', 'mcw'], mime: 'application/msword', canImport: true, canExport: false, fidelity: 'text',
    import: async (d, n) => (await word()).importWordMac(d, n) },
  { id: 'wpd', label: 'WordPerfect Document (.wpd)', ext: ['wpd', 'wp', 'wp4', 'wp5', 'wp6', 'wp7', 'wpt', 'w51', 'w60', 'w61'], mime: 'application/vnd.wordperfect', canImport: true, canExport: false, fidelity: 'high',
    import: async (d, n) => (await import('./legacy/wordperfect')).importWordPerfect(d, n) },
  { id: 'wps', label: 'Microsoft Works Document (.wps)', ext: ['wps', 'wpt'], mime: 'application/vnd.ms-works', canImport: true, canExport: false, fidelity: 'high',
    import: async (d, n) => (await import('./legacy/works')).importWorks(d, n) },
  { id: 'lwp', label: 'Lotus Word Pro Document (.lwp)', ext: ['lwp'], mime: 'application/vnd.lotus-wordpro', canImport: true, canExport: false, fidelity: 'basic',
    import: async (d, n) => (await import('./legacy/lotus')).importWordPro(d, n) },
  { id: 'sam', label: 'Ami Pro Document (.sam)', ext: ['sam'], mime: 'application/vnd.lotus-amipro', canImport: true, canExport: false, fidelity: 'high',
    import: async (d, n) => (await import('./legacy/lotus')).importAmiPro(d, n) },
  { id: 'mcw', label: 'MacWrite Document (.mcw)', ext: ['mcw', 'mw', 'mwii', 'mwp'], mime: 'application/macwriteii', canImport: true, canExport: false, fidelity: 'basic',
    import: async (d, n) => (await import('./legacy/mac')).importMacWrite(d, n) },
  { id: 'wn', label: 'WriteNow Document', ext: ['wn'], mime: 'application/octet-stream', canImport: true, canExport: false, fidelity: 'text',
    import: async (d, n) => (await import('./legacy/mac')).importWriteNow(d, n) },
  { id: 'cwk', label: 'ClarisWorks / AppleWorks Document (.cwk)', ext: ['cwk', 'cws'], mime: 'application/x-appleworks', canImport: true, canExport: false, fidelity: 'text',
    import: async (d, n) => (await import('./legacy/mac')).importClarisWorks(d, n) },
  { id: 'wordstar', label: 'WordStar Document (.ws)', ext: ['ws', 'ws3', 'ws4', 'ws5', 'ws6', 'ws7', 'wsd'], mime: 'application/x-wordstar', canImport: true, canExport: false, fidelity: 'basic',
    import: async (d, n) => (await import('./legacy/charmode')).importWordStar(d, n) },
  { id: 'xywrite', label: 'XyWrite Document (.xy)', ext: ['xy', 'xyw', 'xy3', 'xy4'], mime: 'application/x-xywrite', canImport: true, canExport: false, fidelity: 'basic',
    import: async (d, n) => (await import('./legacy/charmode')).importXyWrite(d, n) },
  { id: 'rft', label: 'DisplayWrite / DCA-RFT Document (.rft)', ext: ['rft', 'dca'], mime: 'application/dca-rft', canImport: true, canExport: false, fidelity: 'basic',
    import: async (d, n) => (await import('./legacy/charmode')).importDca(d, n) },
  { id: 'multimate', label: 'MultiMate Document', ext: ['dox', 'mm'], mime: 'application/octet-stream', canImport: true, canExport: false, fidelity: 'text',
    import: async (d, n) => (await import('./legacy/charmode')).importMultiMate(d, n) },
  { id: 'hwp', label: 'Hangul Document (.hwp)', ext: ['hwp', 'hwt'], mime: 'application/x-hwp', canImport: true, canExport: false, fidelity: 'basic',
    import: async (d, n) => (await import('./legacy/hwp')).importHwp(d, n) },

  // Spreadsheets: one table per sheet.
  { id: 'xlsx', label: 'Excel Workbook (.xlsx)', ext: ['xlsx', 'xlsm', 'xltx', 'xltm'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', canImport: true, canExport: false, category: 'spreadsheet', fidelity: 'basic',
    import: async (d, n) => (await sheets()).importSpreadsheet(d, n, 'xlsx') },
  { id: 'xls', label: 'Excel 97-2003 Workbook (.xls)', ext: ['xls', 'xlt', 'xlr'], mime: 'application/vnd.ms-excel', canImport: true, canExport: false, category: 'spreadsheet', fidelity: 'basic',
    import: async (d, n) => (await sheets()).importSpreadsheet(d, n, 'xls') },
  { id: 'ods', label: 'OpenDocument Spreadsheet (.ods)', ext: ['ods', 'ots', 'fods'], mime: 'application/vnd.oasis.opendocument.spreadsheet', canImport: true, canExport: false, category: 'spreadsheet', fidelity: 'basic',
    import: async (d, n) => (await sheets()).importSpreadsheet(d, n, 'ods') },
  { id: 'csv', label: 'Comma-Separated Values (.csv)', ext: ['csv'], mime: 'text/csv', canImport: true, canExport: false, category: 'spreadsheet', fidelity: 'full',
    import: async (d, n) => (await sheets()).importSpreadsheet(d, n, 'csv') },
  { id: 'tsv', label: 'Tab-Separated Values (.tsv)', ext: ['tsv', 'tab'], mime: 'text/tab-separated-values', canImport: true, canExport: false, category: 'spreadsheet', fidelity: 'full',
    import: async (d, n) => (await sheets()).importSpreadsheet(d, n, 'tsv') },
  { id: 'dbf', label: 'dBASE Table (.dbf)', ext: ['dbf'], mime: 'application/dbase', canImport: true, canExport: false, category: 'spreadsheet', fidelity: 'basic',
    import: async (d, n) => (await sheets()).importSpreadsheet(d, n, 'dbf') },
  { id: 'lotus123', label: 'Lotus 1-2-3 Worksheet (.wk1)', ext: ['wk1', 'wks'], mime: 'application/vnd.lotus-1-2-3', canImport: true, canExport: false, category: 'spreadsheet', fidelity: 'basic',
    import: async (d, n) => (await sheets()).importSpreadsheet(d, n, 'lotus123') },

  // Presentations: one section per slide.
  { id: 'pptx', label: 'PowerPoint Presentation (.pptx)', ext: ['pptx', 'pptm', 'ppsx', 'potx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', canImport: true, canExport: false, category: 'presentation', fidelity: 'basic',
    import: async (d, n) => (await slides()).importPresentation(d, n, 'pptx') },
  { id: 'odp', label: 'OpenDocument Presentation (.odp)', ext: ['odp', 'otp', 'fodp'], mime: 'application/vnd.oasis.opendocument.presentation', canImport: true, canExport: false, category: 'presentation', fidelity: 'basic',
    import: async (d, n) => (await slides()).importPresentation(d, n, 'odp') },
  { id: 'ppt', label: 'PowerPoint 97-2003 Presentation (.ppt)', ext: ['ppt', 'pps', 'pot'], mime: 'application/vnd.ms-powerpoint', canImport: true, canExport: false, category: 'presentation', fidelity: 'text',
    import: async (d, n) => (await slides()).importPresentation(d, n, 'ppt') },

  // Email: header block, body, attachment list.
  { id: 'eml', label: 'Email Message (.eml)', ext: ['eml'], mime: 'message/rfc822', canImport: true, canExport: false, category: 'email', fidelity: 'high',
    import: async (d, n) => (await email()).importEmail(d, n, 'eml') },
  { id: 'emlx', label: 'Apple Mail Message (.emlx)', ext: ['emlx'], mime: 'message/rfc822', canImport: true, canExport: false, category: 'email', fidelity: 'high',
    import: async (d, n) => (await email()).importEmail(d, n, 'emlx') },
  { id: 'mbox', label: 'Mailbox (.mbox)', ext: ['mbox', 'mbx'], mime: 'application/mbox', canImport: true, canExport: false, category: 'email', fidelity: 'high',
    import: async (d, n) => (await email()).importEmail(d, n, 'mbox') },
  { id: 'mht', label: 'Web Archive (.mht)', ext: ['mht', 'mhtml'], mime: 'multipart/related', canImport: true, canExport: false, fidelity: 'high',
    import: async (d, n) => (await email()).importEmail(d, n, 'mht') },
  { id: 'msg', label: 'Outlook Message (.msg)', ext: ['msg'], mime: 'application/vnd.ms-outlook', canImport: true, canExport: false, category: 'email', fidelity: 'high',
    import: async (d, n) => (await email()).importEmail(d, n, 'msg') },
  { id: 'tnef', label: 'TNEF Attachment Bundle (winmail.dat)', ext: ['dat', 'tnef'], mime: 'application/ms-tnef', canImport: true, canExport: false, category: 'email', fidelity: 'basic',
    import: async (d, n) => (await email()).importEmail(d, n, 'tnef') },
];
