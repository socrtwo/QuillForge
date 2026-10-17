/** Wires the embedded-editor protocol (embed.ts) to the running application. See docs/EMBED.md. */
import type { App } from '../app';
import { schema } from '../editor/schema';
import { importHtml } from '../io/html';
import { normalizeSettings } from '../editor/settings';
import { confirmDialog, toast } from '../ui/dialog';
import { EmbedSession, type LoadRequest } from './embed';
import { emailContent } from './emailHtml';

declare const __APP_VERSION__: string;

export function startEmbed(app: App): EmbedSession {
  // The message is the first document; anything a command opens later is a scratch document.
  const tab = app.docs[0];
  tab.title = 'Message';
  const inFrame = window.parent !== window;
  let ancestor: string | undefined;
  try { ancestor = (location as any).ancestorOrigins?.[0] || undefined; } catch { /* not reported */ }
  if (ancestor === 'null') ancestor = undefined;

  const editor = {
    async load(req: LoadRequest) {
      let doc = await importHtml(new TextEncoder().encode(req.html).buffer as ArrayBuffer, 'message.html', { keepCidImages: true });
      const settings = normalizeSettings(doc.attrs.settings);
      if (req.lang) settings.language = req.lang;
      if (req.subject) settings.properties.title = req.subject;
      doc = schema.node('doc', { settings }, doc.content);
      app.replaceDoc(tab, doc);
      tab.dirty = false;
      tab.title = req.subject?.trim() || 'Message';
      if (req.theme) { app.embedTheme = req.theme; app.ui.applyPrefs(); }
      const title = document.querySelector('.qf-embed-title');
      if (title) title.textContent = req.subject?.trim() ? `Editing: ${req.subject.trim()}` : 'Editing message';
      app.activate(tab);
      app.focus();
    },
    content: () => emailContent(tab.view.state.doc),
  };
  const session = new EmbedSession(editor, {
    parent: window.parent,
    initialOrigin: ancestor,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0',
  });
  window.addEventListener('message', (e) => {
    session.handle(e).catch((err) => toast(`Could not open the message: ${err?.message || err}`));
  });
  app.onDocChange((t) => { if (t === tab) session.changed(); });
  app.embedControls = {
    done: () => {
      session.done();
      tab.dirty = false;
      if (!inFrame) toast('Done: the message was handed back (quill-embed:done).');
    },
    cancel: async () => {
      if (tab.dirty && !(await confirmDialog('Discard changes', 'Close the editor without your changes to this message?', 'Discard', 'Keep editing'))) return;
      session.cancel();
      if (!inFrame) toast('Cancelled (quill-embed:cancel).');
    },
  };
  session.ready();
  return session;
}
