import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

// OAuth client IDs are public identifiers (they ship in every page load),
// so a baked-in fallback is safe and avoids a hard Vercel env dependency.
const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '541798318088-t7i3uqpdihatrf3530p58qgqpuvdej4n.apps.googleusercontent.com';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/**
 * How long Google's script gets before we stop waiting for it and draw our
 * own button. Long enough for a slow phone on a slow network to load 200KB
 * (a 50 KB/s LTE link in Lusaka needs a good ten seconds); short enough that
 * a person on a browser that blocks the script is not left looking at a hole.
 * A blocked script rejects at once and never waits this long, so the timer
 * only ever fires for the slow case, where the redirect button is the worse
 * answer: it walks a page navigation through the auth server on the same
 * slow link, and that is the one place a raw "site can't be reached" page
 * can appear. If the script arrives after this fires, the proper button
 * replaces the redirect one.
 */
const GSI_PATIENCE_MS = 12000;

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
    // 401 is the healthy answer without an apikey; any HTTP answer means the
    // link carries.
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: controller.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
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
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

interface GoogleSignInProps {
  /** Show the Google One Tap floating prompt in addition to the button */
  oneTap?: boolean;
  onError?: (message: string) => void;
}

/**
 * "Continue with Google", two ways.
 *
 * The first way is Google Identity Services: Google's own script draws the
 * official button and (optionally) the One Tap prompt, and the ID token it
 * hands back is exchanged for a Supabase session with a nonce check. The
 * SHA-256 hash goes to Google, the raw nonce to Supabase.
 *
 * The second way exists because the first one can simply not arrive. Ad
 * blockers, privacy extensions, some corporate networks and the odd browser
 * setting all stop accounts.google.com/gsi/client from loading, and until now
 * the component's answer to that was a blank forty-pixel gap that looked like
 * a bug (the founder saw exactly that). So: while the script is loading there
 * is a visible placeholder, and if it fails or takes too long we draw our own
 * button that goes through Supabase's ordinary OAuth redirect instead. That
 * path needs nothing from Google on our page at all; it walks the person to
 * accounts.google.com and back. Same account, same session, one extra hop.
 */
export function GoogleSignIn({ oneTap = true, onError }: GoogleSignInProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [verifying, setVerifying] = useState(false);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);

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
        options: { redirectTo: `${window.location.origin}/` },
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

  useEffect(() => {
    if (!isSupabaseConfigured || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    const patience = window.setTimeout(() => {
      if (!cancelled) setFallback(true);
    }, GSI_PATIENCE_MS);

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
        });

        if (buttonRef.current) {
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'left',
            width: Math.min(Math.max(buttonRef.current.clientWidth || 340, 200), 400),
          });
        }
        window.clearTimeout(patience);
        setFallback(false);
        setReady(true);

        /* Google can accept the script and still refuse the button: when the
           page's origin is not on the client ID's allowed list (localhost, a
           preview URL, a new domain) it draws an iframe of zero height and
           logs "origin is not allowed" to the console, nothing else. That was
           the blank gap on the founder's PC. So the button is measured once it
           has had a moment to draw, and if there is nothing there, the
           redirect button takes its place. The redirect path is checked by
           Supabase, not by this client ID, so it works on every origin. */
        window.setTimeout(() => {
          if (cancelled) return;
          const h = buttonRef.current?.getBoundingClientRect().height ?? 0;
          if (h < 20) {
            setReady(false);
            setFallback(true);
          }
        }, 1500);

        if (oneTap) {
          window.google.accounts.id.prompt();
        }
      } catch {
        // Script blocked or unavailable: the redirect button takes over.
        if (!cancelled) setFallback(true);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(patience);
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneTap]);

  if (!isSupabaseConfigured || !GOOGLE_CLIENT_ID) return null;

  const showFallback = fallback && !ready;
  const loading = !ready && !fallback;

  return (
    <div className="relative mb-3">
      {/* Google's own button lands in here. Kept in the tree while loading so
          the script has somewhere to draw; hidden only if we gave up on it. */}
      <div
        ref={buttonRef}
        className={`flex justify-center [color-scheme:light] ${showFallback ? 'hidden' : ''}`}
      />

      {loading && (
        <div
          className="flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-muted/40 text-sm text-muted-foreground animate-pulse"
          aria-live="polite"
        >
          <GoogleMark className="h-4 w-4 opacity-60" />
          Loading Google sign-in
        </div>
      )}

      {showFallback && (
        <button
          type="button"
          onClick={redirectSignIn}
          disabled={verifying}
          className="flex h-10 w-full items-center justify-center gap-2.5 rounded-full border border-border bg-background text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
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
