/// <reference lib="webworker" />
/** Spelling worker: Hunspell-compatible checking with nspell and the SCOWL en_US dictionary. */
import nspell from 'nspell';
import aff from '../../node_modules/dictionary-en/index.aff?raw';
import dic from '../../node_modules/dictionary-en/index.dic?raw';

let spell: ReturnType<typeof nspell> | null = null;
const cache = new Map<string, boolean>();

function ensure() {
  if (!spell) spell = nspell(aff, dic);
  return spell;
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { id: number; type: 'check' | 'suggest' | 'add' | 'remove'; words?: string[]; word?: string };
  const sp = ensure();
  if (msg.type === 'add' && msg.word) { sp.add(msg.word); cache.set(msg.word, true); (self as any).postMessage({ id: msg.id, ok: true }); return; }
  if (msg.type === 'remove' && msg.word) { sp.remove(msg.word); cache.delete(msg.word); (self as any).postMessage({ id: msg.id, ok: true }); return; }
  if (msg.type === 'suggest' && msg.word) { (self as any).postMessage({ id: msg.id, suggestions: sp.suggest(msg.word).slice(0, 8) }); return; }
  const bad: string[] = [];
  for (const w of msg.words || []) {
    let ok = cache.get(w);
    if (ok === undefined) { ok = sp.correct(w); cache.set(w, ok); }
    if (!ok) bad.push(w);
  }
  (self as any).postMessage({ id: msg.id, bad });
};
