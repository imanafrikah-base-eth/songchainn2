import type { Database } from '@/integrations/supabase/types';
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { AudienceProfile } from '@/types/database';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { ensureProfile, getProfile, upsertProfile } from '@/lib/localDb';
import { hasWalletProvider, connectWallet, signMessage, generateNonce, selectWallet, subscribeWallets, toChecksumAddress } from '@/lib/baseWallet';

/* The profile row's own Update type, so a write never carries a column the
 * table does not have. Newer supabase-js rejects excess properties at the
 * type level, which is what turned these two writes into failed builds. */
type ProfileUpdate = Database['public']['Tables']['audience_profiles']['Update'];

interface AuthContextType {
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> } | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isArtist: boolean;
  artistId: string | null;
  /** Blue tick. Set by us on the artist_accounts row, never self-declared. */
  isVerifiedArtist: boolean;
  isLoading: boolean;
  audienceProfile: AudienceProfile | null;
  needsOnboarding: boolean;
  walletAddress: string | null;
  isWalletDetected: boolean;
  signInWithWallet: (walletRdns?: string) => Promise<{ error: Error | null }>;
  signInWithFarcasterToken: (token: string) => Promise<{ error: Error | null }>;
  signInWithFarcaster: (message: string, signature: string) => Promise<{ error: Error | null }>;
  signInWithFarcasterContext: (fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string }) => Promise<{ error: Error | null }>;
  signInWithFarcasterMiniApp: (fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string }, message: string, signature: string) => Promise<{ error: Error | null }>;
  signInWithFarcasterQuickAuth: (fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string }, token: string) => Promise<{ error: Error | null }>;
  signInWithFacebook: (fb: { id: string; name: string; email?: string; picture_url?: string; access_token?: string }) => Promise<{ error: Error | null }>;
  signInWithFacebookContext: (fb: { id: string; name: string; email?: string; picture_url?: string }) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Re-read artist_accounts for the signed-in person (after a claim is approved). */
  refreshArtistStatus: () => Promise<void>;
  createFarcasterProfile: (farcasterUser: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string }) => Promise<void>;
}

const FC_USER_KEY = 'songchainn_fc_user';
const FB_USER_KEY = 'songchainn_fb_user';

function isFcUserId(id?: string | null) {
  return !!id && id.startsWith('fc-');
}

function isFbUserId(id?: string | null) {
  return !!id && id.startsWith('fb-');
}

function isSyntheticUserId(id?: string | null) {
  return isFcUserId(id) || isFbUserId(id);
}

function loadFcUserFromStorage(): { user: { id: string; email?: string | null; user_metadata?: Record<string, any> } | null; profile: AudienceProfile | null } {
  try {
    const raw = localStorage.getItem(FC_USER_KEY);
    if (!raw) return { user: null, profile: null };
    const parsed = JSON.parse(raw);
    if (!parsed?.user?.id || !isFcUserId(parsed.user.id)) return { user: null, profile: null };
    return { user: parsed.user, profile: parsed.profile ?? null };
  } catch {
    return { user: null, profile: null };
  }
}

function loadFbUserFromStorage(): { user: { id: string; email?: string | null; user_metadata?: Record<string, any> } | null; profile: AudienceProfile | null } {
  try {
    const raw = localStorage.getItem(FB_USER_KEY);
    if (!raw) return { user: null, profile: null };
    const parsed = JSON.parse(raw);
    if (!parsed?.user?.id || !isFbUserId(parsed.user.id)) return { user: null, profile: null };
    return { user: parsed.user, profile: parsed.profile ?? null };
  } catch {
    return { user: null, profile: null };
  }
}

function buildFbUserAndProfile(fb: { id: string; name: string; email?: string; picture_url?: string }) {
  const syntheticId = `fb-${fb.id}`;
  const user = {
    id: syntheticId,
    email: fb.email ?? null,
    user_metadata: {
      facebook_id: fb.id,
      provider: 'facebook_context',
      name: fb.name,
      picture_url: fb.picture_url,
    },
  };
  const profile = {
    id: syntheticId,
    user_id: syntheticId,
    profile_name: fb.name,
    profile_picture_url: fb.picture_url ?? null,
    is_public: true,
    onboarding_completed: true,
  } as unknown as AudienceProfile;
  return { user, profile };
}

