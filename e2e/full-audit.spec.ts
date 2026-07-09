import { test, expect, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const _dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:4173';
const SS_DIR = join(_dirname, '../e2e-audit/screenshots');

async function ss(page: Page, name: string) {
  await page.screenshot({ path: `${SS_DIR}/${name}.png`, fullPage: false });
}

async function waitForApp(page: Page) {
  // Wait for the root to have content (not just spinner)
  await page.waitForFunction(() => {
    const root = document.getElementById('root');
    return root && root.children.length > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(800);
}

// ─── MOBILE VIEWPORT ──────────────────────────────────────────────────────────
test.describe('MOBILE (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('M-01 · Page load & browser title', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const title = await page.title();
    console.log('TITLE:', title);
    expect(title).not.toContain('Audience');
    expect(title).not.toContain('—');
    await ss(page, 'M01-title-and-load');
  });

  test('M-02 · Auth / Onboarding gate visible', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    await ss(page, 'M02-auth-gate');
    // Should show sign-in OR onboarding OR home (if cookies persist)
    const body = await page.content();
    const hasAuth = body.includes('Sign') || body.includes('sign') || body.includes('Onboard') || body.includes('Connect') || body.includes('Welcome') || body.includes('Hot Today') || body.includes('ongChainn');
    expect(hasAuth).toBe(true);
  });

  test('M-03 · Auth page — email sign-in form visible', async ({ page }) => {
    await page.goto(`${BASE}/auth`);
    await waitForApp(page);
    await ss(page, 'M03-auth-page');
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput.first()).toBeVisible({ timeout: 8000 });
    await expect(passwordInput.first()).toBeVisible({ timeout: 8000 });
  });

  test('M-04 · Home page renders after bypass', async ({ page }) => {
    // Simulate already-logged-in state by checking if home renders with music
    await page.goto(`${BASE}/?bypass_onboarding=true`);
    await waitForApp(page);
    await ss(page, 'M04-home-mobile');
    // Check for key home page sections
    const content = await page.content();
    console.log('HOME content includes Navigation:', content.includes('ongChainn'));
  });

  test('M-05 · Bottom tab bar visible on mobile', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Bottom tab bar should be present (it hides when song plays)
    const tabBar = page.locator('nav.fixed.bottom-0');
    await ss(page, 'M05-bottom-tabbar');
    const tabBarCount = await tabBar.count();
    console.log('Bottom tab bar elements:', tabBarCount);
  });

  test('M-06 · Search button visible in nav', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const searchBtn = page.locator('button[aria-label="Search"], button:has-text("Search")').first();
    const searchBtnCount = await searchBtn.count();
    console.log('Search buttons found:', searchBtnCount);
    await ss(page, 'M06-search-btn');
  });

  test('M-07 · Search modal opens and shows input', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Click search in nav
    const searchBtn = page.locator('button[aria-label="Search"]').first();
    if (await searchBtn.count() > 0) {
      await searchBtn.click();
      await page.waitForTimeout(500);
      await ss(page, 'M07-search-modal-open');
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      const inputCount = await searchInput.count();
      console.log('Search input in modal:', inputCount);
      if (inputCount > 0) {
        await searchInput.fill('Sanchy');
        await page.waitForTimeout(400);
        await ss(page, 'M07b-search-results');
        const results = page.locator('[role="dialog"] li, [role="dialog"] button').filter({ hasText: /Sanchy|sanchy/i });
        console.log('Search results for Sanchy:', await results.count());
      }
      // Close modal
      await page.keyboard.press('Escape');
    } else {
      console.log('WARN: Search button not found in nav');
    }
  });
});

