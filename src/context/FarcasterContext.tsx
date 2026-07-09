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
  // Holds the in-flight SIWF promise so the sign-in completion effect can await it.
  const siwfPromiseRef = useRef<Promise<{ message: string; signature: string } | null> | null>(null);

  // Kick off SIWF as soon as we know we're in a Farcaster frame — runs in parallel
  // with sdk.context so the two round-trips overlap instead of stacking.
  useEffect(() => {
    const hasRealSession = user && !user.id?.startsWith('fc-');
    if (!state.isInFarcaster || hasRealSession || siwfPromiseRef.current || signedInRef.current) return;
    siwfPromiseRef.current = (async () => {
      try {
        return await Promise.race([
          requestFarcasterSignIn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('siwf:timeout')), 15000)
          ),
        ]);
      } catch {
        return null;
      }
    })();
  }, [state.isInFarcaster, user]);

  // Complete sign-in once sdk.context has resolved and the user's fid is available.
  // By then the SIWF promise (started above) is either already resolved or nearly done.
  useEffect(() => {
    const hasRealSession = user && !user.id?.startsWith('fc-');
    if (!state.isInFarcaster || hasRealSession || signedInRef.current) return;
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
      // Await the already-in-progress SIWF (started in parallel with context fetch).
      // If SIWF finished first this resolves instantly; if context was faster we wait here.
      const siwf = siwfPromiseRef.current ? await siwfPromiseRef.current : null;

      if (siwf) {
        try {
          const result = await signInWithFarcasterMiniApp(fcData, siwf.message, siwf.signature);
          if (!result.error) return;
        } catch {
          // SIWF path failed — fall through to context-only
        }
      }

      // Fallback: context-only sign-in (writes fc-XXX to localStorage + farcaster_profiles)
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
