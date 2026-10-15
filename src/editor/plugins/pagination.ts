/**
 * Print Layout pagination.
 *
 * The document is rendered as one continuous column whose width equals the page width.
 * After layout settles, this plugin measures block and line boxes and inserts "page gap"
 * widget decorations that (a) fill the remainder of the current page, (b) show the footnotes
 * and footer of that page, (c) draw the gap between sheets, and (d) show the next page's
 * header. Paragraphs that straddle a page boundary are split with an inline block widget at
 * the first line that does not fit, honouring widow/orphan control, keep-with-next,
 * keep-lines-together and page-break-before. Tables and images that do not fit move to the
 * next page (they are not split).
 *
 * Measurements never require removing existing widgets: block widgets are siblings of the
 * measured nodes, and the heights of inline widgets inside split paragraphs are subtracted.
 */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../schema';

export interface PageConfig {
  enabled: boolean;
  widthPt: number;
  heightPt: number;
  margin: { top: number; right: number; bottom: number; left: number };
  gapPx: number;
  header: (page: number, pages: number) => string;
  footer: (page: number, pages: number) => string;
  footnoteHtml: (node: PMNode, num: string) => string;
  footnoteNumber: (pos: number) => string | null;
  footnotesAtPageBottom: boolean;
}

export interface PageInfo {
  /** Start position of each page (first page starts at 0). */
  starts: number[];
  pages: number;
}

interface Brk {
  pos: number;          // doc position where the next page begins
  inline: boolean;      // break inside a paragraph
  fill: number;         // px of empty space to fill on the page before the break
  page: number;         // index of the page that ends here (0-based)
  fnHtml: string;       // footnote area html for the page ending here
  fnH: number;
  shiftLeft: number;    // for inline widgets: offset from paragraph content box to page edge
  shiftRight: number;
}

interface PState { deco: DecorationSet; info: PageInfo; sig: string }

export const pageKey = new PluginKey<PState>('pagination');

const PT = 4 / 3; // px per pt

function widgetDom(b: Brk | null, cfg: PageConfig, pages: number, last: boolean, first: boolean, fill: number, fnHtml: string, fnH: number, inline: boolean, shiftL: number, shiftR: number, pageIdx: number): HTMLElement {
  const mt = cfg.margin.top * PT, mb = cfg.margin.bottom * PT, ml = cfg.margin.left * PT, mr = cfg.margin.right * PT;
  const el = document.createElement(inline ? 'span' : 'div');
  el.className = 'qf-pgap' + (inline ? ' qf-pgap-inline' : '') + (last ? ' qf-pgap-last' : '') + (first ? ' qf-pgap-first' : '');
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  const total = first ? mt : last ? fill + mb : fill + mb + cfg.gapPx + mt;
  el.style.cssText = `display:block;height:${total}px;margin-left:${-(shiftL)}px;margin-right:${-(shiftR)}px;text-indent:0;` + (first ? `margin-top:${-mt}px;` : '');
  el.dataset.h = String(total);
  const part = (cls: string, h: number, html = '', pad = true) => {
    const d = document.createElement('span');
    d.className = cls;
    d.style.cssText = `display:block;height:${h}px;${pad ? `padding-left:${ml}px;padding-right:${mr}px;` : ''}`;
    if (html) d.innerHTML = html;
    el.appendChild(d);
    return d;
  };
  if (first) {
    const top = part('qf-pg-top', mt);
    top.innerHTML = `<span class="qf-pg-header" style="top:${cfg.margin.top * PT * 0.5}px">${cfg.header(1, pages)}</span>`;
    return el;
  }
  part('qf-pg-fill', Math.max(0, fill - fnH));
  if (fnH > 0) part('qf-pg-footnotes', fnH, fnHtml);
  const bottom = part('qf-pg-bottom', mb);
  bottom.innerHTML = `<span class="qf-pg-footer">${cfg.footer(pageIdx + 1, pages)}</span>`;
  if (!last) {
    part('qf-pg-gap', cfg.gapPx, `<span class="qf-pg-num">${pageIdx + 2}</span>`, false);
    const top = part('qf-pg-top', mt);
    top.innerHTML = `<span class="qf-pg-header">${cfg.header(pageIdx + 2, pages)}</span>`;
  }
  return el;
}

