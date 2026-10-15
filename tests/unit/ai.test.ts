import { describe, it, expect } from 'vitest';
import { detectKey, PROVIDERS, providerById } from '../../src/ai/providers';
import { cleanOutput, splitAlternatives, diffText, looksLikeMarkdown } from '../../src/ai/apply';
import { parseCommentJson, FEATURES } from '../../src/ai/features';
import { pickModels } from '../../src/ai/client';
import { parseOAuthInput } from '../../src/ai/oauth';
import { resolveBaseUrl } from '../../src/ai/store';

describe('provider registry', () => {
  it('has unique ids, docs links, and https key pages', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROVIDERS) {
      expect(p.links.docs).toMatch(/^https:\/\//);
      for (const u of Object.values(p.links)) if (u) expect(u).toMatch(/^https:\/\//);
    }
  });
  it('fills endpoint templates', () => {
    expect(resolveBaseUrl(providerById('cloudflare')!, { accountId: 'abc' })).toBe('https://api.cloudflare.com/client/v4/accounts/abc/ai/v1');
    expect(resolveBaseUrl(providerById('azure')!, { resource: 'my-res' })).toBe('https://my-res.openai.azure.com/openai/v1');
    expect(resolveBaseUrl(providerById('custom')!, { baseUrl: 'https://x.test/v1/' })).toBe('https://x.test/v1');
  });
});

describe('key detection', () => {
  it('recognizes distinctive key formats inside copied text', () => {
    expect(detectKey(`Your key: sk-or-v1-${'a1'.repeat(32)} (keep it safe)`)?.provider).toBe('openrouter');
    expect(detectKey(`gsk_${'A'.repeat(52)}`)?.provider).toBe('groq');
    expect(detectKey(`sk-ant-api03-${'x'.repeat(90)}AA`)?.provider).toBe('anthropic');
    expect(detectKey(`AIza${'b'.repeat(35)}`)?.provider).toBe('gemini');
    expect(detectKey(`AQ.${'Ab3_'.repeat(10)}`)?.provider).toBe('gemini');
    expect(detectKey(`sk-proj-${'Z9_'.repeat(20)}`)?.provider).toBe('openai');
    expect(detectKey(`xai-${'q'.repeat(80)}`)?.provider).toBe('xai');
  });
  it('uses generic patterns only for the provider being set up', () => {
    const plain = 'A'.repeat(32);
    expect(detectKey(plain)).toBeNull();
    expect(detectKey(plain, 'mistral')?.provider).toBe('mistral');
  });
  it('ignores ordinary text and huge clipboard contents', () => {
    expect(detectKey('meeting notes for Tuesday')).toBeNull();
    expect(detectKey('x'.repeat(5000))).toBeNull();
  });
});

describe('output cleaning', () => {
  it('drops preambles, fences and wrapping quotes', () => {
    expect(cleanOutput('Sure! Here is the rewritten text:\nHello there.')).toBe('Hello there.');
    expect(cleanOutput('```\nplain\n```')).toBe('plain');
    expect(cleanOutput('"Quoted answer."')).toBe('Quoted answer.');
    expect(cleanOutput('<think>reasoning</think>\nFinal.')).toBe('Final.');
  });
  it('splits alternatives and strips their labels', () => {
    expect(splitAlternatives('Version 1: One.\n---\n2. Two.\n---\nOption 3 - Three.')).toEqual(['One.', 'Two.', 'Three.']);
  });
  it('detects Markdown structure', () => {
    expect(looksLikeMarkdown('| a | b |\n| - | - |')).toBe(true);
    expect(looksLikeMarkdown('- item')).toBe(true);
    expect(looksLikeMarkdown('Just a sentence.')).toBe(false);
  });
});

describe('word diff', () => {
  const apply = (a: string, b: string) => {
    const edits = diffText(a, b)!;
    let out = a;
    for (const e of [...edits].reverse()) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
    return { out, edits };
  };
  it('produces minimal word-level edits that rebuild the target', () => {
    const { out, edits } = apply('I will recieve teh package today.', 'I will receive the package today.');
    expect(out).toBe('I will receive the package today.');
    expect(edits.length).toBe(2);
  });
  it('handles insertions, deletions and identical input', () => {
    expect(apply('a b c', 'a x b c').out).toBe('a x b c');
    expect(apply('a b c', 'a c').out).toBe('a c');
    expect(diffText('same', 'same')).toEqual([]);
  });
});

describe('feature definitions', () => {
  it('every feature builds a prompt and has a unique id', () => {
    const ids = new Set<string>();
    for (const f of FEATURES) {
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(typeof f.prompt({ text: 'Sample.', arg: f.options?.[0]?.value, extra: 'x', lang: 'auto', n: 3 })).toBe('string');
    }
  });
  it('uses no trademarked feature names as labels', () => {
    const banned = /copilot|gemini|magic write|\bzia\b|writing tools|apple intelligence|help me write|spices|sparks/i;
    for (const f of FEATURES) expect(f.label).not.toMatch(banned);
  });
  it('parses comment JSON wrapped in prose or fences', () => {
    expect(parseCommentJson('Here you go:\n```json\n[{"quote":"lazy dog","comment":"vague"}]\n```')).toEqual([{ quote: 'lazy dog', comment: 'vague' }]);
    expect(parseCommentJson('not json')).toEqual([]);
  });
});

describe('model choice and OAuth input', () => {
  it('keeps defaults when offered, otherwise picks sensible models', () => {
    const p = providerById('groq')!;
    expect(pickModels(p, [p.models.fast, p.models.quality, 'whisper-large'])).toEqual({ fast: p.models.fast, quality: p.models.quality });
    const q = pickModels(providerById('openai')!, ['text-embedding-3', 'gpt-x-mini', 'gpt-x-pro']);
    expect(q.fast).toBe('gpt-x-mini');
    expect(q.quality).toBe('gpt-x-pro');
  });
  it('extracts the code from a pasted redirect URL or a bare code', () => {
    expect(parseOAuthInput('http://127.0.0.1:5555/callback?code=abc123def456ghi789&state=1')).toBe('abc123def456ghi789');
    expect(parseOAuthInput('abc123def456ghi789xyz')).toBe('abc123def456ghi789xyz');
    expect(parseOAuthInput('hello')).toBeNull();
  });
});
