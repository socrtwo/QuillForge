/**
 * Format-aware text extractors for the recovery report: when a legacy file's structure cannot
 * be parsed, these decode its text runs (in the right code page, without control codes).
 */
type Extractor = (u8: Uint8Array) => Promise<string>;

const EXTRACTORS: Record<string, Extractor> = {
  doc6: async (u) => (await import('./word')).extractText(u),
  word2: async (u) => (await import('./word')).extractText(u),
  worddos: async (u) => (await import('./word')).extractText(u),
  wri: async (u) => (await import('./word')).extractText(u),
  wordmac: async (u) => (await import('./word')).extractText(u),
  wpd: async (u) => (await import('./wordperfect')).extractText(u),
  wps: async (u) => (await import('./works')).extractText(u),
  lwp: async (u) => (await import('./lotus')).extractWordProText(u),
  sam: async (u) => (await import('./lotus')).extractAmiProText(u),
  mcw: async (u) => (await import('./mac')).extractText(u),
  wn: async (u) => (await import('./mac')).extractText(u),
  cwk: async (u) => (await import('./mac')).extractText(u),
  wordstar: async (u) => (await import('./charmode')).extractText(u, 'wordstar'),
  xywrite: async (u) => (await import('./charmode')).extractText(u, 'xywrite'),
  rft: async (u) => (await import('./charmode')).extractText(u, 'rft'),
  multimate: async (u) => (await import('./charmode')).extractText(u, 'multimate'),
  hwp: async (u) => (await import('./hwp')).extractText(u),
};

export function legacyExtractor(format: string): Extractor | null {
  return EXTRACTORS[format] || null;
}
