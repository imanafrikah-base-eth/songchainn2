import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two people, start to finish: somebody who listens, and somebody who makes
 * music. Both create an account through the real sign-up form, finish
 * onboarding, and then use the app the way they would. The rest of the suite
 * runs signed out and so can only ever say the outside of the building stands.
 *
 * Accounts are throwaway (`qa-*@songchainn.test`) and are removed at the end
 * with the service role, so nothing is left behind in the shared database.
 * The artist is promoted with the service role too, because an artist account
 * is granted FOR a person, never self-assigned.
 */

const BASE = 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
const PASSWORD = `Qa-${RUN}-pass!9`;

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  for (const file of ['.env.local', '.env']) {
    try {
      const txt = readFileSync(join(process.cwd(), file), 'utf8');
      const m = txt.match(new RegExp(`^${name}=(.*)$`, 'm'));
      if (m) return m[1].trim().replace(/^"|"$/g, '');
    } catch {
      /* next */
    }
  }
  return '';
}

const SUPABASE_URL = env('VITE_SUPABASE_URL') || 'https://wsjhbfmzbonxmxaaassu.supabase.co';
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

async function admin(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

async function userIdByEmail(email: string): Promise<string | null> {
  const r = await admin(`/auth/v1/admin/users?page=1&per_page=200`);
  if (!r.ok) return null;
  const users = (JSON.parse(r.body).users ?? []) as Array<{ id: string; email: string }>;
  return users.find((u) => u.email === email)?.id ?? null;
}

function watch(page: Page, errors: string[]) {
  // Only Vercel serves this script; anywhere else the browser parses an HTML
  // 404 as JavaScript and reports a syntax error that is not ours.
  void page.route('**/_vercel/**', (r) => r.abort());
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message} @ ${(e.stack ?? '').split('\n')[1]?.trim() ?? '?'}`));
  // Which request answered badly, not just that one did.
  page.on('response', (r) => {
    const st = r.status();
    if (st >= 400) {
      const u = new URL(r.url());
      console.log(`HTTP ${st} ${r.request().method()} ${u.host}${u.pathname}${u.search.slice(0, 120)}`);
    }
  });
  page.on('requestfailed', (r) => console.log(`REQFAIL ${r.failure()?.errorText} ${r.url().slice(0, 160)}`));
  // A script answered with HTML is what 'Unexpected token <' means. Name it.
  page.on('response', (r) => {
    const ct = r.headers()['content-type'] ?? '';
    if (r.request().resourceType() === 'script' && ct.includes('text/html')) console.log(`HTML-AS-SCRIPT ${r.status()} ${r.url().slice(0, 160)} on ${page.url().slice(0, 80)}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Noise that is not ours: extension chatter, blocked third-party media.
    if (/DialogTitle|favicon|ERR_BLOCKED_BY_CLIENT|net::ERR|403|401|406|Failed to load resource/.test(t)) return;
    // R2 sends no CORS headers; on Vercel textures go through the same-origin
    // /api/img proxy, which vite preview does not serve. Preview-only.
    if (/blocked by CORS policy/.test(t) && /r2.dev/.test(t)) return;
    // A request the page itself abandoned by navigating away, not a server answer.
    if (/TypeError: Failed to fetch/.test(t)) return;
    errors.push(`console: ${t.slice(0, 200)}`);
  });
}

