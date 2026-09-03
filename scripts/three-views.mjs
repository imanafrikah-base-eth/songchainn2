/**
 * The app as three different people see it, side by side.
 *
 *   1. SIGNED OUT   what a stranger lands on, before any account exists
 *   2. AUDIENCE     somebody with an account who is here to listen
 *   3. ARTIST       somebody with an artist account who can build a world
 *
 * One Chrome, three isolated contexts, because three accounts cannot share one
 * localStorage: sign a second one in and the first is signed out.
 *
 * DESKTOP BY DEFAULT. These windows open on a computer, so they open the
 * desktop layout, at a width the desktop breakpoints actually respond to.
 * Forcing a phone viewport into a desktop window is how you end up looking at
 * a 400px column with a wall of black beside it and think the app is broken.
 * Pass PHONE=1 when the mobile layout is the thing being reviewed.
 *
 *   node scripts/three-views.mjs
 *   PHONE=1 node scripts/three-views.mjs
 *   ROUTE_ARTIST=/world-builder node scripts/three-views.mjs
 *
 * Signing in happens through the app's own form rather than through the
 * Supabase client: node's fetch cannot reach the project from this machine,
 * while the browser can, and the browser is the thing we are demonstrating.
 *
 * Windows stay open until this process is killed.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
const PHONE = process.env.PHONE === '1';

const creds = JSON.parse(readFileSync('artist-credentials.json', 'utf8'));
const artist = (name) => {
  const row = creds.find((c) => c.name === name);
  if (!row?.password) throw new Error(`no password on file for ${name}`);
  return { email: row.email, password: row.password };
};

const PLAN = [
  {
    who: '1. SIGNED OUT  what everyone sees first',
    storage: null,
    login: null,
    route: process.env.ROUTE_GUEST ?? '/',
  },
  {
    who: '2. AUDIENCE    signed in to listen',
    // A session already on disk, so this one needs no sign-in round trip.
    storage: '.ui-inspect-session.json',
    login: null,
    route: process.env.ROUTE_AUDIENCE ?? '/',
  },
  {
    who: '3. ARTIST      N3M3SIS, who can build a world',
    storage: null,
    login: artist('N3M3SIS'),
    route: process.env.ROUTE_ARTIST ?? '/',
  },
];

/* Desktop windows are wide enough to cross the lg breakpoint, so the sidebar
   and the two column layouts are the ones on screen. Phone windows are a real
   handset width. */
const WIN_W = PHONE ? 470 : 1280;
const WIN_H = PHONE ? 980 : 900;
const PHONE_W = 402;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [`--window-size=${WIN_W},${WIN_H}`],
});

/** Sign in the way a person does: through the form on the landing page. */
async function signInThroughTheApp(page, login) {
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The landing page is heavy and the log in control is not interactive until
  // it has settled. Waiting on the control itself rather than on a guessed
  // number of milliseconds is what makes this reliable at any window size.
  const logIn = page.getByRole('button', { name: /^log in$/i }).first();
  await logIn.waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForTimeout(2500);
  await logIn.click();

  const email = page.locator('input[type="email"]').first();
  await email.waitFor({ state: 'visible', timeout: 30000 });
  await email.fill(login.email);
  await page.locator('input[type="password"]').first().fill(login.password);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).last().click();
  await page.waitForTimeout(9000);
}

let column = 0;
for (const view of PLAN) {
  const ctx = await browser.newContext({
    viewport: null, // the page fills the window; a fixed viewport leaves a gutter
    ...(view.storage ? { storageState: view.storage } : {}),
  });
  const page = await ctx.newPage();

  try {
    const cdp = await ctx.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        left: PHONE ? column * (WIN_W + 6) : column * 60,
        top: PHONE ? 0 : column * 40,
        width: WIN_W,
        height: WIN_H,
        windowState: 'normal',
      },
    });
  } catch {
    // Placement is cosmetic. A window in the wrong place still shows the app.
  }
  column++;

  if (PHONE) {
    // Chrome on Windows refuses to make a window much narrower than 500px, so a
    // real phone width can only be had by emulating one and scaling it up to
    // fill the window.
    try {
      const cdp = await ctx.newCDPSession(page);
      const outer = await page.evaluate(() => window.innerWidth);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: PHONE_W,
        height: 0,
        deviceScaleFactor: 0,
        mobile: true,
        screenWidth: PHONE_W,
        positionX: 0,
        scale: Math.max(1, outer / PHONE_W),
      });
    } catch {
      // Emulation unavailable. The window still works, just wider than a phone.
    }
  }

  try {
    if (view.login) await signInThroughTheApp(page, view.login);
    await page.goto(ORIGIN + view.route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log(`${view.who}  ->  ${view.route}`);
  } catch (e) {
    console.log(`${view.who}  ->  FAILED: ${String(e).slice(0, 90)}`);
  }
}

console.log(`\nThree windows open in ${PHONE ? 'PHONE' : 'DESKTOP'} layout. Ctrl+C closes them.`);
await new Promise(() => {});
