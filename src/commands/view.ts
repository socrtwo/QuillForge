/** View tab: document views, show/hide, zoom, window, focus and reading tools. */
import { def } from './registry';
import type { App, ViewMode } from '../app';
import { schema, styleLevel } from '../editor/schema';
import { focusKey, foldKey, allHeadingKeys } from '../editor/plugins/decorations';
import { currentParagraph, setParaAttrs, moveBlocks } from '../editor/ops';
import { openDialog, toast } from '../ui/dialog';
import { keepAwake } from '../platform/native';

const N = schema.nodes;
const v = (app: App) => app.view;

const VIEWS: [ViewMode, string, string, string][] = [
  ['print', 'Print Layout', 'description', 'Pages exactly as they will print'],
  ['mobile', 'Mobile View', 'smartphone', 'Text reflows to fit the screen; real font sizes'],
  ['web', 'Web Layout', 'public', 'Pageless, full width'],
  ['read', 'Read Mode', 'chrome_reader_mode', 'Distraction-free reading (read-only)'],
  ['outline', 'Outline', 'format_list_bulleted', 'Work with the heading structure'],
  ['draft', 'Draft', 'article', 'Fast editing without page layout'],
  ['focus', 'Focus', 'center_focus_strong', 'Dims everything but your current paragraph'],
];
for (const [mode, label, icon, tip] of VIEWS) {
  def({ id: `view.${mode}`, label, icon, tab: 'View', group: 'Views', kind: 'toggle', tip, popular: mode === 'print' || mode === 'read', noRecord: true, run: (app) => app.setViewMode(app.tab.viewMode === mode && mode !== 'print' ? 'print' : mode), isActive: (app) => app.tab.viewMode === mode });
}

def([
  { id: 'view.ruler', label: 'Ruler', icon: 'straighten', tab: 'View', group: 'Show', kind: 'toggle', noRecord: true, run: (app) => { app.prefs.showRuler = !app.prefs.showRuler; app.savePrefs(); app.ui.applyPrefs(); }, isActive: (app) => app.prefs.showRuler },
  { id: 'view.gridlines', label: 'Gridlines', icon: 'grid_on', tab: 'View', group: 'Show', kind: 'toggle', noRecord: true, run: (app) => { app.tab.page.classList.toggle('qf-page-grid'); app.refresh(); }, isActive: (app) => app.tab.page.classList.contains('qf-page-grid') },
  { id: 'view.navPane', label: 'Navigation Pane', icon: 'list_alt', tab: 'View', group: 'Show', kind: 'toggle', keys: ['Mod-Alt-n'], popular: true, noRecord: true, run: (app) => app.ui.togglePane('navigation'), isActive: (app) => app.ui.paneOpen('navigation') },
  { id: 'view.formattingMarks', label: 'Show/Hide ¶', icon: 'format_paragraph', tab: 'View', group: 'Show', kind: 'toggle', keys: ['Mod-Shift-8'], popular: true, noRecord: true, run: (app) => { app.prefs.showMarks = !app.prefs.showMarks; app.savePrefs(); app.ui.applyPrefs(); }, isActive: (app) => app.prefs.showMarks },
  { id: 'view.hiddenText', label: 'Show Hidden Text', icon: 'visibility', tab: 'View', group: 'Show', kind: 'toggle', noRecord: true, run: (app) => { app.prefs.showHiddenText = !app.prefs.showHiddenText; app.savePrefs(); app.ui.applyPrefs(); }, isActive: (app) => app.prefs.showHiddenText },
  {
    id: 'view.fieldShading', label: 'Field Shading', icon: 'data_object', tab: 'View', group: 'Show', kind: 'menu', noRecord: true,
    run: (app, arg) => { app.prefs.fieldShading = arg || 'always'; app.savePrefs(); app.ui.applyPrefs(); },
    menu: (app) => (['always', 'selected', 'never'] as const).map((k) => ({ id: 'view.fieldShading', arg: k, label: k === 'always' ? 'Always' : k === 'selected' ? 'When Selected' : 'Never', checked: app.prefs.fieldShading === k })),
  },
  { id: 'view.textBoundaries', label: 'Text Boundaries', icon: 'crop_free', tab: 'View', group: 'Show', kind: 'toggle', noRecord: true, run: (app) => { app.tab.page.classList.toggle('qf-boundaries'); app.refresh(); }, isActive: (app) => app.tab.page.classList.contains('qf-boundaries') },
  { id: 'view.revealCodes', label: 'Reveal Codes', icon: 'code', tab: 'View', group: 'Show', kind: 'toggle', keys: ['Alt-F3'], noRecord: true, origin: 'WordPerfect Reveal Codes', run: (app) => app.ui.togglePane('reveal'), isActive: (app) => app.ui.paneOpen('reveal') },
  { id: 'view.statusBar', label: 'Status Bar', icon: 'bottom_navigation', tab: 'View', group: 'Show', kind: 'toggle', noRecord: true, run: (app) => { document.body.classList.toggle('qf-no-status'); app.refresh(); }, isActive: () => !document.body.classList.contains('qf-no-status') },
]);

