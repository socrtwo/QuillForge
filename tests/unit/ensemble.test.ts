import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runEnsemble, parseStance, normalizeEnsemble, outcomeLine, costNote, requestEstimate, labelResponses,
  MASTER_PROMPT, DRAFT_MINUTE, STANCE_PROMPT, REVISE_PROMPT,
  type EnsemblePlan, type MemberCall, type EnsembleInfo,
} from '../../src/ai/ensemble';
import { AiError, chat, listModels, type ChatRequest, type ChatResult } from '../../src/ai/client';
import { aiSettings, saveAiSettings, reloadAiSettings, setApiKey, resolveProvider, ensemblePlan, receivingProviders } from '../../src/ai/store';

// ------------------------------------------------------------------------------------------
// Mock providers: deterministic answers, and a log of every call.

type Kind = 'answer' | 'master' | 'draft' | 'stance' | 'revise';
interface Call { provider: string; model: string; kind: Kind; req: ChatRequest }

const lastText = (req: ChatRequest) => { const c = req.messages[req.messages.length - 1].content; return typeof c === 'string' ? c : ''; };
function kindOf(req: ChatRequest): Kind {
  const t = lastText(req);
  if (t.includes(STANCE_PROMPT)) return 'stance';
  if (t.includes(REVISE_PROMPT)) return 'revise';
  if (t.includes(DRAFT_MINUTE)) return 'draft';
  if (t.includes(MASTER_PROMPT)) return 'master';
  return 'answer';
}

function mockCall(answer: (c: Call, n: number) => string | Error | Promise<string>) {
  const calls: Call[] = [];
  const call: MemberCall = async (provider, model, req) => {
    const c: Call = { provider, model, kind: kindOf(req), req };
    calls.push(c);
    const a = await answer(c, calls.filter((x) => x.provider === provider && x.kind === c.kind).length);
    if (a instanceof Error) throw a;
    req.onToken?.(a, a);
    return { text: a, model, provider, providerName: provider.toUpperCase(), usage: { in: 10, out: 5 } } as ChatResult;
  };
  return { call, calls };
}

const plan = (mode: 'master' | 'consensus', ids = ['a', 'b', 'c'], extra: Partial<EnsemblePlan> = {}): EnsemblePlan => ({
  mode, members: ids.map((p) => ({ provider: p, model: `${p}-model` })), master: { provider: 'm', model: 'm-model' }, maxRounds: 3, memberTimeoutMs: 1000, ...extra,
});
const req = (over: Partial<ChatRequest> = {}): ChatRequest => ({ messages: [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: 'Rewrite: the cat sat.' }], temperature: 0.4, ...over });
const reverse = <T>(l: T[]) => [...l].reverse();

