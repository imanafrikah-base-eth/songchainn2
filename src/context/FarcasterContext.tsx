import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useFarcaster } from '@/hooks/useFarcaster';
import { useAuth } from '@/context/AuthContext';
import { fcAddMiniApp } from '@/lib/farcasterActions';
import type { Context as FarcasterCoreContext } from '@farcaster/miniapp-core';

type MiniAppContext = FarcasterCoreContext.MiniAppContext;

const ADD_MINIAPP_KEY = 'songchainn_fc_add_prompted';

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

  // Once signed in inside Warpcast / Base App, ask the host to add this
  // miniapp to the user's home. The host shows its own native prompt; we
  // only fire it once per FC user (tracked in localStorage).
  useEffect(() => {
    if (!state.isInFarcaster || !user?.id) return;
    let prompted: string | null = null;
    try { prompted = localStorage.getItem(ADD_MINIAPP_KEY); } catch { /* noop */ }
    if (prompted === user.id) return;
    // Defer so we don't compete with the splash-to-app transition.
    const t = setTimeout(() => {
      void fcAddMiniApp().finally(() => {
        try { localStorage.setItem(ADD_MINIAPP_KEY, user.id); } catch { /* noop */ }
      });
    }, 4000);
    return () => clearTimeout(t);
  }, [state.isInFarcaster, user?.id]);

  const value: FarcasterContextType = { ...state, quickAuthFailed };
  return <FarcasterContext.Provider value={value}>{children}</FarcasterContext.Provider>;
}

export function useFarcasterContext(): FarcasterContextType {
  return useContext(FarcasterContext);
}
