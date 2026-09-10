import { useCallback, useEffect, useState } from 'react';
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

/** Google's four-colour G, drawn here so the button needs nothing from Google to look right. */
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
 * "Continue with Google", the way that always works, plus One Tap when it can.
 *
 * The button is ours and it goes through Supabase's ordinary Google sign-in:
 * a hop to accounts.google.com and back to the page. That path depends on
 * nothing loading on our page, works on every browser that can reach
 * Google, and the auth logs show it completing. It used to sit behind
 * Google's own scripted button, which could arrive late, draw nothing when
 * the origin was not on Google's list, or silently do nothing in a webview;
 * each of those looked like a broken button.
 *
 * One Tap is the extra: Google's script is loaded in the background and,
 * where the browser and the person's Google session allow it, the prompt
 * appears and signs them in with an ID token (nonce-checked by Supabase).
 * If it never appears, nothing is missing; the button is right there.
 *
 * Inside another app's built-in browser Google refuses to sign anyone in,
 * so there the button is replaced by a line that says to open a real
 * browser, and the email form below still works.
 */
export function GoogleSignIn({ oneTap = true, onError }: GoogleSignInProps) {
  const [verifying, setVerifying] = useState(false);
  const [webview] = useState(inAppBrowser);

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

  // One Tap, in the background, never in the way.
  useEffect(() => {
    if (!oneTap || webview || !isSupabaseConfigured || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    (async () => {
      try {
        await loadGsi();
        if (cancelled || !window.google?.accounts?.id) return;
        const rawNonce = crypto.randomUUID().replace(/-/g, '');
        const hashedNonce = await sha256Hex(rawNonce);
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
          itp_support: true,
          cancel_on_tap_outside: false,
        });
        window.google.accounts.id.prompt();
      } catch {
        /* Script blocked or refused: the button is right there. */
      }
    })();
    return () => {
      cancelled = true;
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
      <button
        type="button"
        onClick={redirectSignIn}
        disabled={verifying}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-border bg-background text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
      >
        <GoogleMark className="h-4 w-4" />
        Continue with Google
      </button>

      {verifying && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-foreground">Signing you in with Google...</span>
        </div>
      )}
    </div>
  );
}