// Zoom ------------------------------------------------------------------------------------------
def([
  { id: 'view.zoom', label: 'Zoom…', icon: 'zoom_in', tab: 'View', group: 'Zoom', popular: true, noRecord: true, run: async (app) => {
    const r = await openDialog({ title: 'Zoom', fields: [
      { key: 'preset', label: 'Zoom to', type: 'radio', options: [{ value: '2', label: '200%' }, { value: '1', label: '100%' }, { value: '0.75', label: '75%' }, { value: 'pageWidth', label: 'Page width' }, { value: 'onePage', label: 'Whole page' }, { value: 'custom', label: 'Percent:' }], value: 'custom' },
      { key: 'pct', label: 'Percent', type: 'number', value: Math.round(app.tab.zoom * 100), min: 10, max: 500 },
    ] });
    if (!r) return;
    if (r.preset === 'pageWidth' || r.preset === 'onePage') app.setZoom(1, r.preset);
    else app.setZoom(r.preset === 'custom' ? (r.pct || 100) / 100 : parseFloat(r.preset));
  } },
  { id: 'view.zoomIn', label: 'Zoom In', icon: 'zoom_in', tab: 'View', group: 'Zoom', noRecord: true, run: (app) => app.setZoom(Math.min(5, Math.round((app.tab.zoom + 0.1) * 10) / 10)) },
  { id: 'view.zoomOut', label: 'Zoom Out', icon: 'zoom_out', tab: 'View', group: 'Zoom', noRecord: true, run: (app) => app.setZoom(Math.max(0.1, Math.round((app.tab.zoom - 0.1) * 10) / 10)) },
  { id: 'view.zoom100', label: '100%', icon: 'crop_free', tab: 'View', group: 'Zoom', noRecord: true, run: (app) => app.setZoom(1) },
  { id: 'view.pageWidth', label: 'Page Width', icon: 'fit_page_width', tab: 'View', group: 'Zoom', noRecord: true, run: (app) => app.setZoom(1, 'pageWidth') },
  { id: 'view.onePage', label: 'One Page', icon: 'fit_page', tab: 'View', group: 'Zoom', noRecord: true, run: (app) => app.setZoom(1, 'onePage') },
  { id: 'view.multiplePages', label: 'Multiple Pages', icon: 'auto_stories', tab: 'View', group: 'Zoom', noRecord: true, run: (app) => { app.setViewMode('print'); app.setZoom(0.45); } },
]);