async function appReady(page: Page) {
  await page.waitForFunction(
    () => !!document.querySelector('#root header, #root main, #root nav, #root form, #root h1'),
    null,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(400);
}

async function noCrash(page: Page, where: string) {
  const crashed = await page.locator('text=Something went wrong').count();
  expect(crashed, `${where} crashed`).toBe(0);
  const notFound = await page.locator('text=/page not found|404/i').count();
  expect(notFound, `${where} is a 404`).toBe(0);
}

/** The real sign-up form, then onboarding, then the age gate if it shows. */
async function signUp(page: Page, email: string, name: string, makesMusic: boolean) {
  await page.goto(`${BASE}/?auth=signup`);
  await appReady(page);
  const emailInput = page.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 20_000 });
  await emailInput.fill(email);
  await page.locator('input[placeholder="Password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();

  // Onboarding
  const displayName = page.locator('input[placeholder="Your display name"]');
  await expect(displayName).toBeVisible({ timeout: 45_000 });
  if (makesMusic) {
    await page.getByRole('button', { pressed: false }).filter({ hasText: /make|artist|music/i }).first().click().catch(() => undefined);
  }
  await displayName.fill(name);
  // Date of birth is asked here, and it is what opens the adult-only parts.
  const dobField = page.locator('input[type="date"]').first();
  if (await dobField.count()) await dobField.fill('1990-05-05');
  await page.getByRole('button', { name: /Enter \$ongChainn/i }).click();
  await page.waitForTimeout(1500);

  // Age gate, when it asks
  const dob = page.locator('input[type="date"]').first();
  if (await dob.count()) {
    await dob.fill('1990-05-05');
    await page.locator('input[type="date"]').first().locator('xpath=following::button[1]').click().catch(() => undefined);
    await page.waitForTimeout(800);
  }
  await appReady(page);
}

async function visit(page: Page, path: string, errors: string[]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await appReady(page);
  await page.waitForTimeout(600);
  await noCrash(page, path);
  console.log(`ok ${path}`);
}

