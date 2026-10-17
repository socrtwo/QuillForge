import { describe, it, expect, beforeAll } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../src/editor/schema';
import { dialectFor, grammarMatches, isEnglish, Proofer, type SpellDialect } from '../../src/proof/proofing';
import type { ProofIssue } from '../../src/editor/plugins/decorations';

const S = schema;

describe('dictionary choice', () => {
  it('uses the preference unless it is "follow the document"', () => {
    expect(dialectFor('any', 'en-GB')).toBe('any');
    expect(dialectFor('en-CA', 'en-US')).toBe('en-CA');
    expect(dialectFor(undefined, 'en-GB')).toBe('en-GB');
  });
  it('maps document languages to the nearest dictionary', () => {
    const d = (lang: string) => dialectFor('document', lang);
    expect(d('en-US')).toBe('en-US');
    expect(d('en-PH')).toBe('en-US');
    expect(d('en-GB')).toBe('en-GB');
    expect(d('en-IE')).toBe('en-GB');
    expect(d('en-IN')).toBe('en-GB');
    expect(d('en-ZA')).toBe('en-GB');
    expect(d('en-CA')).toBe('en-CA');
    expect(d('en-AU')).toBe('en-AU');
    expect(d('en-NZ')).toBe('en-AU');
    expect(d('en')).toBe('any');
    expect(d('fr-FR')).toBe('any');
    expect(d('en_GB')).toBe('en-GB');
    expect(d('en-Latn-US')).toBe('en-US');
    expect(d('eng')).toBe('any');
    expect(d('')).toBe('any');
  });
  it('recognizes English language tags', () => {
    expect(isEnglish('en')).toBe(true);
    expect(isEnglish('en-GB')).toBe(true);
    expect(isEnglish('EN-in')).toBe(true);
    expect(isEnglish(null)).toBe(true);
    expect(isEnglish('fr-FR')).toBe(false);
    expect(isEnglish('eng')).toBe(false);
  });
});

describe('a / an', () => {
  const rules = (t: string) => grammarMatches(t).map((m) => m.rule);
  const fixes = (t: string) => grammarMatches(t).flatMap((m) => m.suggestions);
  it('accepts every variety\'s usage before an h', () => {
    for (const t of ['Use an herb.', 'Use a herb.', 'It was an historic day.', 'It was a historic day.', 'We stayed at an hotel.', 'We stayed at a hotel.', 'It is an honour.', 'It is an honor.', 'Wait an hour.', 'He is an heir.', 'We need a house.']) {
      expect(rules(t), t).not.toContain('a-an');
      expect(rules(t), t).not.toContain('a-an-h');
    }
  });
  it('flags "a" before a silent h and "an" before a sounded consonant', () => {
    expect(fixes('Wait a hour.')).toContain('an hour');
    expect(fixes('It is a honour.')).toContain('an honour');
    expect(fixes('It is a honor.')).toContain('an honor');
    expect(fixes('A honest man.')).toContain('An honest');
    expect(fixes('We need an house.')).toContain('a house');
    expect(fixes('Eat a apple.')).toContain('an apple');
  });
  it('accepts "a" before vowel letters with a consonant sound', () => {
    for (const t of ['A university.', 'A user.', 'A one-off.', 'A European city.', 'A once-in-a-lifetime trip.']) expect(rules(t), t).not.toContain('a-an');
  });
  it('leaves initialisms alone, whose sound spelling does not show', () => {
    for (const t of ['An FBI agent.', 'A NATO base.', 'An HR manager.', 'A HR manager.', 'An MBA.']) expect(rules(t), t).not.toContain('a-an');
  });
  it('checks "then" vs "than" in either spelling', () => {
    expect(rules('It was bigger then I realised.')).toContain('then');
    expect(rules('It was bigger then I realized.')).toContain('then');
  });
});

// ------------------------------------------------------------------------------------------
// The spelling worker, run in-process: postMessage to the fake Worker calls the worker
// module's onmessage, and its replies come back through the fake Worker's onmessage.

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

const lang = (l: string) => S.marks.lang.create({ lang: l });
const para = (...parts: (string | [string, string])[]) => S.nodes.paragraph.create(null, parts.map((p) => (typeof p === 'string' ? S.text(p) : S.text(p[0], [lang(p[1])]))));

async function proof(doc: PMNode, spellDialect: SpellDialect, language = 'en-US'): Promise<ProofIssue[]> {
  let state = EditorState.create({ doc });
  const view = { get state() { return state; }, dispatch: (tr: any) => { state = state.apply(tr); } };
  const tab = { view, settings: { language } } as any;
  const app = { prefs: { spellcheck: true, grammar: true, spellDialect, ignoredWords: [], dictionary: [] }, docs: [tab] } as any;
  return new Proofer(app).run(tab);
}
const misspelled = async (text: string, d: SpellDialect, language?: string) =>
  (await proof(S.node('doc', null, [para(text)]), d, language)).filter((i) => i.kind === 'spell').map((i) => i.message.match(/"(.+)"/)![1]);

describe('spelling varieties', () => {
  it('accepts American, British, Canadian and Australian spelling by default', async () => {
    expect(await misspelled('The colour and color of the organisation and organization were analysed and analyzed at the theatre and theater.', 'any')).toEqual([]);
    expect(await misspelled('I will recieve it.', 'any')).toEqual(['recieve']);
  }, 60000);
  it('checks one variety when asked', async () => {
    expect(await misspelled('The colour and color.', 'en-US')).toEqual(['colour']);
    expect(await misspelled('The colour and color.', 'en-GB')).toEqual(['color']);
    expect(await misspelled('We organize and organise.', 'en-GB')).toEqual([]);
    expect(await misspelled('The colour of the jewellery.', 'en-AU')).toEqual([]);
    expect(await misspelled('The colour of the centre was analyzed.', 'en-CA')).toEqual([]);
    expect(await misspelled('The color of the center.', 'en-CA')).toEqual(['color', 'center']);
  }, 60000);
  it('follows the document language and runs marked with their own variety', async () => {
    const doc = S.node('doc', null, [para('Our colour scheme, and ', ['a colour quoted from London', 'en-GB'], '.')]);
    const bad = (await proof(doc, 'document', 'en-US')).filter((i) => i.kind === 'spell');
    expect(bad.length).toBe(1);
    expect(doc.textBetween(bad[0].from, bad[0].to)).toBe('colour');
    expect(bad[0].from).toBeLessThan(10);
    expect(bad[0].dialect).toBe('en-US');
  }, 60000);
  it('does not check text in other languages with English rules', async () => {
    const doc = S.node('doc', null, [para('I will recieve it. ', ['Je vais recevoir une lettre.', 'fr-FR'])]);
    const issues = await proof(doc, 'any');
    expect(issues.filter((i) => i.kind === 'spell').map((i) => doc.textBetween(i.from, i.to))).toEqual(['recieve']);
    const french = S.node('doc', null, [para('Je vais recevoir une lettre, a apple.')]);
    expect(await proof(french, 'any', 'fr-FR')).toEqual([]);
  }, 60000);
});
