import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { EditorState } from 'prosemirror-state';

// IndexedDB is not available under jsdom: keep the store in memory.
const mem = new Map<string, unknown>();
vi.mock('../../src/util/store', () => ({
  kvGet: async (k: string) => mem.get(k),
  kvSet: async (k: string, v: unknown) => { mem.set(k, v); },
  kvDel: async (k: string) => { mem.delete(k); },
  kvKeys: async (p = '') => [...mem.keys()].filter((k) => k.startsWith(p)),
}));

const { CATALOG, dictionaryFor, sha256, untar, installDictionary, installedDictionaries, removeDictionary } = await import('../../src/proof/dictionaries');
const { Proofer } = await import('../../src/proof/proofing');
const { schema: S } = await import('../../src/editor/schema');

describe('catalog', () => {
  it('lists the published dictionaries with checksums and licenses', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(90);
    for (const d of CATALOG) {
      expect(d.aff.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(d.dic.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(d.integrity).toMatch(/^sha512-/);
      expect(d.tarball).toMatch(/^https:\/\/registry\.npmjs\.org\//);
      expect(d.license).toBeTruthy();
    }
    expect(CATALOG.filter((d) => d.bundled).map((d) => d.id).sort()).toEqual(['en', 'en-au', 'en-ca', 'en-gb']);
  });
});

describe('language to dictionary', () => {
  const all = new Set(CATALOG.map((d) => d.id));
  it('picks the closest installed dictionary', () => {
    expect(dictionaryFor('fr-FR', all)).toBe('fr');
    expect(dictionaryFor('fr-CA', all)).toBe('fr');
    expect(dictionaryFor('de-AT', all)).toBe('de-at');
    expect(dictionaryFor('de-LI', all)).toBe('de-ch');
    expect(dictionaryFor('de-DE', all)).toBe('de');
    expect(dictionaryFor('es-MX', all)).toBe('es-mx');
    expect(dictionaryFor('es-ES', all)).toBe('es');
    expect(dictionaryFor('pt-BR', all)).toBe('pt');
    expect(dictionaryFor('pt-PT', all)).toBe('pt-pt');
    expect(dictionaryFor('no', all)).toBe('nb');
    expect(dictionaryFor('sr-Latn-RS', all)).toBe('sr-latn');
    expect(dictionaryFor('grc', all)).toBe('el-polyton');
    expect(dictionaryFor('ca-ES-valencia', all)).toBe('ca-valencia');
    expect(dictionaryFor('sv_FI', all)).toBe('sv-fi');
    expect(dictionaryFor('xx-YY', all)).toBeNull();
    expect(dictionaryFor('fr-FR', new Set(['de']))).toBeNull();
  });
});

describe('verification helpers', () => {
  it('computes SHA-256 like node', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 100000]) {
      const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
      expect(Buffer.from(sha256(data)).toString('hex')).toBe(createHash('sha256').update(data).digest('hex'));
    }
  });
  it('reads files from a tar archive', () => {
    const tar = makeTar({ 'package/package.json': '{}', 'package/index.aff': 'SET UTF-8\n' });
    expect(new TextDecoder().decode(untar(tar, 'package/index.aff'))).toBe('SET UTF-8\n');
    expect(() => untar(tar, 'package/index.dic')).toThrow(/missing/);
  });
});

// ------------------------------------------------------------------------------------------
// Installing and using a dictionary (a tiny one, so the test needs no network)

const AFF = 'SET UTF-8\nTRY aeinorstmcbhj\n';
const DIC = '4\nbonjour\nmaison\nchat\nje\n';

