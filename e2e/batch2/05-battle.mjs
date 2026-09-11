/**
 * Batch 2 browser test, step 5: in-app voice for a WaveWarz battle (item 7).
 *
 *   node e2e/batch2/05-battle.mjs <outDir> <battleId> quote
 *     The host of a Main Stage battle sees the voice card with the $3 price in
 *     $WWAT and the pay button; a listener sees no voice controls yet.
 *
 *   node e2e/batch2/05-battle.mjs <outDir> <battleId> live
 *     With voice switched on for the battle, host and listener both connect to
 *     the room audio, the listener asks to speak, the host approves, and the
 *     listener is brought up to speak.
 *
 * Paying the fee itself needs real $WWAT and is not run here; the switch is
 * flipped on the server between the two modes instead.
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [OUT, BATTLE, MODE] = process.argv.slice(2);
const BASE = 'http://localhost:5173';
const accounts = JSON.parse(readFileSync(join(OUT, 'accounts.json'), 'utf8'));
const owner = accounts.people.find((p) => p.role === 'owner');
const listener = accounts.people.find((p) => p.role === 'listener');
const ROOM = `${BASE}/wavewarz-africa/room/${BATTLE}`;

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
const earCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', storageState: listener.state, permissions: ['microphone'] });
const host = await hostCtx.newPage();
const ear = await earCtx.newPage();
for (const [who, p] of [['host', host], ['listener', ear]]) {
  p.on('pageerror', (e) => console.log(`${who} pageerror: ${e.message.slice(0, 200)}`));
  p.on('response', (r) => {
    const u = r.url();
    if (/livekit-token|battle-voice/.test(u)) console.log(`${who} ${r.status()} ${new URL(u).pathname}`);
  });
}

try {
  if (MODE === 'quote') {
    await step('battle voice: the host sees the $3 $WWAT price and the pay button', async () => {
      await host.goto(ROOM, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await host.locator('text=In-app voice').first().waitFor({ timeout: 90_000 });
      await host.getByRole('button', { name: /Pay \$3 and turn on voice/ }).waitFor({ timeout: 60_000 });
      const copy = await host.locator('div', { has: host.locator('h3', { hasText: 'In-app voice' }) }).last().innerText();
      check('battle voice: the host sees the $3 $WWAT price and the pay button', /\$3 in \$WWAT/.test(copy), copy.replace(/\s+/g, ' ').slice(0, 220));
    });

    await step('battle voice: a listener has no voice controls while it is off', async () => {
      await ear.goto(ROOM, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await ear.locator('text=/Cast Your Vote|Voting Is Closed|Final Score/').first().waitFor({ timeout: 90_000 });
      const request = await ear.getByRole('button', { name: /Request to Speak/ }).count();
      const audio = await ear.locator('text=/Audio On|Audio Reconnecting/').count();
      check('battle voice: a listener has no voice controls while it is off', request === 0 && audio === 0, `request buttons ${request}, audio badges ${audio}`);
    });
  }

  if (MODE === 'live') {
    await step('battle voice: host and listener both connect to the room audio', async () => {
      await host.goto(ROOM, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await ear.goto(ROOM, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await host.locator('text=Audio On').first().waitFor({ timeout: 90_000 });
      await ear.locator('text=Audio On').first().waitFor({ timeout: 90_000 });
      const card = await host.getByRole('button', { name: /turn on voice/i }).count();
      check('battle voice: host and listener both connect to the room audio', card === 0, `voice card still offered: ${card}`);
    });

    await step('battle voice: the listener asks to speak', async () => {
      await ear.getByRole('button', { name: /Request to Speak/ }).click({ timeout: 60_000 });
      await ear.getByRole('button', { name: /Request Sent/ }).waitFor({ timeout: 30_000 });
      check('battle voice: the listener asks to speak', true);
    });

    await step('battle voice: the host approves and the listener is brought up to speak', async () => {
      await host.getByRole('button', { name: /^Approve$/ }).first().click({ timeout: 60_000 });
      await ear.getByRole('button', { name: /Leave Stage/ }).waitFor({ timeout: 60_000 });
      await ear.locator('text=Audio On').first().waitFor({ timeout: 60_000 });
      check('battle voice: the host approves and the listener is brought up to speak', true);
    });

    await host.screenshot({ path: join(OUT, 'b2-battle-host.png') });
    await ear.screenshot({ path: join(OUT, 'b2-battle-speaker.png') });
  }
} finally {
  writeFileSync(join(OUT, `battle-${MODE}.json`), JSON.stringify({ results }, null, 2));
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
