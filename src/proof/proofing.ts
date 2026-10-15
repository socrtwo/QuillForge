/** Proofing engine: background spelling (worker) + rule-based grammar and style checks. */
import type { App, DocTab } from '../app';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../editor/schema';
import { proofKey, type ProofIssue } from '../editor/plugins/decorations';

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, (v: any) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const cb = pending.get(e.data.id); if (cb) { pending.delete(e.data.id); cb(e.data); } };
    worker.onerror = () => { worker = null; };
  } catch {
    worker = null;
  }
  return worker;
}

function call(msg: Record<string, any>): Promise<any> {
  const w = getWorker();
  if (!w) return Promise.resolve({ bad: [], suggestions: [] });
  const id = ++reqId;
  return new Promise((res) => { pending.set(id, res); w.postMessage({ ...msg, id }); });
}

export async function suggest(word: string): Promise<string[]> { return (await call({ type: 'suggest', word })).suggestions || []; }
export async function addWord(word: string): Promise<void> { await call({ type: 'add', word }); }

interface Seg { text: string; pos: number[]; base: number; noProof: Set<number> }

function segments(doc: PMNode): Seg[] {
  const out: Seg[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    let text = '';
    const map: number[] = [];
    const noProof = new Set<number>();
    node.forEach((child, off) => {
      if (child.isText) {
        const skip = child.marks.some((m) => (m.type === schema.marks.lang && m.attrs.noProof) || m.type === schema.marks.code || m.type === schema.marks.deletion || m.type === schema.marks.link);
        for (let i = 0; i < child.text!.length; i++) { if (skip) noProof.add(text.length + i); map.push(pos + 1 + off + i); }
        text += child.text;
      } else { map.push(pos + 1 + off); text += '￼'; }
    });
    map.push(pos + 1 + node.content.size);
    out.push({ text, pos: map, base: pos + 1, noProof });
    return false;
  });
  return out;
}

