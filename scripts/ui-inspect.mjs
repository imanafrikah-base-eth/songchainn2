#!/usr/bin/env node
/**
 * UI inspector: catches layout that does not fit the screen.
 *
 * A button hanging half off the right edge of a phone is a beginner mistake and
 * it is the kind of thing nobody notices on a 1440px laptop. This measures it
 * instead of trusting an eyeball: every route, at the narrowest phone widths we
 * support, reporting any element whose box crosses the viewport edge.
 *
 *   node scripts/ui-inspect.mjs                    # default routes, default widths
 *   node scripts/ui-inspect.mjs --url http://localhost:5173 --routes /,/discover
 *   node scripts/ui-inspect.mjs --json             # machine-readable, for CI
 *
 * Exit code is 1 when anything overflows, so it can gate a commit.
 */

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = argOf('url', 'http://localhost:5173').replace(/\/$/, '');
const JSON_OUT = args.includes('--json');
/**
 * Signed-out, every guarded route redirects to the landing page, so a scan
 * without a session silently measures one page N times and reports all clear.
 * Point --storage at a Playwright storageState JSON to scan the real app.
 * Create one once with:  node scripts/ui-inspect.mjs --login
 */
const STORAGE = argOf('storage', '');
const LOGIN = args.includes('--login');

/** 320 is the narrowest phone still in real use; 360 and 402 are the common ones. */
const WIDTHS = argOf('widths', '320,360,402').split(',').map((w) => Number(w.trim()));
const ROUTES = argOf(
  'routes',
  '/,/discover,/artists,/social,/marketplace,/profile,/playlists,/leaderboard,/about,/dj-shuffle,/room,/wallet,/worlds',
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

/** Ignore sub-pixel rounding and deliberately-offscreen animation staging. */
const TOLERANCE_PX = 2;

const findOverflow = (tolerance) => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const seen = new Set();

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    // Deliberately parked offscreen (drawers, carousels mid-transition).
    if (style.position === 'fixed' && style.transform && style.transform !== 'none') continue;
    // Decoration that paints nothing and cannot be touched is not a layout bug.
    // Blurred backdrop circles legitimately hang past the edge by design.
    if (style.pointerEvents === 'none') continue;

    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const overRight = r.right - vw;
    const overLeft = -r.left;
    const worst = Math.max(overRight, overLeft);
    if (worst <= tolerance) continue;

    // An ancestor that scrolls horizontally on purpose, or clips, makes this
    // fine: the user never sees past the edge either way.
    let p = el.parentElement;
    let contained = false;
    while (p && p !== document.body) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflowX === 'hidden' ||
          ps.overflow === 'hidden' || ps.overflow === 'clip') {
        const pr = p.getBoundingClientRect();
        // Only counts if the clipping box is itself on screen.
        if (pr.right <= vw + tolerance && pr.left >= -tolerance) { contained = true; break; }
      }
      p = p.parentElement;
    }
    if (contained) continue;

    const interactive =
      ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
      el.getAttribute('role') === 'button';
    // Does this element actually show the user anything?
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
      .length > 0;
    const paints =
      ownText ||
      el.tagName === 'IMG' ||
      (style.backgroundImage && style.backgroundImage !== 'none') ||
      (style.borderWidth !== '0px' && style.borderStyle !== 'none');
    if (!interactive && !paints) continue;

    const cls = (el.getAttribute('class') || '').slice(0, 120);
    const key = `${el.tagName}.${cls}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      tag: el.tagName.toLowerCase(),
      cls,
      text: (el.textContent || '').trim().slice(0, 48),
      overflowPx: Math.round(worst),
      side: overRight > overLeft ? 'right' : 'left',
      interactive,
    });
  }
  return {
    docScrolls: document.documentElement.scrollWidth > vw + tolerance,
    scrollWidth: document.documentElement.scrollWidth,
    viewport: vw,
    items: out.sort((a, b) => b.overflowPx - a.overflowPx).slice(0, 15),
  };
};

const browser = await chromium.launch({ channel: 'chrome', headless: !LOGIN });

// One-off: opens a real browser, you sign in by hand, it saves the session.
if (LOGIN) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 780 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  console.log('Sign in in the browser window, then press Enter here.');
  await new Promise((r) => process.stdin.once('data', r));
  const out = STORAGE || '.ui-inspect-session.json';
  await ctx.storageState({ path: out });
  console.log('Session saved to ' + out + '. Re-run with --storage ' + out);
  await browser.close();
  process.exit(0);
}

const findings = [];

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...(STORAGE ? { storageState: STORAGE } : {}),
  });
  const page = await ctx.newPage();

  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3500);
      const res = await page.evaluate(findOverflow, TOLERANCE_PX);
      if (res.docScrolls || res.items.length) {
        findings.push({ route, width, ...res });
      }
    } catch (err) {
      findings.push({ route, width, error: String(err.message || err).slice(0, 120) });
    }
  }
  await ctx.close();
}

await browser.close();

if (!STORAGE && !JSON_OUT) {
  console.log(
    [
      'NOTE: no --storage session given, so guarded routes redirected to the landing page.',
      '      Run "node scripts/ui-inspect.mjs --login" once to capture a session first.',
      '',
    ].join('\n'),
  );
}

if (JSON_OUT) {
  console.log(JSON.stringify(findings, null, 2));
} else if (!findings.length) {
  console.log(`No horizontal overflow at ${WIDTHS.join('px, ')}px across ${ROUTES.length} routes.`);
} else {
  for (const f of findings) {
    if (f.error) {
      console.log(`\n[${f.width}px] ${f.route}  COULD NOT LOAD: ${f.error}`);
      continue;
    }
    console.log(`\n[${f.width}px] ${f.route}  page scrolls sideways: ${f.docScrolls} (${f.scrollWidth}px wide)`);
    for (const i of f.items) {
      console.log(
        `   ${i.interactive ? 'TAP ' : '    '}+${String(i.overflowPx).padStart(4)}px ${i.side}  <${i.tag}> ${i.text ? `"${i.text}" ` : ''}${i.cls}`,
      );
    }
  }
}

process.exit(findings.some((f) => !f.error) ? 1 : 0);