export function paginationPlugin(getConfig: () => PageConfig) {
  let timer: any = null;
  let lastCfgSig = '';

  return new Plugin<PState>({
    key: pageKey,
    state: {
      init: () => ({ deco: DecorationSet.empty, info: { starts: [0], pages: 1 }, sig: '' }),
      apply(tr, v) {
        const m = tr.getMeta(pageKey) as PState | undefined;
        if (m) return m;
        if (!tr.docChanged) return v;
        return { deco: v.deco.map(tr.mapping, tr.doc), info: { ...v.info, starts: v.info.starts.map((p) => tr.mapping.map(p)) }, sig: v.sig };
      },
    },
    props: {
      decorations(state) { return pageKey.getState(state)?.deco; },
    },
    view(view) {
      const schedule = (delay: number) => {
        clearTimeout(timer);
        timer = setTimeout(() => run(view), delay);
      };
      const onResize = () => schedule(150);
      window.addEventListener('resize', onResize);
      (document as any).fonts?.ready?.then(() => schedule(0));
      (view as any)._qfPaginate = (delay = 0) => schedule(delay);
      schedule(50);
      return {
        update(v, prev) {
          const cfg = getConfig();
          const sig = JSON.stringify([cfg.enabled, cfg.widthPt, cfg.heightPt, cfg.margin, cfg.gapPx]);
          if (sig !== lastCfgSig) { lastCfgSig = sig; schedule(0); return; }
          if (v.state.doc !== prev.doc || v.state.doc.attrs.settings !== prev.doc.attrs.settings) schedule(350);
        },
        destroy() { clearTimeout(timer); window.removeEventListener('resize', onResize); },
      };
    },
  });

  function run(view: EditorView) {
    if ((view as any).isDestroyed) return;
    if (view.composing) { clearTimeout(timer); timer = setTimeout(() => run(view), 400); return; }
    const cfg = getConfig();
    const cur = pageKey.getState(view.state)!;
    if (!cfg.enabled) {
      if (cur.deco !== DecorationSet.empty) view.dispatch(view.state.tr.setMeta(pageKey, { deco: DecorationSet.empty, info: { starts: [0], pages: 1 }, sig: '' }).setMeta('addToHistory', false));
      return;
    }
    if (!view.dom.isConnected || view.dom.offsetWidth === 0) return;
    const result = measure(view, cfg);
    if (!result) return;
    const { breaks, finalFill, finalFnHtml, finalFnH } = result;
    const pages = breaks.length + 1;
    const sig = JSON.stringify([breaks.map((b) => [b.pos, Math.round(b.fill), b.inline, Math.round(b.fnH), b.fnHtml.length, Math.round(b.shiftLeft)]), Math.round(finalFill), finalFnH, pages, cfg.header(1, pages), cfg.footer(1, pages)]);
    if (sig === cur.sig) return;
    const decos: Decoration[] = [];
    decos.push(Decoration.widget(0, () => widgetDom(null, cfg, pages, false, true, 0, '', 0, false, cfg.margin.left * PT, cfg.margin.right * PT, 0), { side: -1, key: `pg-first-${pages}-${cfg.header(1, pages)}`, ignoreSelection: true }));
    breaks.forEach((b, i) => {
      decos.push(Decoration.widget(b.pos, () => widgetDom(b, cfg, pages, false, false, b.fill, b.fnHtml, b.fnH, b.inline, b.shiftLeft, b.shiftRight, b.page), {
        side: -1, key: `pg-${i}-${Math.round(b.fill)}-${b.inline ? 1 : 0}-${pages}-${Math.round(b.fnH)}-${b.fnHtml.length}-${Math.round(b.shiftLeft)}`, ignoreSelection: true,
      }));
    });
    const end = view.state.doc.content.size;
    decos.push(Decoration.widget(end, () => widgetDom(null, cfg, pages, true, false, finalFill, finalFnHtml, finalFnH, false, cfg.margin.left * PT, cfg.margin.right * PT, pages - 1), { side: 1, key: `pg-last-${Math.round(finalFill)}-${pages}-${finalFnH}-${finalFnHtml.length}`, ignoreSelection: true }));
    const info: PageInfo = { starts: [0, ...breaks.map((b) => b.pos)], pages };
    const scroller = view.dom.closest('.qf-scroll') as HTMLElement | null;
    const st = scroller?.scrollTop;
    view.dispatch(view.state.tr.setMeta(pageKey, { deco: DecorationSet.create(view.state.doc, decos), info, sig }).setMeta('addToHistory', false).setMeta('pagination', true));
    if (scroller && st != null) scroller.scrollTop = st;
    view.dom.dispatchEvent(new CustomEvent('qf-paginated', { bubbles: true, detail: info }));
  }
}

