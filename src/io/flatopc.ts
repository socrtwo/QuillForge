/**
 * Word "XML Document" (Word 2007 and later flat OPC: a pkg:package with one pkg:part per
 * package part) import. The parts are unpacked into an in-memory OOXML package and opened
 * with the DOCX importer, so fidelity is the same as for .docx.
 */
import JSZip from 'jszip';
import type { Node as PMNode } from 'prosemirror-model';
import { importDocxZip } from './docx-import';
import { decodeXml, parseXml, attr, kids, kid } from './xml-read';
import { base64ToBytes } from './serialize';

/** Unpack a flat OPC document into a JSZip package (exported for tests). */
export function flatOpcToPackage(data: ArrayBuffer): JSZip {
  const doc = parseXml(decodeXml(data));
  const root = doc?.documentElement;
  if (!root || root.localName !== 'package') throw new Error('Not a flat OPC package (pkg:package root element missing)');
  const zip = new JSZip();
  const types: string[] = [];
  const ser = new XMLSerializer();
  for (const part of kids(root)) {
    if (part.localName !== 'part') continue;
    const name = (attr(part, 'name') || '').replace(/^\/+/, '');
    if (!name) continue;
    const ct = attr(part, 'contentType') || 'application/octet-stream';
    types.push(`<Override PartName="/${name.replace(/"/g, '&quot;')}" ContentType="${ct.replace(/"/g, '&quot;')}"/>`);
    const xml = kid(part, 'xmlData');
    const bin = kid(part, 'binaryData');
    if (xml) {
      const el = kids(xml)[0];
      if (el) zip.file(name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + ser.serializeToString(el));
    } else if (bin) zip.file(name, base64ToBytes((bin.textContent || '').replace(/\s+/g, '')));
  }
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${types.join('')}</Types>`);
  return zip;
}

export async function importFlatOpc(data: ArrayBuffer, name: string): Promise<PMNode> {
  return importDocxZip(flatOpcToPackage(data), name);
}
