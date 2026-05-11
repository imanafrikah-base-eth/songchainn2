import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { AudienceProfile } from '@/types/database';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { ensureProfile, getProfile, upsertProfile } from '@/lib/localDb';
import { hasWalletProvider, connectWallet, getConnectedAccounts, signMessage, generateNonce } from '@/lib/baseWallet';

interface AuthContextType {
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> } | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isArtist: boolean;
  artistId: string | null;
  isLoading: boolean;
  audienceProfile: AudienceProfile | null;
  needsOnboarding: boolean;
  walletAddress: string | null;
  isWalletDetected: boolean;
  signInWithWallet: () => Promise<{ error: Error | null }>;
  signInWithFarcasterToken: (token: string) => Promise<{ error: Error | null }>;
  signInWithFarcaster: (message: string, signature: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
  const [user, setUser] = useState<{ id: string; email?: string | null; user_metadata?: Record<string, any> } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [audienceProfile, setAudienceProfile] = useState<AudienceProfile | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(shouldRequireOnboardingFromStorage());
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isWalletDetected, setIsWalletDetected] = useState(false);

  // Check for any wallet provider (keep it fresh when the app regains focus)
  useEffect(() => {
    const update = () => setIsWalletDetected(hasWalletProvider());

    update();

    if (typeof window === 'undefined') return;

    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);

    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const refreshRoles = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    setIsAdmin(data?.role === 'admin');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      setAudienceProfile(null);
      setNeedsOnboarding(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('audience_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
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
      const completed = (profileData as any).onboarding_completed === true;
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
        setUser(null);
        setAudienceProfile(null);
        setNeedsOnboarding(false);
        setWalletAddress(null);
        setIsAdmin(false);
        setIsArtist(false);
        setArtistId(null);
        setIsLoading(false);
        return;
      }

      try {
        // 8-second guard: if getSession() hangs (e.g. Supabase project paused or key
        // needs initial network validation), we still unblock the render.
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
        } else {
          setUser(null);
          setIsAdmin(false);
        }
        setIsArtist(false);
        setArtistId(null);
        if (u) void refreshRoles(u.id);
      } catch {
        // Supabase unreachable or timed-out — proceed as unauthenticated
        if (mounted) {
          setUser(null);
          setIsAdmin(false);
          setIsArtist(false);
          setArtistId(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u ? { id: u.id, email: u.email, user_metadata: u.user_metadata as any } : null);
      if (u) {
        await refreshRoles(u.id);
      } else {
        setIsAdmin(false);
      }
      setIsArtist(false);
      setArtistId(null);
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

  const signInWithWallet = useCallback(async () => {
    try {
      if (!isSupabaseConfigured) {
        return { error: new Error('Supabase is not configured') };
      }

      if (!hasWalletProvider()) {
        return { error: new Error('No wallet detected. Please install a Base compatible wallet.') };
      }

      // Connect and get address, switching to Base chain automatically
      let address: string | undefined;
      const existing = await getConnectedAccounts();
      if (existing.length > 0) {
        address = existing[0];
      } else {
        const result = await connectWallet();
        if (!result.success || !result.address) {
          return { error: new Error(result.error ?? 'Failed to connect wallet') };
        }
        address = result.address;
      }

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
      setWalletAddress(address);
      setNeedsOnboarding(true);
      try {
        localStorage.setItem('songchainn_needs_onboarding', '1');
        localStorage.setItem('songchainn_show_profile_photo_hint', '1');
      } catch {
        void 0;
      }
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
      await refreshProfile();
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Sign in failed') };
    }
  }, [refreshProfile, refreshRoles]);

  const signInWithFarcasterToken = useCallback(async (token: string) => {
    try {
      if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured') };

      const { data, error: fnError } = await supabase.functions.invoke('farcaster-auth', {
        body: { token },
      });
      if (fnError) return { error: new Error(fnError.message || 'Farcaster auth failed') };

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
      // Don't force needsOnboarding here — onAuthStateChange will fire and
      // refreshProfile (via useEffect) will set it correctly from the DB.
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
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Farcaster sign-in failed') };
    }
  }, [refreshRoles]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setIsAdmin(false);
    setIsArtist(false);
    setArtistId(null);
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
      isLoading,
      audienceProfile, 
      needsOnboarding,
      walletAddress,
      isWalletDetected,
      signInWithWallet,
      signInWithFarcasterToken,
      signInWithFarcaster,
      signUpWithEmail,
      signInWithEmail,
      signOut,
      refreshProfile,
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
      isLoading: false,
      audienceProfile: null,
      needsOnboarding: false,
      walletAddress: null,
      isWalletDetected: false,
      signInWithWallet: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFarcasterToken: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithFarcaster: async () => ({ error: new Error('AuthProvider missing') }),
      signUpWithEmail: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithEmail: async () => ({ error: new Error('AuthProvider missing') }),
      signOut: async () => {},
      refreshProfile: async () => {},
    };
  }
  return context;
}