interface LineBox { top: number; bottom: number; left: number }

function zoomRatio(view: EditorView): number {
  const r = view.dom.getBoundingClientRect();
  return view.dom.offsetWidth ? r.width / view.dom.offsetWidth : 1;
}

/** Natural line boxes of an element, in client px, with inline gap widgets subtracted. */
function lineBoxes(el: HTMLElement): { lines: LineBox[]; widgetsAbove: (y: number) => number } {
  const widgets = [...el.querySelectorAll<HTMLElement>('.qf-pgap-inline')].map((w) => { const r = w.getBoundingClientRect(); return { top: r.top, h: r.height }; });
  const widgetsAbove = (y: number) => widgets.filter((w) => w.top < y - 0.5).reduce((a, w) => a + w.h, 0);
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.height > 0 && r.width >= 0);
  const lines: LineBox[] = [];
  for (const r of rects) {
    // Skip rects that belong to the widgets themselves.
    if (widgets.some((w) => r.top >= w.top - 0.5 && r.bottom <= w.top + w.h + 0.5)) continue;
    const ex = lines.find((l) => Math.abs(l.top - r.top) < 2 || (r.top >= l.top - 1 && r.bottom <= l.bottom + 1) || (r.top < l.bottom - 2 && r.bottom > l.top + 2));
    if (ex) { ex.top = Math.min(ex.top, r.top); ex.bottom = Math.max(ex.bottom, r.bottom); ex.left = Math.min(ex.left, r.left); }
    else lines.push({ top: r.top, bottom: r.bottom, left: r.left });
  }
  lines.sort((a, b) => a.top - b.top);
  return { lines, widgetsAbove };
}

