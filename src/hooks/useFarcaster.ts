import { useEffect, useState } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import type { MiniAppContext } from '@farcaster/miniapp-core';

interface FarcasterState {
  isInFarcaster: boolean;
  context: MiniAppContext | null;
}

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
        if (!cancelled) sdk.actions.ready();
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return state;
}
