/** AutoCorrect and AutoFormat-as-you-type. */
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { Plugin, TextSelection, type EditorState } from 'prosemirror-state';
import { schema } from './schema';

export interface AutoFormatPrefs {
  smartQuotes: boolean;
  dashes: boolean;
  fractions: boolean;
  ordinals: boolean;
  symbols: boolean;
  markdownBlocks: boolean;
  markdownInline: boolean;
  autoLinks: boolean;
  capitalizeSentences: boolean;
  twoInitialCaps: boolean;
  capitalizeDays: boolean;
  capsLock: boolean;
  replaceList: boolean;
  borderLines: boolean;
  quoteStyle: 'curly' | 'guillemets' | 'german' | 'straight';
}

export const DEFAULT_AUTOFORMAT: AutoFormatPrefs = {
  smartQuotes: true, dashes: true, fractions: true, ordinals: true, symbols: true,
  markdownBlocks: true, markdownInline: true, autoLinks: true, capitalizeSentences: true,
  twoInitialCaps: true, capitalizeDays: true, capsLock: true, replaceList: true, borderLines: true,
  quoteStyle: 'curly',
};

/** Default AutoCorrect replacement list (common English typos). User-editable in Options. */
export const DEFAULT_REPLACEMENTS: Record<string, string> = {
  abbout: 'about', abotu: 'about', accomodate: 'accommodate', acheive: 'achieve', acn: 'can', adn: 'and',
  agian: 'again', alot: 'a lot', alwasy: 'always', amke: 'make', apparantly: 'apparently', aready: 'already',
  arguement: 'argument', basicly: 'basically', becasue: 'because', becuase: 'because', beggining: 'beginning',
  beleive: 'believe', belive: 'believe', calender: 'calendar', cant: "can't", certianly: 'certainly',
  comming: 'coming', commitee: 'committee', completly: 'completely', concious: 'conscious', definately: 'definitely',
  didnt: "didn't", doesnt: "doesn't", dont: "don't", embarass: 'embarrass', enviroment: 'environment',
  existance: 'existence', familar: 'familiar', finaly: 'finally', foriegn: 'foreign', freind: 'friend',
  goign: 'going', govenment: 'government', gaurd: 'guard', happend: 'happened', hte: 'the', htis: 'this',
  immediatly: 'immediately', independant: 'independent', isnt: "isn't", jsut: 'just', knowlege: 'knowledge',
  libary: 'library', lisence: 'license', maintainance: 'maintenance', mispell: 'misspell', neccessary: 'necessary',
  noticable: 'noticeable', occassion: 'occasion', occured: 'occurred', occurence: 'occurrence', ocurred: 'occurred',
  peice: 'piece', posession: 'possession', prefered: 'preferred', probaly: 'probably', publically: 'publicly',
  realy: 'really', recieve: 'receive', recomend: 'recommend', refered: 'referred', relevent: 'relevant',
  remeber: 'remember', seperate: 'separate', shoudl: 'should', sieze: 'seize', similiar: 'similar',
  succesful: 'successful', supercede: 'supersede', suprise: 'surprise', taht: 'that', teh: 'the', tehy: 'they',
  thier: 'their', threshhold: 'threshold', tommorow: 'tomorrow', tounge: 'tongue', truely: 'truly',
  untill: 'until', wasnt: "wasn't", wierd: 'weird', whcih: 'which', wiht: 'with', wont: "won't", wouldnt: "wouldn't",
  yuo: 'you', i: 'I', "i'm": "I'm", "i've": "I've", "i'll": "I'll", "i'd": "I'd",
};

