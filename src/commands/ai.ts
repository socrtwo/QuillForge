/**
 * AI tab commands. Every feature in src/ai/features.ts becomes a registered command, so each
 * one can be put on the Quick Access Bar, a custom tab, or a keyboard shortcut, and recorded
 * in macros like any other command.
 */
import { def, type MenuEntry } from './registry';
import type { App } from '../app';
import { schema } from '../editor/schema';
import { FEATURES, BASE_SYSTEM, parseCommentJson, type AiFeature } from '../ai/features';
import { aiSettings, saveAiSettings, resolveProvider } from '../ai/store';
import { providerById } from '../ai/providers';
import { chat, AiError, type ChatMessage, type ContentPart } from '../ai/client';
import { selectionOrParagraph, documentText, textBefore, rangeText, cleanOutput, splitAlternatives, replaceRange, insertBelow, insertAtCursor, addComments, blocksFromText, dispatchAiEdit, diffText } from '../ai/apply';
import { openDialog, toast, promptDialog, confirmDialog } from '../ui/dialog';
import { selectedImage } from './picture';
import { docKey } from './file';
import { commentRanges } from './review';
import { kvGet, kvSet } from '../util/store';

const N = schema.nodes;

// ------------------------------------------------------------------------------------------
// Shared plumbing

async function ensureProvider(app: App, reason: string): Promise<boolean> {
  const s = aiSettings();
  if (!s.enabled) { toast('AI features are turned off (AI ▸ AI Settings).'); return false; }
  if (s.active && (await resolveProvider())) return true;
  const { openAiSetup } = await import('../ui/aiWizard');
  return openAiSetup(app, { reason });
}

const isCloud = () => { const p = providerById(aiSettings().active || ''); return !!p && p.kind !== 'local' && p.kind !== 'builtin'; };

/** First use of a cloud provider: say plainly where the text goes. */
async function privacyCheck(): Promise<boolean> {
  const s = aiSettings();
  const id = s.active!;
  if (!isCloud() || s.privacyAck.includes(id)) return true;
  const p = providerById(id)!;
  const ok = await confirmDialog('Sending Text to an AI Service',
    `AI commands send the text they need directly from this device to ${p.name}. QuillForge has no server and keeps no copy. ${p.name}'s terms and privacy policy apply${p.free === 'free' ? ', and free tiers may use what you send to improve their models' : ''}. Continue?`, 'Continue', 'Cancel');
  if (ok) saveAiSettings((x) => { x.privacyAck.push(id); });
  return ok;
}

async function confirmWholeDoc(app: App, words: number): Promise<boolean> {
  const s = aiSettings();
  if (!s.confirmDocument || !isCloud()) return true;
  const p = providerById(s.active!)!;
  return confirmDialog('Send the Whole Document?', `This sends the whole document (${words.toLocaleString()} words) to ${p.name}. Select a passage first to send only that.`, 'Send', 'Cancel');
}

async function storyNotes(app: App): Promise<string> {
  try { return ((await kvGet('ai:notes:' + docKey(app.tab))) as string) || ''; } catch { return ''; }
}

async function systemPrompt(app: App, f?: AiFeature): Promise<string> {
  const s = aiSettings();
  const parts = [BASE_SYSTEM];
  if (f?.system) parts.push(f.system);
  if (s.language && s.language !== 'auto') parts.push(`Write generated text in ${s.language} unless translating.`);
  const notes = await storyNotes(app);
  if (notes) parts.push(`Background notes from the author about this document (characters, setting, terminology, style). Respect them:\n${notes}`);
  return parts.join('\n\n');
}

function fail(e: unknown, app: App): void {
  if (e instanceof AiError && e.code === 'aborted') { toast('Stopped'); return; }
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof AiError && (e.code === 'auth' || e.code === 'no-provider')) {
    toast(msg, { action: 'Fix', onAction: () => app.exec('ai.providers'), ms: 8000 });
  } else toast(msg, { ms: 8000 });
  console.warn('AI:', e);
}

async function imageDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}