// Window ------------------------------------------------------------------------------------------
def([
  { id: 'view.newWindow', label: 'New Document Tab', icon: 'tab', tab: 'View', group: 'Window', noRecord: true, run: (app) => app.exec('file.new') },
  {
    id: 'view.switchWindows', label: 'Switch Windows', icon: 'tab_group', tab: 'View', group: 'Window', kind: 'menu', noRecord: true,
    run: (app, arg) => { const t = app.docs.find((d) => d.id === arg); if (t) app.activate(t); },
    menu: (app) => app.docs.map((d) => ({ id: 'view.switchWindows', arg: d.id, label: d.displayName + (d.dirty ? ' •' : ''), checked: d === app.tab })),
  },
  { id: 'view.nextWindow', label: 'Next Document', icon: 'arrow_forward', tab: 'View', group: 'Window', keys: ['Mod-F6'], noRecord: true, run: (app) => { const i = app.docs.indexOf(app.tab); app.activate(app.docs[(i + 1) % app.docs.length]); } },
  { id: 'view.prevWindow', label: 'Previous Document', icon: 'arrow_back', tab: 'View', group: 'Window', keys: ['Mod-Shift-F6'], noRecord: true, run: (app) => { const i = app.docs.indexOf(app.tab); app.activate(app.docs[(i - 1 + app.docs.length) % app.docs.length]); } },
  { id: 'view.fullScreen', label: 'Full Screen', icon: 'fullscreen', tab: 'View', group: 'Window', kind: 'toggle', noRecord: true, run: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }, isActive: () => !!document.fullscreenElement },
  { id: 'view.distractionFree', label: 'Distraction-Free Writing', icon: 'self_improvement', tab: 'View', group: 'Window', kind: 'toggle', keys: ['Mod-Alt-Shift-z'], noRecord: true, origin: 'Distraction-free editors', run: (app) => { document.body.classList.toggle('qf-zen'); app.ui.applyPrefs(); toast(document.body.classList.contains('qf-zen') ? 'Press Ctrl+Shift+Enter or tap the top edge to exit' : ''); }, isActive: () => document.body.classList.contains('qf-zen') },
  { id: 'view.commandSearch', label: 'Search Commands', icon: 'manage_search', tab: 'View', group: 'Window', keys: ['Alt-q'], popular: true, noRecord: true, run: (app) => app.ui.commandPalette() },
  { id: 'view.cmdSearch', label: 'Search Commands', icon: 'search', tab: 'View', group: 'Window', internal: true, noRecord: true, run: (app) => app.ui.commandPalette() },
  { id: 'view.collapseRibbon', label: 'Collapse the Ribbon', icon: 'expand_less', tab: 'View', group: 'Window', kind: 'toggle', keys: ['Mod-F1'], noRecord: true, run: (app) => { app.prefs.ribbon = app.prefs.ribbon === 'full' ? 'tabs' : 'full'; app.savePrefs(); app.ui.applyPrefs(); }, isActive: (app) => app.prefs.ribbon !== 'full' },
  { id: 'view.darkMode', label: 'Dark Mode', icon: 'dark_mode', tab: 'View', group: 'Window', kind: 'menu', noRecord: true, run: (app, arg) => { app.prefs.theme = arg || (app.prefs.theme === 'dark' ? 'light' : 'dark'); app.savePrefs(); app.ui.applyPrefs(); }, menu: (app) => (['system', 'light', 'dark'] as const).map((t) => ({ id: 'view.darkMode', arg: t, label: t[0].toUpperCase() + t.slice(1), checked: app.prefs.theme === t })) },
  { id: 'view.darkPage', label: 'Dark Page Color', icon: 'contrast', tab: 'View', group: 'Window', kind: 'toggle', noRecord: true, run: (app) => { app.prefs.darkPage = !app.prefs.darkPage; app.savePrefs(); for (const d of app.docs) app.applySettingsToDom(d); app.refresh(); }, isActive: (app) => app.prefs.darkPage },
]);

