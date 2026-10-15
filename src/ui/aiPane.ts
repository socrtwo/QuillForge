/** AI pane (chat and results) and the preview dialog used by rewrite-type commands. */
import { h, icon, clear } from './dom';
import { openDialog, toast } from './dialog';
import type { App } from '../app';
import type { PaneDef } from './panes';
import { chat, AiError, type ChatMessage } from '../ai/client';
import { aiSettings } from '../ai/store';
import { providerById } from '../ai/providers';
import { cleanOutput, insertAtCursor, insertBelow, replaceRange, documentText, rangeText, blocksFromText } from '../ai/apply';
import { BASE_SYSTEM } from '../ai/features';

// ------------------------------------------------------------------------------------------
// Busy indicator with Stop

let busyEl: HTMLElement | null = null;
let current: AbortController | null = null;

export function aiBusy(label: string): AbortController {
  current?.abort();
  const ctl = new AbortController();
  current = ctl;
  busyEl?.remove();
  busyEl = h('div', { class: 'qf-ai-busy', role: 'status' }, h('span', { class: 'qf-spin' }), h('span', null, label), h('button', { class: 'qf-link', onclick: () => ctl.abort() }, 'Stop'));
  document.body.appendChild(busyEl);
  ctl.signal.addEventListener('abort', () => aiIdle(ctl));
  return ctl;
}

export function aiIdle(ctl?: AbortController): void {
  if (ctl && ctl !== current) return;
  busyEl?.remove();
  busyEl = null;
  current = null;
}

export function stopAi(): void { current?.abort(); }

export function aiAuthor(): string {
  const s = aiSettings();
  const id = s.active || '';
  const cfg = s.providers[id];
  return `AI (${cfg?.model || providerById(id)?.name || 'assistant'})`;
}

// ------------------------------------------------------------------------------------------
// Preview dialog

export interface PreviewOptions {
  title: string;
  original?: string;
  /** Streams the first version; resolves with all versions. */
  generate: (onToken: (full: string) => void, signal: AbortSignal) => Promise<string[]>;
  /** Range to replace (rewrite-type features). */
  range?: { from: number; to: number };
  /** Default action when the range is a draft position. */
  primary: 'replace' | 'insert' | 'cursor';
  markdown?: boolean;
  /** Ask again with a follow-up instruction. */
  refine?: (current: string, instruction: string) => Promise<string>;
}