function commentThreads(app: App, atCursor: boolean): string {
  const s = app.settings;
  const ranges = commentRanges(app.state.doc);
  const ids = Object.keys(s.comments || {});
  let pick = ids.filter((id) => !s.comments[id].resolved);
  if (atCursor) {
    const pos = app.state.selection.from;
    const here = [...ranges.entries()].find(([, r]) => pos >= r.from && pos <= r.to);
    if (here) pick = [here[0]];
  }
  return pick.map((id) => {
    const c = s.comments[id];
    const r = ranges.get(id);
    return [`On “${(r?.text || '').slice(0, 120)}”:`, `${c.author}: ${c.text}`, ...(c.replies || []).map((x: any) => `${x.author}: ${x.text}`)].join('\n');
  }).join('\n\n');
}

// ------------------------------------------------------------------------------------------
// Feature runner

export async function runFeature(app: App, f: AiFeature, arg?: string): Promise<void> {
  if (!(await ensureProvider(app, `“${f.label.replace(/…$/, '')}” needs an AI provider. Choose one below; free options are at the top.`))) return;
  if (!(await privacyCheck())) return;
  const s = aiSettings();
  const st = app.state;

  // Option menus (tone, language…) when run without an argument (palette, QAT, shortcut).
  if (f.options && arg == null) {
    const r = await openDialog({ title: f.label, fields: [{ key: 'v', label: 'Choose', type: 'select', options: f.options.map((o) => ({ value: o.value, label: o.label })), value: f.options[0].value }] });
    if (!r) return;
    arg = r.v;
  }

  // Input
  let text = '';
  let range: { from: number; to: number } | undefined;
  let images: ContentPart[] = [];
  switch (f.input) {
    case 'selection': {
      if (st.selection.empty) { toast('Select some text first.'); return; }
      range = { from: st.selection.from, to: st.selection.to };
      text = rangeText(st.doc, range.from, range.to);
      break;
    }
    case 'selectionOrParagraph': {
      const r = selectionOrParagraph(app);
      if (!r || !r.text) { toast('Select some text or place the cursor in a paragraph.'); return; }
      range = { from: r.from, to: r.to };
      text = r.text;
      break;
    }
    case 'selectionOrDocument':
    case 'document': {
      if (f.input === 'selectionOrDocument' && !st.selection.empty) {
        range = { from: st.selection.from, to: st.selection.to };
        text = rangeText(st.doc, range.from, range.to);
      } else {
        const d = documentText(app, providerById(s.active!)?.kind === 'local' ? 6000 : 120000);
        if (!d.text) { toast('The document is empty.'); return; }
        if (!(await confirmWholeDoc(app, d.words))) return;
        text = d.text;
        if (d.truncated) toast('The document is long; the middle part was left out of the request.');
      }
      break;
    }
    case 'before': text = textBefore(app); if (!text) { toast('Write a few sentences first, then use Continue Writing.'); return; } break;
    case 'prompt': if (!st.selection.empty) text = rangeText(st.doc, st.selection.from, st.selection.to); break;
    case 'image': {
      const im = selectedImage(app);
      if (!im) { toast('Select a picture first.'); return; }
      const p = providerById(s.active!);
      if (p && !p.vision && p.kind !== 'openai') { toast(`${p.name} cannot read images here. Use a provider with vision models (OpenAI, Anthropic, Gemini, OpenRouter, xAI).`); return; }
      try { images = [{ type: 'image', dataUrl: await imageDataUrl(im.node.attrs.src) }]; } catch { toast('This picture could not be read.'); return; }
      break;
    }
    case 'comment': text = commentThreads(app, f.id === 'ai.draftReply'); if (!text) { toast('There are no open comments.'); return; } break;
    case 'none': break;
  }

  // Extra input
  let extra = '';
  if (f.ask) {
    const v = await promptDialog(f.ask.title, f.ask.label, '', f.ask.multiline ? ({ type: 'textarea', rows: 4, placeholder: f.ask.placeholder } as any) : ({ placeholder: f.ask.placeholder } as any));
    if (v == null || (!v.trim() && f.id !== 'ai.outline')) return;
    extra = v.trim();
    if (f.id === 'ai.outline' && !extra && !text) { toast('Enter a topic or select text to outline.'); return; }
  }
  if (f.id === 'ai.matchVoice') extra = s.voiceProfile || 'Plain, clear, and natural; keep the author\'s own phrasing where it works.';
  if (f.id === 'ai.styleGuide') extra = s.styleGuide;

  const n = f.alternatives ? Math.max(1, Math.min(5, s.alternatives)) : 1;
  const userText = f.prompt({ text, arg, extra, lang: s.language, n });
  const sys = await systemPrompt(app, f);
  const messages: ChatMessage[] = [{ role: 'system', content: sys }, { role: 'user', content: images.length ? [{ type: 'text', text: userText }, ...images] : userText }];
  const base = { messages, tier: f.tier, temperature: f.temperature, maxTokens: f.maxTokens };
  const { aiBusy, aiIdle, showAiPreview, paneResult, aiAuthor } = await import('../ui/aiPane');
  const author = aiAuthor();
  const track = s.trackAsRevisions;

  try {
    switch (f.output) {
      case 'preview': {
        const primary = f.input === 'prompt' || f.input === 'before' ? 'cursor' : f.id === 'ai.addDetail' ? 'insert' : 'replace';
        await showAiPreview(app, {
          title: f.label.replace(/…$/, '') + (arg ? `: ${arg}` : ''),
          original: range ? text : undefined,
          range: primary === 'replace' ? range : undefined,
          primary,
          markdown: f.markdown,
          generate: async (onToken, signal) => {
            const r = await chat({ ...base, signal, onToken: (_d, full) => onToken(f.alternatives ? full.split(/\n\s*-{3,}\s*\n/)[0] : full) });
            return f.alternatives ? splitAlternatives(r.text) : [r.text];
          },
          refine: async (current, instruction) => (await chat({ ...base, messages: [...messages, { role: 'assistant', content: current }, { role: 'user', content: `Revise that: ${instruction}. Return only the revised text.` }] })).text,
        });
        return;
      }
      case 'pane': {
        const out = paneResult(app, f.label.replace(/…$/, '') + (arg ? `: ${arg}` : ''), f.markdown);
        const ctl = aiBusy(`${f.label.replace(/…$/, '')}…`);
        try {
          const r = await chat({ ...base, signal: ctl.signal, onToken: (_d, full) => out.update(full) });
          out.done(cleanOutput(r.text, { keepMarkdown: true }));
        } finally { aiIdle(ctl); }
        return;
      }
      case 'insertBelow':
      case 'cursor':
      case 'newDoc':
      case 'comments': {
        const ctl = aiBusy(`${f.label.replace(/…$/, '')}…`);
        let r;
        try { r = await chat({ ...base, signal: ctl.signal }); } finally { aiIdle(ctl); }
        const result = cleanOutput(r.text, { keepMarkdown: !!f.markdown || f.output === 'comments' });
        if (!result) { toast('The AI returned nothing.'); return; }
        if (f.output === 'insertBelow') await insertBelow(app, result, { track, author, markdown: f.markdown, heading: f.id === 'ai.keyPoints' ? 'Key points' : undefined });
        else if (f.output === 'cursor') await insertAtCursor(app, result, { track, author, markdown: f.markdown });
        else if (f.output === 'newDoc') {
          const blocks = await blocksFromText(result, true);
          const title = `${f.label.replace(/…$/, '')}${arg ? ` (${arg})` : ''}`;
          const doc = schema.nodes.doc.createAndFill(null, blocks.length ? blocks : [schema.nodes.paragraph.create()])!;
          const tab = app.createTab(doc, { title, fileName: `${title}.docx`, format: 'docx', uri: null });
          tab.dirty = true;
          app.activate(tab);
        } else {
          const items = parseCommentJson(result);
          if (!items.length) { const p = paneResult(app, f.label, true); p.done(result); toast('The notes could not be matched to the text; they are shown in the AI pane.'); return; }
          const placed = addComments(app, items, author);
          toast(`${placed} comment${placed === 1 ? '' : 's'} added${placed < items.length ? ` (${items.length - placed} could not be matched to the text)` : ''}`);
          if (placed) app.ui.openPane('comments');
        }
        return;
      }
      case 'tracked': {
        await trackedEdit(app, f, base.messages[0].content as string, range);
        return;
      }
      case 'replace': {
        const ctl = aiBusy(`${f.label}…`);
        let r;
        try { r = await chat({ ...base, signal: ctl.signal }); } finally { aiIdle(ctl); }
        if (range) await replaceRange(app, range, cleanOutput(r.text, { keepMarkdown: f.markdown }), { track, author, markdown: f.markdown });
        return;
      }
    }
  } catch (e) {
    fail(e, app);
  }
}

