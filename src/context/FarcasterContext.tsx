import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useFarcaster, requestFarcasterSignIn, requestFarcasterQuickAuthToken } from '@/hooks/useFarcaster';
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
  const { user, signInWithFarcasterMiniApp, signInWithFarcasterQuickAuth, signInWithFarcasterContext } = useAuth();
  const signedInRef = useRef(false);
  const [quickAuthFailed, setQuickAuthFailed] = useState(false);
  // Holds the in-flight credential promises so the sign-in completion effect can
  // await them. Both are started up-front so their round-trips overlap sdk.context.
  const quickAuthPromiseRef = useRef<Promise<string | null> | null>(null);
  const siwfPromiseRef = useRef<Promise<{ message: string; signature: string } | null> | null>(null);

  // Kick off credential acquisition as soon as we know we're in a Farcaster frame.
  // Quick Auth is the preferred credential (no signature prompt, verified against
  // Farcaster's JWKS); SIWF is fetched in parallel as the fallback for hosts that
  // don't support Quick Auth.
  useEffect(() => {
    const hasRealSession = user && !user.id?.startsWith('fc-');
    if (!state.isInFarcaster || hasRealSession || quickAuthPromiseRef.current || signedInRef.current) return;

    quickAuthPromiseRef.current = (async () => {
      try {
        return await Promise.race([
          requestFarcasterQuickAuthToken(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
        ]);
      } catch {
        return null;
      }
    })();

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
      // 1. Quick Auth — preferred: no signature prompt, JWKS-verified server-side.
      const token = quickAuthPromiseRef.current ? await quickAuthPromiseRef.current : null;
      if (token) {
        try {
          const result = await signInWithFarcasterQuickAuth(fcData, token);
          if (!result.error) return;
        } catch {
          // fall through to SIWF
        }
      }

      // 2. SIWF — for hosts without Quick Auth. The edge function binds the
      // signature to the FID on-chain, so the fid here cannot be forged.
      const siwf = siwfPromiseRef.current ? await siwfPromiseRef.current : null;
      if (siwf) {
        try {
          const result = await signInWithFarcasterMiniApp(fcData, siwf.message, siwf.signature);
          if (!result.error) return;
        } catch {
          // fall through to context-only
        }
      }

      // 3. Context-only — last resort. Local synthetic fc-XXX identity with NO
      // Supabase session (unverified context can't be traded for one). The user
      // can browse, but DB-backed actions stay gated behind a real sign-in.
      const result = await signInWithFarcasterContext(fcData);
      if (result?.error) {
        setQuickAuthFailed(true);
        signedInRef.current = false;
      }
    };

    void doSignIn();
  }, [state.isInFarcaster, state.context, user, signInWithFarcasterQuickAuth, signInWithFarcasterMiniApp, signInWithFarcasterContext]);

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
