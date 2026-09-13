import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

// OAuth client IDs are public identifiers (they ship in every page load),
// so a baked-in fallback is safe and avoids a hard Vercel env dependency.
const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '541798318088-t7i3uqpdihatrf3530p58qgqpuvdej4n.apps.googleusercontent.com';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** How long the auth server gets to answer a probe before we call the link down. */
const REACH_TIMEOUT_MS = 8000;

/** How long Google's own button gets to appear before the redirect button takes its place. */
const GSI_RENDER_TIMEOUT_MS = 4000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

/**
 * Before leaving the page for the redirect flow, make sure the auth server
 * can be reached from this phone right now. The redirect is a page
 * navigation, and if the link cannot carry it the browser shows its own
 * "took too long to respond" page with the Supabase hostname on it; nothing
 * we render can catch that. A probe from here fails inside the app instead,
 * where the message is ours and the person can simply try again.
 */
async function authServerReachable(): Promise<boolean> {
  if (!SUPABASE_URL) return true;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REACH_TIMEOUT_MS);
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: controller.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Google refuses to sign anyone in from inside another app's built-in
 * browser (the one WhatsApp, Facebook, Instagram, TikTok, X and Telegram
 * open links in): it answers "disallowed_useragent" and the person sees a
 * dead end. Better to say so up front and point them at a real browser.
 */
function inAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|TikTok|BytedanceWebview|Snapchat|; wv\)|WebView/i.test(ua);
}

function prefersDark(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.classList.contains('dark') || root.dataset.theme === 'dark') return true;
  if (root.classList.contains('light') || root.dataset.theme === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
}

declare global {
  interface Window {
    google?: any;
  }
}