const WORD_RE = /[\p{L}][\p{L}\p{M}'’]*[\p{L}\p{M}]|[\p{L}]/gu;

const GRAMMAR_RULES: { re: RegExp; msg: string; fix?: (m: RegExpExecArray) => string[]; rule: string }[] = [
  { re: /\b(\w+)\s+\1\b/gi, msg: 'Repeated word', fix: (m) => [m[1]], rule: 'repeat' },
  { re: / {2,}(?=\S)/g, msg: 'Extra spaces between words', fix: () => [' '], rule: 'spaces' },
  { re: /\s+([,.;:!?])(?!\w)/g, msg: 'Space before punctuation', fix: (m) => [m[1]], rule: 'spacepunct' },
  { re: /\b(a)\s+([aeiou]\w+)/gi, msg: 'Use "an" before a vowel sound', fix: (m) => [`${m[1] === 'A' ? 'An' : 'an'} ${m[2]}`], rule: 'a-an' },
  { re: /\b(an)\s+([bcdfgjklmnpqrstvwxyz]\w+)/gi, msg: 'Use "a" before a consonant sound', fix: (m) => [`${m[1] === 'An' ? 'A' : 'a'} ${m[2]}`], rule: 'a-an' },
  { re: /\b(could|should|would|must|might) of\b/gi, msg: 'Did you mean "have"?', fix: (m) => [`${m[1]} have`], rule: 'of-have' },
  { re: /\b(alot)\b/gi, msg: '"A lot" is two words', fix: () => ['a lot'], rule: 'alot' },
  { re: /\b(irregardless)\b/gi, msg: 'Nonstandard; use "regardless"', fix: () => ['regardless'], rule: 'irregardless' },
  { re: /\b(i)\b(?!\.)/g, msg: 'Capitalize the pronoun "I"', fix: () => ['I'], rule: 'i' },
  { re: /(?:^|[.!?]\s+)([a-z])/g, msg: 'Capitalize the first word of a sentence', fix: (m) => [m[0].replace(m[1], m[1].toUpperCase())], rule: 'cap' },
  { re: /\b(their|there|they're) (is|are|was|were)\b/gi, msg: 'Check their / there / they\'re', rule: 'their' },
  { re: /\b(your) (welcome|right|wrong)\b/gi, msg: 'Did you mean "you\'re"?', fix: (m) => [`you're ${m[2]}`], rule: 'your' },
  { re: /\b(its) (a|an|the|been|not)\b/gi, msg: 'Did you mean "it\'s"?', fix: (m) => [`it's ${m[2]}`], rule: 'its' },
  { re: /\b(then) (I|we|you|he|she|they) (thought|realized)\b/g, msg: 'Check "then" vs "than"', rule: 'then' },
  { re: /\b(less) (people|items|things|words|cars|books)\b/gi, msg: 'Use "fewer" with countable nouns', fix: (m) => [`fewer ${m[2]}`], rule: 'fewer' },
  { re: /,{2,}|\.{4,}|!{2,}|\?{2,}/g, msg: 'Repeated punctuation', rule: 'punct' },
  { re: /\(\s+|\s+\)/g, msg: 'Space inside parentheses', fix: (m) => [m[0].trim()], rule: 'paren' },
];

export class Proofer {
  private timer: any = null;
  private running = false;
  constructor(private app: App) {}

  schedule(tab: DocTab = this.app.active, delay = 1200) {
    if (!this.app.prefs.spellcheck && !this.app.prefs.grammar) {
      if ((proofKey.getState(tab.view.state)?.issues.length || 0) > 0) tab.view.dispatch(tab.view.state.tr.setMeta(proofKey, []).setMeta('addToHistory', false));
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(tab), delay);
  }

  async run(tab: DocTab): Promise<ProofIssue[]> {
    if (this.running) { this.schedule(tab, 800); return []; }
    this.running = true;
    try {
      const doc = tab.view.state.doc;
      const segs = segments(doc);
      const issues: ProofIssue[] = [];
      const ignored = new Set(this.app.prefs.ignoredWords.map((w) => w.toLowerCase()));
      const dict = new Set(this.app.prefs.dictionary.map((w) => w.toLowerCase()));
      if (this.app.prefs.spellcheck) {
        const words = new Set<string>();
        const occurrences: { word: string; from: number; to: number }[] = [];
        for (const s of segs) {
          WORD_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = WORD_RE.exec(s.text))) {
            const w = m[0].replace(/’/g, "'").replace(/'s$/i, '').replace(/^'|'$/g, '');
            if (!w || s.noProof.has(m.index)) continue;
            if (/\d/.test(w) || w.length < 2) continue;
            if (/^[\p{Lu}]{2,}$/u.test(w)) continue; // acronyms
            if (ignored.has(w.toLowerCase()) || dict.has(w.toLowerCase())) continue;
            words.add(w);
            occurrences.push({ word: w, from: s.pos[m.index], to: s.pos[m.index + m[0].length - 1] + 1 });
          }
        }
        if (words.size) {
          const res = await call({ type: 'check', words: [...words] });
          const bad = new Set<string>(res.bad || []);
          for (const o of occurrences) if (bad.has(o.word)) issues.push({ from: o.from, to: o.to, kind: 'spell', message: `"${o.word}" may be misspelled`, suggestions: [] });
        }
      }
      if (this.app.prefs.grammar) {
        for (const s of segs) {
          for (const r of GRAMMAR_RULES) {
            r.re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = r.re.exec(s.text))) {
              if (m[0].length === 0) { r.re.lastIndex++; continue; }
              if (r.rule === 'repeat' && /^(had|that|is|do|very|bye|no|so|ha|go)$/i.test(m[1])) continue;
              if (r.rule === 'cap' && /\b(e\.g|i\.e|etc|vs|cf|al)\.\s+[a-z]$/i.test(s.text.slice(Math.max(0, m.index - 8), m.index + m[0].length))) continue;
              if (r.rule === 'a-an' && /^(uni|use|usu|one|eu|ur)/i.test(m[2])) continue;
              if (r.rule === 'an' && /^h(our|onest|onor|eir)/i.test(m[2])) continue;
              const start = m.index + (r.rule === 'cap' ? m[0].length - 1 : 0);
              const end = m.index + m[0].length;
              if (s.noProof.has(start)) continue;
              issues.push({ from: s.pos[start], to: s.pos[end - 1] + 1, kind: r.rule === 'spaces' || r.rule === 'paren' ? 'style' : 'grammar', message: r.msg, suggestions: r.fix ? (r.rule === 'cap' ? [m[1].toUpperCase()] : r.fix(m)) : [], rule: r.rule });
            }
          }
        }
      }
      if (tab.view.state.doc === doc && !(tab.view as any).isDestroyed) tab.view.dispatch(tab.view.state.tr.setMeta(proofKey, issues).setMeta('addToHistory', false));
      else this.schedule(tab, 600);
      return issues;
    } finally {
      this.running = false;
    }
  }
}
