/// <reference lib="webworker" />
/**
 * Spelling worker: Hunspell-compatible checking with nspell and the SCOWL English dictionaries.
 *
 * Dialects:
 *   any    - English in all its major varieties: a word is accepted when the American or the
 *            British dictionary accepts it (together they also cover Canadian and Australian
 *            spelling), so no writer's own spelling is marked wrong. The default.
 *   en-US  - American
 *   en-GB  - British; also accepts Oxford -ize spellings (organize, realization)
 *   en-CA  - Canadian
 *   en-AU  - Australian
 * Each 'check' and 'suggest' message names its dialect ('any' when it names none), so text marked
 * with its own variety is checked against that variety. Dictionaries load on demand, so only the
 * varieties in use take memory (about 9-12 MB each).
 */
import nspell from 'nspell';

export type Dialect = 'any' | 'en-US' | 'en-GB' | 'en-CA' | 'en-AU';
type Speller = ReturnType<typeof nspell>;
type Single = Exclude<Dialect, 'any'>;

const loaders: Record<Single, () => Promise<[string, string]>> = {
  'en-US': async () => [(await import('../../node_modules/dictionary-en/index.aff?raw')).default, (await import('../../node_modules/dictionary-en/index.dic?raw')).default],
  'en-GB': async () => [(await import('../../node_modules/dictionary-en-gb/index.aff?raw')).default, (await import('../../node_modules/dictionary-en-gb/index.dic?raw')).default],
  'en-CA': async () => [(await import('../../node_modules/dictionary-en-ca/index.aff?raw')).default, (await import('../../node_modules/dictionary-en-ca/index.dic?raw')).default],
  'en-AU': async () => [(await import('../../node_modules/dictionary-en-au/index.aff?raw')).default, (await import('../../node_modules/dictionary-en-au/index.dic?raw')).default],
};

const DIALECTS = new Set<string>(['any', 'en-US', 'en-GB', 'en-CA', 'en-AU']);
const loaded = new Map<Single, Promise<Speller>>();
const personal = new Set<string>();

function speller(d: Single): Promise<Speller> {
  let p = loaded.get(d);
  if (!p) {
    p = loaders[d]().then(([aff, dic]) => {
      const sp = nspell(aff, dic);
      for (const w of personal) sp.add(w);
      return sp;
    });
    // A failed load is retried next time instead of failing forever.
    p.catch(() => loaded.delete(d));
    loaded.set(d, p);
  }
  return p;
}

/** Results per dialect: word -> correct. */
const cache = new Map<Dialect, Map<string, boolean>>();

/** Dictionaries consulted for a dialect (the first one gives suggestions first). */
function spellers(d: Dialect): Promise<Speller[]> {
  if (d === 'any') return Promise.all([speller('en-US'), speller('en-GB')]);
  if (d === 'en-GB') return Promise.all([speller('en-GB'), speller('en-US')]);
  return Promise.all([speller(d)]);
}

const OXFORD = /iz(e|ed|es|ing|ation|ations|er|ers|able)$/i;

async function correct(d: Dialect, w: string): Promise<boolean> {
  const sps = await spellers(d);
  if (d === 'en-GB') {
    // British dictionary, plus Oxford spelling: -ize forms the American dictionary confirms.
    return sps[0].correct(w) || (OXFORD.test(w) && sps[1].correct(w));
  }
  return sps.some((s) => s.correct(w));
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { id: number; type: 'check' | 'suggest' | 'add' | 'remove'; words?: string[]; word?: string; dialect?: string };
  const reply = (v: Record<string, unknown>) => (self as any).postMessage({ id: msg.id, ...v });
  try {
    const d: Dialect = msg.dialect && DIALECTS.has(msg.dialect) ? (msg.dialect as Dialect) : 'any';
    if (msg.type === 'add' && msg.word) {
      personal.add(msg.word);
      for (const p of loaded.values()) (await p).add(msg.word);
      for (const c of cache.values()) c.set(msg.word, true);
      reply({ ok: true });
      return;
    }
    if (msg.type === 'remove' && msg.word) {
      personal.delete(msg.word);
      for (const p of loaded.values()) (await p).remove(msg.word);
      for (const c of cache.values()) c.delete(msg.word);
      reply({ ok: true });
      return;
    }
    if (msg.type === 'suggest' && msg.word) {
      const out: string[] = [];
      for (const sp of await spellers(d)) for (const s of sp.suggest(msg.word)) if (!out.includes(s)) out.push(s);
      reply({ suggestions: out.slice(0, 8) });
      return;
    }
    let c = cache.get(d);
    if (!c) cache.set(d, (c = new Map()));
    const bad: string[] = [];
    for (const w of msg.words || []) {
      let ok = c.get(w);
      if (ok === undefined) { ok = await correct(d, w); c.set(w, ok); }
      if (!ok) bad.push(w);
    }
    reply({ bad });
  } catch (err) {
    reply({ bad: [], suggestions: [], error: String((err as Error)?.message || err) });
  }
};