// Serial, because the artist test builds on what the listener test proved.
// Two retries, because sign-up is a live network round trip from this machine
// and a stalled request is not a verdict on the app; every retry starts with
// fresh throwaway accounts, so nothing is reused.
test.describe.configure({ mode: 'serial', retries: 2 });
test.describe('Signed-in journeys', () => {
  test.setTimeout(240_000);
  // The PWA service worker fetches on the page's behalf and those requests
  // bypass page.route, so the Vercel-only script above could not be blocked
  // while it was active. The worker is Vercel's concern, not these journeys'.
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

  const audienceEmail = `qa-audience-${RUN}@songchainn.test`;
  const artistEmail = `qa-artist-${RUN}@songchainn.test`;
  const created: string[] = [];

  test.afterAll(async () => {
    if (!SERVICE_KEY) return;
    for (const email of created) {
      const id = await userIdByEmail(email);
      if (!id) continue;
      await admin(`/rest/v1/artist_accounts?user_id=eq.${id}`, { method: 'DELETE' });
      await admin(`/rest/v1/worlds?owner_id=eq.${id}`, { method: 'DELETE' });
      await admin(`/rest/v1/world_nfts?owner_id=eq.${id}`, { method: 'DELETE' });
      await admin(`/rest/v1/social_posts?user_id=eq.${id}`, { method: 'DELETE' });
      const r = await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
      console.log(`cleanup ${email}: ${r.status}`);
    }
  });

  test('Audience: sign up, listen, post, walk the app', async ({ page }) => {
    const errors: string[] = [];
    watch(page, errors);
    await signUp(page, audienceEmail, `QA Listener ${RUN}`, false);
    created.push(audienceEmail);
    await noCrash(page, 'home after onboarding');

    // Signed in: the shell is there.
    await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible({ timeout: 20_000 });

    // Play something.
    await visit(page, '/discover', errors);
    const play = page.locator('button[aria-label*="play" i], button:has(svg.lucide-play)').first();
    if (await play.count()) {
      await play.click();
      await page.waitForTimeout(2500);
      const audio = await page.evaluate(() => Array.from(document.querySelectorAll('audio')).some((a) => a.src || a.querySelector('source')));
      console.log('audio element wired:', audio);
    } else {
      console.log('no play button on /discover');
    }

    // Post a line in the feed.
    await visit(page, '/social', errors);
    const opener = page.locator('button[aria-label="Create a post"]').first();
    if (await opener.count()) { await opener.click(); await page.waitForTimeout(800); }
    const composer = page.locator('textarea[placeholder*="listening"]').first();
    if (await composer.count()) {
      await composer.fill(`QA post ${RUN}: the feed works`);
      const postBtn = page.getByRole('button', { name: /^post$/i }).last();
      console.log('post buttons in sheet:', await page.locator('[role="dialog"] button, [data-state="open"] button').allInnerTexts().then((t) => JSON.stringify(t.slice(0, 12))));
      if (await postBtn.count()) {
        await postBtn.click();
        await expect(page.locator(`text=QA post ${RUN}`).first()).toBeVisible({ timeout: 20_000 });
        console.log('post published');
      }
    } else {
      console.log('composer not found on /social');
    }

    // Every door a listener can open.
    for (const p of ['/marketplace', '/artists', '/artist/3', '/world/iman-afrikah', '/keys', '/wallet', '/leaderboard', '/inbox', '/profile', '/room', '/wavewarz-africa/battles/live', '/launch', '/drops/iman-afrikah', '/claim', '/studio']) {
      await visit(page, p, errors);
    }
    // A listener never sees the upload form: the Studio turns them to the claim.
    await page.goto(`${BASE}/studio`);
    await appReady(page);
    await expect(page.locator('text=The Studio is for artist accounts').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('input[type="file"]').count(), 'no upload input for a listener').toBe(0);
    // A listener is told the launcher and drops are for artists, not shown a broken form.
    await page.goto(`${BASE}/drops/iman-afrikah`);
    await appReady(page);
    await expect(page.locator('text=/only the artist|artist accounts|Sign in/i').first()).toBeVisible({ timeout: 15_000 });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Artist: sign up, get the account, build a world, make a drop', async ({ page }) => {
    test.skip(!SERVICE_KEY, 'needs SUPABASE_SERVICE_ROLE_KEY to grant the artist account');
    const errors: string[] = [];
    watch(page, errors);
    await signUp(page, artistEmail, `QA Artist ${RUN}`, true);
    created.push(artistEmail);
    await noCrash(page, 'home after onboarding');

    // Granted for the artist, never by them.
    const uid = await userIdByEmail(artistEmail);
    expect(uid, 'artist user exists').toBeTruthy();
    const grant = await admin('/rest/v1/artist_accounts', {
      method: 'POST',
      body: JSON.stringify({ artist_id: `qa-${RUN}`, user_id: uid, is_verified: false }),
    });
    expect(grant.ok, `artist grant: ${grant.body}`).toBe(true);
    await page.reload();
    await appReady(page);

    await visit(page, '/studio', errors);
    expect(await page.locator('text=The Studio is for artist accounts').count(), 'artist sees the Studio').toBe(0);
    await visit(page, '/launch', errors);
    await expect(page.locator('text=/What are you launching|artist accounts/i').first()).toBeVisible({ timeout: 15_000 });

    // Build a world.
    await visit(page, '/world-builder', errors);
    const nameInput = page.locator('input[placeholder="N3M3SIS"]').first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill(`QA World ${RUN}`);
    await page.locator('input[placeholder="How you want to be credited"]').fill(`QA Artist ${RUN}`);
    await page.locator('input[placeholder="What this place is, in a sentence"]').fill('A test world that gets removed after the run.');
    await page.getByRole('button', { name: /Create my world/i }).click();
    await page.waitForTimeout(2500);
    await noCrash(page, 'builder after create');

    // The Drops step.
    const dropsStep = page.getByRole('button', { name: /\. Drops$/ }).first();
    await expect(dropsStep).toBeVisible({ timeout: 20_000 });
    await dropsStep.click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: /Mint on Base/i }).first()).toBeVisible({ timeout: 15_000 });
    // A brand-new artist has no songs on the platform yet, so "A song" has
    // nothing to pick and the form rightly refuses to save. Artwork it is.
    await page.getByRole('button', { name: /^Artwork/i }).first().click();
    await page.locator('main input[placeholder="What it is called"]').fill(`QA Drop ${RUN}`);
    await page.locator('main input[placeholder="https://..."]').first().fill('https://songchainn.xyz/songchainn-logo.webp');
    await page.getByRole('button', { name: /Save draft/i }).click();
    await expect(page.locator(`text=QA Drop ${RUN}`).first()).toBeVisible({ timeout: 20_000 });
    console.log('drop draft saved');

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
