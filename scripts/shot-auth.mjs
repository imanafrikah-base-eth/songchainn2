// Screenshot a route as a signed-in user, using the inspector session.
// Route and output come from env vars: Git Bash rewrites a leading "/" in an
// argument into a Windows path, which silently corrupts the URL.
import { chromium } from 'playwright';
// ROUTE is given WITHOUT a leading slash: Git Bash rewrites a leading "/"
// into a Windows path even inside an env assignment.
const route = '/' + (process.env.ROUTE ?? '').replace(/^\/+/, '');
const out = process.env.OUT ?? 'shot.png';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({
  viewport: { width: 402, height: 900 }, deviceScaleFactor: 2,
  storageState: process.env.STORAGE ?? '.ui-inspect-session.json',
});
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
await p.goto('http://localhost:5173' + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(9000);
if (process.env.CLICK) {
  const btn = p.getByRole('button', { name: new RegExp(process.env.CLICK, 'i') });
  if (await btn.count()) {
    await btn.first().click();
    // three.js has to load, compile shaders and pull textures over the network.
    await p.waitForTimeout(Number(process.env.CLICK_WAIT ?? 15000));
    console.log('clicked:', process.env.CLICK);
    console.log('canvas present:', await p.locator('canvas').count());
  } else {
    console.log('button not found:', process.env.CLICK);
  }
}
if (process.env.SCROLL_TO) {
  const el = p.locator(process.env.SCROLL_TO).first();
  if (await el.count()) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(8000); }
  else console.log('scroll target not found:', process.env.SCROLL_TO);
}
console.log('h1:', (await p.locator('h1').first().textContent().catch(() => '(none)')) || '(empty)');
console.log('errors:', errs.length ? errs.slice(0, 3).join(' || ') : 'none');
await p.screenshot({ path: out, timeout: 20000, animations: 'disabled' })
  .catch(e => console.log('shot warn:', e.message.slice(0, 60)));
await b.close();
