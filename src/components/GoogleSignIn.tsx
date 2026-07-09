import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

// OAuth client IDs are public identifiers (they ship in every page load),
// so a baked-in fallback is safe and avoids a hard Vercel env dependency.
const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '541798318088-lbu23secpl6fpu6vt3qgg2teecchdfif.apps.googleusercontent.com';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

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

interface GoogleSignInProps {
  /** Show the Google One Tap floating prompt in addition to the button */
  oneTap?: boolean;
  onError?: (message: string) => void;
}

/**
 * "Continue with Google" via Google Identity Services.
 * Renders the official Google button and (optionally) triggers the One Tap
 * prompt. The returned ID token is exchanged for a Supabase session with a
 * nonce check: the SHA-256 hash goes to Google, the raw nonce to Supabase.
 */
export function GoogleSignIn({ oneTap = true, onError }: GoogleSignInProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [verifying, setVerifying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !GOOGLE_CLIENT_ID) return;
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
        setReady(true);

        if (oneTap) {
          window.google.accounts.id.prompt();
        }
      } catch {
        // Network blocked or script unavailable: quietly render nothing.
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
  }, [oneTap]);

  if (!isSupabaseConfigured || !GOOGLE_CLIENT_ID) return null;

  return (
    <div className="relative mb-3">
      <div ref={buttonRef} className="flex justify-center [color-scheme:light]" />
      {verifying && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-foreground">Signing you in with Google...</span>
        </div>
      )}
      {!ready && <div className="h-10" />}
    </div>
  );
}
