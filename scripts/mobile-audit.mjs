#!/usr/bin/env node
/**
 * The phone audit.
 *
 * scripts/ui-inspect.mjs already measures things that hang off the right edge.
 * This measures the other two ways a phone screen goes wrong, both of which
 * that scanner reports clean:
 *
 *   COVERED    Fixed chrome sitting on top of something you were meant to read
 *              or press. The bottom tab bar, the mini player and the floating
 *              Mo$ha button are all position:fixed, so nothing in the document
 *              flow knows they are there. A button underneath one of them is
 *              not a button, and no overflow check will ever notice.
 *
 *   CLIPPED    A box with overflow hidden and more content in it than fits, so
 *              the rest is unreachable rather than merely below the fold.
 *
 * Plain overflow is reported too, so one run answers the whole question.
 *
 *   node scripts/mobile-audit.mjs --storage .ui-inspect-session.json
 *   node scripts/mobile-audit.mjs --widths 320,402 --routes discover,social
 *
 * Routes are named WITHOUT a leading slash. Git Bash rewrites a leading "/" in
 * an argument into a Windows path and silently corrupts it.
 *
 * Signed out, every guarded route redirects to the landing page, so a run with
 * no --storage measures one page N times and reports all clear. Point it at a
 * Playwright storageState file to scan the real app.
 */

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf('url', 'http://localhost:5173').replace(/\/$/, '');
const STORAGE = argOf('storage', null);
const WIDTHS = argOf('widths', '320,360,402').split(',').map(Number);
const DEFAULT_ROUTES = [
  '', 'discover', 'social', 'community', 'profile', 'playlists', 'marketplace',
  'wallet', 'inbox', 'leaderboard', 'studio', 'room', 'dj-shuffle', 'artists',
  'about', 'launch', 'world-builder', 'world/iman-afrikah', 'wavewarz-africa',
];
const ROUTES = argOf('routes', DEFAULT_ROUTES.join(',')).split(',');

/** How much of a target has to be under fixed chrome before it is a defect. */
const COVERED_RATIO = 0.28;

