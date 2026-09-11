/**
 * Batch 2 browser test, step 3: a world's station, live, with two people (item 6).
 *
 *   - the owner puts the station on air, with Chrome's fake microphone
 *   - a second person sees it go On air and listens live over LiveKit
 *   - each sees the other in the room
 *   - the owner ends the session and keeps it as an episode
 *   - the episode stands on the world page and its audio file is really there
 *
 * The listener has to be able to open a draft world, so the run gives them an
 * editor role on the test world first (drafts are private to their makers).
 *
 *   node e2e/batch2/03-station.mjs <outDir>
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const BASE = 'http://localhost:5173';
const accounts = JSON.parse(readFileSync(join(OUT, 'accounts.json'), 'utf8'));
const { slug } = JSON.parse(readFileSync(join(OUT, 'world.json'), 'utf8'));
const owner = accounts.people.find((p) => p.role === 'owner');
const listener = accounts.people.find((p) => p.role === 'listener');
const RUN = accounts.run;
const TITLE = `QA Session ${RUN}`;
const EPISODE = `QA Episode ${RUN}`;

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

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', storageState: owner.state, permissions: ['microphone'] });
const listenCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', storageState: listener.state });
const host = await hostCtx.newPage();
const ear = await listenCtx.newPage();
for (const [who, p] of [['host', host], ['listener', ear]]) {
  p.on('pageerror', (e) => console.log(`${who} pageerror: ${e.message.slice(0, 200)}`));
  p.on('response', (r) => {
    if (r.url().includes('world-voice-token') || r.url().includes('upload-url') || r.url().includes('upload-relay')) console.log(`${who} ${r.status()} ${new URL(r.url()).pathname}`);
  });
}

try {
  await step('station: owner goes on air', async () => {
    await host.goto(`${BASE}/world/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const titleBox = host.getByRole('textbox', { name: 'Name this session' });
    await titleBox.waitFor({ timeout: 90_000 });
    await titleBox.fill(TITLE);
    await host.getByRole('button', { name: /^Go live$/ }).click();
    await host.getByRole('button', { name: /End the session/ }).waitFor({ timeout: 60_000 });
    const onAir = await host.locator(`text=On air: ${TITLE}`).count();
    check('station: owner goes on air', onAir > 0, `on air label ${onAir}`);
  });

  await step('station: a second person sees it on air and listens live', async () => {
    await ear.goto(`${BASE}/world/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await ear.locator(`text=On air: ${TITLE}`).waitFor({ timeout: 90_000 });
    await ear.getByRole('button', { name: /Listen live/ }).click();
    await ear.getByRole('button', { name: /Stop listening/ }).waitFor({ timeout: 60_000 });
    await ear.locator('text=/1 other person in the room/').waitFor({ timeout: 45_000 });
    check('station: a second person sees it on air and listens live', true);
  });

  await step('station: the host sees the listener arrive', async () => {
    await host.locator('text=/1 other person in the room/').waitFor({ timeout: 45_000 });
    const playing = await ear.evaluate(() => Array.from(document.querySelectorAll('audio')).filter((a) => a.srcObject).length);
    check('station: the host sees the listener arrive', true, `listener has ${playing} live audio element(s)`);
  });

  // Let the recording run long enough to be a real file.
  await host.waitForTimeout(8000);

  await step('station: ending offers to keep it, and keeping it publishes an episode', async () => {
    await host.getByRole('button', { name: /End the session/ }).click();
    await host.locator('text=Keep it as an episode?').waitFor({ timeout: 60_000 });
    await host.getByRole('textbox', { name: 'Name the episode' }).fill(EPISODE);
    await host.getByRole('button', { name: /^Keep it$/ }).click();
    await host.locator('text=Kept. It is in the episodes below.').waitFor({ timeout: 180_000 });
    await host.locator(`text=${EPISODE}`).first().waitFor({ timeout: 30_000 });
    check('station: ending offers to keep it, and keeping it publishes an episode', true);
  });

  await step('station: the listener sees it go off air', async () => {
    await ear.locator('text=Off air right now.').waitFor({ timeout: 60_000 });
    check('station: the listener sees it go off air', true);
  });

  await step('station: the episode is on the world page for others, and its file plays', async () => {
    await ear.reload({ waitUntil: 'domcontentloaded' });
    const row = ear.locator('li', { hasText: EPISODE }).first();
    await row.waitFor({ timeout: 90_000 });
    const src = await row.locator('audio').getAttribute('src');
    const res = await fetch(src, { method: 'HEAD' });
    check('station: the episode is on the world page for others, and its file plays', res.status === 200 && Number(res.headers.get('content-length')) > 1000, `${res.status}, ${res.headers.get('content-length')} bytes, ${res.headers.get('content-type')}`);
  });

  await host.screenshot({ path: join(OUT, 'b2-station-host.png') });
} finally {
  writeFileSync(join(OUT, 'station.json'), JSON.stringify({ results }, null, 2));
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
