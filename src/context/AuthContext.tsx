import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { AudienceProfile } from '@/types/database';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { hasWalletProvider, connectWallet, signMessage } from '@/lib/baseWallet';

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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
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

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      setAudienceProfile(null);
      setNeedsOnboarding(false);
      return;
    }

    const [byUserIdRes, byIdRes] = await Promise.all([
      supabase.from('audience_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('audience_profiles').select('*').eq('id', user.id).maybeSingle(),
    ]);

    const profileData = (byUserIdRes.data as any) || (byIdRes.data as any) || null;
    const profileError = byUserIdRes.error || byIdRes.error;

    if (profileError) {
      setAudienceProfile(null);
      setNeedsOnboarding(shouldRequireOnboardingFromStorage());
      return;
    }

    if (profileData) {
      setAudienceProfile(profileData as any);
      const completed = (profileData as any).onboarding_completed;
      const needs = completed === false;
      setNeedsOnboarding(needs);
      if (!needs) {
        try {
          localStorage.removeItem('songchainn_needs_onboarding');
        } catch {
          void 0;
        }
      }
      return;
    }

    const fallbackName =
      (user.email ? user.email.split('@')[0] : null) ||
      (user.user_metadata?.full_name as string | undefined) ||
      'Listener';

    const { data: created, error: createError } = await supabase
      .from('audience_profiles')
      .upsert(
        {
          id: user.id,
          user_id: user.id,
          profile_name: fallbackName,
          bio: null,
          profile_picture_url: null,
          cover_photo_url: null,
          x_profile_link: null,
          base_profile_link: null,
          location: null,
          onboarding_completed: false,
        } as any,
        { onConflict: 'id' }
      )
      .select('*')
      .maybeSingle();

    if (createError) {
      setAudienceProfile(null);
      setNeedsOnboarding(true);
      return;
    }

    setAudienceProfile((created as any) ?? null);
    setNeedsOnboarding(true);
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

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const u = data.session?.user ?? null;
      if (u) {
        setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      } else {
        setUser(null);
      }
      setIsAdmin(false);
      setIsArtist(false);
      setArtistId(null);
      setIsLoading(false);
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u ? { id: u.id, email: u.email, user_metadata: u.user_metadata as any } : null);
      setIsAdmin(false);
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

      const connectResult = await connectWallet();
      if (!connectResult.success || !connectResult.address) {
        return { error: new Error(connectResult.error || 'Failed to connect wallet') };
      }

      const address = connectResult.address;

      const nonceRes = await (supabase as any).functions.invoke('verify-base-signature', {
        body: { action: 'generate-nonce' },
      });
      if (nonceRes.error || !nonceRes.data?.nonce) {
        return { error: new Error('Failed to get sign-in nonce') };
      }

      const nonce = String(nonceRes.data.nonce);

      const message = [
        'Sign in to $ongChainn',
        '',
        `Wallet: ${address}`,
        `Nonce: ${nonce}`,
      ].join('\n');

      const sigRes = await signMessage(message, address);
      if (!sigRes.signature) {
        return { error: new Error(sigRes.error || 'Signature was rejected') };
      }

      const verifyRes = await (supabase as any).functions.invoke('verify-base-signature', {
        body: {
          action: 'verify',
          address,
          message,
          signature: sigRes.signature,
          nonce,
        },
      });

      if (verifyRes.error || !verifyRes.data?.success || !verifyRes.data?.session) {
        const msg = verifyRes?.data?.error || verifyRes?.error?.message || 'Wallet verification failed';
        return { error: new Error(msg) };
      }

      const session = verifyRes.data.session as any;
      const userData = verifyRes.data.user as any;

      if (!session?.access_token || !session?.refresh_token) {
        return { error: new Error('Invalid session returned from wallet sign-in') };
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (setSessionError) {
        return { error: setSessionError };
      }

      if (userData?.id) {
        setUser({
          id: userData.id,
          email: userData.email,
          user_metadata: userData.user_metadata as any,
        });
      }

      setWalletAddress(address);
      setIsAdmin(false);
      setIsArtist(false);
      setArtistId(null);
      await refreshProfile();

      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Wallet sign-in failed') };
    }
  }, [refreshProfile]);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    try {
      if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured') };

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error };
      const u = data.user;
      if (!u) return { error: new Error('Failed to create user') };

      setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      setIsAdmin(false);
      setIsArtist(false);
      setArtistId(null);

      const username = email.split('@')[0] || 'listener';
      await supabase
        .from('audience_profiles')
        .upsert(
          {
            id: u.id,
            user_id: u.id,
            profile_name: username,
            bio: null,
            profile_picture_url: null,
            cover_photo_url: null,
            x_profile_link: null,
            base_profile_link: null,
            location: null,
            onboarding_completed: false,
          } as any,
          { onConflict: 'id' }
        );

      await refreshProfile();
      try {
        localStorage.setItem('songchainn_needs_onboarding', '1');
      } catch {
        void 0;
      }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Sign up failed') };
    }
  }, [refreshProfile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured') };

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error };
      const u = data.user;
      if (!u) return { error: new Error('Failed to sign in') };

      setUser({ id: u.id, email: u.email, user_metadata: u.user_metadata as any });
      setIsAdmin(false);
      setIsArtist(false);
      setArtistId(null);
      await refreshProfile();
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err?.message || 'Sign in failed') };
    }
  }, [refreshProfile]);

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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