let gsiLoader: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiLoader) {
    gsiLoader = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gsiLoader = null;
        reject(new Error('Google sign-in failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return gsiLoader;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Google's four-colour G, drawn here so the fallback button needs nothing from Google to look right. */
function GoogleMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

interface GoogleSignInProps {
  /** Also offer Google's One Tap prompt, when the browser and Google allow it. */
  oneTap?: boolean;
  onError?: (message: string) => void;
}

/**
 * "Continue with Google", signed in on OUR page wherever Google allows it.
 *
 * WHY THIS CHANGED (12 Sep 2026). The button used to go through Supabase's
 * redirect: a hop to accounts.google.com and back. Google names whoever
 * receives that hop, so the account chooser said "to continue to
 * wsjhbfmzbonxmxaaassu.supabase.co", which reads like a stranger's site.
 *
 * Now the first choice is Google's own button, drawn by Google's script on
 * this page. Choosing an account opens Google's sign-in window over
 * songchainn.xyz and hands back an ID token, which Supabase checks against a
 * nonce (signInWithIdToken). Google then names this site, or the app name set
 * on the OAuth consent screen once it is verified.
 *
 * The redirect is kept, never removed. The old reason for moving off Google's
 * scripted button still holds: it can arrive late, draw nothing when this
 * origin is missing from the client's Authorised JavaScript origins, or do
 * nothing in a webview. So if Google's button has not drawn within a few
 * seconds, or the script is blocked, our own button appears and uses the
 * redirect, which always works. Nobody is ever left without a way in.
 *
 * Inside another app's built-in browser Google refuses to sign anyone in,
 * so there the button is replaced by a line that says to open a real
 * browser, and the email form below still works.
 */
export function GoogleSignIn({ oneTap = true, onError }: GoogleSignInProps) {
  const [verifying, setVerifying] = useState(false);
  const [webview] = useState(inAppBrowser);
  /** 'loading' until Google's button draws; 'google' once it has; 'fallback' if it never does. */
  const [mode, setMode] = useState<'loading' | 'google' | 'fallback'>('loading');
  const buttonHost = useRef<HTMLDivElement | null>(null);

  const redirectSignIn = useCallback(async () => {
    setVerifying(true);
    try {
      if (!(await authServerReachable())) {
        onError?.('The sign-in server is not answering on this connection. Check your signal and try again, or sign in with your email and password.');
        setVerifying(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        onError?.(error.message);
        setVerifying(false);
      }
      // On success the browser is already leaving for Google.
    } catch (err: any) {
      onError?.(err?.message || 'Google sign-in failed');
      setVerifying(false);
    }
  }, [onError]);

  // Coming back from Google with a complaint in the URL: say it in words
  // instead of leaving a person on a page that did nothing.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const desc = params.get('error_description') || hash.get('error_description') || params.get('error') || hash.get('error');
      if (desc) onError?.(`Google sign-in did not finish: ${decodeURIComponent(desc.replace(/\+/g, ' '))}. Try again, or use your email.`);
    } catch {
      /* nothing to read */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google's own button (and One Tap beside it), with the redirect as the net.
  useEffect(() => {
    if (webview || !isSupabaseConfigured || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    const giveUp = window.setTimeout(() => {
      if (!cancelled) setMode((m) => (m === 'google' ? m : 'fallback'));
    }, GSI_RENDER_TIMEOUT_MS);

    (async () => {
      try {
        await loadGsi();
        if (cancelled || !window.google?.accounts?.id) return;
        const rawNonce = crypto.randomUUID().replace(/-/g, '');
        const hashedNonce = await sha256Hex(rawNonce);
        if (cancelled) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: { credential?: string }) => {
            if (!response?.credential) return;
            setVerifying(true);
            try {
              const { error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
                nonce: rawNonce,
              });
              if (error) onError?.(error.message);
              // Success: AuthContext's onAuthStateChange picks up the session
              // and routes new users into onboarding.
            } catch (err: any) {
              onError?.(err?.message || 'Google sign-in failed');
            } finally {
              setVerifying(false);
            }
          },
          nonce: hashedNonce,
          use_fedcm_for_prompt: true,
          use_fedcm_for_button: true,
          itp_support: true,
          cancel_on_tap_outside: false,
          context: 'signin',
          ux_mode: 'popup',
        });

        const host = buttonHost.current;
        if (host) {
          // Google draws into an iframe; its arrival is the proof the button works
          // on this origin. Watch for it rather than trusting renderButton to throw.
          observer = new MutationObserver(() => {
            if (host.querySelector('iframe')) {
              window.clearTimeout(giveUp);
              if (!cancelled) setMode('google');
              observer?.disconnect();
            }
          });
          observer.observe(host, { childList: true, subtree: true });
          const width = Math.max(200, Math.min(400, Math.floor(host.getBoundingClientRect().width || 320)));
          window.google.accounts.id.renderButton(host, {
            type: 'standard',
            theme: prefersDark() ? 'filled_black' : 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'center',
            width,
          });
        }

        if (oneTap) window.google.accounts.id.prompt();
      } catch {
        /* Script blocked or refused: the redirect button takes over. */
        window.clearTimeout(giveUp);
        if (!cancelled) setMode('fallback');
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
      observer?.disconnect();
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneTap, webview]);

  if (!isSupabaseConfigured || !GOOGLE_CLIENT_ID) return null;

  if (webview) {
    return (
      <p className="mb-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Google sign-in does not work inside this app's browser. Open songchainn.xyz in Chrome or Safari for Google, or use your email below.
      </p>
    );
  }

  return (
    <div className="relative mb-3">
      {/* Google's own button draws in here. Kept mounted (not display:none, which
          would give it no width to draw at) and simply collapsed if it never comes. */}
      <div
        ref={buttonHost}
        className={mode === 'fallback' ? 'h-0 overflow-hidden' : 'flex min-h-11 w-full justify-center'}
        aria-hidden={mode === 'fallback' ? true : undefined}
      />

      {mode === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex h-11 items-center justify-center rounded-full border border-border bg-background">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {mode === 'fallback' && (
        <button
          type="button"
          onClick={redirectSignIn}
          disabled={verifying}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-border bg-background text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
        >
          <GoogleMark className="h-4 w-4" />
          Continue with Google
        </button>
      )}

      {verifying && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-foreground">Signing you in with Google...</span>
        </div>
      )}
    </div>
  );
}