export async function showAiPreview(app: App, o: PreviewOptions): Promise<void> {
  const ctl = new AbortController();
  let versions: string[] = [''];
  let idx = 0;
  let done = false;
  const out = h('div', { class: 'qf-ai-out', contenteditable: 'false' });
  const counter = h('span', { class: 'qf-help' });
  const track = h('input', { type: 'checkbox', checked: aiSettings().trackAsRevisions }) as HTMLInputElement;
  const nav = h('div', { class: 'qf-row qf-ai-nav' },
    h('button', { class: 'qf-iconbtn', title: 'Previous version', onclick: () => { if (idx > 0) { idx--; render(); } } }, icon('chevron_left')), counter,
    h('button', { class: 'qf-iconbtn', title: 'Next version', onclick: () => { if (idx < versions.length - 1) { idx++; render(); } } }, icon('chevron_right')));
  const refineIn = h('input', { type: 'text', class: 'qf-input', placeholder: 'Refine: e.g. shorter, more formal, mention the date…' }) as HTMLInputElement;
  const render = () => {
    out.textContent = versions[idx] || (done ? '(empty response)' : '…');
    counter.textContent = versions.length > 1 ? `Version ${idx + 1} of ${versions.length}` : '';
    nav.style.display = versions.length > 1 ? '' : 'none';
  };
  const body = h('div', { class: 'qf-ai-preview' },
    o.original ? h('details', null, h('summary', null, 'Original'), h('div', { class: 'qf-ai-orig' }, o.original)) : null,
    out, nav,
    o.refine ? h('div', { class: 'qf-row' }, refineIn, h('button', { class: 'qf-btn', onclick: async () => {
      if (!refineIn.value.trim() || !done) return;
      done = false; const base = versions[idx]; versions = ['']; idx = 0; render();
      try { versions = [cleanOutput(await o.refine!(base, refineIn.value.trim()), { keepMarkdown: o.markdown })]; } catch (e: any) { versions = [base]; toast(String(e?.message || e)); }
      done = true; refineIn.value = ''; render();
    } }, 'Refine')) : null,
    h('label', { class: 'qf-check' }, track, ' Insert as tracked change'),
    h('p', { class: 'qf-help qf-ai-disclaimer' }, 'AI can be wrong. Check facts, names and dates before you keep this.'));
  render();

  const author = aiAuthor();
  const apply = async (mode: 'replace' | 'insert' | 'cursor') => {
    const text = versions[idx];
    if (!text) return;
    const opts = { track: track.checked, author, markdown: o.markdown };
    if (mode === 'replace' && o.range) await replaceRange(app, o.range, text, opts);
    else if (mode === 'insert') await insertBelow(app, text, opts);
    else await insertAtCursor(app, text, opts);
  };

  const buttons: { label: string; primary?: boolean; onClick: (v: any, c: any) => void }[] = [];
  if (o.range && o.primary === 'replace') buttons.push({ label: 'Replace', primary: true, onClick: async (_v, c) => { if (!done) return; c.close(null); await apply('replace'); } });
  buttons.push({ label: o.primary === 'cursor' ? 'Insert' : 'Insert below', primary: o.primary !== 'replace', onClick: async (_v, c) => { if (!done) return; c.close(null); await apply(o.primary === 'cursor' ? 'cursor' : 'insert'); } });
  buttons.push({ label: 'Copy', onClick: async () => { try { await navigator.clipboard.writeText(versions[idx]); toast('Copied'); } catch { toast('Clipboard is not available'); } } });
  buttons.push({ label: 'Retry', onClick: () => { if (done) void run(); } });

  const run = async () => {
    done = false; versions = ['']; idx = 0; render();
    try {
      const all = await o.generate((full) => { versions[0] = cleanOutput(full, { keepMarkdown: o.markdown }); render(); }, ctl.signal);
      versions = all.map((v) => cleanOutput(v, { keepMarkdown: o.markdown })).filter(Boolean);
      if (!versions.length) versions = [''];
    } catch (e: any) {
      if (!(e instanceof AiError && e.code === 'aborted')) out.textContent = String(e?.message || e);
      versions = [''];
    }
    done = true;
    render();
  };
  void run();
  await openDialog({ title: o.title, content: body, wide: true, ok: false, cancel: 'Discard', buttons });
  ctl.abort();
}

// ------------------------------------------------------------------------------------------
// AI pane

interface Turn { role: 'user' | 'assistant'; text: string; title?: string; markdown?: boolean }
const history: Turn[] = [];
let paneEl: HTMLElement | null = null;
let paneApp: App | null = null;

/** Show a result (or a streaming result) in the AI pane. Returns an updater. */
export function paneResult(app: App, title: string, markdown = true): { update: (t: string) => void; done: (t: string) => void } {
  app.ui.openPane('ai');
  const turn: Turn = { role: 'assistant', text: '', title, markdown };
  history.push(turn);
  drawPane();
  return {
    update: (t) => { turn.text = t; drawTurnText(turn); },
    done: (t) => { turn.text = t; drawPane(); },
  };
}

function drawTurnText(turn: Turn) {
  const el = paneEl?.querySelector(`[data-turn="${history.indexOf(turn)}"] .qf-ai-msg-text`);
  if (el) el.textContent = turn.text || '…';
}

function drawPane() {
  if (!paneEl || !paneApp) return;
  const app = paneApp;
  const log = paneEl.querySelector('.qf-ai-log') as HTMLElement;
  if (!log) return;
  clear(log);
  if (!history.length) {
    log.append(h('p', { class: 'qf-help' }, aiSettings().active ? 'Ask anything about this document, or use the commands on the AI tab. Results appear here with buttons to insert them.' : 'AI is not set up yet.'));
    if (!aiSettings().active) log.append(h('button', { class: 'qf-btn qf-primary', onclick: () => app.exec('ai.setup') }, 'Set Up AI…'));
  }
  history.forEach((t, i) => {
    log.append(h('div', { class: `qf-ai-msg qf-ai-${t.role}`, 'data-turn': String(i) },
      t.title ? h('div', { class: 'qf-ai-msg-title' }, t.title) : null,
      h('div', { class: 'qf-ai-msg-text' }, t.text || '…'),
      t.role === 'assistant' && t.text ? h('div', { class: 'qf-row qf-ai-msg-actions' },
        h('button', { class: 'qf-btn qf-sm', title: 'Insert at the cursor', onclick: () => void insertAtCursor(app, t.text, { track: aiSettings().trackAsRevisions, author: aiAuthor(), markdown: t.markdown }) }, icon('input'), ' Insert'),
        h('button', { class: 'qf-btn qf-sm', title: 'Replace the selection', onclick: () => { const sel = app.state.selection; if (sel.empty) { toast('Select the text to replace first.'); return; } void replaceRange(app, { from: sel.from, to: sel.to }, t.text, { track: aiSettings().trackAsRevisions, author: aiAuthor(), markdown: t.markdown }); } }, icon('find_replace'), ' Replace'),
        h('button', { class: 'qf-btn qf-sm', title: 'Insert at the top of the document', onclick: () => void insertTop(app, t.text, t.markdown) }, icon('vertical_align_top'), ' Top'),
        h('button', { class: 'qf-btn qf-sm', onclick: async () => { try { await navigator.clipboard.writeText(t.text); toast('Copied'); } catch { toast('Clipboard is not available'); } } }, icon('content_copy'))) : null));
  });
  log.scrollTop = log.scrollHeight;
}

