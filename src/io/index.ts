/**
 * File format registry.
 *
 * Contract for converter modules (src/io/<format>.ts):
 *   import:  (data: ArrayBuffer, name: string) => Promise<PMNode>   // a `doc` node; settings in doc.attrs.settings
 *   export:  (doc: PMNode, opts: ExportOptions) => Promise<Blob>
 */
import type { Node as PMNode } from 'prosemirror-model';

export interface ExportOptions {
  fileName: string;
  author: string;
  /** Title for formats that carry one (EPUB, HTML). */
  title?: string;
}

export interface FormatDef {
  id: string;
  label: string;
  ext: string[];
  mime: string;
  canImport: boolean;
  canExport: boolean;
  import?: (data: ArrayBuffer, name: string) => Promise<PMNode>;
  export?: (doc: PMNode, opts: ExportOptions) => Promise<Blob>;
  note?: string;
}

const lazy = <T>(loader: () => Promise<T>) => loader;

export const FORMATS: FormatDef[] = [
  {
    id: 'docx', label: 'Word Document (.docx)', ext: ['docx', 'docm', 'dotx', 'dotm'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', canImport: true, canExport: true,
    import: async (d, n) => (await import('./docx-import')).importDocx(d, n),
    export: async (doc, o) => (await import('./docx-export')).exportDocx(doc, o),
  },
  {
    id: 'odt', label: 'OpenDocument Text (.odt)', ext: ['odt', 'ott'], mime: 'application/vnd.oasis.opendocument.text', canImport: true, canExport: true,
    import: async (d, n) => (await import('./odt')).importOdt(d, n),
    export: async (doc, o) => (await import('./odt')).exportOdt(doc, o),
  },
  {
    id: 'rtf', label: 'Rich Text Format (.rtf)', ext: ['rtf'], mime: 'application/rtf', canImport: true, canExport: true,
    import: async (d, n) => (await import('./rtf')).importRtf(d, n),
    export: async (doc, o) => (await import('./rtf')).exportRtf(doc, o),
  },
  {
    id: 'html', label: 'Web Page (.html)', ext: ['html', 'htm', 'xhtml'], mime: 'text/html', canImport: true, canExport: true,
    import: async (d, n) => (await import('./html')).importHtml(d, n),
    export: async (doc, o) => (await import('./html')).exportHtml(doc, o),
  },
  {
    id: 'md', label: 'Markdown (.md)', ext: ['md', 'markdown', 'mdown', 'txt.md'], mime: 'text/markdown', canImport: true, canExport: true,
    import: async (d, n) => (await import('./markdown')).importMarkdown(d, n),
    export: async (doc, o) => (await import('./markdown')).exportMarkdown(doc, o),
  },
  {
    id: 'txt', label: 'Plain Text (.txt)', ext: ['txt', 'text', 'log', 'csv'], mime: 'text/plain', canImport: true, canExport: true,
    import: async (d, n) => (await import('./text')).importText(d, n),
    export: async (doc, o) => (await import('./text')).exportText(doc, o),
  },
  {
    id: 'epub', label: 'EPUB e-book (.epub)', ext: ['epub'], mime: 'application/epub+zip', canImport: true, canExport: true,
    import: async (d, n) => (await import('./epub')).importEpub(d, n),
    export: async (doc, o) => (await import('./epub')).exportEpub(doc, o),
  },
  {
    id: 'fodt', label: 'Flat OpenDocument (.fodt)', ext: ['fodt'], mime: 'application/vnd.oasis.opendocument.text-flat-xml', canImport: true, canExport: true,
    import: async (d, n) => (await import('./odt')).importFodt(d, n),
    export: async (doc, o) => (await import('./odt')).exportFodt(doc, o),
  },
  {
    id: 'qfd', label: 'QuillForge Document (.qfd)', ext: ['qfd', 'json'], mime: 'application/json', canImport: true, canExport: true,
    import: async (d) => (await import('./native')).importNative(d),
    export: async (doc) => (await import('./native')).exportNative(doc),
  },
  { id: 'pdf', label: 'PDF (via Print ▸ Save as PDF)', ext: ['pdf'], mime: 'application/pdf', canImport: false, canExport: true, note: 'Uses the system print service' },
];
void lazy;

export function formatForName(name: string): FormatDef | undefined {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  return FORMATS.find((f) => f.ext.includes(ext));
}

export function formatById(id: string): FormatDef | undefined {
  return FORMATS.find((f) => f.id === id);
}

export function sniffFormat(data: ArrayBuffer, name: string): FormatDef | undefined {
  const u8 = new Uint8Array(data.slice(0, 64));
  const head = String.fromCharCode(...u8);
  if (head.startsWith('PK')) {
    const byName = formatForName(name);
    if (byName && ['docx', 'odt', 'epub'].includes(byName.id)) return byName;
    if (head.includes('mimetypeapplication/vnd.oasis')) return formatById('odt');
    if (head.includes('mimetypeapplication/epub')) return formatById('epub');
    return formatById('docx');
  }
  if (head.startsWith('{\\rtf')) return formatById('rtf');
  if (/^\s*\{\s*"(type|qf)"/.test(head)) return formatById('qfd');
  if (/^\s*<(!doctype html|html|\?xml)/i.test(head)) {
    if (/office:document/.test(new TextDecoder().decode(data.slice(0, 2000)))) return formatById('fodt');
    return formatById('html');
  }
  return formatForName(name) || formatById('txt');
}

export async function importFile(data: ArrayBuffer, name: string): Promise<{ doc: PMNode; format: FormatDef }> {
  const fmt = sniffFormat(data, name);
  if (!fmt || !fmt.import) throw new Error(`Unsupported file type: ${name}`);
  const doc = await fmt.import(data, name);
  return { doc, format: fmt };
}

export async function exportFile(doc: PMNode, formatId: string, opts: ExportOptions): Promise<Blob> {
  const fmt = formatById(formatId);
  if (!fmt || !fmt.export) throw new Error(`Cannot export as ${formatId}`);
  return fmt.export(doc, opts);
}

export function decodeText(data: ArrayBuffer): string {
  const u8 = new Uint8Array(data);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.slice(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.slice(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder('windows-1252').decode(u8);
  }
}
