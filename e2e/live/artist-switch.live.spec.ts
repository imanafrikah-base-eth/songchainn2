import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://www.songchainn.xyz';
const RUN = Date.now().toString(36);
const EMAIL = `qa-switch-${RUN}@songchainn.test`;
const PASSWORD = `Qa-${RUN}-pass!9`;

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  try {
    const m = readFileSync(join(process.cwd(), '.env.local'), 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  } catch { /* none */ }
  return '';
}
const SUPABASE_URL = 'https://wsjhbfmzbonxmxaaassu.supabase.co';
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
async function admin(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) } });
  return { ok: res.ok, status: res.status, body: await res.text() };
}
async function userId(): Promise<string | null> {
  const r = await admin('/auth/v1/admin/users?page=1&per_page=200');
  const users = (JSON.parse(r.body).users ?? []) as Array<{ id: string; email: string }>;
  return users.find((u) => u.email === EMAIL)?.id ?? null;
}

test.describe.configure({ mode: 'serial' });
test.describe('Live: the switch to an artist account', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  let created = false;

  test.afterAll(async () => {
    if (!created || !SERVICE_KEY) return;
    const id = await userId();
    if (!id) return;
    await admin(`/rest/v1/artist_accounts?user_id=eq.${id}`, { method: 'DELETE' });
    await admin(`/rest/v1/artist_claims?user_id=eq.${id}`, { method: 'DELETE' });
    const r = await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
    console.log(`cleanup ${EMAIL}: ${r.status}`);
  });

  test('Signed out, Mo$ha answers with the button', async ({ page }) => {
    await page.goto(BASE);
    const call = page.locator('button', { hasText: 'Call Mo$ha' }).first();
    await expect(call).toBeVisible({ timeout: 30_000 });
    await call.click();
    const box = page.locator('textarea[aria-label="Message Mo$ha"]').first();
    await expect(box).toBeVisible({ timeout: 30_000 });
    await box.fill('How do I switch to my artist account?');
    await box.press('Enter');
    const button = page.locator('a[href="/claim"]', { hasText: 'Switch to artist account' }).first();
    await expect(button).toBeVisible({ timeout: 60_000 });
    const reply = await page.locator('a[href="/claim"]').first().locator('xpath=..').innerText();
    console.log('Mo$ha said:', reply.slice(0, 300).replace(/\n/g, ' '));
  });

  test('A listener: Profile shows the switch, the claim page opens, the Studio is closed', async ({ page }) => {
    await page.goto(`${BASE}/?auth=signup`);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[placeholder="Password"]').first().fill(PASSWORD);
    await page.locator('form button[type="submit"]').first().click();
    const name = page.locator('input[placeholder="Your display name"]');
    await expect(name).toBeVisible({ timeout: 60_000 });
    created = true;
    await name.fill(`QA Switch ${RUN}`);
    const dob = page.locator('input[type="date"]').first();
    if (await dob.count()) await dob.fill('1990-05-05');
    await page.getByRole('button', { name: /Enter \$ongChainn/i }).click();
    await page.waitForTimeout(2000);

    await page.goto(`${BASE}/profile`);
    const switchBtn = page.locator('a[href="/claim"]', { hasText: 'Switch to artist account' }).first();
    await expect(switchBtn).toBeVisible({ timeout: 30_000 });
    await switchBtn.click();
    await expect(page.locator('text=Are you an artist on here?')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('text=N3M3SIS').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Ask for an artist page/i })).toBeVisible();

    await page.goto(`${BASE}/studio`);
    await expect(page.locator('text=The Studio is for artist accounts')).toBeVisible({ timeout: 30_000 });
    expect(await page.locator('input[type="file"]').count()).toBe(0);
  });

  test('Granted: the same account opens the Studio', async ({ page }) => {
    test.skip(!SERVICE_KEY, 'needs the service key to grant');
    const id = await userId();
    expect(id).toBeTruthy();
    const grant = await admin('/rest/v1/artist_accounts', { method: 'POST', body: JSON.stringify({ artist_id: `qa-switch-${RUN}`, user_id: id, is_verified: false }) });
    expect(grant.ok, grant.body).toBe(true);

    await page.goto(`${BASE}/?auth=signin`);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[placeholder="Password"]').first().fill(PASSWORD);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForTimeout(3000);

    await page.goto(`${BASE}/profile`);
    await expect(page.locator('a[href="/studio"]', { hasText: 'Open the Studio' }).first()).toBeVisible({ timeout: 30_000 });
    await page.goto(`${BASE}/studio`);
    await expect(page.locator('input[type="file"]').first()).toBeAttached({ timeout: 30_000 });
    expect(await page.locator('text=The Studio is for artist accounts').count()).toBe(0);
    await page.goto(`${BASE}/claim`);
    await expect(page.locator('text=This is an artist account')).toBeVisible({ timeout: 30_000 });
  });
});