function measure(view: EditorView, cfg: PageConfig) {
  const z = zoomRatio(view) || 1;
  const contentH = (cfg.heightPt - cfg.margin.top - cfg.margin.bottom) * PT; // css px
  if (contentH <= 50) return null;
  const doc = view.state.doc;
  const breaks: Brk[] = [];
  let used = 0;
  let page = 0;
  let fnUsed = 0;
  let fnHtml = '';
  const ml = cfg.margin.left * PT, mr = cfg.margin.right * PT;
  const domRect = view.dom.getBoundingClientRect();
  const measurer = footnoteMeasurer(view, cfg);

  const pushBreak = (pos: number, inline: boolean, shiftL = ml, shiftR = mr) => {
    breaks.push({ pos, inline, fill: Math.max(0, contentH - used), page, fnHtml, fnH: fnUsed, shiftLeft: shiftL, shiftRight: shiftR });
    page++;
    used = 0; fnUsed = 0; fnHtml = '';
  };

  const footnotesIn = (node: PMNode, base: number, from = 0, to = Infinity) => {
    const out: { pos: number; node: PMNode }[] = [];
    if (!cfg.footnotesAtPageBottom) return out;
    node.descendants((n, p) => {
      if (n.type === schema.nodes.footnote && n.attrs.kind !== 'end') {
        const abs = base + 1 + p;
        if (abs >= from && abs < to) out.push({ pos: abs, node: n });
      }
      return true;
    });
    return out;
  };
  const addFootnotes = (list: { pos: number; node: PMNode }[]) => {
    for (const f of list) {
      const num = cfg.footnoteNumber(f.pos) || '';
      const html = cfg.footnoteHtml(f.node, num);
      const h = measurer.height(html);
      if (!fnHtml) fnUsed += 12; // separator line + spacing
      fnHtml += html;
      fnUsed += h;
    }
  };
  const fnHeightOf = (list: { pos: number; node: PMNode }[]) => list.reduce((a, f) => a + measurer.height(cfg.footnoteHtml(f.node, cfg.footnoteNumber(f.pos) || '')), 0) + (list.length && !fnHtml ? 12 : 0);

  const children: { node: PMNode; pos: number }[] = [];
  doc.forEach((node, offset) => children.push({ node, pos: offset }));

  for (let i = 0; i < children.length; i++) {
    const { node, pos } = children[i];
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom || !(dom instanceof HTMLElement)) continue;
    const r = dom.getBoundingClientRect();
    const isPara = node.type === schema.nodes.paragraph;
    const { lines, widgetsAbove } = isPara ? lineBoxes(dom) : { lines: [] as LineBox[], widgetsAbove: () => 0 };
    const inlineWidgetH = isPara ? widgetsAbove(r.bottom + 1) : 0;
    let h = (r.height - inlineWidgetH) / z;
    const fns = footnotesIn(node, pos);
    const fnH = fnHeightOf(fns);

    if (isPara && node.attrs.pageBreakBefore && used > 0) pushBreak(pos, false);

    const remaining = contentH - used - fnUsed;
    if (h + fnH <= remaining + 0.5) {
      // keep-with-next: if the next block cannot start on this page, move this block too
      if (isPara && node.attrs.keepNext && i + 1 < children.length && used > 0) {
        const nd = view.nodeDOM(children[i + 1].pos) as HTMLElement | null;
        if (nd) {
          const nh = nd.getBoundingClientRect().height / z;
          const firstLines = Math.min(nh, 2.2 * 16);
          if (h + fnH + firstLines > remaining) { pushBreak(pos, false); }
        }
      }
      used += h; addFootnotes(fns);
    } else if (isPara && !node.attrs.keepLines && lines.length >= 2) {
      // Split the paragraph across pages, possibly several times.
      const top0 = r.top;
      const naturalTop = (l: LineBox) => (l.top - top0 - widgetsAbove(l.top)) / z;
      const naturalBottom = (l: LineBox) => (l.bottom - top0 - widgetsAbove(l.top)) / z;
      let startLine = 0;
      let consumedBefore = 0; // natural px of this paragraph already placed on previous pages
      let guard = 0;
      while (guard++ < 200) {
        const avail = contentH - used - fnUsed;
        // find first line that doesn't fit
        let k = -1;
        for (let li = startLine; li < lines.length; li++) {
          if (naturalBottom(lines[li]) - consumedBefore > avail + 0.5) { k = li; break; }
        }
        if (k < 0) { used += h - consumedBefore; break; }
        const widow = node.attrs.widowControl;
        if (widow) {
          if (k - startLine < 2 && startLine === 0) k = startLine; // orphan: move whole paragraph
          else if (lines.length - k < 2 && k - 1 > startLine) k = k - 1; // widow: pull a line over
        }
        if (k <= startLine) {
          if (used > 0 || startLine > 0) {
            if (startLine === 0) { pushBreak(pos, false); consumedBefore = 0; startLine = 0; continue; }
          }
          // cannot split meaningfully (first line taller than a page)
          used += h - consumedBefore; break;
        }
        // position at the start of line k
        const line = lines[k];
        const y = (line.top + line.bottom) / 2;
        const found = view.posAtCoords({ left: Math.max(domRect.left + 1, line.left + 1), top: y });
        let splitPos = found ? found.pos : -1;
        if (splitPos <= pos + 1 || splitPos >= pos + node.nodeSize - 1) { used += h - consumedBefore; break; }
        // ensure splitPos is at the start of the line (not at end of previous line)
        try {
          const c = view.coordsAtPos(splitPos, 1);
          if (c.top < line.top - 2) splitPos += 1;
        } catch { /* */ }
        const beforeH = naturalTop(line) - consumedBefore;
        used += beforeH;
        addFootnotes(fns.filter((f) => f.pos < splitPos && f.pos >= (breaks.length ? breaks[breaks.length - 1].pos : 0)));
        const pr = dom.getBoundingClientRect();
        const cs = getComputedStyle(dom);
        const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
        const leftOffset = (pr.left - domRect.left) / z + padL; // content box left from editor border-box
        const rightOffset = (domRect.right - pr.right) / z + padR;
        pushBreak(splitPos, true, leftOffset, rightOffset);
        consumedBefore = naturalTop(line);
        startLine = k;
      }
      // footnotes after the last split point
      const lastBreak = breaks.length ? breaks[breaks.length - 1].pos : 0;
      if (lastBreak > pos) addFootnotes(fns.filter((f) => f.pos >= lastBreak));
      else addFootnotes(fns);
    } else {
      // unsplittable block
      if (used > 0) pushBreak(pos, false);
      used += h; addFootnotes(fns);
      if (used > contentH) used = contentH; // overflowing block: the page grows
    }

    const forced = node.type === schema.nodes.page_break || (node.type === schema.nodes.section_break && node.attrs.kind !== 'continuous');
    if (forced && i + 1 < children.length) {
      pushBreak(children[i + 1].pos, false);
      if (node.type === schema.nodes.section_break && (node.attrs.kind === 'oddPage' || node.attrs.kind === 'evenPage')) {
        const wantOdd = node.attrs.kind === 'oddPage';
        const isOdd = (page + 1) % 2 === 1;
        if (wantOdd !== isOdd) { used = 0; pushBreak(children[i + 1].pos, false); }
      }
    }
  }
  measurer.dispose();
  return { breaks, finalFill: Math.max(0, contentH - used), finalFnHtml: fnHtml, finalFnH: fnUsed };
}

function footnoteMeasurer(view: EditorView, cfg: PageConfig) {
  const host = document.createElement('div');
  host.className = 'qf-pg-footnotes qf-measure';
  host.style.cssText = `position:absolute;visibility:hidden;left:-10000px;top:0;width:${(cfg.widthPt - cfg.margin.left - cfg.margin.right) * PT}px`;
  (view.dom.parentElement || document.body).appendChild(host);
  const cache = new Map<string, number>();
  return {
    height(html: string): number {
      let h = cache.get(html);
      if (h == null) {
        host.innerHTML = html;
        h = host.getBoundingClientRect().height;
        cache.set(html, h);
      }
      return h;
    },
    dispose() { host.remove(); },
  };
}

export function pageInfo(state: EditorState): PageInfo {
  return pageKey.getState(state)?.info || { starts: [0], pages: 1 };
}

/** 1-based page number containing a document position. */
export function pageOfPos(state: EditorState, pos: number): number {
  const { starts } = pageInfo(state);
  let p = 1;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= pos) p = i + 1;
  return p;
}

export function repaginate(view: EditorView, delay = 0): void {
  (view as any)._qfPaginate?.(delay);
}
