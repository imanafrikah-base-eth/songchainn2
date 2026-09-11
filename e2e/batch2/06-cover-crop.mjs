/**
 * Batch 2 browser test, step 6: any photo can be a cover.
 *
 * N3M3SIS could not put records out because the Studio refused every cover
 * that was not already square and offered no way to crop it. Signed in as the
 * throwaway artist from step 1, this picks a wide picture as the cover and
 * checks that a square window opens, that "Use this" hands back a cover the
 * Studio accepts, and that no refusal is shown. Nothing is uploaded.
 *
 *   node e2e/batch2/06-cover-crop.mjs <outDir>
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

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', storageState: owner.state });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 160)));

try {
  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const coverInput = page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').first();
  await coverInput.waitFor({ state: 'attached', timeout: 120_000 });
  check('the Studio shows the cover picker', true);

  // A wide 1600 by 900 picture, drawn in the page, so no file has to exist on disk.
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2b30';
    g.fillRect(0, 0, 1600, 900);
    g.fillStyle = '#d9d9de';
    g.fillRect(500, 150, 600, 600);
    return c.toDataURL('image/png');
  });
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await coverInput.setInputFiles({ name: 'wide-cover.png', mimeType: 'image/png', buffer });

  const dialog = page.getByRole('dialog', { name: /Make it square/i });
  const opened = await dialog.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
  check('a wide picture opens the square window instead of being refused', opened);

  const refusedEarly = await page.getByText(/Covers have to be square|crop it first/i).count();
  check('the old "crop it first" refusal is gone', refusedEarly === 0, `${refusedEarly} found`);

  if (opened) {
    await page.waitForTimeout(800);
    const box = await dialog.locator('[aria-label="Your cover, drag to fit"]').boundingBox();
    const square = box ? Math.abs(box.width - box.height) <= 2 : false;
    check('the window is square', square, box ? `${Math.round(box.width)} by ${Math.round(box.height)}` : 'no box');
    if (box) {
      // Drag the picture sideways, the way a thumb would.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    await dialog.getByRole('button', { name: /Use this/i }).click();
    const closed = await dialog.waitFor({ state: 'hidden', timeout: 20_000 }).then(() => true).catch(() => false);
    check('"Use this" closes the window', closed);

    await page.waitForTimeout(1500);
    const preview = page.locator('img[src^="blob:"]').first();
    const hasPreview = await preview.count();
    let natural = null;
    if (hasPreview) {
      natural = await preview.evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    }
    check('the cropped cover shows as the preview, square', !!natural && natural.w === natural.h, natural ? `${natural.w} by ${natural.h}` : 'no preview');
    const blocked = await page.getByText(/Covers are square\. Pick the photo again|could not read that image|MB at most/i).count();
    check('the Studio accepts the cropped cover with no refusal', blocked === 0, `${blocked} refusals`);
  }
} finally {
  writeFileSync(join(OUT, 'cover-crop.json'), JSON.stringify({ results }, null, 2));
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