function makeTar(files: Record<string, string>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [name, body] of Object.entries(files)) {
    const data = new TextEncoder().encode(body);
    const head = new Uint8Array(512);
    head.set(new TextEncoder().encode(name), 0);
    head.set(new TextEncoder().encode(data.length.toString(8).padStart(11, '0') + '\0'), 124);
    parts.push(head, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const entry = CATALOG.find((d) => d.id === 'fr')!;
const original = JSON.parse(JSON.stringify(entry));
function useFakeFiles() {
  entry.aff = { size: AFF.length, sha256: createHash('sha256').update(AFF).digest('hex') };
  entry.dic = { size: DIC.length, sha256: createHash('sha256').update(DIC).digest('hex') };
  const tgz = gzipSync(makeTar({ 'package/index.aff': AFF, 'package/index.dic': DIC }));
  entry.integrity = 'sha512-' + createHash('sha512').update(tgz).digest('base64');
  return tgz;
}
const respond = (body: Uint8Array | string, status = 200) => new Response(body as BodyInit, { status });

afterEach(async () => { Object.assign(entry, JSON.parse(JSON.stringify(original))); vi.unstubAllGlobals(); await removeDictionary('fr'); mem.clear(); });

describe('installing', () => {
  it('downloads both files from jsDelivr and checks them', async () => {
    useFakeFiles();
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => { urls.push(u); return respond(u.endsWith('.aff') ? AFF : DIC); });
    const phases = new Set<string>();
    await installDictionary('fr', (p) => phases.add(p.phase));
    expect(urls).toEqual([`https://cdn.jsdelivr.net/npm/dictionary-fr@${entry.version}/index.aff`, `https://cdn.jsdelivr.net/npm/dictionary-fr@${entry.version}/index.dic`]);
    expect([...phases]).toEqual(['download', 'verify', 'save']);
    expect((await installedDictionaries()).has('fr')).toBe(true);
    await removeDictionary('fr');
    expect((await installedDictionaries()).has('fr')).toBe(false);
  });
  it('falls back to the npm package when the CDN fails or its files do not match', async () => {
    const tgz = useFakeFiles();
    vi.stubGlobal('fetch', async (u: string) => (u.startsWith('https://registry.npmjs.org/') ? respond(tgz) : respond('tampered')));
    await installDictionary('fr');
    expect((await installedDictionaries()).has('fr')).toBe(true);
  });
  it('installs nothing when neither source verifies', async () => {
    useFakeFiles();
    vi.stubGlobal('fetch', async (u: string) => (u.startsWith('https://registry.npmjs.org/') ? respond(gzipSync(new Uint8Array(10))) : respond('', 404)));
    await expect(installDictionary('fr')).rejects.toThrow(/integrity/);
    expect((await installedDictionaries()).has('fr')).toBe(false);
  });
});

// The spelling worker, run in-process as in proofing.test.ts.
let workerHandler: ((e: { data: unknown }) => Promise<void>) | null = null;
let liveWorker: FakeWorker | null = null;
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { liveWorker = this; }
  postMessage(data: unknown) { void workerHandler!({ data }); }
  terminate() { /* */ }
}
beforeAll(async () => {
  (globalThis as any).Worker = FakeWorker;
  (self as any).postMessage = (data: unknown) => liveWorker?.onmessage?.({ data });
  await import('../../src/proof/spell.worker');
  workerHandler = (self as any).onmessage;
  (self as any).onmessage = null;
});

describe('checking with a downloaded dictionary (Hunspell)', () => {
  it('checks text marked as French with the French dictionary and skips English grammar there', async () => {
    useFakeFiles();
    vi.stubGlobal('fetch', async (u: string) => respond(u.endsWith('.aff') ? AFF : DIC));
    await installDictionary('fr');
    const fr = S.marks.lang.create({ lang: 'fr-FR' });
    const doc = S.node('doc', null, [S.nodes.paragraph.create(null, [S.text('An apple. '), S.text('bonjour je maisonn a apple', [fr])])]);
    let state = EditorState.create({ doc });
    const view = { get state() { return state; }, dispatch: (tr: any) => { state = state.apply(tr); } };
    const tab = { view, settings: { language: 'en-US' } } as any;
    const app = { prefs: { spellcheck: true, grammar: true, spellDialect: 'any', ignoredWords: [], dictionary: [] }, docs: [tab] } as any;
    const issues = await new Proofer(app).run(tab);
    const spelled = issues.filter((i) => i.kind === 'spell').map((i) => doc.textBetween(i.from, i.to));
    expect(spelled).toEqual(['maisonn', 'apple']);
    expect(issues.find((i) => i.kind === 'spell')!.dialect).toBe('dict:fr');
    expect(issues.filter((i) => i.rule === 'a-an')).toEqual([]);
  }, 60000);
});
