/**
 * Batch 2 browser test, step 1: two throwaway people, made the real way.
 *
 * Signs up an owner (an artist-to-be) and a listener through the actual sign-up
 * form and onboarding on the local dev server, then keeps each browser session
 * so the later steps start signed in without doing it again. Accounts are
 * qa-b2-*@songchainn.test and are removed when the run is finished.
 *
 *   node e2e/batch2/01-accounts.mjs <outDir>
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const BASE = 'http://localhost:5173';
const RUN = Date.now().toString(36);
const PASSWORD = `Qa-${RUN}-pass!9`;
const env = readFileSync('.env.local', 'utf8');
const ANON = (env.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const SUPABASE = 'https://wsjhbfmzbonxmxaaassu.supabase.co';

async function appReady(page) {
  await page.waitForFunction(() => !!document.querySelector('#root header, #root main, #root nav, #root form, #root h1'), null, { timeout: 90_000 });
  await page.waitForTimeout(500);
}

async function signUp(page, email, name, makesMusic) {
  await page.goto(`${BASE}/?auth=signup`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await appReady(page);
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });
  await emailInput.fill(email);
  await page.locator('input[placeholder="Password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();

  const displayName = page.locator('input[placeholder="Your display name"]');
  // This PC's browser can take most of a minute to get the sign-up reply back.
  await displayName.waitFor({ state: 'visible', timeout: 240_000 });
  if (makesMusic) {
    await page.getByRole('button', { pressed: false }).filter({ hasText: /make|artist|music/i }).first().click().catch(() => undefined);
  }
  await displayName.fill(name);
  const dob = page.locator('input[type="date"]').first();
  if (await dob.count()) await dob.fill('1990-05-05', { timeout: 120_000 });
  await page.getByRole('button', { name: /Enter \$ongChainn/i }).click();
  await displayName.waitFor({ state: 'hidden', timeout: 90_000 });
  await page.waitForTimeout(1500);
  const gate = page.locator('input[type="date"]').first();
  if (await gate.count()) {
    await gate.fill('1990-05-05');
    await gate.locator('xpath=following::button[1]').click().catch(() => undefined);
    await page.waitForTimeout(1000);
  }
  await appReady(page);
}

async function userId(email) {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const j = await r.json();
  return j.user?.id ?? null;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const people = [
  { role: 'owner', email: `qa-b2-owner-${RUN}@songchainn.test`, name: `QA Owner ${RUN}`, makesMusic: true },
  { role: 'listener', email: `qa-b2-listen-${RUN}@songchainn.test`, name: `QA Listener ${RUN}`, makesMusic: false },
];
const result = { run: RUN, password: PASSWORD, people: [] };
try {
  for (const p of people) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const t = Date.now();
    await signUp(page, p.email, p.name, p.makesMusic);
    const state = join(OUT, `state-${p.role}.json`);
    await context.storageState({ path: state });
    const uid = await userId(p.email);
    console.log(`signed up ${p.role} in ${Math.round((Date.now() - t) / 1000)}s uid=${uid} url=${page.url()}`);
    result.people.push({ ...p, uid, state });
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, 'accounts.json'), JSON.stringify(result, null, 2));
}