function buildFcUserAndProfile(fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string }) {
  const id = `fc-${fc.fid}`;
  const profileName = fc.displayName || fc.username || `User ${fc.fid}`;
  const user = {
    id,
    email: null,
    user_metadata: {
      farcaster_fid: fc.fid,
      provider: 'farcaster_context',
      username: fc.username,
      displayName: fc.displayName,
      pfpUrl: fc.pfpUrl,
      location: fc.location,
    },
  };
  const profile = {
    id,
    user_id: id,
    profile_name: profileName,
    profile_picture_url: fc.pfpUrl ?? null,
    location: fc.location ?? null,
    is_public: true,
    onboarding_completed: true,
  } as unknown as AudienceProfile;
  return { user, profile };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function shouldRequireOnboardingFromStorage() {
  try {
    return localStorage.getItem('songchainn_needs_onboarding') === '1';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const fcBoot = loadFcUserFromStorage();
  const fbBoot = fcBoot.user ? { user: null, profile: null } : loadFbUserFromStorage();
  const bootUser = fcBoot.user ?? fbBoot.user;
  const bootProfile = fcBoot.profile ?? fbBoot.profile;
  const [user, setUser] = useState<{ id: string; email?: string | null; user_metadata?: Record<string, any> } | null>(bootUser);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [isVerifiedArtist, setIsVerifiedArtist] = useState(false);
  const [audienceProfile, setAudienceProfile] = useState<AudienceProfile | null>(bootProfile);
  const [needsOnboarding, setNeedsOnboarding] = useState(bootUser ? false : shouldRequireOnboardingFromStorage());
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isWalletDetected, setIsWalletDetected] = useState(false);
  const userRef = React.useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Check for any wallet provider (keep it fresh when the app regains focus)
  useEffect(() => {
    const update = () => setIsWalletDetected(hasWalletProvider());

    update();

    if (typeof window === 'undefined') return;

    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    const unsubscribeWallets = subscribeWallets(update);

    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
      unsubscribeWallets();
    };
  }, []);

  /**
   * Resolve what this account is allowed to be: admin, and artist.
   *
   * `isArtist` was declared, threaded through the whole context and consumed by
   * the app, but `setIsArtist` was called fourteen times and every single one
   * passed false. There was no code path that could make anybody a musician,
   * which is why /studio was unreachable. The artist_accounts table existed the
   * whole time and was never read; this reads it.
   *
   * A row in artist_accounts linking this user to an artist id IS the artist
   * identity. Nothing self-declared: the row is written when the account is
   * created for them, so an artist cannot appoint themselves.
   */
  const refreshRoles = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;

    const [{ data: roleRow }, { data: artistRow }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      supabase
        .from('artist_accounts')
        .select('artist_id, is_verified')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    setIsAdmin(roleRow?.role === 'admin');

    const artist = artistRow as { artist_id?: string; is_verified?: boolean } | null;
    setIsArtist(Boolean(artist?.artist_id));
    setArtistId(artist?.artist_id ?? null);
    setIsVerifiedArtist(Boolean(artist?.is_verified));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    if (isSyntheticUserId(user.id)) {
      // Synthetic fc-/fb- users are local-only — no Supabase profile lookup.
      setNeedsOnboarding(false);
      try { localStorage.setItem('songchainn_needs_onboarding', '0'); } catch { void 0; }
      return;
    }
    if (!isSupabaseConfigured) {
      setAudienceProfile(null);
      setNeedsOnboarding(false);
      return;
    }

    // Same 8-second guard as bootstrap. Without it a profile read that stalls
    // on a slow connection left the whole app on a spinner with no error and
    // nothing to tap; with it, the cached profile takes over and the person
    // keeps moving.
    const { data: profileData, error: profileError } = await Promise.race([
      supabase.from('audience_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('profile:timeout') }), 8000),
      ),
    ]);
    const fallbackName =
      (user.email ? user.email.split('@')[0] : null) ||
      (user.user_metadata?.full_name as string | undefined) ||
      'Listener';

    if (profileError) {
      const cached = getProfile(user.id);
      if (cached) {
        setAudienceProfile(cached);
        const completed = (cached as any).onboarding_completed === true;
        setNeedsOnboarding(!completed);
        try {
          localStorage.setItem('songchainn_needs_onboarding', completed ? '0' : '1');
        } catch {
          void 0;
        }
      } else {
        setAudienceProfile(null);
        setNeedsOnboarding(true);
        try {
          localStorage.setItem('songchainn_needs_onboarding', '1');
        } catch {
          void 0;
        }
      }
      return;
    }

    if (profileData) {
      setAudienceProfile(profileData as any);
      upsertProfile(profileData as any);
      // A profile with any name set means onboarding was already done (handles rows
      // created before the onboarding_completed column existed).
      const hasName = Boolean((profileData as any).profile_name);
      const completed = (profileData as any).onboarding_completed === true || hasName;
      const needsOnboardingFlag = !completed;
      setNeedsOnboarding(needsOnboardingFlag);
      try {
        localStorage.setItem('songchainn_needs_onboarding', needsOnboardingFlag ? '1' : '0');
      } catch {
        void 0;
      }
      return;
    }

    setAudienceProfile(null);
    setNeedsOnboarding(true);
    try {
      localStorage.setItem('songchainn_needs_onboarding', '1');
    } catch {
      void 0;
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      if (!isSupabaseConfigured) {
        if (!mounted) return;
        // Keep any rehydrated FC/FB synthetic user in place.
        if (!isSyntheticUserId(userRef.current?.id)) {
          setUser(null);
          setAudienceProfile(null);
          setNeedsOnboarding(false);
        }
        setWalletAddress(null);
        setIsAdmin(false);
        setIsArtist(false);
        setArtistId(null);
        setIsVerifiedArtist(false);
        setIsLoading(false);
        return;
      }

      try {
        // 8-second guard: if getSession() hangs (e.g. Supabase project paused),
        // we still unblock the render.
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('auth:timeout')), 8000)
          ),
        ]);
        if (!mounted) return;
        const u = sessionResult.data?.session?.user ?? null;
        if (u) {
          setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
        } else if (!isSyntheticUserId(userRef.current?.id)) {
          setUser(null);
          setIsAdmin(false);
        }
        setIsArtist(false);
        setArtistId(null);
        setIsVerifiedArtist(false);
        if (u) void refreshRoles(u.id);
      } catch {
        // On timeout or network error, don't touch user/isAdmin — onAuthStateChange
        // already fired INITIAL_SESSION with any stored session from localStorage and
        // called refreshRoles. Overriding state here would log out a valid session.
        if (mounted) {
          setIsArtist(false);
          setArtistId(null);
          setIsVerifiedArtist(false);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      if (u) {
        setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
        // A real Supabase session supersedes any synthetic fc-/fb- identity —
        // drop the stored fallback so it can't shadow the session on next boot.
        try { localStorage.removeItem(FC_USER_KEY); } catch { void 0; }
        try { localStorage.removeItem(FB_USER_KEY); } catch { void 0; }
        // Supabase serializes auth operations with an internal lock while this
        // callback runs — awaiting another Supabase call (refreshRoles needs the
        // session token) synchronously here deadlocks the client until reload.
        // Defer to the next tick so this callback returns immediately.
        setTimeout(() => { void refreshRoles(u.id); }, 0);
      } else if (!isSyntheticUserId(userRef.current?.id)) {
        // Don't wipe a synthetic FC/FB session when no Supabase session exists.
        setUser(null);
        setIsAdmin(false);
      }
      setIsArtist(false);
      setArtistId(null);
      setIsVerifiedArtist(false);
      setWalletAddress(null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setAudienceProfile(null);
      setNeedsOnboarding(false);
      return;
    }
    void refreshProfile();
  }, [user, refreshProfile]);

  const signInWithWallet = useCallback(async (walletRdns?: string) => {
    try {
      if (!isSupabaseConfigured) {
        return { error: new Error('Supabase is not configured') };
      }

      // Route all wallet calls to the wallet the user picked (EIP-6963);
      // undefined falls back to window.ethereum.
      selectWallet(walletRdns);

      if (!hasWalletProvider()) {
        return { error: new Error('No wallet detected. Please install a Base compatible wallet.') };
      }

      // Always ask the wallet who is connected right now, rather than trusting
      // the account it authorised on some earlier visit. A user who switched
      // accounts inside their wallet would otherwise be asked to sign as an
      // address the wallet is no longer holding, and strict wallets refuse to
      // display that request at all. eth_requestAccounts does not re-prompt an
      // already-authorised site, so this costs nothing, and it is also what
      // switches the wallet over to Base.
      const result = await connectWallet();
      if (!result.success || !result.address) {
        return { error: new Error(result.error ?? 'Failed to connect wallet') };
      }
      // EIP-55, because SIWE requires it and wallets compare against it.
      const address = toChecksumAddress(result.address);

      // Build an EIP-4361 SIWE message
      const domain = window.location.host || 'songchainn.xyz';
      const nonce = generateNonce();
      const issuedAt = new Date().toISOString();
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        '',
        'Sign in to $ongChainn on Base',
        '',
        `URI: ${window.location.origin}`,
        'Version: 1',
        'Chain ID: 8453',
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
      ].join('\n');

      const { signature, error: sigErr } = await signMessage(message, address);
      if (sigErr || !signature) {
        return { error: new Error(sigErr ?? 'Signature rejected') };
      }

      // Verify server-side and get a Supabase OTP
      const { data, error: fnError } = await supabase.functions.invoke('wallet-auth', {
        body: { message, signature },
      });

      if (fnError) return { error: new Error(fnError.message || 'Wallet auth failed') };

      const { email, otp } = data as { email: string; otp: string };

      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'magiclink',
      });
      if (otpError) return { error: otpError };

      const u = otpData.user;
      if (!u) return { error: new Error('Sign-in failed') };

      setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      await refreshRoles(u.id);
      setIsArtist(false);
      setArtistId(null);
      setIsVerifiedArtist(false);
      setWalletAddress(address);
      // refreshProfile via useEffect will determine onboarding status for this user
      await refreshProfile();

      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Wallet sign-in failed') };
    }
  }, [refreshProfile, refreshRoles]);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    try {
      if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured') };

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error };
      const u = data.user;
      if (!u) return { error: new Error('Failed to create user') };

      setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      await refreshRoles(u.id);
      setIsArtist(false);
      setArtistId(null);
      setIsVerifiedArtist(false);
      setNeedsOnboarding(true);
      try {
        localStorage.setItem('songchainn_needs_onboarding', '1');
      } catch {
        void 0;
      }
      await refreshProfile();
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Sign up failed') };
    }
  }, [refreshProfile, refreshRoles]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured') };

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error };
      const u = data.user;
      if (!u) return { error: new Error('Failed to sign in') };

      setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      await refreshRoles(u.id);
      setIsArtist(false);
      setArtistId(null);
      setIsVerifiedArtist(false);
      // Returning users land on home; the user-change effect triggers refreshProfile
      // which will set needsOnboarding=true only if their profile is genuinely incomplete.
      setNeedsOnboarding(false);
      try { localStorage.setItem('songchainn_needs_onboarding', '0'); } catch { void 0; }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Sign in failed') };
    }
  }, [refreshRoles]);

  const signInWithFarcasterToken = useCallback(async (token: string) => {
    try {
      if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured') };

      const { data, error: fnError } = await supabase.functions.invoke('farcaster-auth', {
        body: { token },
      });
      if (fnError) return { error: new Error(fnError.message || 'Farcaster auth failed') };

      const { otp, isNewUser } = data as { email: string; otp: string; isNewUser?: boolean };

      // farcaster-auth returns generateLink's hashed_token — it MUST be verified
      // as token_hash (verifying with email+token expects the plain 6-digit code
      // and always fails with otp_expired).
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        token_hash: otp,
        type: 'magiclink',
      });
      if (otpError) return { error: otpError };

      const u = otpData.user;
      if (!u) return { error: new Error('Sign-in failed') };

      setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      await refreshRoles(u.id);
      setIsArtist(false);
      setArtistId(null);
      setIsVerifiedArtist(false);
      if (isNewUser) {
        setNeedsOnboarding(true);
        try { localStorage.setItem('songchainn_needs_onboarding', '1'); } catch { void 0; }
      }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Farcaster sign-in failed') };
    }
  }, [refreshRoles]);

  const signInWithFarcaster = useCallback(async (message: string, signature: string) => {
    try {
      if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured') };

      const { data, error: fnError } = await supabase.functions.invoke('farcaster-auth', {
        body: { message, signature },
      });
      if (fnError) return { error: new Error(fnError.message || 'Farcaster auth failed') };

      const { otp, isNewUser } = data as { email: string; otp: string; isNewUser?: boolean };

      // hashed_token → token_hash verification (see signInWithFarcasterToken)
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        token_hash: otp,
        type: 'magiclink',
      });
      if (otpError) return { error: otpError };

      const u = otpData.user;
      if (!u) return { error: new Error('Sign-in failed') };

      setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      await refreshRoles(u.id);
      setIsArtist(false);
      setArtistId(null);
      setIsVerifiedArtist(false);
      if (isNewUser) {
        setNeedsOnboarding(true);
        try { localStorage.setItem('songchainn_needs_onboarding', '1'); } catch { void 0; }
      }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Farcaster sign-in failed') };
    }
  }, [refreshRoles]);

  const createFarcasterProfile = useCallback(async (farcasterUser: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
    location?: string;
  }) => {
    const uid = user?.id;
    if (!uid || !isSupabaseConfigured) return;

    const profileName = farcasterUser.displayName || farcasterUser.username || `User ${farcasterUser.fid}`;

    // Always upsert with all relevant columns so the profile is complete in every view
    const profileData: Record<string, unknown> = {
      user_id: uid,
      id: uid,
      display_name: profileName,
      username: farcasterUser.username || null,
      profile_name: profileName,
      avatar_url: farcasterUser.pfpUrl || null,
      profile_picture_url: farcasterUser.pfpUrl || null,
      location: farcasterUser.location || null,
      is_public: true,
      onboarding_completed: true,
    };

    const { data: existing } = await supabase
      .from('audience_profiles')
      .select('id')
      .eq('user_id', uid)
      .maybeSingle();

    if (existing) {
      await supabase.from('audience_profiles').update(profileData as ProfileUpdate).eq('user_id', uid);
    } else {
      await supabase.from('audience_profiles').insert(profileData as Database['public']['Tables']['audience_profiles']['Insert']);
    }

    await refreshProfile();
    setNeedsOnboarding(false);
    try { localStorage.setItem('songchainn_needs_onboarding', '0'); } catch { void 0; }
  }, [user?.id, refreshProfile]);

  /**
   * Exchanges a farcaster-auth OTP for a real Supabase session, then immediately
   * creates/updates audience_profiles from the mini-app context so the user appears
   * everywhere in the app without ever seeing onboarding.
   */
  const completeFarcasterSession = useCallback(async (
    otp: string,
    fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string },
  ) => {
    // farcaster-auth returns generateLink's hashed_token → verify as token_hash.
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: otp, type: 'magiclink',
    });
    if (otpError) throw otpError;

    const u = otpData.user;
    if (!u) throw new Error('Sign-in failed');

    // Write the profile BEFORE setting needsOnboarding so there is no flash of
    // the onboarding screen for mini-app users.
    const profileName = fc.displayName || fc.username || `User ${fc.fid}`;
    const profileData: Record<string, unknown> = {
      user_id: u.id,
      id: u.id,
      display_name: profileName,
      username: fc.username || null,
      profile_name: profileName,
      avatar_url: fc.pfpUrl || null,
      profile_picture_url: fc.pfpUrl || null,
      location: fc.location || null,
      is_public: true,
      onboarding_completed: true,
    };

    // Upsert profile and refresh roles in parallel — eliminates the extra SELECT
    // round-trip and overlaps the roles query with the profile write.
    await Promise.all([
      (supabase as any).from('audience_profiles').upsert(profileData, { onConflict: 'user_id' }),
      refreshRoles(u.id),
    ]);

    setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
    setIsArtist(false);
    setArtistId(null);
    setIsVerifiedArtist(false);
    setNeedsOnboarding(false);
    try { localStorage.setItem('songchainn_needs_onboarding', '0'); } catch { void 0; }
  }, [refreshRoles]);

  /**
   * Preferred mini-app sign-in: a Quick Auth JWT, which farcaster-auth verifies
   * against Farcaster's JWKS. Zero-tap (no signature prompt) and works on clients
   * where sdk.actions.signIn is unavailable.
   */
  const signInWithFarcasterQuickAuth = useCallback(async (
    fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string },
    token: string,
  ) => {
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase not configured');

      const { data, error: fnError } = await supabase.functions.invoke('farcaster-auth', {
        body: { token },
      });
      if (fnError) throw new Error(fnError.message || 'Farcaster auth failed');

      const { otp } = data as { email: string; otp: string };
      await completeFarcasterSession(otp, fc);
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Quick Auth sign-in failed') };
    }
  }, [completeFarcasterSession]);

  /**
   * Fallback mini-app sign-in: SIWF. farcaster-auth verifies the signature against
   * the FID's on-chain custody/auth addresses, so the claimed fid cannot be forged.
   */
  const signInWithFarcasterMiniApp = useCallback(async (
    fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string },
    message: string,
    signature: string,
  ) => {
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase not configured');

      const { data, error: fnError } = await supabase.functions.invoke('farcaster-auth', {
        // The fid is NOT trusted from the body — the edge function derives it from
        // the verified signature. These fields only enrich auth.users metadata.
        body: {
          username: fc.username ?? null,
          displayName: fc.displayName ?? null,
          pfpUrl: fc.pfpUrl ?? null,
          location: fc.location ?? null,
          message,
          signature,
        },
      });
      if (fnError) throw new Error(fnError.message || 'Farcaster auth failed');

      const { otp } = data as { email: string; otp: string };
      await completeFarcasterSession(otp, fc);
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Mini-app sign-in failed') };
    }
  }, [completeFarcasterSession]);

  const signInWithFarcasterContext = useCallback(async (fc: { fid: number; username?: string; displayName?: string; pfpUrl?: string; location?: string }) => {
    try {
      if (!fc?.fid) return { error: new Error('Missing Farcaster fid') };

      // NOTE: this path deliberately does NOT ask farcaster-auth for a session.
      // sdk.context is client-supplied and carries no proof of FID ownership, so
      // trading it for a real Supabase session would let anyone impersonate any
      // Farcaster user. Real sessions come only from Quick Auth or SIWF, both of
      // which are cryptographically verified server-side. This is the last-resort
      // read-only identity when both of those are unavailable.

      // Local-only fallback: synthetic fc-xxx user (no Supabase writes)
      const { user: fcUser, profile } = buildFcUserAndProfile(fc);
      setUser(fcUser);
      setAudienceProfile(profile);
      setIsAdmin(false); setIsArtist(false); setArtistId(null); setIsVerifiedArtist(false);
      setNeedsOnboarding(false);
      try {
        localStorage.setItem(FC_USER_KEY, JSON.stringify({ user: fcUser, profile }));
        localStorage.setItem('songchainn_needs_onboarding', '0');
      } catch { void 0; }
      if (isSupabaseConfigured) {
        void supabase.from('farcaster_profiles' as any).upsert(
          { fid: fc.fid, username: fc.username ?? null, display_name: fc.displayName ?? fc.username ?? `User ${fc.fid}`, pfp_url: fc.pfpUrl ?? null, location: fc.location ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'fid' }
        ).then(() => {});
      }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Farcaster sign-in failed') };
    }
  }, []);

  /**
   * Facebook sign-in: verifies the access_token with Facebook Graph API via
   * the facebook-auth edge function, then immediately creates/updates the
   * audience_profiles row so the user needs no onboarding. Falls back to a
   * local-only fb-XXX synthetic user if the edge function is unreachable.
   */
  const signInWithFacebook = useCallback(async (fb: { id: string; name: string; email?: string; picture_url?: string; access_token?: string }) => {
    try {
      if (!fb?.id) return { error: new Error('Missing Facebook user ID') };

      if (isSupabaseConfigured) {
        try {
          const { data: authData, error: authErr } = await supabase.functions.invoke('facebook-auth', {
            body: {
              facebook_id: fb.id,
              access_token: fb.access_token ?? null,
              name: fb.name ?? null,
              email: fb.email ?? null,
              picture_url: fb.picture_url ?? null,
            },
          });
          if (!authErr && authData?.otp) {
            // facebook-auth also returns generateLink's hashed_token → token_hash
            const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
              token_hash: authData.otp, type: 'magiclink',
            });
            if (!otpError && otpData?.user) {
              const u = otpData.user;
              const profileData: Record<string, unknown> = {
                user_id: u.id, id: u.id,
                display_name: fb.name, username: null,
                profile_name: fb.name,
                avatar_url: fb.picture_url || null,
                profile_picture_url: fb.picture_url || null,
                location: null,
                is_public: true, onboarding_completed: true,
              };
              const { data: existing } = await supabase.from('audience_profiles').select('id').eq('user_id', u.id).maybeSingle();
              if (existing) {
                await supabase.from('audience_profiles').update(profileData as ProfileUpdate).eq('user_id', u.id);
              } else {
                await supabase.from('audience_profiles').insert(profileData as Database['public']['Tables']['audience_profiles']['Insert']);
              }
              setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
              setAudienceProfile(profileData as any);
              await refreshRoles(u.id);
              setIsArtist(false); setArtistId(null); setIsVerifiedArtist(false);
              setNeedsOnboarding(false);
              try { localStorage.setItem('songchainn_needs_onboarding', '0'); } catch { void 0; }
              return { error: null };
            }
          }
        } catch { /* edge function unavailable — fall through to local-only */ }
      }

      return signInWithFacebookContext(fb);
    } catch (err: any) {
      return { error: new Error(err?.message || 'Facebook sign-in failed') };
    }
  }, [refreshRoles]);

  const signInWithFacebookContext = useCallback(async (fb: { id: string; name: string; email?: string; picture_url?: string }) => {
    try {
      if (!fb?.id) return { error: new Error('Missing Facebook user ID') };

      const { user: fbUser, profile } = buildFbUserAndProfile(fb);
      setUser(fbUser);
      setAudienceProfile(profile);
      setIsAdmin(false); setIsArtist(false); setArtistId(null); setIsVerifiedArtist(false);
      setNeedsOnboarding(false);
      try {
        localStorage.setItem(FB_USER_KEY, JSON.stringify({ user: fbUser, profile }));
        localStorage.setItem('songchainn_needs_onboarding', '0');
      } catch { void 0; }
      // Write to facebook_profiles for community visibility
      if (isSupabaseConfigured) {
        void supabase.from('facebook_profiles' as any).upsert(
          { facebook_id: fb.id, name: fb.name, email: fb.email ?? null, picture_url: fb.picture_url ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'facebook_id' }
        ).then(() => {});
      }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Facebook sign-in failed') };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    try { localStorage.removeItem(FC_USER_KEY); } catch { void 0; }
    try { localStorage.removeItem(FB_USER_KEY); } catch { void 0; }
    setUser(null);
    setIsAdmin(false);
    setIsArtist(false);
    setArtistId(null);
    setIsVerifiedArtist(false);
    setAudienceProfile(null);
    setNeedsOnboarding(false);
    setWalletAddress(null);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user,
      isAuthenticated: !!user, 
      isAdmin,
      isArtist,
      artistId,
      isVerifiedArtist,
      isLoading,
      audienceProfile, 
      needsOnboarding,
      walletAddress,
      isWalletDetected,
      signInWithWallet,
      signInWithFarcasterToken,
      signInWithFarcaster,
      signInWithFarcasterContext,
      signInWithFarcasterMiniApp,
      signInWithFarcasterQuickAuth,
      signInWithFacebook,
      signInWithFacebookContext,
      signUpWithEmail,
      signInWithEmail,
      signOut,
      refreshProfile,
      refreshArtistStatus: async () => {
        if (user?.id && !isSyntheticUserId(user.id)) await refreshRoles(user.id);
      },
      createFarcasterProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    if (import.meta.env.DEV) {
      console.error('useAuth must be used within an AuthProvider');
    }
    return {
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isArtist: false,
      artistId: null,
      isVerifiedArtist: false,
      isLoading: false,
      audienceProfile: null,
      needsOnboarding: false,
      walletAddress: null,
      isWalletDetected: false,
      signInWithWallet: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFarcasterToken: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFarcaster: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFarcasterContext: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFarcasterMiniApp: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFarcasterQuickAuth: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFacebook: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFacebookContext: async () => ({ error: new Error('AuthProvider missing') }),
      signUpWithEmail: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithEmail: async () => ({ error: new Error('AuthProvider missing') }),
      signOut: async () => {},
      refreshProfile: async () => {},
      refreshArtistStatus: async () => {},
      createFarcasterProfile: async () => {},
    };
  }
  return context;
}