const results = [];
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: WIDTHS[0], height: 860 },
  ...(STORAGE ? { storageState: STORAGE } : {}),
});

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width, height: 860 });
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120));
    });
    try {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6500);
      // Scroll to the bottom and back so lazy sections mount and any chrome
      // that only appears after a scroll is on screen when we measure.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1800);
      // Stay at the bottom. Fixed chrome covering something here is permanent,
      // because there is no scroll left to move it out from under.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);

      const found = await page.evaluate((cfg) => {
        const { w, ratio } = cfg;
        const out = { overflow: [], covered: [], clipped: [] };

        const label = (el) => {
          const cls = el.className && el.className.toString ? el.className.toString().slice(0, 30) : '';
          const txt = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30);
          return `${el.tagName}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
        };
        const visible = (el) => {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const insideScroller = (el) => {
          for (let a = el.parentElement; a; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true;
          }
          return false;
        };
        /** Clipped by an ancestor, so however wide it is nothing shows. */
        const clippedByAncestor = (el) => {
          for (let a = el.parentElement; a; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.overflowX === 'hidden' || s.overflowX === 'clip' ||
                s.overflow === 'hidden' || s.overflow === 'clip') return true;
          }
          return false;
        };
        /**
         * Really on screen, not merely laid out.
         *
         * An item scrolled out of an inner list still reports its laid-out
         * rectangle, which can sit anywhere on the page including under the tab
         * bar. Measuring that as "covered by the tab bar" is nonsense: it is
         * clipped by its own container and the bar has nothing to do with it.
         * So walk up the clipping ancestors and require a real intersection.
         */
        const onScreen = (el) => {
          let r = el.getBoundingClientRect();
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const s = getComputedStyle(a);
            const clips = ['hidden', 'clip', 'auto', 'scroll'];
            if (!clips.includes(s.overflowY) && !clips.includes(s.overflowX)) continue;
            const ar = a.getBoundingClientRect();
            const ix = Math.min(r.right, ar.right) - Math.max(r.left, ar.left);
            const iy = Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top);
            if (ix <= 1 || iy <= 1) return false;
          }
          return true;
        };
        /** Deliberately truncated. line-clamp is a choice, not an accident. */
        const lineClamped = (el) => {
          const s = getComputedStyle(el);
          const c = s.webkitLineClamp || s.getPropertyValue('-webkit-line-clamp');
          return !!c && c !== 'none';
        };
        /** Drawn, not read. Nobody can hit it and no screen reader sees it. */
        const decorative = (el) => {
          if (el.getAttribute('aria-hidden') === 'true') return true;
          if (getComputedStyle(el).pointerEvents === 'none') return true;
          for (let a = el.parentElement; a; a = a.parentElement) {
            if (a.getAttribute('aria-hidden') === 'true') return true;
          }
          return false;
        };

        // --- overflow ------------------------------------------------------
        for (const el of document.body.querySelectorAll('*')) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.right <= w + 1 && r.left >= -1) continue;
          if (getComputedStyle(el).position === 'fixed') continue;
          if (insideScroller(el) || clippedByAncestor(el) || decorative(el)) continue;
          out.overflow.push(label(el));
        }

        // --- covered -------------------------------------------------------
        const fixedAll = [...document.body.querySelectorAll('*')].filter((el) => {
          if (!visible(el)) return false;
          const s = getComputedStyle(el);
          if (s.position !== 'fixed' || s.pointerEvents === 'none') return false;
          const r = el.getBoundingClientRect();
          return r.width > 24 && r.height > 24;
        });
        // Outermost fixed elements only, so a bar and its own buttons are one item.
        const vh = window.innerHeight;
        const fixed = fixedAll
          .filter((el) => !fixedAll.some((o) => o !== el && o.contains(el)))
          // A dialog, a sheet or an arrival animation is meant to cover what is
          // behind it. Chrome that lives alongside the page is not.
          .filter((el) => {
            if (el.closest('[role="dialog"], [role="alertdialog"]')) return false;
            if (el.getAttribute('aria-modal') === 'true') return false;
            const r = el.getBoundingClientRect();
            return r.height < vh * 0.85;
          });

        const targets = [
          ...document.body.querySelectorAll('a,button,input,select,textarea,[role="button"],h1,h2,h3,p,li'),
        ];
        for (const f of fixed) {
          const fr = f.getBoundingClientRect();
          for (const t of targets) {
            if (f.contains(t) || t.contains(f) || !visible(t)) continue;
            if (!onScreen(t)) continue;
            const tr = t.getBoundingClientRect();
            if (tr.bottom < 0 || tr.top > window.innerHeight) continue;
            const ox = Math.min(fr.right, tr.right) - Math.max(fr.left, tr.left);
            const oy = Math.min(fr.bottom, tr.bottom) - Math.max(fr.top, tr.top);
            if (ox <= 2 || oy <= 2) continue;
            const covered = (ox * oy) / Math.max(1, tr.width * tr.height);
            if (covered <= ratio) continue;
            // Confirm the fixed thing really paints on top at the overlap.
            const cx = Math.max(fr.left, tr.left) + ox / 2;
            const cy = Math.max(fr.top, tr.top) + oy / 2;
            const hit = document.elementFromPoint(cx, cy);
            if (!hit || (hit !== f && !f.contains(hit))) continue;
            out.covered.push(`${label(f).slice(0, 38)} COVERS ${label(t)} (${Math.round(covered * 100)}%)`);
          }
        }

        // --- clipped -------------------------------------------------------
        for (const el of document.body.querySelectorAll('*')) {
          if (!visible(el)) continue;
          if (getComputedStyle(el).overflowY !== 'hidden') continue;
          if (decorative(el) || lineClamped(el) || !onScreen(el)) continue;
          const hidden = el.scrollHeight - el.clientHeight;
          if (hidden <= 24 || el.clientHeight <= 24) continue;
          if (!(el.innerText || '').trim()) continue;
          /*
           * Only text going missing matters.
           *
           * Nearly every card in this app has a decorative gradient blob
           * absolutely positioned so it bleeds past the corner, which is what
           * overflow-hidden on the card is FOR. Those blobs inflate
           * scrollHeight and made this rule cry wolf on three pages while no
           * word of copy was ever lost. So look at what is actually sticking
           * out: if none of it carries text, the box is doing its job.
           */
          const r = el.getBoundingClientRect();
          let textIsCut = false;
          for (const d of el.querySelectorAll('*')) {
            if (!(d.textContent || '').trim()) continue;
            const dr = d.getBoundingClientRect();
            if (dr.height > 0 && dr.bottom > r.bottom + 2) { textIsCut = true; break; }
          }
          if (!textIsCut) continue;
          out.clipped.push(`${label(el)} (+${hidden}px unreachable)`);
        }

        const dedupe = (a) => [...new Set(a)].slice(0, 6);
        return {
          overflow: dedupe(out.overflow),
          covered: dedupe(out.covered),
          clipped: dedupe(out.clipped),
          pageScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      }, { w: width, ratio: COVERED_RATIO });

      results.push({
        route: '/' + route,
        width,
        ...found,
        consoleErrors: [...new Set(consoleErrors)].slice(0, 3),
      });
    } catch (e) {
      results.push({ route: '/' + route, width, error: String(e).slice(0, 110) });
    }
    await page.close();
  }
}
await browser.close();

let problems = 0;
for (const r of results) {
  const bits = [];
  if (r.error) bits.push(`LOAD FAIL ${r.error}`);
  if (r.pageScrollsX) bits.push('PAGE SCROLLS SIDEWAYS');
  if (r.overflow?.length) bits.push(`OVERFLOW: ${r.overflow.join(' | ')}`);
  if (r.covered?.length) bits.push(`COVERED: ${r.covered.join(' | ')}`);
  if (r.clipped?.length) bits.push(`CLIPPED: ${r.clipped.join(' | ')}`);
  if (r.consoleErrors?.length) bits.push(`CONSOLE: ${r.consoleErrors.join(' | ')}`);
  if (bits.length) {
    problems++;
    console.log(`\n[${r.width}px] ${r.route}\n  ${bits.join('\n  ')}`);
  }
}
console.log(`\n${problems} of ${results.length} route/width combinations have something to fix.`);
process.exit(problems ? 1 : 0);
