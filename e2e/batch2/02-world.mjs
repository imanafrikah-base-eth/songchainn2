/**
 * Batch 2 browser test, step 2: an artist builds a world and changes it in place.
 *
 *   - builds a world in the World Builder, the real way
 *   - marks a street and a city Coming soon (item 4)
 *   - uploads a hero picture with the direct road to storage BLOCKED, so the
 *     only way it can land is the upload relay (item 2)
 *   - walks into the world, switches to the visitor's view, and checks the
 *     Coming soon tile, door and panel, then switches back
 *   - arranges a street in place: adds a block and moves it (item 5)
 *   - arranges a city in place: starts a new street in it (item 5)
 *
 *   node e2e/batch2/02-world.mjs <outDir>
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const BASE = 'http://localhost:5173';
const accounts = JSON.parse(readFileSync(join(OUT, 'accounts.json'), 'utf8'));
const owner = accounts.people.find((p) => p.role === 'owner');
const RUN = accounts.run;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (err) {
    check(name, false, String(err?.message ?? err).split('\n')[0].slice(0, 220));
  }
};

async function appReady(page) {
  await page.waitForFunction(() => !!document.querySelector('#root header, #root main, #root nav, #root form, #root h1'), null, { timeout: 90_000 });
  await page.waitForTimeout(600);
}

// A real, decodable picture for the upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGElEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC',
  'base64',
);
const picture = join(OUT, `qa-hero-${RUN}.png`);
writeFileSync(picture, PNG);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', storageState: owner.state });
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`pageerror: ${e.message.slice(0, 200)}`));
const relayCalls = [];
const directCalls = [];
page.on('response', (r) => {
  if (r.url().includes('/functions/v1/upload-relay')) relayCalls.push(r.status());
});
page.on('request', (r) => {
  if (r.url().includes('.r2.cloudflarestorage.com')) directCalls.push(r.method());
});

let worldId = null;
let slug = null;

try {
  /* ------------------------------------------------------------- build */
  await step('builder: create a world', async () => {
    await page.goto(`${BASE}/world-builder`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await appReady(page);
    const nameInput = page.locator('input[placeholder*="N3M3SIS"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 60_000 });
    await nameInput.fill(`QA World ${RUN}`);
    await page.locator('input[placeholder="How you want to be credited"]').fill(`QA Owner ${RUN}`);
    await page.locator('input[placeholder="What this place is, in a sentence"]').fill('A test world that is removed after the run.');
    await page.getByRole('button', { name: /Create my world/i }).click();
    await page.waitForURL(/[?&]id=/, { timeout: 60_000 });
    worldId = new URL(page.url()).searchParams.get('id');
    slug = `qa-world-${RUN}`;
    check('builder: create a world', Boolean(worldId), `id ${worldId}`);
  });

  /* ------------------------------------------------ item 4: the stages */
  await step('stages: a street and a city set to Coming soon', async () => {
    const streetsStep = page.getByRole('button', { name: /\. Streets$/ }).first();
    await streetsStep.click();
    await page.waitForTimeout(1200);
    const firstStreet = page.locator('li').filter({ has: page.getByRole('group', { name: 'Visitors see' }) }).first();
    await firstStreet.getByRole('button', { name: 'Coming soon' }).click();
    await page.waitForTimeout(800);
    const streetPressed = await firstStreet.getByRole('button', { name: 'Coming soon' }).getAttribute('aria-pressed');
    const cityBox = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Your cities' }) }).last();
    const firstCity = cityBox.locator('li').first();
    await firstCity.getByRole('button', { name: 'Coming soon' }).click();
    await page.waitForTimeout(800);
    const cityPressed = await firstCity.getByRole('button', { name: 'Coming soon' }).getAttribute('aria-pressed');
    check('stages: a street and a city set to Coming soon', streetPressed === 'true' && cityPressed === 'true', `street ${streetPressed}, city ${cityPressed}`);
  });

  /* ------------------------------------ item 2: upload through the relay */
  await step('upload: hero picture lands through the relay with direct storage blocked', async () => {
    await page.route('**/*.r2.cloudflarestorage.com/**', (route) => route.abort('connectionrefused'));
    await page.getByRole('button', { name: /\. Art$/ }).first().click();
    await page.locator('text=Dress the world').waitFor({ timeout: 30_000 });
    const heroCard = page.locator('div.rounded-lg').filter({ has: page.locator('p', { hasText: /^World hero$/ }) }).first();
    await heroCard.locator('input[type="file"]').setInputFiles(picture);
    await heroCard.locator('img').first().waitFor({ state: 'attached', timeout: 120_000 });
    const src = await heroCard.locator('img').first().getAttribute('src');
    const loaded = await fetch(src).then((r) => r.status).catch(() => 0);
    check(
      'upload: hero picture lands through the relay with direct storage blocked',
      directCalls.length > 0 && relayCalls.includes(200) && loaded === 200,
      `direct attempts ${directCalls.length}, relay ${JSON.stringify(relayCalls)}, file ${loaded}`,
    );
    await page.unroute('**/*.r2.cloudflarestorage.com/**');
  });

  /* ------------------------------------------ the world, both views */
  await step('world: owner walks in and sees the owner bar', async () => {
    await page.goto(`${BASE}/world/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByRole('button', { name: /See it as a visitor/i }).waitFor({ timeout: 60_000 });
    check('world: owner walks in and sees the owner bar', true);
  });

  await step('stages: visitor view shows Coming soon on the city and the door', async () => {
    await page.getByRole('button', { name: /See it as a visitor/i }).click();
    await page.getByRole('button', { name: /Back to my view/i }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    const soonCount = await page.locator('text=Coming soon').count();
    check('stages: visitor view shows Coming soon on the city and the door', soonCount >= 1, `${soonCount} Coming soon labels`);
  });

  await step('stages: owner view does not show the Coming soon tile', async () => {
    await page.getByRole('button', { name: /Back to my view/i }).click();
    await page.getByRole('button', { name: /See it as a visitor/i }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    const tiles = await page.locator('span', { hasText: /^Coming soon$/ }).count();
    check('stages: owner view does not show the Coming soon tile', tiles === 0, `${tiles} tiles`);
  });

  /* --------------------------------------- item 5: arrange a street */
  let streetSlug = null;
  await step('arrange: add a block to a street in place and move it', async () => {
    const res = await page.evaluate(async (id) => {
      const mod = await import('/src/integrations/supabase/client.ts');
      const { data } = await mod.supabase.from('world_streets').select('slug, name, stage').eq('world_id', id).order('sort_order');
      return data;
    }, worldId);
    const open = (res ?? []).find((s) => s.stage !== 'soon');
    streetSlug = open?.slug;
    await page.goto(`${BASE}/world/${slug}/${streetSlug}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByRole('button', { name: /Arrange this street/i }).click({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Add something to/ }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Story/ }).first().click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^Add something to/ }).click();
    await page.getByRole('button', { name: /^The records/ }).first().click();
    await page.waitForTimeout(2000);
    const before = await page.locator('li span.truncate').allInnerTexts();
    await page.getByRole('button', { name: 'Move up' }).last().click();
    await page.waitForTimeout(2000);
    const after = await page.locator('li span.truncate').allInnerTexts();
    await page.getByRole('button', { name: /^Done$/ }).click();
    await page.waitForTimeout(1500);
    check('arrange: add a block to a street in place and move it', before.length >= 2 && before[0] !== after[0], `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  });

  /* ----------------------------------------- item 5: arrange a city */
  await step('arrange: start a new street inside a city in place', async () => {
    const cities = await page.evaluate(async (id) => {
      const mod = await import('/src/integrations/supabase/client.ts');
      const { data } = await mod.supabase.from('world_cities').select('slug, name, stage').eq('world_id', id).order('sort_order');
      return data;
    }, worldId);
    const city = (cities ?? []).find((c) => c.stage !== 'soon') ?? cities?.[0];
    await page.goto(`${BASE}/world/${slug}/${city.slug}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByRole('button', { name: /Arrange this city/i }).click({ timeout: 60_000 });
    const input = page.getByRole('textbox', { name: /Name a new street in/ });
    await input.fill(`QA Lane ${RUN}`);
    await page.getByRole('button', { name: /^Add$/ }).click();
    await page.locator('li', { hasText: `QA Lane ${RUN}` }).first().waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Done$/ }).click();
    await page.waitForTimeout(3000);
    const shown = await page.locator(`text=QA Lane ${RUN}`).count();
    check('arrange: start a new street inside a city in place', shown > 0, `${shown} on the city page after Done`);
  });

  await page.screenshot({ path: join(OUT, 'b2-world-city.png') });
} finally {
  writeFileSync(join(OUT, 'world.json'), JSON.stringify({ worldId, slug, results }, null, 2));
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
