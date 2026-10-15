/** QuillForge entry point. */
import 'material-symbols/outlined.css';
import 'katex/dist/katex.min.css';
import './styles/app.css';
import { DOMSerializer } from 'prosemirror-model';
import { installFonts } from './fonts';
import './commands';
import { App } from './app';
import { Shell } from './ui/shell';
import { schema } from './editor/schema';
import { wordAt } from './editor/ops';
import { launchFile, onFileOpened, onBackButton, isNative } from './platform/native';
import { closeMenus, inDialog, toast } from './ui/dialog';
import { kvKeys } from './util/store';

installFonts();
(window as any).__qfSerializer = DOMSerializer.fromSchema(schema);
(window as any).__qfWordAt = wordAt;

const host = document.getElementById('app')!;
const app = new App(host);
app.ui = new Shell(app);
app.rebuildKeyIndex();
app.createTab();
(window as any).qf = app;

async function start() {
  const { openBuffer } = await import('./commands/file');
  const lf = await launchFile();
  if (lf) await openBuffer(app, lf.data, lf.name, lf.uri);
  onFileOpened((f) => openBuffer(app, f.data, f.name, f.uri));
  const drafts = await kvKeys('draft:');
  if (drafts.length) toast(`${drafts.length} unsaved document(s) can be recovered.`, { action: 'Recover', onAction: () => app.exec('file.recover'), ms: 8000 });
  if (app.prefs.firstRun && !lf) setTimeout(() => app.ui.tour(), 600);
}
start();

onBackButton(() => {
  if (document.querySelector('.qf-menu')) { closeMenus(); return true; }
  if (inDialog()) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true; }
  if (host.classList.contains('qf-backstage-open')) { app.ui.hideBackstage(); return true; }
  if (app.ui.pane) { app.ui.closePane(); return true; }
  if (document.body.classList.contains('qf-zen')) { document.body.classList.remove('qf-zen'); return true; }
  if (app.tab.viewMode === 'read') { app.setViewMode('print'); return true; }
  app.saveDrafts();
  return false;
});

window.addEventListener('beforeunload', (e) => {
  app.saveDrafts();
  if (!isNative() && app.docs.some((d) => d.dirty)) { e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') app.saveDrafts(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => app.ui.applyPrefs());
