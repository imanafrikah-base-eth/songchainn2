import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { useFarcaster } from '@/hooks/useFarcaster';
import { useAuth } from '@/context/AuthContext';
import type { MiniAppContext } from '@farcaster/miniapp-core';
import sdk from '@farcaster/miniapp-sdk';

interface FarcasterContextType {
  isInFarcaster: boolean;
  context: MiniAppContext | null;
}

const FarcasterContext = createContext<FarcasterContextType>({
  isInFarcaster: false,
  context: null,
});

export function FarcasterProvider({ children }: { children: ReactNode }) {
  const state = useFarcaster();
  const { user, signInWithFarcasterToken } = useAuth();
  const attemptedRef = useRef(false);

  // Start quickAuth as early as possible — this runs the moment isInFarcaster
  // becomes true, before Auth.tsx even renders, cutting seconds off sign-in time.
  useEffect(() => {
    if (!state.isInFarcaster || user || attemptedRef.current) return;
    attemptedRef.current = true;

    const getToken = (sdk as any).quickAuth?.getToken?.bind((sdk as any).quickAuth);
    if (!getToken) return;

    getToken()
      .then(({ token }: { token: string }) => signInWithFarcasterToken(token))
      .catch(() => {});
  }, [state.isInFarcaster, user, signInWithFarcasterToken]);

  return <FarcasterContext.Provider value={state}>{children}</FarcasterContext.Provider>;
}

export function useFarcasterContext(): FarcasterContextType {
  return useContext(FarcasterContext);
}