/** Proofread/OCR fixes: per paragraph batches, applied as minimal tracked edits by "AI (model)". */
async function trackedEdit(app: App, f: AiFeature, system: string, range?: { from: number; to: number }): Promise<void> {
  const { aiBusy, aiIdle, aiAuthor } = await import('../ui/aiPane');
  const st = app.state;
  const from = range?.from ?? 0, to = range?.to ?? st.doc.content.size;
  const blocks: { pos: number; text: string }[] = [];
  st.doc.nodesBetween(from, to, (n, pos) => {
    if (n.isTextblock) { const t = n.textBetween(0, n.content.size, '', (x) => (x.type === N.hard_break ? ' ' : '')); if (t.trim()) blocks.push({ pos, text: t }); return false; }
    return true;
  });
  if (!blocks.length) { toast('Nothing to check.'); return; }
  const batches: { pos: number; text: string }[][] = [];
  let cur: { pos: number; text: string }[] = [], size = 0;
  for (const b of blocks) { if (size + b.text.length > 3500 && cur.length) { batches.push(cur); cur = []; size = 0; } cur.push(b); size += b.text.length; }
  if (cur.length) batches.push(cur);
  const ctl = aiBusy(`${f.label}… 0 of ${blocks.length} paragraphs`);
  const author = aiAuthor();
  let changed = 0, done = 0;
  try {
    for (const batch of batches) {
      if (ctl.signal.aborted) break;
      const joined = batch.map((b) => b.text).join('\n\n');
      const r = await chat({ messages: [{ role: 'system', content: system }, { role: 'user', content: f.prompt({ text: joined, lang: 'auto', n: 1 }) }], tier: f.tier, temperature: 0, signal: ctl.signal, maxTokens: Math.max(512, Math.ceil(joined.length / 2)) });
      let outs = cleanOutput(r.text).split(/\n\s*\n/);
      if (outs.length !== batch.length) {
        // Paragraph count changed: fall back to one request per paragraph for this batch.
        outs = [];
        for (const b of batch) {
          const one = await chat({ messages: [{ role: 'system', content: system }, { role: 'user', content: f.prompt({ text: b.text, lang: 'auto', n: 1 }) }], tier: f.tier, temperature: 0, signal: ctl.signal, maxTokens: Math.max(256, b.text.length) });
          outs.push(cleanOutput(one.text).replace(/\n+/g, ' '));
        }
      }
      // Apply from the last paragraph backward so earlier positions stay valid.
      for (let k = batch.length - 1; k >= 0; k--) {
        const b = batch[k];
        const fixed = outs[k]?.trim();
        if (!fixed || fixed === b.text.trim()) continue;
        const edits = diffText(b.text, fixed);
        if (!edits || !edits.length) continue;
        const node = app.state.doc.nodeAt(b.pos);
        if (!node || !node.isTextblock) continue;
        const ok = await replaceRange(app, { from: b.pos + 1, to: b.pos + 1 + node.content.size }, fixed, { track: true, author });
        if (ok) changed++;
      }
      done += batch.length;
      const label = document.querySelector('.qf-ai-busy span:nth-child(2)');
      if (label) label.textContent = `${f.label}… ${done} of ${blocks.length} paragraphs`;
    }
  } catch (e) {
    fail(e, app);
  } finally {
    aiIdle(ctl);
  }
  toast(changed ? `${changed} paragraph${changed === 1 ? '' : 's'} corrected as tracked changes. Review them with Review ▸ Next Change.` : 'No corrections were needed.', { ms: 7000 });
  if (changed) app.ui.openPane('revisions');
  void dispatchAiEdit;
}

