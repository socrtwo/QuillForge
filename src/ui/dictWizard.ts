/**
 * Spelling Dictionaries wizard: find, download, use and remove free Hunspell dictionaries for any
 * language (see proof/dictionaries.ts for sources and verification).
 */
import { h, clear } from './dom';
import { openDialog, toast, confirmDialog } from './dialog';
import type { App } from '../app';
import { schema } from '../editor/schema';
import { CATALOG, installedDictionaries, installDictionary, removeDictionary, isHeavy, dictionaryFor, type DictInfo } from '../proof/dictionaries';
import { unloadDictionary } from '../proof/proofing';

const mb = (d: DictInfo) => ((d.aff.size + d.dic.size) / 1e6).toFixed(1) + ' MB';

/** Languages the user probably wants: the device's, and those used in the open document. */
function suggested(app: App): DictInfo[] {
  const tags = new Set<string>();
  for (const t of navigator.languages || [navigator.language]) if (t) tags.add(t);
  if (app.settings.language) tags.add(app.settings.language);
  app.state.doc.descendants((n) => { for (const m of n.marks) if (m.type === schema.marks.lang && m.attrs.lang) tags.add(m.attrs.lang); return true; });
  const all = new Set(CATALOG.map((d) => d.id));
  const ids = new Set<string>();
  for (const t of tags) { const id = dictionaryFor(t, all); if (id) ids.add(id); }
  return CATALOG.filter((d) => ids.has(d.id));
}

export async function openDictionaryWizard(app: App): Promise<void> {
  let installed = await installedDictionaries();
  const root = h('div', { class: 'qf-dict-wizard' });
  const search = h('input', { type: 'search', class: 'qf-input', placeholder: 'Search 90+ languages (name or code)…', 'aria-label': 'Search languages' }) as HTMLInputElement;
  const list = h('div', { class: 'qf-dict-list', role: 'list' });
  const busy = new Map<string, AbortController>();

  const useButtons = (d: DictInfo) => h('span', { class: 'qf-dict-use' },
    h('button', { class: 'qf-btn', onclick: () => { app.updateSettings((s) => { s.language = d.tag; }); app.proofer.schedule(app.tab, 0); toast(`Document language: ${d.name}`); } }, 'Use for this document'),
    h('button', {
      class: 'qf-btn', onclick: () => {
        const { from, to, empty } = app.state.selection;
        if (empty) { toast('Select the text in this language first.'); return; }
        app.view.dispatch(app.state.tr.addMark(from, to, schema.marks.lang.create({ lang: d.tag })));
        app.proofer.schedule(app.tab, 0);
        toast(`Marked the selection as ${d.name}`);
      },
    }, 'Mark selection'));

  const row = (d: DictInfo) => {
    const status = d.bundled ? 'Built in' : installed.has(d.id) ? 'Installed' : '';
    const info = h('div', { class: 'qf-dict-info' },
      h('div', { class: 'qf-dict-name' }, d.name, d.native ? h('span', { class: 'qf-dict-native' }, ` · ${d.native}`) : null, h('code', null, ` ${d.tag}`)),
      h('div', { class: 'qf-help' }, `${mb(d)} · ${d.license} · version ${d.version}`, isHeavy(d) ? h('span', { class: 'qf-warn-inline' }, ` · large: about ${d.memoryMB || '?'} MB of memory, ${Math.ceil((d.loadSec || 1) * 3)} s to start on a phone`) : null));
    const actions = h('div', { class: 'qf-dict-actions' });
    const progress = h('progress', { max: 1, value: 0, hidden: true }) as HTMLProgressElement;
    if (d.bundled) actions.append(h('span', { class: 'qf-badge' }, status));
    else if (installed.has(d.id)) {
      actions.append(h('span', { class: 'qf-badge' }, status), useButtons(d), h('button', {
        class: 'qf-btn', onclick: async () => {
          if (!(await confirmDialog('Remove dictionary', `Remove the ${d.name} dictionary from this device? You can download it again later.`, 'Remove'))) return;
          await removeDictionary(d.id);
          await unloadDictionary(d.id);
          installed = await installedDictionaries();
          app.proofer.schedule(app.tab, 0);
          draw();
        },
      }, 'Remove'));
    } else {
      actions.append(progress, h('button', {
        class: 'qf-btn qf-primary', onclick: async (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          if (busy.has(d.id)) { busy.get(d.id)!.abort(); return; }
          if (isHeavy(d) && !(await confirmDialog('Large dictionary', `${d.name} is a large dictionary (${mb(d)}, about ${d.memoryMB || '?'} MB of memory when loaded). Checking may start slowly, and older phones may not have enough memory. Download it anyway?`, 'Download'))) return;
          const ctl = new AbortController();
          busy.set(d.id, ctl);
          btn.textContent = 'Cancel';
          progress.hidden = false;
          try {
            await installDictionary(d.id, (p) => { progress.max = p.total || 1; progress.value = p.loaded; btn.title = p.phase; }, ctl.signal);
            installed = await installedDictionaries();
            app.proofer.schedule(app.tab, 0);
            toast(`${d.name} dictionary installed`);
          } catch (err) {
            if ((err as Error)?.name !== 'AbortError') toast(`Could not install ${d.name}: ${(err as Error)?.message || err}`, { ms: 8000 });
          } finally {
            busy.delete(d.id);
            draw();
          }
        },
      }, 'Download'));
    }
    return h('div', { class: 'qf-dict-row', role: 'listitem' }, info, actions);
  };

  const draw = () => {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const match = (d: DictInfo) => !q || d.name.toLowerCase().includes(q) || (d.native || '').toLowerCase().includes(q) || d.tag.toLowerCase().startsWith(q) || d.id.startsWith(q);
    const sug = q ? [] : suggested(app);
    const mine = CATALOG.filter((d) => installed.has(d.id) && !sug.includes(d));
    const sections: [string, DictInfo[]][] = q
      ? [['Results', CATALOG.filter(match)]]
      : [['Suggested for you', sug], ['Installed', mine], ['All languages', CATALOG.filter((d) => !sug.includes(d) && !installed.has(d.id))]];
    for (const [title, items] of sections) {
      if (!items.length) continue;
      list.append(h('h3', { class: 'qf-dict-head' }, title), ...items.map(row));
    }
    if (!list.childElementCount) list.append(h('p', { class: 'qf-help' }, 'No dictionary matches. Try the English name of the language or its code (for example "de" or "pt-PT").'));
  };
  search.addEventListener('input', draw);

  root.append(
    h('p', { class: 'qf-help' }, 'Download free spelling dictionaries for the languages you write in. Text marked with a language (Review ▸ Set Proofing Language), or a document whose language is set, is then checked with that dictionary. Dictionaries are stored on this device and work offline.'),
    search, list,
    h('p', { class: 'qf-help qf-small' }, 'Source: the wooorm/dictionaries project (Hunspell dictionaries from LibreOffice, Mozilla and the language communities), downloaded from cdn.jsdelivr.net or the npm registry. Every file is checked against a published checksum before it is used. Each dictionary keeps its own license, shown in the list.'),
  );
  draw();
  await openDialog({ title: 'Spelling Dictionaries', content: root, wide: true, ok: 'Done', cancel: false });
  for (const c of busy.values()) c.abort();
}
