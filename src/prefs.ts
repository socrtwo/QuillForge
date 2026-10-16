/** Application preferences (per device), persisted to localStorage. */
import { DEFAULT_AUTOFORMAT, DEFAULT_REPLACEMENTS, type AutoFormatPrefs } from './editor/autoformat';

export interface CustomGroup { id: string; label: string; items: string[] }
export interface CustomTab { id: string; label: string; groups: CustomGroup[]; hidden?: boolean }
export interface RecentEntry { key: string; name: string; when: number; uri?: string; format?: string; pinned?: boolean }
export interface Macro { name: string; steps: { id: string; arg?: any }[]; description?: string; key?: string; created: number }
export interface Snippet { name: string; gallery: string; json: any; created: number }

export interface Prefs {
  author: string;
  initials: string;
  qat: string[];
  qatPosition: 'top' | 'bottom';
  qatLabels: boolean;
  customTabs: CustomTab[];
  hiddenTabs: string[];
  tabOrder: string[];
  keymap: Record<string, string>;
  units: 'in' | 'cm' | 'mm' | 'pt';
  autosave: boolean;
  autosaveSeconds: number;
  autoformat: AutoFormatPrefs;
  replacements: Record<string, string>;
  theme: 'system' | 'light' | 'dark';
  darkPage: boolean;
  ribbon: 'full' | 'tabs' | 'hidden';
  defaultView: 'auto' | 'print' | 'mobile' | 'web';
  spellcheck: boolean;
  grammar: boolean;
  nativeSpellcheck: boolean;
  wordCompletion: boolean;
  recent: RecentEntry[];
  snippets: Snippet[];
  macros: Macro[];
  dictionary: string[];
  ignoredWords: string[];
  showMarks: boolean;
  showRuler: boolean;
  writingGoal: number;
  defaultFont: string;
  defaultSize: number;
  typewriter: boolean;
  focus: 'off' | 'paragraph' | 'sentence' | 'line';
  miniToolbar: boolean;
  language: string;
  /** Spelling dictionary: all English varieties (default), the document's language, or one variety. */
  spellDialect: 'any' | 'document' | 'en-US' | 'en-GB' | 'en-CA' | 'en-AU';
  confirmClose: boolean;
  defaultSaveFormat: string;
  readAloudRate: number;
  slashMenu: boolean;
  pasteDefault: 'keep' | 'merge' | 'text';
  showHiddenText: boolean;
  showFieldCodes: boolean;
  fieldShading: 'always' | 'selected' | 'never';
  highContrastUI: boolean;
  uiScale: number;
  statusItems: string[];
  clipboardHistory: number;
  pinnedCommands: string[];
  firstRun: boolean;
}

export const DEFAULT_QAT = ['file.save', 'edit.undo', 'edit.redo', 'file.saveAs', 'file.print', 'view.cmdSearch'];

export function defaultPrefs(): Prefs {
  return {
    author: 'Author',
    initials: 'A',
    qat: [...DEFAULT_QAT],
    qatPosition: 'top',
    qatLabels: false,
    customTabs: [],
    hiddenTabs: [],
    tabOrder: [],
    keymap: {},
    units: 'in',
    autosave: true,
    autosaveSeconds: 10,
    autoformat: { ...DEFAULT_AUTOFORMAT },
    replacements: { ...DEFAULT_REPLACEMENTS },
    theme: 'system',
    darkPage: false,
    ribbon: 'full',
    defaultView: 'auto',
    spellcheck: true,
    grammar: true,
    nativeSpellcheck: true,
    wordCompletion: true,
    recent: [],
    snippets: [],
    macros: [],
    dictionary: [],
    ignoredWords: [],
    showMarks: false,
    showRuler: false,
    writingGoal: 0,
    defaultFont: '',
    defaultSize: 0,
    typewriter: false,
    focus: 'off',
    miniToolbar: true,
    language: 'en-US',
    spellDialect: 'any',
    confirmClose: true,
    defaultSaveFormat: 'docx',
    readAloudRate: 1,
    slashMenu: true,
    pasteDefault: 'keep',
    showHiddenText: false,
    showFieldCodes: false,
    fieldShading: 'selected',
    highContrastUI: false,
    uiScale: 1,
    statusItems: ['page', 'words', 'track', 'lang', 'views', 'zoom'],
    clipboardHistory: 24,
    pinnedCommands: [],
    firstRun: true,
  };
}

const KEY = 'quillforge.prefs.v1';

export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw);
    return { ...d, ...p, autoformat: { ...d.autoformat, ...(p.autoformat || {}) }, replacements: p.replacements || d.replacements };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or unavailable */ }
}

export const UNIT_PT: Record<Prefs['units'], number> = { in: 72, cm: 72 / 2.54, mm: 72 / 25.4, pt: 1 };
export function toUnit(pt: number, u: Prefs['units']): number { return Math.round((pt / UNIT_PT[u]) * 100) / 100; }
export function fromUnit(v: number, u: Prefs['units']): number { return v * UNIT_PT[u]; }
