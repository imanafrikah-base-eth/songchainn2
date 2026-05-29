import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useFarcaster, requestFarcasterSignIn } from '@/hooks/useFarcaster';
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
  const { user, signInWithFarcasterMiniApp, signInWithFarcasterContext } = useAuth();
  const signedInRef = useRef(false);
  const [quickAuthFailed, setQuickAuthFailed] = useState(false);

  // Auto-register FC mini-app users in Supabase so they appear in all app tables.
  // Strategy:
  //   1. Try silent SIWF (sdk.actions.signIn) → real Supabase user + audience_profiles row
  //   2. Fallback: local-only fc-XXX context user (still writes to farcaster_profiles)
  useEffect(() => {
    if (!state.isInFarcaster || user || signedInRef.current) return;
    const fc = state.context?.user;
    if (!fc?.fid) return;
    signedInRef.current = true;

    const fcData = {
      fid: fc.fid,
      username: fc.username,
      displayName: fc.displayName,
      pfpUrl: fc.pfpUrl,
      location: fc.location?.description,
    };

    const doSignIn = async () => {
      // Path 1: Silent SIWF → real Supabase session + full profile registration
      try {
        const { message, signature } = await requestFarcasterSignIn();
        const result = await signInWithFarcasterMiniApp(fcData, message, signature);
        if (!result.error) return; // Success — user is fully registered
      } catch {
        // SIWF failed (network, host doesn't support it, etc.) — use fallback
      }

      // Path 2: Context-only sign-in (writes fc-XXX to localStorage + farcaster_profiles for community)
      const result = await signInWithFarcasterContext(fcData);
      if (result?.error) {
        setQuickAuthFailed(true);
        signedInRef.current = false;
      }
    };

    void doSignIn();
  }, [state.isInFarcaster, state.context, user, signInWithFarcasterMiniApp, signInWithFarcasterContext]);

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