const SYMBOLS: [RegExp, string][] = [
  [/\(c\)$/i, '©'], [/\(r\)$/i, '®'], [/\(tm\)$/i, '™'], [/\(e\)$/i, '€'], [/\.\.\.$/, '…'],
  [/->$/, '→'], [/<-$/, '←'], [/=>$/, '⇒'], [/<=$/, '≤'], [/>=$/, '≥'], [/!=$/, '≠'], [/\+-$/, '±'],
  [/:\)$/, '☺'], [/:\($/, '☹'], [/~=$/, '≈'],
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function romanValue(r: string): number {
  const v: Record<string, number> = { i: 1, v: 5, x: 10 };
  let n = 0;
  for (let i = 0; i < r.length; i++) n += v[r[i]] < (v[r[i + 1]] || 0) ? -v[r[i]] : v[r[i]];
  return n;
}

function quoteChars(style: AutoFormatPrefs['quoteStyle']) {
  switch (style) {
    case 'guillemets': return { dOpen: '«', dClose: '»', sOpen: '‹', sClose: '›' };
    case 'german': return { dOpen: '„', dClose: '“', sOpen: '‚', sClose: '‘' };
    case 'straight': return { dOpen: '"', dClose: '"', sOpen: "'", sClose: "'" };
    default: return { dOpen: '“', dClose: '”', sOpen: '‘', sClose: '’' };
  }
}

export function buildInputRules(prefs: () => AutoFormatPrefs) {
  const rules: InputRule[] = [];
  const S = schema;

  const when = (flag: keyof AutoFormatPrefs, rule: InputRule): InputRule => {
    const orig = (rule as any).handler;
    (rule as any).handler = (state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
      if (!prefs()[flag]) return null;
      if (state.selection.$from.parent.type.spec.code) return null;
      return orig(state, match, start, end);
    };
    return rule;
  };

  // Smart quotes. The quote replaces the selection (from the typed position to `end`), like plain typing.
  const quoteAt = (state: EditorState, m: RegExpMatchArray, start: number, end: number, q: string) => state.tr.insertText(q, start + m[0].length - 1, end);
  rules.push(when('smartQuotes', new InputRule(/(?:^|[\s{[(<'"‘“])(")$/, (state, m, start, end) => quoteAt(state, m, start, end, quoteChars(prefs().quoteStyle).dOpen))));
  rules.push(when('smartQuotes', new InputRule(/"$/, (state, m, start, end) => quoteAt(state, m, start, end, quoteChars(prefs().quoteStyle).dClose))));
  rules.push(when('smartQuotes', new InputRule(/(?:^|[\s{[(<'"‘“])(')$/, (state, m, start, end) => quoteAt(state, m, start, end, quoteChars(prefs().quoteStyle).sOpen))));
  rules.push(when('smartQuotes', new InputRule(/'$/, (state, m, start, end) => quoteAt(state, m, start, end, quoteChars(prefs().quoteStyle).sClose))));
  // Dashes
  rules.push(when('dashes', new InputRule(/(\S)--$/, (state, m, start, end) => state.tr.insertText(m[1] + '—', start, end))));
  rules.push(when('dashes', new InputRule(/(\s)-(\s)$/, (state, m, start, end) => state.tr.insertText(`${m[1]}–${m[2]}`, start, end))));
  rules.push(when('dashes', new InputRule(/–-$/, (state, _m, start, end) => state.tr.insertText('—', start, end))));
  // Fractions
  rules.push(when('fractions', new InputRule(/(^|\s)(1\/2|1\/4|3\/4|1\/3|2\/3|1\/8)(\s)$/, (state, m, start, end) => {
    const map: Record<string, string> = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/8': '⅛' };
    return state.tr.insertText(m[1] + map[m[2]] + m[3], start, end);
  })));
  // Ordinals 1st 2nd 3rd 4th -> superscript suffix
  rules.push(when('ordinals', new InputRule(/\b(\d+)(st|nd|rd|th)(\s)$/, (state, m, start, end) => {
    const n = parseInt(m[1], 10);
    const suf = m[2];
    const expected = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
    if (expected !== suf) return null;
    const numEnd = start + m[1].length;
    const tr = state.tr.insertText(m[3], end, end);
    tr.addMark(numEnd, numEnd + suf.length, S.marks.sup.create());
    tr.removeStoredMark(S.marks.sup);
    return tr;
  })));
  // Symbols
  for (const [re, ch] of SYMBOLS) {
    rules.push(when('symbols', new InputRule(re, (state, m, start, end) => state.tr.insertText(ch, start, end))));
  }

  // Markdown-style block shortcuts
  const headingRule = new InputRule(/^(#{1,6})\s$/, (state, m, start, end) => {
    const $s = state.doc.resolve(start);
    if ($s.parent.type !== S.nodes.paragraph) return null;
    const tr = state.tr.delete(start, end);
    tr.setNodeMarkup($s.before(), undefined, { ...$s.parent.attrs, style: `Heading ${m[1].length}` });
    return tr;
  });
  rules.push(when('markdownBlocks', headingRule));
  rules.push(when('markdownBlocks', new InputRule(/^>\s$/, (state, _m, start, end) => {
    const $s = state.doc.resolve(start);
    if ($s.parent.type !== S.nodes.paragraph) return null;
    return state.tr.delete(start, end).setNodeMarkup($s.before(), undefined, { ...$s.parent.attrs, style: 'Quote' });
  })));
  rules.push(when('markdownBlocks', wrappingInputRule(/^\s*([-+*•])\s$/, S.nodes.bullet_list)));
  rules.push(when('markdownBlocks', wrappingInputRule(/^(\d+)[.)]\s$/, S.nodes.ordered_list, (m) => ({ order: +m[1] }), (m, node) => node.childCount + node.attrs.order === +m[1])));
  // "i." and multi-letter numerals ("ii.", "iv.") start a roman list; any other single letter a lettered list.
  rules.push(when('markdownBlocks', wrappingInputRule(/^(i|[ivx]{2,})[.)]\s$/, S.nodes.ordered_list, (m) => ({ order: romanValue(m[1]) || 1, format: 'lower-roman' }))));
  rules.push(when('markdownBlocks', wrappingInputRule(/^([a-z])[.)]\s$/, S.nodes.ordered_list, (m) => ({ order: m[1].charCodeAt(0) - 96, format: 'lower-alpha' }))));
  rules.push(when('markdownBlocks', wrappingInputRule(/^\[( |x)?\]\s$/, S.nodes.task_list)));
  rules.push(when('markdownBlocks', textblockTypeInputRule(/^```([a-z]*)?\s$/, S.nodes.code_block, (m) => ({ language: m[1] || null }))));

  // Inline markdown
  const inlineMark = (re: RegExp, type: () => any) => new InputRule(re, (state, m, start, end) => {
    const inner = m[2];
    if (!inner || /^\s|\s$/.test(inner)) return null;
    const pre = m[1] || '';
    // Delimiter length per side; the last closing character is the one being typed (not yet in the doc).
    const open = (m[0].length - pre.length - inner.length) / 2;
    const s = start + pre.length;
    // Delete the closing, then the opening delimiter and mark the text between, so inline atoms
    // (images, footnotes, breaks) and existing formatting inside are kept.
    const tr = state.tr.delete(s + open + inner.length, end).delete(s, s + open);
    tr.addMark(s, s + inner.length, type().create());
    tr.removeStoredMark(type());
    return tr;
  });
  rules.push(when('markdownInline', inlineMark(/(^|[^*])\*\*([^*]+)\*\*$/, () => S.marks.bold)));
  rules.push(when('markdownInline', inlineMark(/(^|[^_])__([^_]+)__$/, () => S.marks.underline)));
  rules.push(when('markdownInline', inlineMark(/(^|[^*\w])\*([^*]+)\*$/, () => S.marks.italic)));
  rules.push(when('markdownInline', inlineMark(/(^|[^_\w])_([^_]+)_$/, () => S.marks.italic)));
  rules.push(when('markdownInline', inlineMark(/(^|[^~])~~([^~]+)~~$/, () => S.marks.strike)));
  rules.push(when('markdownInline', inlineMark(/(^|[^`])`([^`]+)`$/, () => S.marks.code)));
  rules.push(when('markdownInline', inlineMark(/(^|[^=])==([^=]+)==$/, () => S.marks.highlight)));

  return inputRules({ rules });
}

/** Word-level AutoCorrect (replacement list, capitalization, links) on word boundary. */
export function autocorrectPlugin(prefs: () => AutoFormatPrefs, replacements: () => Record<string, string>, onCorrect?: (from: string, to: string) => void) {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (!/^[\s.,;:!?)\]}"'”’]$/.test(text)) return false;
        const p = prefs();
        const { state } = view;
        const $from = state.doc.resolve(from);
        if ($from.parent.type.spec.code) return false;
        if (state.selection.$from.marks().some((m) => m.type === schema.marks.code)) return false;
        const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 200), $from.parentOffset, '￼', '￼');
        const wm = /([\p{L}\p{N}][\p{L}\p{N}'’]*|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.]+)$/u.exec(before);
        if (!wm) return false;
        const word = wm[1];
        const wStart = from - word.length;
        const tr = state.tr;
        let replaced: string | null = null;

        if (p.autoLinks && /^(https?:\/\/|www\.)/.test(word)) {
          const href = word.startsWith('www.') ? 'https://' + word : word;
          tr.addMark(wStart, from, schema.marks.link.create({ href }));
          tr.insertText(text, from, to);
          view.dispatch(tr);
          return true;
        }
        if (p.autoLinks && /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(word)) {
          tr.addMark(wStart, from, schema.marks.link.create({ href: 'mailto:' + word }));
          tr.insertText(text, from, to);
          view.dispatch(tr);
          return true;
        }
        // A lone letter or roman numeral starting the paragraph ("a.", "ii)") may begin a list: leave it.
        if (p.markdownBlocks && (text === '.' || text === ')') && before.length === word.length && /^([a-z]|[ivx]+)$/.test(word)) return false;
        const reps = replacements();
        if (p.replaceList) {
          // Look up with straight apostrophes so entries like "i'm" also match after smart quotes ("i’m").
          const key = word.replace(/’/g, "'");
          const lower = key.toLowerCase();
          if (Object.hasOwn(reps, key)) replaced = reps[key];
          else if (Object.hasOwn(reps, lower) && key === lower) replaced = reps[lower];
          else if (Object.hasOwn(reps, lower) && key[0] === key[0].toUpperCase() && key.slice(1) === key.slice(1).toLowerCase()) {
            const r = reps[lower]; replaced = r.charAt(0).toUpperCase() + r.slice(1);
          }
          if (replaced != null && p.smartQuotes && p.quoteStyle !== 'straight') replaced = replaced.replace(/'/g, '’');
        }
        let w = replaced ?? word;
        if (p.twoInitialCaps && /^\p{Lu}\p{Lu}\p{Ll}{2,}$/u.test(w)) w = w[0] + w.slice(1).toLowerCase();
        if (p.capsLock && /^\p{Ll}\p{Lu}{2,}$/u.test(w)) w = w[0].toUpperCase() + w.slice(1).toLowerCase();
        if (p.capitalizeDays && DAYS.includes(w.toLowerCase()) && w === w.toLowerCase()) w = w[0].toUpperCase() + w.slice(1);
        if (p.capitalizeSentences && /^\p{Ll}/u.test(w) && !/[.@/]/.test(w)) {
          const pre = before.slice(0, before.length - word.length);
          const atStart = pre === '';
          const afterStop = /[.!?]["'”’)]*\s+$/.test(pre) && !/\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|no|fig|pp?|vol|cf|al)\.\s+$/i.test(pre) && !/\.\.\s+$/.test(pre);
          if (atStart || afterStop) w = w[0].toUpperCase() + w.slice(1);
        }
        if (w === word) return false;
        tr.insertText(w, wStart, from);
        tr.insertText(text, wStart + w.length, wStart + w.length + (to - from));
        tr.setSelection(TextSelection.create(tr.doc, wStart + w.length + text.length));
        tr.setMeta('autocorrect', { from: word, to: w });
        view.dispatch(tr);
        onCorrect?.(word, w);
        return true;
      },
    },
  });
}
