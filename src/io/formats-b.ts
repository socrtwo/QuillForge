/**
 * Import-only registrations for XML, archive and text-markup word-processor formats.
 * Spread into FORMATS by io/index.ts; every converter loads lazily on first use.
 * Detection lives in sniff-b.ts.
 */
import type { FormatDef } from './index';

const ro = (f: Omit<FormatDef, 'canImport' | 'canExport'>): FormatDef => ({ ...f, canImport: true, canExport: false });

export const FORMATS_B: FormatDef[] = [
  ro({
    id: 'wordml', label: 'Word 2003 XML Document (.xml)', ext: ['xml', 'wml'], mime: 'application/vnd.ms-word.wordml',
    import: async (d, n) => (await import('./wordml2003')).importWordml2003(d, n),
    note: 'Microsoft Word 2003 XML (WordprocessingML)',
  }),
  ro({
    id: 'flatopc', label: 'Word XML Document (.xml)', ext: ['xml'], mime: 'application/xml',
    import: async (d, n) => (await import('./flatopc')).importFlatOpc(d, n),
    note: 'Word 2007 and later single-file XML (flat OPC package)',
  }),
  ro({
    id: 'sxw', label: 'OpenOffice.org 1.x Text (.sxw)', ext: ['sxw', 'stw', 'sxg'], mime: 'application/vnd.sun.xml.writer',
    import: async (d, n) => (await import('./sxw')).importSxw(d, n),
    note: 'StarOffice 6/7 and OpenOffice.org 1.x Writer documents and templates',
  }),
  ro({
    id: 'abw', label: 'AbiWord Document (.abw)', ext: ['abw', 'zabw', 'awt'], mime: 'application/x-abiword',
    import: async (d, n) => (await import('./abiword')).importAbiword(d, n),
  }),
  ro({
    id: 'kwd', label: 'KWord Document (.kwd)', ext: ['kwd', 'kwt'], mime: 'application/x-kword',
    import: async (d, n) => (await import('./kword')).importKword(d, n),
    note: 'KOffice KWord 1.x; Calligra Words saves .odt',
  }),
  ro({
    id: 'pages', label: 'Apple Pages Document (.pages)', ext: ['pages'], mime: 'application/vnd.apple.pages',
    import: async (d, n) => (await import('./pages')).importPages(d, n),
    note: "Pages '09 fully; Pages 5 and later: text and basic styles",
  }),
  ro({
    id: 'hwpx', label: 'Hangul Document (.hwpx)', ext: ['hwpx', 'hwpt'], mime: 'application/hwp+zip',
    import: async (d, n) => (await import('./hwpx')).importHwpx(d, n),
  }),
  ro({
    id: 'fb2', label: 'FictionBook (.fb2)', ext: ['fb2', 'fbz'], mime: 'application/x-fictionbook+xml',
    import: async (d, n) => (await import('./fb2')).importFb2(d, n),
  }),
  ro({
    id: 'docbook', label: 'DocBook XML (.dbk)', ext: ['dbk', 'docbook'], mime: 'application/docbook+xml',
    import: async (d, n) => (await import('./docbook')).importDocbook(d, n),
  }),
  ro({
    id: 'rtfd', label: 'RTFD Bundle (.rtfd)', ext: ['rtfd'], mime: 'application/vnd.apple.rtfd',
    import: async (d, n) => (await import('./rtfd')).importRtfd(d, n),
    note: 'TextEdit rich text with attachments (zipped bundle)',
  }),
  ro({
    id: 'mhtml', label: 'Web Archive (.mht)', ext: ['mht', 'mhtml'], mime: 'multipart/related',
    import: async (d, n) => (await import('./mhtml')).importMhtml(d, n),
  }),
  ro({
    id: 'latex', label: 'LaTeX Document (.tex)', ext: ['tex', 'latex', 'ltx'], mime: 'application/x-tex',
    import: async (d, n) => (await import('./latex')).importLatex(d, n),
  }),
  ro({
    id: 'rst', label: 'reStructuredText (.rst)', ext: ['rst', 'rest'], mime: 'text/x-rst',
    import: async (d, n) => (await import('./rst')).importRst(d, n),
  }),
  ro({
    id: 'textile', label: 'Textile (.textile)', ext: ['textile'], mime: 'text/x-textile',
    import: async (d, n) => (await import('./textile')).importTextile(d, n),
  }),
  ro({
    id: 'asciidoc', label: 'AsciiDoc (.adoc)', ext: ['adoc', 'asciidoc', 'asc'], mime: 'text/x-asciidoc',
    import: async (d, n) => (await import('./asciidoc')).importAsciidoc(d, n),
  }),
  ro({
    id: 'org', label: 'Org-mode (.org)', ext: ['org'], mime: 'text/x-org',
    import: async (d, n) => (await import('./org')).importOrg(d, n),
  }),
  ro({
    id: 'man', label: 'Manual Page (troff)', ext: ['man', 'roff', 'mdoc', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'n'], mime: 'text/troff',
    import: async (d, n) => (await import('./troff')).importTroff(d, n),
  }),
];
