import { useEffect, useState } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import type { Context as FarcasterCoreContext } from '@farcaster/miniapp-core';

type MiniAppContext = FarcasterCoreContext.MiniAppContext;

interface FarcasterState {
  isInFarcaster: boolean;
  context: MiniAppContext | null;
}

// Module-level flag so multiple hook instances don't call ready() more than once.
let sdkReadyCalled = false;

export function useFarcaster(): FarcasterState {
  const [state, setState] = useState<FarcasterState>({
    isInFarcaster: false,
    context: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let inFarcaster = false;
      try {
        inFarcaster = await sdk.isInMiniApp();
        if (cancelled) return;
        if (inFarcaster) {
          setState({ isInFarcaster: true, context: null });
        }
      } catch {
        // SDK unavailable or not in a Farcaster client
      } finally {
        // Dismiss the splash screen immediately after frame detection —
        // don't hold it open waiting for sdk.context.
        if (!cancelled && !sdkReadyCalled) {
          sdkReadyCalled = true;
          sdk.actions.ready();
        }
      }

      // Fetch context in the background after the splash is already gone.
      if (inFarcaster && !cancelled) {
        try {
          const context = await sdk.context;
          if (!cancelled) setState({ isInFarcaster: true, context });
        } catch {
          // context unavailable in this client — isInFarcaster stays true
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return state;
}

// Generates a cryptographically random nonce meeting the SIWF ≥ 8-char requirement.
function generateNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Triggers the Farcaster Sign-In flow and returns the SIWE message + signature.
// Must only be called when isInFarcaster is true.
export async function requestFarcasterSignIn(): Promise<{ message: string; signature: string }> {
  const result = await sdk.actions.signIn({ nonce: generateNonce() });
  return { message: result.message, signature: result.signature };
}

// Fetches a Quick Auth JWT from the host. This is the preferred sign-in credential:
// it needs no signature prompt and the server verifies it against Farcaster's JWKS.
// Returns null when the host doesn't support Quick Auth (older clients).
export async function requestFarcasterQuickAuthToken(): Promise<string | null> {
  try {
    const getToken = sdk.quickAuth?.getToken;
    if (typeof getToken !== 'function') return null;
    const result = await sdk.quickAuth.getToken();
    return result?.token ?? null;
  } catch {
    return null;
  }
}