describe('ensemble: master mode', () => {
  it('asks every member, then the master once with shuffled, labeled responses', async () => {
    const { call, calls } = mockCall((c) => (c.kind === 'answer' ? `Answer from ${c.provider}` : 'The final answer.'));
    const streamed: string[] = [];
    const status: string[] = [];
    const r = await runEnsemble(req({ onToken: (_d, full) => streamed.push(full), onStatus: (t) => status.push(t) }), plan('master'), { call, shuffle: reverse });
    expect(calls.filter((c) => c.kind === 'answer').map((c) => c.provider).sort()).toEqual(['a', 'b', 'c']);
    // Members get the same messages and temperature as the original request.
    for (const c of calls.filter((x) => x.kind === 'answer')) { expect(c.req.messages).toEqual(req().messages); expect(c.req.temperature).toBe(0.4); expect(c.req.onToken).toBeUndefined(); }
    const masters = calls.filter((c) => c.kind === 'master');
    expect(masters).toHaveLength(1);
    expect(masters[0].provider).toBe('m');
    const msgs = masters[0].req.messages;
    expect(msgs.slice(0, 2)).toEqual(req().messages); // the original system prompt and messages first
    const last = lastText(masters[0].req);
    expect(msgs[msgs.length - 1].role).toBe('user');
    expect(last.startsWith(MASTER_PROMPT)).toBe(true);
    // Shuffled (reversed here) and labeled A, B, C; provider names never appear.
    expect(last.indexOf('Response A ---\nAnswer from c')).toBeGreaterThan(0);
    expect(last.indexOf('Response B ---\nAnswer from b')).toBeGreaterThan(0);
    expect(last.indexOf('Response C ---\nAnswer from a')).toBeGreaterThan(0);
    expect(r.text).toBe('The final answer.');
    expect(r.provider).toBe('m');
    expect(r.model).toBe('m-model');
    expect(r.usage).toEqual({ in: 40, out: 20 }); // 3 members + master
    expect(streamed).toEqual(['The final answer.']); // only the final answer streams
    expect(status[0]).toBe('Asking 3 AIs…');
    expect(r.ensemble?.mode).toBe('master');
    expect(r.ensemble?.outcome).toBe('synthesized');
    expect(r.ensemble?.members.map((m) => [m.provider, m.text])).toEqual([['a', 'Answer from a'], ['b', 'Answer from b'], ['c', 'Answer from c']]);
    expect(outcomeLine(r.ensemble!, 'Master AI')).toBe('Synthesized by Master AI');
  });

  it('skips and reports a failing member', async () => {
    const { call, calls } = mockCall((c) => (c.provider === 'b' && c.kind === 'answer' ? new AiError('B rejected the API key (401).', 'auth') : c.kind === 'answer' ? `Answer from ${c.provider}` : 'Combined.'));
    const r = await runEnsemble(req(), plan('master'), { call });
    const master = calls.find((c) => c.kind === 'master')!;
    expect(lastText(master.req)).not.toContain('Response C');
    expect(lastText(master.req)).toContain('Response B');
    const b = r.ensemble!.members.find((m) => m.provider === 'b')!;
    expect(b.error).toMatch(/rejected the API key/);
    expect(b.text).toBeUndefined();
    expect(r.text).toBe('Combined.');
  });

  it('leaves out a member that times out', async () => {
    const { call } = mockCall((c) => (c.provider === 'c' && c.kind === 'answer' ? new Promise<string>(() => undefined) : c.kind === 'answer' ? 'x' : 'Combined.'));
    const r = await runEnsemble(req(), plan('master', ['a', 'b', 'c'], { memberTimeoutMs: 30 }), { call });
    expect(r.ensemble!.members.find((m) => m.provider === 'c')!.error).toMatch(/No answer within/);
    expect(r.text).toBe('Combined.');
  });

  it('returns the only answer when just one member answers, and fails when none do', async () => {
    const one = mockCall((c) => (c.provider === 'a' ? 'Only A.' : new Error('down')));
    const r = await runEnsemble(req(), plan('master'), { call: one.call });
    expect(r.text).toBe('Only A.');
    expect(one.calls.some((c) => c.kind === 'master')).toBe(false);
    expect(outcomeLine(r.ensemble!, 'M', (id) => id.toUpperCase())).toMatch(/^Only A answered/);
    const none = mockCall(() => new Error('down'));
    await expect(runEnsemble(req(), plan('master'), { call: none.call })).rejects.toThrow(/None of the AIs answered/);
  });

  it('runs on-device members one at a time and the others in parallel', async () => {
    let active = 0, maxAll = 0;
    const { call } = mockCall(async (c) => {
      if (c.kind !== 'answer') return 'Combined.';
      active++; maxAll = Math.max(maxAll, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return 'x';
    });
    let localNow = 0, localMax = 0;
    const wrapped: MemberCall = async (p, m, r) => {
      if (p.startsWith('local')) { localNow++; localMax = Math.max(localMax, localNow); }
      try { return await call(p, m, r); } finally { if (p.startsWith('local')) localNow--; }
    };
    await runEnsemble(req(), plan('master', ['local1', 'local2', 'a', 'b']), { call: wrapped, sequential: (p) => p.startsWith('local') });
    expect(localMax).toBe(1);
    expect(maxAll).toBeGreaterThanOrEqual(3); // a, b and one on-device call overlap
  });
});

describe('ensemble: Quaker consensus', () => {
  it('reaches unity in round 1 when all unite', async () => {
    const { call, calls } = mockCall((c) => (c.kind === 'answer' ? `Answer ${c.provider}` : c.kind === 'draft' ? 'The minute.' : '{"stance":"unite","reason":"Correct."}'));
    const streamed: string[] = [];
    const r = await runEnsemble(req({ onToken: (_d, f) => streamed.push(f) }), plan('consensus'), { call });
    expect(calls.filter((c) => c.kind === 'draft')).toHaveLength(1);
    expect(lastText(calls.find((c) => c.kind === 'draft')!.req)).toContain(`${MASTER_PROMPT} ${DRAFT_MINUTE}`);
    const stances = calls.filter((c) => c.kind === 'stance');
    expect(stances).toHaveLength(3);
    expect(lastText(stances[0].req)).toContain('--- Minute ---\nThe minute.');
    expect(lastText(stances[0].req)).toContain('"stance":"unite"|"stand-aside"|"block"');
    expect(calls.some((c) => c.kind === 'revise')).toBe(false);
    expect(r.text).toBe('The minute.');
    expect(streamed).toEqual(['The minute.']); // produced earlier, sent as one chunk
    expect(r.provider).toBe('m');
    expect(r.ensemble!.outcome).toBe('unity');
    expect(r.ensemble!.rounds).toHaveLength(1);
    expect(r.ensemble!.rounds![0].responses.every((x) => x.stance === 'unite')).toBe(true);
    expect(outcomeLine(r.ensemble!, 'M')).toBe('United (3 of 3)');
    expect(r.usage).toEqual({ in: 70, out: 35 }); // 3 answers + draft + 3 stances
  });

  it('records stand-asides with their concerns', async () => {
    const { call } = mockCall((c) => (c.kind === 'answer' ? 'x' : c.kind === 'draft' ? 'Minute.' : c.provider === 'b' ? '```json\n{"stance":"stand-aside","reason":"Too formal.","suggested_change":"Use plainer words."}\n```' : '{"stance":"unite"}'));
    const r = await runEnsemble(req(), plan('consensus'), { call });
    expect(r.ensemble!.outcome).toBe('unity-with-stand-asides');
    expect(r.ensemble!.standAsides).toEqual([{ provider: 'b', reason: 'Too formal. Suggested change: Use plainer words.' }]);
    expect(outcomeLine(r.ensemble!, 'M')).toBe('United; 1 stood aside');
  });

  it('a block triggers a revision and a second round', async () => {
    const status: string[] = [];
    const { call, calls } = mockCall((c, n) => {
      if (c.kind === 'answer') return `Answer ${c.provider}`;
      if (c.kind === 'draft') return 'Draft minute.';
      if (c.kind === 'revise') return 'Revised minute.';
      return c.provider === 'c' && n === 1 ? '{"stance":"block","reason":"The date is wrong.","suggested_change":"Say 1843."}' : '{"stance":"unite"}';
    });
    const r = await runEnsemble(req({ onStatus: (t) => status.push(t) }), plan('consensus'), { call });
    const revise = calls.filter((c) => c.kind === 'revise');
    expect(revise).toHaveLength(1);
    expect(lastText(revise[0].req)).toContain('The date is wrong. Suggested change: Say 1843.');
    expect(lastText(revise[0].req)).toContain('--- Minute ---\nDraft minute.');
    expect(lastText(revise[0].req)).not.toContain('"c"');
    expect(r.ensemble!.rounds!.map((x) => x.minute)).toEqual(['Draft minute.', 'Revised minute.']);
    expect(r.ensemble!.rounds![0].responses.find((x) => x.provider === 'c')!.stance).toBe('block');
    expect(r.ensemble!.outcome).toBe('unity');
    expect(r.text).toBe('Revised minute.');
    expect(status).toContain('Round 1 of 3: 1 objection; the clerk is revising the minute…');
    expect(status).toContain('Round 2 of 3: 0 objections');
  });

  it('after maxRounds with a persistent block: no-unity, and the last minute is still returned', async () => {
    let rev = 0;
    const { call, calls } = mockCall((c) => {
      if (c.kind === 'answer') return 'x';
      if (c.kind === 'draft') return 'Minute 0.';
      if (c.kind === 'revise') return `Minute ${++rev}.`;
      return c.provider === 'a' ? '{"stance":"block","reason":"Still wrong."}' : '{"stance":"unite"}';
    });
    const r = await runEnsemble(req(), plan('consensus', ['a', 'b', 'c'], { maxRounds: 2 }), { call });
    expect(calls.filter((c) => c.kind === 'stance')).toHaveLength(6);
    expect(calls.filter((c) => c.kind === 'revise')).toHaveLength(1); // no revision after the last round
    expect(r.ensemble!.outcome).toBe('no-unity');
    expect(r.ensemble!.blocks).toEqual([{ provider: 'a', reason: 'Still wrong.' }]);
    expect(r.text).toBe('Minute 1.');
    expect(outcomeLine(r.ensemble!, 'M')).toBe('No unity after 2 rounds: 1 objection');
  });

  it('counts unparseable stances as unite with a note, and leaves failed members out of a round', async () => {
    const { call } = mockCall((c) => (c.kind === 'answer' ? 'x' : c.kind === 'draft' ? 'Minute.' : c.provider === 'a' ? 'I think it is fine overall.' : c.provider === 'b' ? new Error('timeout') : '{"stance":"unite"}'));
    const r = await runEnsemble(req(), plan('consensus'), { call });
    const resp = r.ensemble!.rounds![0].responses;
    expect(resp.map((x) => x.provider)).toEqual(['a', 'c']);
    expect(resp[0]).toMatchObject({ stance: 'unite', reason: expect.stringMatching(/could not be read/) });
    expect(r.ensemble!.outcome).toBe('unity');
  });
});

describe('ensemble: abort', () => {
  it('Stop cancels every outstanding call', async () => {
    const ctl = new AbortController();
    const signals: AbortSignal[] = [];
    const call: MemberCall = (_p, _m, r) => new Promise((_, reject) => {
      signals.push(r.signal!);
      r.signal!.addEventListener('abort', () => reject(new AiError('Stopped', 'aborted')));
    });
    const p = runEnsemble(req({ signal: ctl.signal }), plan('master'), { call });
    await new Promise((r) => setTimeout(r, 5));
    expect(signals).toHaveLength(3);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('also cancels a call that ignores its signal (the late answer is dropped)', async () => {
    const ctl = new AbortController();
    const { call, calls } = mockCall(() => new Promise<string>(() => undefined));
    const p = runEnsemble(req({ signal: ctl.signal }), plan('consensus'), { call });
    await new Promise((r) => setTimeout(r, 5));
    ctl.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
    expect(calls.every((c) => c.req.signal!.aborted)).toBe(true);
  });
});

describe('ensemble helpers', () => {
  it('parses stances', () => {
    expect(parseStance('{"stance":"unite","reason":"ok"}')).toEqual({ stance: 'unite', reason: 'ok' });
    expect(parseStance('Sure: {"stance": "Stand aside", "reason": "meh", "suggested_change": "shorter"}')).toEqual({ stance: 'stand-aside', reason: 'meh Suggested change: shorter' });
    expect(parseStance('<think>hmm</think>{"stance":"BLOCK","reason":"wrong total"}').stance).toBe('block');
    expect(parseStance('stance: block').stance).toBe('block');
    expect(parseStance('no idea').stance).toBe('unite');
  });
  it('normalizes stored settings', () => {
    expect(normalizeEnsemble(null)).toEqual({ mode: 'single', members: [], master: '', maxRounds: 3, showDeliberation: true, memberTimeoutMs: 90000 });
    const n = normalizeEnsemble({ mode: 'consensus', members: [{ provider: 'a' }, { provider: 'a' }, { provider: 'b', model: ' m ' }, 7, ...'cdefgh'.split('').map((p) => ({ provider: p }))], maxRounds: 9, showDeliberation: 'yes' });
    expect(n.mode).toBe('consensus');
    expect(n.members).toHaveLength(6);
    expect(n.members[1]).toEqual({ provider: 'b', model: 'm' });
    expect(n.maxRounds).toBe(5);
    expect(n.showDeliberation).toBe(true);
    expect(normalizeEnsemble({ mode: 'everyone' }).mode).toBe('single');
  });
  it('estimates cost', () => {
    expect(requestEstimate(3, 3)).toEqual({ master: 4, consensus: 15 });
    expect(costNote(3, 3)).toBe('Each request is sent to 3 services (about 4 requests for master mode, up to 3×(3+1)+3 = 15 for consensus). Paid services charge for each.');
  });
  it('labels responses A, B, C', () => {
    expect(labelResponses(['one', 'two'])).toBe('--- Response A ---\none\n--- End of Response A ---\n\n--- Response B ---\ntwo\n--- End of Response B ---');
  });
  it('words every outcome', () => {
    const base: EnsembleInfo = { mode: 'consensus', members: [{ provider: 'a', model: 'x', text: '1', ms: 1 }, { provider: 'b', model: 'y', text: '2', ms: 1 }], outcome: 'unity', rounds: [{ minute: 'm', responses: [{ provider: 'a', stance: 'unite' }, { provider: 'b', stance: 'unite' }] }] };
    expect(outcomeLine(base, 'M')).toBe('United (2 of 2)');
    expect(outcomeLine({ ...base, outcome: 'no-unity', blocks: [{ provider: 'a', reason: 'r' }, { provider: 'b', reason: 'r' }], rounds: [base.rounds![0], base.rounds![0], base.rounds![0]] }, 'M')).toBe('No unity after 3 rounds: 2 objections');
  });
});

// ------------------------------------------------------------------------------------------
// chat() dispatch, against a stubbed fetch (OpenAI-compatible JSON answers)

describe('chat() with several AIs', () => {
  let urls: { url: string; model: string; method: string }[] = [];
  beforeEach(async () => {
    urls = [];
    localStorage.clear();
    reloadAiSettings();
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      urls.push({ url, model: body.model, method: init?.method || 'GET' });
      if (!init?.body) return new Response(JSON.stringify({ data: [{ id: 'one' }, { id: 'two' }] }), { status: 200 });
      const last = body.messages[body.messages.length - 1].content;
      const text = /Reply with JSON only/.test(last) ? '{"stance":"unite"}' : /Several independent assistants/.test(last) ? 'FINAL' : `answer from ${body.model}`;
      return new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }), { status: 200 });
    });
    saveAiSettings((s) => {
      s.active = 'custom';
      s.providers.custom = { id: 'custom', model: 'custom-q', baseUrl: 'http://localhost:9/v1' };
      s.providers.groq = { id: 'groq', model: 'groq-q', baseUrl: 'http://localhost:9/groq/v1' };
      s.ensemble = { mode: 'master', members: [{ provider: 'custom' }, { provider: 'groq', model: 'groq-other' }], master: 'groq', maxRounds: 2, showDeliberation: true, memberTimeoutMs: 5000 };
    });
    await setApiKey('groq', 'gsk_SECRET_TEST_KEY_123');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('resolves the plan: members with models, master, receiving services', () => {
    expect(ensemblePlan()).toEqual({ mode: 'master', members: [{ provider: 'custom', model: 'custom-q' }, { provider: 'groq', model: 'groq-other' }], master: { provider: 'groq', model: 'groq-other' }, maxRounds: 2, memberTimeoutMs: 5000 });
    expect(receivingProviders()).toEqual(['custom', 'groq']);
    saveAiSettings((s) => { s.ensemble.mode = 'single'; });
    expect(ensemblePlan()).toBeNull();
    expect(receivingProviders()).toEqual(['custom']);
    saveAiSettings((s) => { s.ensemble.mode = 'consensus'; s.ensemble.members = [{ provider: 'custom' }, { provider: 'removed' }]; });
    expect(ensemblePlan()).toBeNull(); // fewer than two usable members
  });

  it('a normal request uses the ensemble; usage adds up all calls', async () => {
    const before = aiSettings().usage.requests;
    const r = await chat({ messages: [{ role: 'user', content: 'Summarize' }] });
    expect(r.text).toBe('FINAL');
    expect(r.provider).toBe('groq');
    expect(urls.map((u) => u.model).sort()).toEqual(['custom-q', 'groq-other', 'groq-other']);
    expect(r.usage).toEqual({ in: 6, out: 9 });
    expect(aiSettings().usage.requests - before).toBe(3);
    expect(r.ensemble?.members.map((m) => m.text)).toEqual(['answer from custom-q', 'answer from groq-other']);
  });

  it('key tests and model lists bypass the ensemble', async () => {
    const r = await chat({ provider: 'custom', tier: 'fast', messages: [{ role: 'user', content: 'Reply with OK.' }] });
    expect(urls).toHaveLength(1);
    expect(r.ensemble).toBeUndefined();
    expect(r.text).toBe('answer from custom-q');
    const models = await listModels((await resolveProvider('groq'))!);
    expect(models).toEqual(['one', 'two']);
    expect(urls).toHaveLength(2);
    expect(urls[1].url).toBe('http://localhost:9/groq/v1/models');
  });

  it('settings (and their export) never contain keys', () => {
    const stored = localStorage.getItem('quillforge.ai.v1') || '';
    expect(stored).toContain('"ensemble"');
    expect(stored).not.toContain('SECRET_TEST_KEY');
    expect(JSON.stringify(aiSettings())).not.toContain('SECRET_TEST_KEY');
    expect(Object.keys(aiSettings().ensemble).sort()).toEqual(['master', 'maxRounds', 'memberTimeoutMs', 'members', 'mode', 'showDeliberation']);
  });
});