// ------------------------------------------------------------------------------------------
// Registration

const featureCommands = FEATURES.filter((f) => f.id !== 'ai.storyNotes').map((f) => ({
  id: f.id, label: f.label, icon: f.icon, tab: 'AI', group: f.group, tip: f.tip, keys: f.keys, popular: f.popular, keywords: `ai ${f.keywords || ''}`,
  kind: (f.options ? 'menu' : 'button') as 'menu' | 'button',
  edits: ['preview', 'replace', 'tracked', 'insertBelow', 'cursor', 'comments'].includes(f.output),
  run: (app: App, arg?: any) => runFeature(app, f, typeof arg === 'string' ? arg : undefined),
  menu: f.options ? (): MenuEntry[] => f.options!.map((o) => ({ id: f.id, arg: o.value, label: o.label })) : undefined,
}));

def(featureCommands);

def([
  {
    id: 'ai.setup', label: 'Set Up AI…', icon: 'auto_awesome', tab: 'AI', group: 'Assistant', popular: true, noRecord: true,
    tip: 'Choose a free or paid AI: on-device, free cloud tiers, your own computer, or a paid key. Opens the right page in your browser and picks up the key.',
    keywords: 'api key openai anthropic gemini mistral groq openrouter ollama wizard',
    run: async (app) => { const { openAiSetup } = await import('../ui/aiWizard'); await openAiSetup(app); },
  },
  {
    id: 'ai.providers', label: 'Providers & Models…', icon: 'tune', tab: 'AI', group: 'Assistant', noRecord: true,
    tip: 'Switch AI provider, choose models, test or remove keys',
    run: async (app) => { const { openAiProviders } = await import('../ui/aiWizard'); await openAiProviders(app); },
  },
  {
    id: 'ai.chooseProvider', label: 'Active AI', icon: 'swap_horiz', tab: 'AI', group: 'Assistant', kind: 'menu', noRecord: true,
    tip: 'Switch between the AI providers you have set up',
    run: async (app, id?: string) => {
      if (!id) { const { openAiProviders } = await import('../ui/aiWizard'); await openAiProviders(app); return; }
      if (!aiSettings().providers[id]) return;
      saveAiSettings((s) => { s.active = id; });
      toast(`AI: ${providerById(id)?.name}`);
    },
    menu: () => {
      const s = aiSettings();
      const items: MenuEntry[] = Object.keys(s.providers).map((id) => ({ id: 'ai.chooseProvider', arg: id, label: `${providerById(id)?.name || id} · ${s.providers[id].model}`, checked: s.active === id }));
      return [...items, ...(items.length ? [{ separator: true }] : []), { id: 'ai.setup', label: 'Add a provider…' }];
    },
  },
  {
    id: 'ai.chat', label: 'AI Pane', icon: 'chat_bubble', tab: 'AI', group: 'Assistant', kind: 'toggle', popular: true, keys: ['Mod-Alt-a'], noRecord: true,
    tip: 'Chat with the AI about this document; results can be inserted with one tap',
    run: (app) => app.ui.togglePane('ai'),
    isActive: (app) => (app.ui as any).pane?.def?.id === 'ai',
  },
  { id: 'ai.stop', label: 'Stop AI', icon: 'stop_circle', tab: 'AI', group: 'Assistant', noRecord: true, tip: 'Stop the request in progress', run: async () => { const { stopAi } = await import('../ui/aiPane'); stopAi(); } },
  {
    id: 'ai.settings', label: 'AI Settings…', icon: 'settings_suggest', tab: 'AI', group: 'Assistant', noRecord: true,
    tip: 'Tracked AI edits, privacy prompts, voice profile, style guide, language, usage',
    run: async (app) => { const { openAiSettings } = await import('../ui/aiWizard'); await openAiSettings(app); },
  },
  {
    id: 'ai.privacy', label: 'AI & Privacy', icon: 'shield', tab: 'AI', group: 'Assistant', noRecord: true,
    tip: 'Where your text goes when you use AI',
    run: async () => {
      const s = aiSettings();
      const p = providerById(s.active || '');
      await openDialog({ title: 'AI & Privacy', ok: 'Close', cancel: false, fields: [{ key: 'i', type: 'info', html: [
        '<p><b>QuillForge has no server.</b> AI requests go directly from this device to the provider you choose, using your own key. Nothing is sent until you run an AI command.</p>',
        `<p><b>Active provider:</b> ${p ? p.name.replace(/</g, '&lt;') : 'none'}${p && (p.kind === 'local' || p.kind === 'builtin') ? ' — runs on this device; your text does not leave it.' : p ? ' — the selected text (or the document, after asking) is sent to this service; its terms apply.' : ''}</p>`,
        '<p><b>Keys</b> are stored on this device only: in the Android Keystore-encrypted store in the app, or in this browser\'s IndexedDB on the web. They are never placed in documents, drafts or exported settings.</p>',
        '<p><b>Free tiers</b> of some services may use prompts to improve their models. Use the on-device model for confidential text.</p>',
        '<p><b>AI can be wrong.</b> Turn on "Insert AI edits as tracked changes" in AI Settings to review every change it makes.</p>',
      ].join('') }] });
    },
  },
  {
    id: 'ai.storyNotes', label: 'Story Notes…', icon: 'sticky_note_2', tab: 'AI', group: 'Creative', noRecord: true,
    tip: 'Notes about characters, setting, terminology and style, sent with every AI request for this document',
    run: async (app) => {
      const cur = await storyNotes(app);
      const v = await promptDialog('Story Notes', 'Background the AI should respect in this document (characters and relationships, places, era, spelling of names, style rules).', cur, { type: 'textarea', rows: 10 } as any);
      if (v == null) return;
      await kvSet('ai:notes:' + docKey(app.tab), v);
      toast(v.trim() ? 'Story notes saved for this document' : 'Story notes cleared');
    },
  },
  {
    id: 'ai.prompts', label: 'Prompt Library…', icon: 'library_books', tab: 'AI', group: 'Assistant', noRecord: true,
    tip: 'Save your own AI instructions and run them from the AI tab, the Quick Access Bar or a shortcut',
    run: (app) => managePrompts(app),
  },
  {
    id: 'ai.runPrompt', label: 'My Prompts', icon: 'play_circle', tab: 'AI', group: 'Assistant', kind: 'menu',
    tip: 'Run one of your saved AI prompts',
    run: async (app, id?: string) => {
      const s = aiSettings();
      if (!s.prompts.length) { await managePrompts(app); return; }
      let p = s.prompts.find((x) => x.id === id);
      if (!p) {
        const r = await openDialog({ title: 'Run Prompt', fields: [{ key: 'p', label: 'Prompt', type: 'select', options: s.prompts.map((x) => ({ value: x.id, label: x.name })), value: s.prompts[0].id }] });
        if (!r) return;
        p = s.prompts.find((x) => x.id === r.p);
      }
      if (!p) return;
      const sp = p;
      const output = sp.output === 'replace' ? 'preview' : sp.output === 'insert' ? 'insertBelow' : sp.output === 'newdoc' ? 'newDoc' : sp.output === 'comment' ? 'comments' : 'pane';
      await runFeature(app, {
        id: 'ai.custom', label: sp.name, icon: 'play_circle', group: 'Assistant', tip: '', markdown: true,
        input: sp.input === 'selection' ? 'selectionOrParagraph' : sp.input === 'document' ? 'selectionOrDocument' : 'prompt',
        output: output as AiFeature['output'], tier: 'quality', temperature: 0.5,
        prompt: ({ text }) => `${sp.prompt}${sp.output === 'comment' ? '\nRespond with JSON only: an array of {"quote": "exact excerpt", "comment": "note"}.' : ''}${text ? `\n\nText:\n${text}` : ''}`,
      });
    },
    menu: () => {
      const s = aiSettings();
      return [...s.prompts.map((p) => ({ id: 'ai.runPrompt', arg: p.id, label: p.name })), ...(s.prompts.length ? [{ separator: true }] : []), { id: 'ai.prompts', label: 'Manage prompts…' }];
    },
  },
  {
    id: 'ai.generateImage', label: 'Generate Image…', icon: 'image', tab: 'AI', group: 'Media', edits: true,
    tip: 'Create a picture from a description (needs a provider with an image model, such as OpenAI)',
    run: (app) => generateImage(app),
  },
  {
    id: 'ai.reviewEdits', label: 'Review AI Edits', icon: 'manage_history', tab: 'AI', group: 'Review', noRecord: true,
    tip: 'Open the Revisions pane to accept or reject changes made by AI (tracked as "AI (model)")',
    run: (app) => { app.ui.openPane('revisions'); },
  },
  {
    id: 'ai.clearLocal', label: 'Delete Downloaded Models', icon: 'delete', tab: 'AI', group: 'Assistant', noRecord: true,
    tip: 'Free the storage used by the on-device model',
    run: async () => {
      const { clearLocalModels, localStorageEstimate } = await import('../ai/local');
      const before = await localStorageEstimate();
      if (!(await confirmDialog('Delete Downloaded Models', `Delete the on-device AI model files? ${before}`, 'Delete'))) return;
      const n = await clearLocalModels();
      toast(n ? 'Downloaded model files deleted' : 'No downloaded model files were found');
    },
  },
]);