// ─── DESKTOP VIEWPORT ─────────────────────────────────────────────────────────
test.describe('DESKTOP (1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('D-01 · Home page full render', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    await ss(page, 'D01-home-desktop');
    const title = await page.title();
    console.log('Desktop title:', title);
    expect(title).toBe('$ONGCHAINN');
  });

  test('D-02 · Top navigation has Search button', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const searchBtn = page.locator('button[aria-label="Search"], header button:has-text("Search")').first();
    const count = await searchBtn.count();
    console.log('Desktop nav search buttons:', count);
    await ss(page, 'D02-nav-search');
    expect(count).toBeGreaterThan(0);
  });

  test('D-03 · Search modal — auto-suggest works', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const searchBtn = page.locator('button[aria-label="Search"]').first();
    await searchBtn.click();
    await page.waitForTimeout(400);
    const input = page.locator('input[placeholder*="Search"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });

    // Type artist name
    await input.fill('7ROO7H');
    await page.waitForTimeout(300);
    await ss(page, 'D03-search-7roo7h');
    const listItems = page.locator('[role="dialog"] ul li');
    const count = await listItems.count();
    console.log('Search results for 7ROO7H:', count);

    // Type song fragment
    await input.fill('flex');
    await page.waitForTimeout(300);
    await ss(page, 'D03b-search-flex');
    const flexCount = await page.locator('[role="dialog"] ul li').count();
    console.log('Search results for flex:', flexCount);
    await page.keyboard.press('Escape');
  });

  test('D-04 · Home Quick Actions — Search replaces WaveWarz', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Check Quick Actions section
    const quickActions = page.locator('text=Quick Actions').first();
    const count = await quickActions.count();
    console.log('Quick Actions header count:', count);
    const wavewarz = await page.locator('text=WaveWarz Africa').count();
    const searchAction = await page.locator('section:has-text("Quick Actions") button:has-text("Search"), section:has-text("Quick Actions") div:has-text("Search")').count();
    console.log('WaveWarz Africa still in quick actions:', wavewarz, '  Search action in quick actions:', searchAction);
    await ss(page, 'D04-quick-actions');
    expect(wavewarz).toBe(0);
  });

  test('D-05 · Hot Today section', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const hotToday = page.locator('text=Hot Today').first();
    const htCount = await hotToday.count();
    console.log('Hot Today section:', htCount);
    await ss(page, 'D05-hot-today');
  });

  test('D-06 · New Releases section', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const newReleases = page.locator('text=New Releases').first();
    const nrCount = await newReleases.count();
    console.log('New Releases section:', nrCount);
    await ss(page, 'D06-new-releases');
  });

  test('D-07 · Music playback — play a song', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Find a play button or song card
    const playBtn = page.locator('button[aria-label*="play" i], button[aria-label*="Play" i], [data-testid*="play"]').first();
    const songCard = page.locator('.glass-card, [class*="song-card"]').first();
    const playCircle = page.locator('svg').filter({ has: page.locator('path[d*="M"]') }).first();

    // Try clicking first SongCard
    const songCards = page.locator('button, div[class*="cursor-pointer"]').filter({ has: page.locator('svg[data-lucide="play"], svg[data-lucide="pause"]') });
    const scCount = await songCards.count();
    console.log('Clickable song elements with play/pause:', scCount);

    // Click first play-circle icon button
    const playIcons = page.locator('button').filter({ has: page.locator('[class*="play"], [class*="Play"]') });
    if (await playIcons.count() > 0) {
      await playIcons.first().click();
      await page.waitForTimeout(1500);
      await ss(page, 'D07-song-playing');
      // Audio player should appear
      const audioPlayer = page.locator('[class*="AudioPlayer"], [class*="audio-player"], footer').first();
      console.log('Audio player visible:', await audioPlayer.count() > 0);
    } else {
      console.log('WARN: No play buttons found');
      await ss(page, 'D07-no-play-found');
    }
  });

  test('D-08 · Audio player controls', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Look for AudioPlayer component
    const audioPlayer = page.locator('[class*="AudioPlayer"], audio[src]').first();
    const audioElem = page.locator('audio');
    console.log('Audio elements on page:', await audioElem.count());
    await ss(page, 'D08-audio-player');
  });

  test('D-09 · Artists page loads', async ({ page }) => {
    await page.goto(`${BASE}/artists`);
    await waitForApp(page);
    await ss(page, 'D09-artists-page');
    const content = await page.content();
    const hasArtists = content.includes('7ROO7H') || content.includes('NDA') || content.includes('Sanchy') || content.includes('artist') || content.includes('Artist');
    console.log('Artists page has artist data:', hasArtists);
  });

  test('D-10 · Artist detail page loads without crash', async ({ page }) => {
    // Navigate to first artist
    await page.goto(`${BASE}/artist/1`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await ss(page, 'D10-artist-detail');
    // Should NOT show error boundary crash
    const crashed = await page.locator('text=Something went wrong, text=Error, text=crashed').count();
    const notFound = await page.locator('text=Artist Not Found').count();
    const content = await page.content();
    console.log('Artist detail crashed:', crashed, '  Not found:', notFound);
    console.log('Has artist content:', content.includes('Follow') || content.includes('Songs') || content.includes('Streams'));
  });

  test('D-11 · Artist skeleton shows while loading', async ({ page }) => {
    // Slow network simulation
    await page.route('**/supabase**', async (route) => {
      await new Promise(r => setTimeout(r, 2000));
      await route.continue();
    });
    await page.goto(`${BASE}/artist/1`);
    await page.waitForTimeout(500);
    await ss(page, 'D11-artist-loading-skeleton');
    await page.unrouteAll();
  });

  test('D-12 · Community page loads with profiles', async ({ page }) => {
    await page.goto(`${BASE}/community`);
    await waitForApp(page);
    await page.waitForTimeout(3000);
    await ss(page, 'D12-community-page');
    const memberBadge = page.locator('text=members').first();
    console.log('Community members badge:', await memberBadge.count());
    const profileCards = page.locator('.glass-card').count();
    console.log('Profile cards on community:', await profileCards);
  });

  test('D-13 · Community search works', async ({ page }) => {
    await page.goto(`${BASE}/community`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    const searchInput = page.locator('input[placeholder*="Search members"]').first();
    const count = await searchInput.count();
    console.log('Community search input:', count);
    if (count > 0) {
      await searchInput.fill('test');
      await page.waitForTimeout(400);
      await ss(page, 'D13-community-search');
    }
  });

  test('D-14 · Community sort tabs', async ({ page }) => {
    await page.goto(`${BASE}/community`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    console.log('Community sort tabs:', tabCount);
    // Click "Newest"
    const newestTab = page.locator('[role="tab"]:has-text("Newest")').first();
    if (await newestTab.count() > 0) {
      await newestTab.click();
      await page.waitForTimeout(400);
      await ss(page, 'D14-community-newest-tab');
    }
  });

  test('D-15 · Social feed loads', async ({ page }) => {
    await page.goto(`${BASE}/social`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await ss(page, 'D15-social-feed');
    const content = await page.content();
    console.log('Social page has feed:', content.includes('post') || content.includes('Post') || content.includes('Feed') || content.includes('Social'));
  });

  test('D-16 · Discover page loads', async ({ page }) => {
    await page.goto(`${BASE}/discover`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await ss(page, 'D16-discover-page');
    const content = await page.content();
    console.log('Discover has genres/catalogs:', content.includes('Catalog') || content.includes('catalog') || content.includes('Genre'));
  });

  test('D-17 · DJ Shuffle page loads', async ({ page }) => {
    await page.goto(`${BASE}/dj-shuffle`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await ss(page, 'D17-dj-shuffle');
    const content = await page.content();
    console.log('DJ Shuffle loaded:', content.includes('Shuffle') || content.includes('shuffle') || content.includes('DJ'));
  });

  test('D-18 · The Room page loads', async ({ page }) => {
    await page.goto(`${BASE}/room`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await ss(page, 'D18-room-page');
    const content = await page.content();
    console.log('Room page loaded:', content.includes('Room') || content.includes('room') || content.includes('Live'));
  });

  test('D-19 · Playlists page loads', async ({ page }) => {
    await page.goto(`${BASE}/playlists`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await ss(page, 'D19-playlists-page');
    const content = await page.content();
    console.log('Playlists page loaded:', content.includes('Playlist') || content.includes('playlist'));
  });

  test('D-20 · Marketplace page loads', async ({ page }) => {
    await page.goto(`${BASE}/marketplace`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await ss(page, 'D20-marketplace');
    const content = await page.content();
    console.log('Marketplace loaded:', content.includes('Marketplace') || content.includes('marketplace') || content.includes('Buy') || content.includes('mint'));
  });

  test('D-21 · Profile page loads', async ({ page }) => {
    await page.goto(`${BASE}/profile`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await ss(page, 'D21-profile-page');
    const content = await page.content();
    console.log('Profile page loaded:', content.includes('Profile') || content.includes('profile') || content.includes('Sign') || content.includes('sign'));
  });

  test('D-22 · About page loads', async ({ page }) => {
    await page.goto(`${BASE}/about`);
    await waitForApp(page);
    await page.waitForTimeout(1000);
    await ss(page, 'D22-about-page');
    const content = await page.content();
    console.log('About page loaded:', content.includes('About') || content.includes('about') || content.includes('Phase'));
  });

  test('D-23 · 404 / NotFound page', async ({ page }) => {
    await page.goto(`${BASE}/this-page-does-not-exist`);
    await waitForApp(page);
    await page.waitForTimeout(800);
    await ss(page, 'D23-404-page');
    const content = await page.content();
    console.log('404 content mentions not found:', content.includes('Not Found') || content.includes('404') || content.includes('not found') || content.includes("doesn't exist"));
  });

  test('D-24 · Navigation links all work', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const navLinks = ['/discover', '/artists', '/room', '/community', '/social'];
    for (const link of navLinks) {
      await page.goto(`${BASE}${link}`);
      await waitForApp(page);
      await page.waitForTimeout(600);
      const crashed = await page.locator('text=Something went wrong').count();
      if (crashed > 0) {
        console.log(`CRASH on ${link}`);
        await ss(page, `D24-crash-${link.replace('/', '')}`);
      } else {
        console.log(`✅ ${link} loaded OK`);
      }
    }
  });

  test('D-25 · Console errors audit', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`PAGE ERROR: ${err.message}`));

    await page.goto(BASE);
    await waitForApp(page);
    await page.waitForTimeout(3000);

    console.log('Console errors on home:', errors.length);
    console.log('Console warnings on home:', warnings.length);
    errors.slice(0, 10).forEach(e => console.log('ERROR:', e));
    warnings.slice(0, 5).forEach(w => console.log('WARN:', w));
    await ss(page, 'D25-console-audit');
  });

  test('D-26 · Catalog detail page loads', async ({ page }) => {
    await page.goto(`${BASE}/catalog/1`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await ss(page, 'D26-catalog-detail');
    const content = await page.content();
    console.log('Catalog detail loaded:', content.includes('catalog') || content.includes('Catalog') || content.includes('Songs') || content.includes('Track'));
  });

  test('D-27 · WaveWarz page loads', async ({ page }) => {
    await page.goto(`${BASE}/wavewarz-africa`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await ss(page, 'D27-wavewarz');
    const content = await page.content();
    console.log('WaveWarz page:', content.includes('WaveWarz') || content.includes('Battle') || content.includes('wavewarz'));
  });

  test('D-28 · Inbox page loads', async ({ page }) => {
    await page.goto(`${BASE}/inbox`);
    await waitForApp(page);
    await page.waitForTimeout(1000);
    await ss(page, 'D28-inbox');
    const content = await page.content();
    console.log('Inbox loaded:', content.includes('Inbox') || content.includes('inbox') || content.includes('Message') || content.includes('Notification'));
  });

  test('D-29 · PWA manifest & service worker', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const manifestLink = await page.$('link[rel="manifest"]');
    const hasManifest = !!manifestLink;
    console.log('PWA manifest link present:', hasManifest);
    const swRegistered = await page.evaluate(() => {
      return navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : 0;
    });
    console.log('Service worker registrations:', swRegistered);
    await ss(page, 'D29-pwa');
  });

  test('D-30 · Repeat & shuffle buttons in audio player', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Try to trigger audio player by clicking a song
    const hotSongs = page.locator('.glass-card button').first();
    if (await hotSongs.count() > 0) {
      await hotSongs.click();
      await page.waitForTimeout(1200);
    }
    await ss(page, 'D30-audio-controls');
    const repeatBtn = page.locator('button[aria-label*="repeat" i], button[title*="repeat" i]');
    const shuffleBtn = page.locator('button[aria-label*="shuffle" i], button[title*="shuffle" i]');
    console.log('Repeat button:', await repeatBtn.count());
    console.log('Shuffle button:', await shuffleBtn.count());
  });

  test('D-31 · Share buttons on song cards', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const shareBtn = page.locator('button[aria-label*="share" i], button:has-text("Share")').first();
    console.log('Share buttons:', await shareBtn.count());
    await ss(page, 'D31-share-buttons');
  });

  test('D-32 · Like button on song cards', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const heartBtn = page.locator('button').filter({ has: page.locator('svg[data-lucide="heart"], [class*="Heart"]') }).first();
    const heartCount = await heartBtn.count();
    console.log('Heart/like buttons:', heartCount);
    await ss(page, 'D32-like-buttons');
    if (heartCount > 0) {
      await heartBtn.click();
      await page.waitForTimeout(500);
      await ss(page, 'D32b-after-like');
    }
  });

  test('D-33 · Install / Download banner', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    const banner = page.locator('[class*="DownloadApp"], [class*="install"], button:has-text("Install"), button:has-text("Add to Home")').first();
    console.log('Install banner/button:', await banner.count());
    await ss(page, 'D33-install-banner');
  });

  test('D-34 · Mo$ha AI chat button', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    const moshaBtn = page.locator('button:has-text("Mo$ha"), button:has-text("Mosha"), button:has-text("Call Mo$ha")').first();
    const count = await moshaBtn.count();
    console.log('Mo$ha button count:', count);
    await ss(page, 'D34-mosha');
    if (count > 0) {
      await moshaBtn.click();
      await page.waitForTimeout(800);
      await ss(page, 'D34b-mosha-open');
    }
  });

  test('D-35 · Offline indicator component exists', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Check offline indicator is in DOM (even if hidden)
    const offline = page.locator('[class*="OfflineIndicator"], [class*="offline"]');
    console.log('Offline indicator in DOM:', await offline.count());
    await ss(page, 'D35-offline-indicator');
  });

  test('D-36 · Farcaster meta tag present', async ({ page }) => {
    await page.goto(BASE);
    const fcMeta = await page.$('meta[name="fc:frame"]');
    const hasFcMeta = !!fcMeta;
    console.log('Farcaster fc:frame meta tag:', hasFcMeta);
    const content = await fcMeta?.getAttribute('content') || 'not found';
    console.log('fc:frame content:', content.slice(0, 100));
    expect(hasFcMeta).toBe(true);
  });

  test('D-37 · OG / social meta tags', async ({ page }) => {
    await page.goto(BASE);
    const ogTitle = await page.$eval('meta[property="og:title"]', el => el.getAttribute('content')).catch(() => 'not found');
    const ogDesc = await page.$eval('meta[property="og:description"]', el => el.getAttribute('content')).catch(() => 'not found');
    const twitterTitle = await page.$eval('meta[name="twitter:title"]', el => el.getAttribute('content')).catch(() => 'not found');
    console.log('og:title:', ogTitle);
    console.log('og:description:', ogDesc);
    console.log('twitter:title:', twitterTitle);
    expect(ogTitle).not.toContain('Audience-First');
    expect(twitterTitle).not.toContain('Audience-First');
  });

  test('D-38 · Reset password page', async ({ page }) => {
    await page.goto(`${BASE}/reset-password`);
    await waitForApp(page);
    await page.waitForTimeout(800);
    await ss(page, 'D38-reset-password');
    const content = await page.content();
    console.log('Reset password page:', content.includes('password') || content.includes('Password') || content.includes('reset') || content.includes('Reset'));
  });

  test('D-39 · Navigation no JS errors on scroll', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(BASE);
    await waitForApp(page);
    // Scroll down the page
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    console.log('JS errors during scroll:', errors.length, errors.join(' | '));
    await ss(page, 'D39-scroll-test');
  });

  test('D-40 · Install page', async ({ page }) => {
    await page.goto(`${BASE}/install`);
    await waitForApp(page);
    await page.waitForTimeout(800);
    await ss(page, 'D40-install-page');
    const content = await page.content();
    console.log('Install page loaded:', content.includes('Install') || content.includes('install') || content.includes('Download') || content.includes('PWA'));
  });
});

