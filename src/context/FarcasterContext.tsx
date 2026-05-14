import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useFarcaster } from '@/hooks/useFarcaster';
import { useAuth } from '@/context/AuthContext';
import type { MiniAppContext } from '@farcaster/miniapp-core';
import sdk from '@farcaster/miniapp-sdk';

interface FarcasterContextType {
  isInFarcaster: boolean;
  context: MiniAppContext | null;
  quickAuthFailed: boolean;
}

const FarcasterContext = createContext<FarcasterContextType>({
  isInFarcaster: false,
  context: null,
  quickAuthFailed: false,
});

export function FarcasterProvider({ children }: { children: ReactNode }) {
  const state = useFarcaster();
  const { user, signInWithFarcasterToken, isLoading } = useAuth();
  const attemptedRef = useRef(false);
  const [quickAuthFailed, setQuickAuthFailed] = useState(false);

  // Start quickAuth as early as possible — fires the moment isInFarcaster becomes
  // true, before Auth.tsx renders, cutting seconds off sign-in time.
  // On failure, sets quickAuthFailed so Auth.tsx can surface the manual button.
  useEffect(() => {
    if (!state.isInFarcaster || user || isLoading || attemptedRef.current) return;
    attemptedRef.current = true;

    const quickAuth = (sdk as any).quickAuth;
    if (!quickAuth?.getToken) {
      setQuickAuthFailed(true);
      return;
    }

    quickAuth.getToken()
      .then(({ token }: { token: string }) => signInWithFarcasterToken(token))
      .catch(() => setQuickAuthFailed(true));
  }, [state.isInFarcaster, user, isLoading, signInWithFarcasterToken]);

  const value: FarcasterContextType = { ...state, quickAuthFailed };
  return <FarcasterContext.Provider value={value}>{children}</FarcasterContext.Provider>;
}

export function useFarcasterContext(): FarcasterContextType {
  return useContext(FarcasterContext);
}
