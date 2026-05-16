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
  const { user, signInWithFarcasterToken, isLoading, createFarcasterProfile } = useAuth();
  const attemptedRef = useRef(false);
  const profileCreatedRef = useRef(false);
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
      .then(async ({ token }: { token: string }) => {
        const result = await signInWithFarcasterToken(token);
        if (result?.error) {
          if (import.meta.env.DEV) console.error('[FarcasterContext] quickAuth sign-in failed:', result.error.message);
          setQuickAuthFailed(true);
        }
      })
      .catch((err: any) => {
        if (import.meta.env.DEV) console.error('[FarcasterContext] quickAuth.getToken failed:', err?.message);
        setQuickAuthFailed(true);
      });
  }, [state.isInFarcaster, user, isLoading, signInWithFarcasterToken]);

  // Once signed in AND context is available, auto-populate the Supabase profile
  // from the user's public Farcaster account — skips onboarding entirely.
  useEffect(() => {
    if (!state.isInFarcaster || !user || !state.context?.user || profileCreatedRef.current) return;
    profileCreatedRef.current = true;
    const fc = state.context.user;
    void createFarcasterProfile({
      fid: fc.fid,
      username: fc.username,
      displayName: fc.displayName,
      pfpUrl: fc.pfpUrl,
      location: state.context.user.location?.description,
    });
  }, [state.isInFarcaster, user, state.context, createFarcasterProfile]);

  const value: FarcasterContextType = { ...state, quickAuthFailed };
  return <FarcasterContext.Provider value={value}>{children}</FarcasterContext.Provider>;
}

export function useFarcasterContext(): FarcasterContextType {
  return useContext(FarcasterContext);
}