// Focus, reading, typewriter ------------------------------------------------------------------
def([
  {
    id: 'view.focusMode', label: 'Focus Highlighting', icon: 'center_focus_weak', tab: 'View', group: 'Writing', kind: 'menu', noRecord: true, origin: 'iA Writer / Ulysses focus mode',
    run: (app, arg) => { app.prefs.focus = arg ?? (app.prefs.focus === 'off' ? 'sentence' : 'off'); app.savePrefs(); v(app).dispatch(app.state.tr.setMeta(focusKey, { mode: app.prefs.focus })); },
    menu: (app) => (['off', 'sentence', 'paragraph', 'line'] as const).map((m) => ({ id: 'view.focusMode', arg: m, label: m === 'off' ? 'Off' : `Current ${m}`, checked: app.prefs.focus === m })),
  },
  { id: 'view.typewriter', label: 'Typewriter Scrolling', icon: 'keyboard', tab: 'View', group: 'Writing', kind: 'toggle', noRecord: true, origin: 'Scrivener / iA Writer', run: (app) => { app.prefs.typewriter = !app.prefs.typewriter; app.savePrefs(); app.ui.applyPrefs(); }, isActive: (app) => app.prefs.typewriter },
  {
    id: 'view.writingGoal', label: 'Writing Goal…', icon: 'flag', tab: 'View', group: 'Writing', noRecord: true, origin: 'Scrivener project targets',
    run: async (app) => {
      const r = await openDialog({ title: 'Writing Goal', fields: [{ key: 'goal', label: 'Words to write this session (0 = off)', type: 'number', value: app.prefs.writingGoal || 500 }] });
      if (!r) return;
      app.prefs.writingGoal = r.goal || 0; app.savePrefs();
      app.tab.sessionStartWords = -1;
      app.refresh();
    },
  },
  {
    id: 'view.immersiveReader', label: 'Immersive Reader', icon: 'chrome_reader_mode', tab: 'View', group: 'Immersive', noRecord: true,
    run: async (app) => {
      const r = await openDialog({ title: 'Immersive Reader', fields: [
        { key: 'width', label: 'Column width', type: 'select', options: [{ value: '40ch', label: 'Very narrow' }, { value: '55ch', label: 'Narrow' }, { value: '70ch', label: 'Moderate' }, { value: '100%', label: 'Wide' }], value: '55ch' },
        { key: 'spacing', label: 'Increase text spacing', type: 'checkbox', value: true },
        { key: 'color', label: 'Page color', type: 'select', options: [{ value: '', label: 'Default' }, { value: '#f6efdf', label: 'Sepia' }, { value: '#e8f0e8', label: 'Mint' }, { value: '#1e1e1e', label: 'Inverse' }], value: '#f6efdf' },
        { key: 'focus', label: 'Line focus', type: 'select', options: ['off', 'line', 'sentence', 'paragraph'], value: 'off' },
        { key: 'size', label: 'Text size', type: 'range', min: 80, max: 200, value: 120, suffix: '%' },
      ] });
      if (!r) return;
      app.setViewMode('read');
      const el = app.tab.el;
      el.style.setProperty('--qf-read-width', r.width);
      el.style.setProperty('--qf-read-size', String(r.size / 100));
      el.style.setProperty('--qf-read-bg', r.color || '');
      el.classList.toggle('qf-read-spacing', r.spacing);
      el.classList.toggle('qf-read-inverse', r.color === '#1e1e1e');
      v(app).dispatch(app.state.tr.setMeta(focusKey, { mode: r.focus }));
    },
  },
  {
    id: 'view.teleprompter', label: 'Teleprompter', icon: 'slideshow', tab: 'View', group: 'Immersive', kind: 'toggle', noRecord: true, origin: 'Presenter / teleprompter apps',
    run: async (app) => {
      const el = app.tab.el;
      if ((app as any)._prompter) { clearInterval((app as any)._prompter); (app as any)._prompter = null; el.classList.remove('qf-prompter'); keepAwake(false); app.setViewMode('print'); return; }
      const r = await openDialog({ title: 'Teleprompter', fields: [{ key: 'speed', label: 'Scroll speed (px/s)', type: 'range', min: 5, max: 200, value: 40 }, { key: 'mirror', label: 'Mirror text (for beam-splitter glass)', type: 'checkbox', value: false }] });
      if (!r) return;
      app.setViewMode('read');
      el.classList.add('qf-prompter');
      el.classList.toggle('qf-mirror', r.mirror);
      keepAwake(true);
      let last = performance.now();
      let paused = false;
      el.onclick = () => { paused = !paused; };
      (app as any)._prompter = setInterval(() => { const now = performance.now(); if (!paused) el.scrollTop += (r.speed * (now - last)) / 1000; last = now; }, 16);
      toast('Tap to pause/resume. Toggle Teleprompter again to stop.');
    },
    isActive: (app) => !!(app as any)._prompter,
  },
  {
    id: 'view.textSpacing', label: 'Text Spacing (Reading)', icon: 'format_letter_spacing_wider', tab: 'View', group: 'Immersive', kind: 'toggle', noRecord: true,
    run: (app) => { app.tab.el.classList.toggle('qf-read-spacing'); app.refresh(); }, isActive: (app) => app.tab.el.classList.contains('qf-read-spacing'),
  },
  { id: 'view.readAloud', label: 'Read Aloud', icon: 'record_voice_over', tab: 'View', group: 'Immersive', noRecord: true, run: (app) => app.exec('review.readAloud') },
  { id: 'view.pageMovement', label: 'Side to Side Page Movement', icon: 'swap_horiz', tab: 'View', group: 'Page Movement', kind: 'toggle', noRecord: true, run: (app) => { app.tab.el.classList.toggle('qf-side-by-side'); app.setViewMode('print'); app.refresh(); }, isActive: (app) => app.tab.el.classList.contains('qf-side-by-side') },
]);