async function insertTop(app: App, text: string, markdown?: boolean) {
  const blocks = await blocksFromText(text, markdown !== false);
  app.tab.view.dispatch(app.state.tr.insert(0, blocks).scrollIntoView());
}

async function ask(app: App, question: string, include: 'none' | 'selection' | 'document') {
  history.push({ role: 'user', text: question });
  const turn: Turn = { role: 'assistant', text: '', markdown: true };
  history.push(turn);
  drawPane();
  const msgs: ChatMessage[] = [{ role: 'system', content: `${BASE_SYSTEM} You are chatting with the author in a side panel; Markdown is fine here.` }];
  if (include !== 'none') {
    const st = app.state;
    const ctx = include === 'selection' && !st.selection.empty ? rangeText(st.doc, st.selection.from, st.selection.to) : documentText(app, 60000).text;
    msgs.push({ role: 'user', content: `${include === 'selection' ? 'Selected text' : 'The document'}:\n${ctx}` }, { role: 'assistant', content: 'Understood.' });
  }
  for (const t of history.slice(0, -2).slice(-10)) msgs.push({ role: t.role, content: t.text });
  msgs.push({ role: 'user', content: question });
  const ctl = aiBusy('AI is answering…');
  try {
    const r = await chat({ messages: msgs, signal: ctl.signal, onToken: (_d, full) => { turn.text = full; drawTurnText(turn); } });
    turn.text = cleanOutput(r.text, { keepMarkdown: true });
  } catch (e: any) {
    turn.text = e instanceof AiError && e.code === 'aborted' ? turn.text || '(stopped)' : `⚠ ${e?.message || e}`;
  } finally { aiIdle(ctl); }
  drawPane();
}

export const aiPaneDef: PaneDef = {
  id: 'ai',
  title: 'AI',
  render(app, el) {
    paneEl = el;
    paneApp = app;
    el.classList.add('qf-ai-pane');
    const input = h('textarea', { class: 'qf-input', rows: 3, placeholder: 'Ask about this document, or ask for anything…' }) as HTMLTextAreaElement;
    const include = h('select', { class: 'qf-input qf-sm' },
      h('option', { value: 'document' }, 'Use the document'), h('option', { value: 'selection' }, 'Use the selection'), h('option', { value: 'none' }, 'No document context')) as HTMLSelectElement;
    const send = () => { const q = input.value.trim(); if (!q) return; input.value = ''; void ask(app, q, include.value as any); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const s = aiSettings();
    const prov = s.active ? providerById(s.active) : null;
    el.append(
      h('div', { class: 'qf-ai-head qf-help' }, prov ? `${prov.name} · ${s.providers[s.active!]?.model || ''}` : 'No AI provider', ' ', h('button', { class: 'qf-link', onclick: () => app.exec('ai.providers') }, 'Change')),
      h('div', { class: 'qf-ai-log' }),
      h('div', { class: 'qf-ai-compose' }, input, h('div', { class: 'qf-row' }, include, h('span', { class: 'qf-spacer' }),
        h('button', { class: 'qf-iconbtn', title: 'Clear conversation', onclick: () => { history.length = 0; drawPane(); } }, icon('delete_sweep')),
        h('button', { class: 'qf-btn qf-primary', onclick: send }, icon('send'), ' Send'))));
    drawPane();
  },
  onClose() { paneEl = null; },
};

/** Show a long result in a read-only dialog (used when the pane is too small, e.g. phones). */
export async function showAiText(title: string, text: string): Promise<void> {
  await openDialog({ title, content: h('div', { class: 'qf-ai-out' }, text), wide: true, ok: 'Close', cancel: false });
}