async function managePrompts(app: App): Promise<void> {
  for (;;) {
    const s = aiSettings();
    const r = await openDialog({
      title: 'Prompt Library', wide: true,
      fields: [
        { key: 'id', label: 'Saved prompts', type: 'list', options: s.prompts.map((p) => ({ value: p.id, label: p.name })), value: s.prompts[0]?.id },
        { key: 'help', type: 'info', html: '<p class="qf-help">Saved prompts appear under AI ▸ My Prompts and can be added to the Quick Access Bar. The selected text (or document) is appended to the prompt.</p>' },
      ],
      ok: 'Close', cancel: false,
      buttons: [
        { label: 'New…', onClick: (_v, c) => c.close({ act: 'new' }) },
        { label: 'Edit…', onClick: (v, c) => c.close({ act: 'edit', id: v.id }) },
        { label: 'Delete', onClick: (v, c) => c.close({ act: 'delete', id: v.id }) },
      ],
    });
    if (!r || !r.act) return;
    if (r.act === 'delete' && r.id) { saveAiSettings((x) => { x.prompts = x.prompts.filter((p) => p.id !== r.id); }); continue; }
    const cur = r.act === 'edit' ? s.prompts.find((p) => p.id === r.id) : undefined;
    if (r.act === 'edit' && !cur) continue;
    const e = await openDialog({
      title: cur ? 'Edit Prompt' : 'New Prompt', wide: true, fields: [
        { key: 'name', label: 'Name', type: 'text', value: cur?.name || '' },
        { key: 'prompt', label: 'Instruction', type: 'textarea', rows: 5, value: cur?.prompt || '', placeholder: 'e.g. Rewrite as a formal genealogical abstract with dates in "1 Jan 1850" form' },
        { key: 'input', label: 'Works on', type: 'select', options: [{ value: 'selection', label: 'The selection (or paragraph)' }, { value: 'document', label: 'The selection, or the whole document' }, { value: 'none', label: 'Nothing (just the instruction)' }], value: cur?.input || 'selection', half: true },
        { key: 'output', label: 'Result', type: 'select', options: [{ value: 'replace', label: 'Preview, then replace' }, { value: 'insert', label: 'Insert below' }, { value: 'pane', label: 'Show in the AI pane' }, { value: 'comment', label: 'Comments' }, { value: 'newdoc', label: 'New document' }], value: cur?.output || 'replace', half: true },
      ],
      validate: (v) => (!String(v.name).trim() || !String(v.prompt).trim() ? 'Enter a name and an instruction.' : null),
    });
    if (!e) continue;
    saveAiSettings((x) => {
      const p = { id: cur?.id || `p${Date.now().toString(36)}`, name: String(e.name).trim(), prompt: String(e.prompt).trim(), input: e.input, output: e.output };
      x.prompts = cur ? x.prompts.map((q) => (q.id === cur.id ? p : q)) : [...x.prompts, p];
    });
  }
}