// Outline tools -------------------------------------------------------------------------------
function changeLevel(app: App, delta: number) {
  setParaAttrs(v(app), (a) => {
    const lvl = styleLevel(a.style, a.outlineLevel);
    const next = Math.max(0, Math.min(9, (lvl || (delta > 0 ? 0 : 1)) + delta));
    return next === 0 ? { style: 'Normal', outlineLevel: null } : { style: `Heading ${next}`, outlineLevel: null };
  });
}
def([
  { id: 'outline.promote', label: 'Promote', icon: 'keyboard_double_arrow_left', tab: 'View', group: 'Outline', keys: ['Alt-Shift-ArrowLeft'], edits: true, run: (app) => { if (styleLevel(currentParagraph(app.state)?.attrs.style)) changeLevel(app, -1); else app.exec('list.decreaseLevel'); } },
  { id: 'outline.demote', label: 'Demote', icon: 'keyboard_double_arrow_right', tab: 'View', group: 'Outline', keys: ['Alt-Shift-ArrowRight'], edits: true, run: (app) => { const p = currentParagraph(app.state); if (styleLevel(p?.attrs.style) || app.tab.viewMode === 'outline') changeLevel(app, 1); else app.exec('list.increaseLevel'); } },
  { id: 'outline.promoteToHeading1', label: 'Promote to Heading 1', icon: 'first_page', tab: 'View', group: 'Outline', edits: true, run: (app) => setParaAttrs(v(app), { style: 'Heading 1', outlineLevel: null }) },
  { id: 'outline.demoteToBody', label: 'Demote to Body Text', icon: 'last_page', tab: 'View', group: 'Outline', edits: true, run: (app) => setParaAttrs(v(app), { style: 'Normal', outlineLevel: null }) },
  {
    id: 'outline.moveUp', label: 'Move Section Up', icon: 'move_up', tab: 'View', group: 'Outline', edits: true,
    run: (app) => moveSection(app, -1),
  },
  { id: 'outline.moveDown', label: 'Move Section Down', icon: 'move_down', tab: 'View', group: 'Outline', edits: true, run: (app) => moveSection(app, 1) },
  { id: 'outline.expand', label: 'Expand Heading', icon: 'unfold_more', tab: 'View', group: 'Outline', run: (app) => toggleFoldAtCursor(app, false) },
  { id: 'outline.collapse', label: 'Collapse Heading', icon: 'unfold_less', tab: 'View', group: 'Outline', run: (app) => toggleFoldAtCursor(app, true) },
  { id: 'outline.expandAll', label: 'Expand All Headings', icon: 'unfold_more_double', tab: 'View', group: 'Outline', run: (app) => v(app).dispatch(app.state.tr.setMeta(foldKey, { expandAll: true, level: 0 })) },
  { id: 'outline.collapseAll', label: 'Collapse All Headings', icon: 'unfold_less_double', tab: 'View', group: 'Outline', run: (app) => v(app).dispatch(app.state.tr.setMeta(foldKey, { collapseAll: allHeadingKeys(app.state.doc) })) },
  {
    id: 'outline.showLevel', label: 'Show Level', icon: 'filter_list', tab: 'View', group: 'Outline', kind: 'menu',
    run: (app, arg) => v(app).dispatch(app.state.tr.setMeta(foldKey, { level: arg ?? 0 })),
    menu: () => [{ id: 'outline.showLevel', arg: 0, label: 'All Levels' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: 'outline.showLevel', arg: n, label: `Level ${n}` }))],
  },
  { id: 'outline.firstLineOnly', label: 'Show First Line Only', icon: 'short_text', tab: 'View', group: 'Outline', kind: 'toggle', run: (app) => { app.tab.el.classList.toggle('qf-first-line'); app.refresh(); }, isActive: (app) => app.tab.el.classList.contains('qf-first-line') },
]);

