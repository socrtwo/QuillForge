import { describe, it, expect, vi } from 'vitest';

describe('carry-over from the former name', () => {
  it('copies quillforge.* settings to quillpen.* once, without overwriting', async () => {
    localStorage.clear();
    localStorage.setItem('quillforge.prefs.v1', '{"firstRun":false}'); // rename:keep
    localStorage.setItem('quillforge.ai.v1', '{"active":"device"}'); // rename:keep
    localStorage.setItem('quillpen.ai.v1', '{"active":"groq"}');
    vi.resetModules();
    await import('../../src/util/legacy');
    expect(localStorage.getItem('quillpen.prefs.v1')).toBe('{"firstRun":false}');
    expect(localStorage.getItem('quillpen.ai.v1')).toBe('{"active":"groq"}');
    expect(localStorage.getItem('quillforge.prefs.v1')).toBe('{"firstRun":false}'); // rename:keep — old entries are kept
    // Runs once: a later old-name value is not copied again.
    localStorage.setItem('quillforge.ink', 'x'); // rename:keep
    vi.resetModules();
    await import('../../src/util/legacy');
    expect(localStorage.getItem('quillpen.ink')).toBeNull();
  });
});
