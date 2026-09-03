/**
 * Open every point of view at once, each in its own signed-in window.
 *
 * One Chrome, three isolated contexts, because three accounts cannot share one
 * localStorage. Each window is sized to a phone and the page fills it, so what
 * is on screen is exactly what the mobile layout does. Windows stay open until
 * this process is killed.
 *
 *   SHOTS=<dir> node scripts/four-views.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const ORIGIN = 'http://localhost:5173';
const SHOTS = process.env.SHOTS ?? '.';
mkdirSync(SHOTS, { recursive: true });

function env(name) {
  for (const file of ['.env.local', '.env']) {
    let text;
    try { text = readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { continue; }
    const line = text.split(/\r?\n/).find((l) => l.startsWith(name + '='));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const anon = env('VITE_SUPABASE_ANON_KEY');
const ref = JSON.parse(Buffer.from(anon.split('.')[1], 'base64').toString('utf8')).ref;
const url = env('VITE_SUPABASE_URL') || `https://${ref}.supabase.co`;
const creds = JSON.parse(readFileSync('artist-credentials.json', 'utf8'));
const artist = (name) => {
  const row = creds.find((c) => c.name === name);
  if (!row?.password) throw new Error(`no password on file for ${name}`);
  return { email: row.email, password: row.password };
};

async function storageFor({ email, password }) {
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  const s = data.session;
  const value = JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: s.expires_at, expires_in: s.expires_in, token_type: 'bearer', user: s.user,
  });
  return { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: `sb-${ref}-auth-token`, value }] }] };
}

/* Who is looking, and at what. */
const PLAN = [
  {
    who: 'N3M3SIS, artist account',
    login: artist('N3M3SIS'),
    tabs: [
      { route: '/artist/11', shot: '1-artist-account.png', label: 'her artist account' },
      { route: '/studio', shot: '2-artist-studio.png', label: 'Studio, with the world entry' },
      { route: '/world-builder', shot: '3-world-builder.png', label: 'Create World, step one' },
    ],
  },
  {
    who: 'Audience member',
    login: { email: 'ui-inspector@songchainn.test', password: 'ui-inspect-' + ref },
    tabs: [
      { route: '/profile', shot: '4-audience-account.png', label: 'audience account' },
      { route: '/world/iman-afrikah?preview=fan', shot: '5-fan-town-square.png', label: 'the town square as a fan' },
      { route: '/world/iman-afrikah/parlour?preview=fan', shot: '6-fan-parlour.png', label: 'the Parlour, open to a fan' },
      { route: '/world/iman-afrikah/studio?preview=fan', shot: '7-fan-locked-door.png', label: 'the Studio, closed to a fan' },
    ],
  },
  {
    who: 'IMan Afrikah',
    login: artist('IMan Afrikah'),
    tabs: [
      { route: '/world/iman-afrikah/council?preview=council', shot: '8-iman-council.png', label: 'the Council, his innermost room' },
      { route: '/world/iman-afrikah/studio?preview=council', shot: '9-iman-studio.png', label: 'the same door, open to him' },
    ],
  },
];

const W = 500;
const PHONE_W = 390;
const H = 960;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [`--window-size=${W},${H}`, '--window-position=0,0'],
});

let column = 0;
for (const group of PLAN) {
  // viewport null means the page fills the window. A fixed viewport inside a
  // wider window leaves a dead gutter and makes a fine page look broken.
  const ctx = await browser.newContext({ viewport: null, storageState: await storageFor(group.login) });
  let placed = false;
  for (const tab of group.tabs) {
    const page = await ctx.newPage();
    if (!placed) {
      try {
        const cdp = await ctx.newCDPSession(page);
        const { windowId } = await cdp.send('Browser.getWindowForTarget');
        await cdp.send('Browser.setWindowBounds', {
          windowId,
          bounds: { left: column * (W + 8), top: 0, width: W, height: H, windowState: 'normal' },
        });
      } catch { /* placement is cosmetic */ }
      placed = true;
      column++;
    }
    // Chrome on Windows refuses to make a window narrower than about 500px,
    // so a real phone width can only be had by emulating one and scaling it up
    // to fill the window. Anything less either lies about the layout or leaves
    // a dead gutter beside the page.
    try {
      const cdp2 = await ctx.newCDPSession(page);
      const outer = await page.evaluate(() => window.innerWidth);
      await cdp2.send('Emulation.setDeviceMetricsOverride', {
        width: PHONE_W,
        height: Math.round((outer > 0 ? H - 90 : 800) * (PHONE_W / Math.max(outer, PHONE_W))),
        deviceScaleFactor: 0,
        mobile: true,
        scale: Math.max(1, outer / PHONE_W),
        screenWidth: PHONE_W,
        screenHeight: 844,
      });
      await cdp2.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    } catch { /* emulation is a nicety */ }

    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
    await page.goto(ORIGIN + tab.route, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(9000);
    const h1 = (await page.locator('h1').first().textContent().catch(() => '')) || '(no h1)';
    const over = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const inScroller = (el) => {
        let n = el.parentElement;
        while (n && n !== document.body) {
          const o = getComputedStyle(n).overflowX;
          if (o === 'auto' || o === 'scroll') return true;
          n = n.parentElement;
        }
        return false;
      };
      let n = 0;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.right > vw + 1 && !inScroller(el)) n++;
      }
      return { vw, n };
    });
    await page.screenshot({ path: `${SHOTS}/${tab.shot}`, timeout: 30000 })
      .catch((e) => console.log('  shot warn', e.message.slice(0, 60)));
    console.log(`${group.who} | ${tab.label} | ${tab.route}`);
    console.log(`   h1: ${h1.trim().slice(0, 80)}`);
    console.log(`   width ${over.vw}px, cut off: ${over.n}`);
    console.log(`   errors: ${errs.length ? errs.slice(0, 2).join(' || ') : 'none'}`);
  }
}

console.log('\nAll windows are open. Leave this running; kill it to close them.');
await new Promise(() => {});