function toggleFoldAtCursor(app: App, collapse: boolean) {
  const st = app.state;
  const $f = st.selection.$from;
  const idx = $f.index(0);
  let key: string | null = null;
  st.doc.forEach((n, _p, i) => { if (i <= idx && n.type === N.paragraph && styleLevel(n.attrs.style, n.attrs.outlineLevel)) key = n.attrs.id || `${i}:${n.textContent.slice(0, 40)}`; });
  if (!key) return;
  const folded = foldKey.getState(st)!.folded;
  if (folded.has(key) !== collapse) v(app).dispatch(st.tr.setMeta(foldKey, { toggle: key }));
}

/** Move a heading together with its subordinate content. */
function moveSection(app: App, dir: -1 | 1) {
  const st = app.state;
  const doc = st.doc;
  const idx = st.selection.$from.index(0);
  const node = doc.child(idx);
  const lvl = node.type === N.paragraph ? styleLevel(node.attrs.style, node.attrs.outlineLevel) : 0;
  if (!lvl) { moveBlocks(v(app), dir); return; }
  const sectionEnd = (start: number, level: number) => { let e = start + 1; while (e < doc.childCount) { const n = doc.child(e); const l = n.type === N.paragraph ? styleLevel(n.attrs.style, n.attrs.outlineLevel) : 0; if (l && l <= level) break; e++; } return e; };
  const end = sectionEnd(idx, lvl);
  const posOf = (i: number) => { let p = 0; for (let k = 0; k < i; k++) p += doc.child(k).nodeSize; return p; };
  if (dir < 0) {
    let prev = idx - 1;
    while (prev >= 0) { const n = doc.child(prev); const l = n.type === N.paragraph ? styleLevel(n.attrs.style, n.attrs.outlineLevel) : 0; if (l && l <= lvl) break; prev--; }
    if (prev < 0) return;
    const from = posOf(idx), to = posOf(end), target = posOf(prev);
    const slice = doc.slice(from, to);
    const tr = st.tr.delete(from, to).insert(target, slice.content);
    v(app).dispatch(tr.scrollIntoView());
    app.selectPos(target + 1);
  } else {
    if (end >= doc.childCount) return;
    const nextEnd = sectionEnd(end, lvl);
    const from = posOf(idx), to = posOf(end), target = posOf(nextEnd);
    const slice = doc.slice(from, to);
    const tr = st.tr.insert(target, slice.content).delete(from, to);
    v(app).dispatch(tr.scrollIntoView());
    app.selectPos(target - (to - from) + 1);
  }
}
