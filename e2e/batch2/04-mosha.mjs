/**
 * Batch 2 browser test, step 4: Mo$ha asks where, then rides along (item 3).
 *
 *   - the owner asks Mo$ha to change their world; he offers "Here in chat" or
 *     "Take me to the page" as buttons
 *   - "Here in chat" opens the world editor right under his message
 *   - asked again, "Take me to the page" goes to the builder with the ride-along card
 *   - the owner changes something on the page, and the card's next line follows on
 *
 * Mo$ha is a language model, so each ask gets a second, plainer try before a
 * missing button is called a failure.
 *
 *   node e2e/batch2/04-mosha.mjs <outDir>
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const BASE = 'http://localhost:5173';
const accounts = JSON.parse(readFileSync(join(OUT, 'accounts.json'), 'utf8'));
const owner = accounts.people.find((p) => p.role === 'owner');

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

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', storageState: owner.state });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`pageerror: ${e.message.slice(0, 200)}`));

async function say(text) {
  const box = page.getByRole('textbox', { name: 'Message Mo$ha' });
  await box.waitFor({ timeout: 60_000 });
  await box.fill(text);
  await box.press('Enter');
}

async function lastMoshaLine() {
  return page.evaluate(() => {
    const bubbles = Array.from(document.querySelectorAll('div.rounded-bl-md'));
    return (bubbles.at(-1)?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300);
  });
}

async function askForChoice(first, second) {
  const choice = page.getByRole('button', { name: 'Take me to the page' });
  const before = await choice.count();
  await say(first);
  try {
    await page.waitForFunction((n) => document.querySelectorAll('button').length && Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Take me to the page').length > n, before, { timeout: 90_000 });
    return true;
  } catch {
    console.log(`  Mo$ha said instead: ${await lastMoshaLine()}`);
    await say(second);
    try {
      await page.waitForFunction((n) => Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Take me to the page').length > n, before, { timeout: 90_000 });
      return true;
    } catch {
      console.log(`  Mo$ha said instead: ${await lastMoshaLine()}`);
      return false;
    }
  }
}

try {
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('songchainn:open-mosha')));

  await step('mosha: offers "Here in chat" or "Take me to the page" for a world change', async () => {
    const shown = await askForChoice(
      'I want to rename the streets in my world.',
      'Help me change my world please. I have not decided where to do it.',
    );
    check('mosha: offers "Here in chat" or "Take me to the page" for a world change', shown, `he said: ${await lastMoshaLine()}`);
  });

  await step('mosha: "Here in chat" opens the world editor under his message', async () => {
    await page.getByRole('button', { name: 'Here in chat' }).last().click();
    await page.getByRole('button', { name: /^Streets$/ }).first().waitFor({ timeout: 45_000 });
    check('mosha: "Here in chat" opens the world editor under his message', true);
  });

  let initial = '';
  await step('mosha: "Take me to the page" opens the builder with him riding along', async () => {
    const shown = await askForChoice(
      'Now I want to change the pictures on my world.',
      'Change the pictures on my world. Where should I do it, here or on the page?',
    );
    if (!shown) throw new Error('no choice offered the second time');
    await page.getByRole('button', { name: 'Take me to the page' }).last().click();
    await page.waitForURL(/world-builder.*guide=1/, { timeout: 60_000 });
    const card = page.locator('text=Mo$ha, on this page with you');
    await card.waitFor({ timeout: 90_000 });
    initial = await page.locator('[role="status"]', { has: card }).locator('p.text-sm').first().innerText();
    check('mosha: "Take me to the page" opens the builder with him riding along', true, `url ${new URL(page.url()).search}`);
  });

  await step('mosha: the card follows on from a change made on the page', async () => {
    await page.getByRole('button', { name: /\. Streets$/ }).first().click();
    await page.waitForTimeout(1500);
    const street = page.locator('li').filter({ has: page.getByRole('group', { name: 'Visitors see' }) }).nth(1);
    await street.getByRole('button', { name: 'Off the map' }).click();
    const cardText = page.locator('[role="status"]', { has: page.locator('text=Mo$ha, on this page with you') }).locator('p.text-sm').first();
    await page.waitForFunction(
      ([sel, start]) => {
        const el = Array.from(document.querySelectorAll('[role="status"]')).find((n) => n.textContent?.includes('on this page with you'));
        const p = el?.querySelector('p.text-sm');
        const t = p?.textContent?.trim() ?? '';
        return t.length > 0 && t !== start;
      },
      ['', initial],
      { timeout: 120_000 },
    );
    const reply = await cardText.innerText();
    check('mosha: the card follows on from a change made on the page', reply !== initial && reply.length > 10, `he said: ${reply.slice(0, 220)}`);
  });

  await page.screenshot({ path: join(OUT, 'b2-mosha-ridealong.png') });
} finally {
  writeFileSync(join(OUT, 'mosha.json'), JSON.stringify({ results }, null, 2));
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