// ─── MOBILE DEEP TESTS ────────────────────────────────────────────────────────
test.describe('MOBILE DEEP (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('M-10 · Search in bottom tab bar', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Bottom tab bar search
    const tabSearch = page.locator('nav.fixed button:has-text("Search")').first();
    const tabSearchCount = await tabSearch.count();
    console.log('Search in bottom tab bar:', tabSearchCount);
    await ss(page, 'M10-bottom-tab-search');
    if (tabSearchCount > 0) {
      await tabSearch.click();
      await page.waitForTimeout(500);
      await ss(page, 'M10b-search-modal-from-tab');
      const modal = page.locator('[role="dialog"]').first();
      console.log('Modal opened from tab search:', await modal.count() > 0);
      await page.keyboard.press('Escape');
    }
  });

  test('M-11 · Mobile home quick actions', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Quick Actions grid
    const quickActions = page.locator('text=Quick Actions');
    console.log('Quick Actions on mobile:', await quickActions.count());
    await ss(page, 'M11-quick-actions-mobile');
    // Search should be there, WaveWarz should not
    const ww = await page.locator('text=WaveWarz Africa').count();
    console.log('WaveWarz Africa still visible:', ww);
    expect(ww).toBe(0);
  });

  test('M-12 · Artist detail mobile render', async ({ page }) => {
    await page.goto(`${BASE}/artist/1`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await ss(page, 'M12-artist-mobile');
    const crashed = await page.locator('text=Something went wrong').count();
    console.log('Artist page crashed on mobile:', crashed);
  });

  test('M-13 · Community page mobile', async ({ page }) => {
    await page.goto(`${BASE}/community`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await ss(page, 'M13-community-mobile');
  });

  test('M-14 · Viewport width breakpoint check', async ({ page }) => {
    await page.goto(BASE);
    await waitForApp(page);
    // Desktop nav should be hidden on mobile
    const desktopNav = page.locator('nav.hidden.xl\\:flex, nav.hidden.lg\\:flex');
    console.log('Desktop nav hidden on mobile (expected hidden):', await desktopNav.count());
    // Bottom tab bar should be visible
    const bottomTab = page.locator('nav.lg\\:hidden, nav.fixed.bottom-0');
    console.log('Mobile bottom bar visible:', await bottomTab.count());
    await ss(page, 'M14-responsive');
  });
});
