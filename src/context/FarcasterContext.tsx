import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useFarcaster } from '@/hooks/useFarcaster';
import { useAuth } from '@/context/AuthContext';
import type { Context as FarcasterCoreContext } from '@farcaster/miniapp-core';

type MiniAppContext = FarcasterCoreContext.MiniAppContext;

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
  const { user, signInWithFarcasterContext } = useAuth();
  const signedInRef = useRef(false);
  const [quickAuthFailed, setQuickAuthFailed] = useState(false);

  // Trust sdk.context.user for client-side sign-in. Per Farcaster Mini Apps docs,
  // context.user is untrusted (no signature) but fine for UI gating. No backend
  // round-trip, no Supabase OTP — we just unlock the app.
  useEffect(() => {
    if (!state.isInFarcaster || user || signedInRef.current) return;
    const fc = state.context?.user;
    if (!fc?.fid) return;
    signedInRef.current = true;
    void signInWithFarcasterContext({
      fid: fc.fid,
      username: fc.username,
      displayName: fc.displayName,
      pfpUrl: fc.pfpUrl,
      location: fc.location?.description,
    }).then((r) => {
      if (r?.error) {
        setQuickAuthFailed(true);
        signedInRef.current = false;
      }
    });
  }, [state.isInFarcaster, state.context, user, signInWithFarcasterContext]);

  // If we're in Farcaster but context never resolved within ~3s, surface the
  // manual button so the user isn't stranded.
  useEffect(() => {
    if (!state.isInFarcaster || user || state.context?.user) return;
    const t = setTimeout(() => {
      if (!signedInRef.current) setQuickAuthFailed(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [state.isInFarcaster, state.context, user]);

  const value: FarcasterContextType = { ...state, quickAuthFailed };
  return <FarcasterContext.Provider value={value}>{children}</FarcasterContext.Provider>;
}

export function useFarcasterContext(): FarcasterContextType {
  return useContext(FarcasterContext);
}