async function generateImage(app: App): Promise<void> {
  if (!(await ensureProvider(app, 'Generating images needs an AI provider with an image model.'))) return;
  const rp = await resolveProvider();
  if (!rp) return;
  if (!rp.def.images) { toast(`${rp.def.name} has no image model set up in QuillForge. OpenAI (gpt-image-1) is supported; add it in AI ▸ Set Up AI.`, { ms: 8000 }); return; }
  if (!(await privacyCheck())) return;
  const prompt = await promptDialog('Generate Image', 'Describe the picture', '', { type: 'textarea', rows: 3 } as any);
  if (!prompt?.trim()) return;
  const { aiBusy, aiIdle } = await import('../ui/aiPane');
  const ctl = aiBusy('Generating image…');
  try {
    const res = await fetch(`${rp.baseUrl}/images/generations`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rp.key}` },
      body: JSON.stringify({ model: rp.def.images, prompt: prompt.trim(), size: '1024x1024', n: 1 }),
    });
    const text = await res.text();
    if (!res.ok) throw new AiError(`${rp.def.name} image error ${res.status}: ${text.slice(0, 300)}`);
    const j = JSON.parse(text);
    const b64 = j.data?.[0]?.b64_json;
    const url = b64 ? `data:image/png;base64,${b64}` : j.data?.[0]?.url;
    if (!url) throw new AiError('No image was returned.');
    const src = url.startsWith('data:') ? url : await imageDataUrl(url);
    const node = N.image.create({ src, alt: prompt.trim().slice(0, 200), width: 400 });
    app.tab.view.dispatch(app.state.tr.replaceSelectionWith(node).scrollIntoView());
  } catch (e) {
    fail(e, app);
  } finally {
    aiIdle(ctl);
  }
}
