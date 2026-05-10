import { useEffect, useState } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import type { MiniAppContext } from '@farcaster/miniapp-core';

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
      try {
        const inFarcaster = await sdk.isInMiniApp();
        if (cancelled) return;
        if (inFarcaster) {
          const context = await sdk.context;
          if (!cancelled) setState({ isInFarcaster: true, context });
        }
      } catch {
        // not in Farcaster or SDK unavailable
      } finally {
        if (!cancelled && !sdkReadyCalled) {
          sdkReadyCalled = true;
          sdk.actions.ready();
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
