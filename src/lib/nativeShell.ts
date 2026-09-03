// Native shell wiring for the Capacitor Android app.
//
// Everything here is a no-op in the browser, so main.tsx can call it
// unconditionally. Each piece fixes something that makes a wrapped web app
// feel broken on Android:
//
//   1. Splash screen that never hides (we hide it once React has painted)
//   2. Hardware back button that closes the app instead of going back
//   3. External links that load inside the shell and trap the user
//   4. OAuth / magic-link redirects that land in Chrome and never come home
//
// Deep links are handed to React Router by pushing history and firing a
// popstate, which BrowserRouter already listens for. That avoids threading a
// navigate() callback through the provider tree.

import { isNativeApp } from './native';

/** Hosts we own. A link to one of these stays inside the app. */
const INTERNAL_HOSTS = new Set([
  'localhost',
  'songchainn.xyz',
  'www.songchainn.xyz',
  'beta.songchainn.xyz',
]);

function isInternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true; // wallet/mailto/tel schemes
    return INTERNAL_HOSTS.has(url.hostname);
  } catch {
    return true; // relative or unparseable, treat as in-app
  }
}

/** Send an in-app path to React Router without a full page reload. */
function navigateInApp(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function initNativeShell(): Promise<void> {
  if (!isNativeApp()) return;

  const [{ App }, { SplashScreen }, { StatusBar, Style }, { Browser }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
    import('@capacitor/browser'),
  ]);

  // --- Status bar -----------------------------------------------------------
  // Style.Dark means "dark background, light icons", which matches the app.
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0A0A0F' });
  } catch {
    /* some OEM skins reject this; not worth failing startup over */
  }

  // --- Splash ---------------------------------------------------------------
  // launchAutoHide is false in capacitor.config.ts, so this is the only thing
  // that dismisses it. requestAnimationFrame gives React one frame to paint
  // first, which avoids a white flash between splash and app.
  requestAnimationFrame(() => {
    setTimeout(() => {
      SplashScreen.hide().catch(() => {});
    }, 120);
  });

  // --- Hardware back button -------------------------------------------------
  // Default Capacitor behaviour closes the app from any screen. Instead: go
  // back through router history, and only exit when there is nowhere to go.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.pathname !== '/') {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // --- External links -------------------------------------------------------
  // Without this, tapping an external link replaces the app with a webpage and
  // there is no way back. Open those in the system browser instead.
  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (isInternalUrl(href)) return;

      event.preventDefault();
      Browser.open({ url: new URL(href, window.location.href).toString() }).catch(() => {});
    },
    true,
  );

  // --- Deep links / auth return --------------------------------------------
  // Supabase magic links and OAuth redirects come back to songchainn.xyz. The
  // Android App Links filter in AndroidManifest.xml routes those into the app,
  // and this turns the incoming URL into in-app navigation. Auth tokens arrive
  // in the hash or query, so both are preserved.
  App.addListener('appUrlOpen', ({ url }) => {
    try {
      const incoming = new URL(url);
      const path = `${incoming.pathname}${incoming.search}${incoming.hash}`;
      navigateInApp(path || '/');
    } catch {
      /* malformed deep link, ignore rather than crash the shell */
    }
  });
}
