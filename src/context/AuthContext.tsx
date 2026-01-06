import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import { AudienceProfile } from '@/types/database';
import { 
  hasWalletProvider, 
  connectWallet,
  signMessage,
  generateNonce 
} from '@/lib/baseWallet';

interface AuthContextType {
  user: User | null;
  session: Session | null;
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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Create a SIWE message for wallet signing
 */
function createSIWEMessage(
  address: string,
  nonce: string,
  domain: string = window.location.host,
  uri: string = window.location.origin
): string {
  const issuedAt = new Date().toISOString();
  
  return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to $ongChainn with your wallet.

URI: ${uri}
Version: 1
Chain ID: 8453
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

function resolveArtistIdFromUser(user: User | null) {
  if (!user) return null;

  const metaArtistIdRaw = (user.user_metadata as any)?.artist_id as string | number | undefined | null;
  const metaArtistId = metaArtistIdRaw != null ? String(metaArtistIdRaw) : null;
  if (metaArtistId) return metaArtistId;

  const email = user.email || '';
  const match = email.match(/^artist\+(\d+)@/i);
  const fromEmail = match?.[1] || null;
  if (fromEmail) return fromEmail;

  return null;
}

function shouldRequireOnboardingFromStorage() {
  try {
    return localStorage.getItem('songchainn_needs_onboarding') === '1';
  } catch {
    return false;
  }
}

function isAudienceProfilesUnavailableError(err: unknown) {
  const anyErr = err as any;
  const code = String(anyErr?.code || '');
  const status = Number(anyErr?.status || 0);
  const message = String(anyErr?.message || '');
  const messageLower = message.toLowerCase();

  return (
    code === 'PGRST205' ||
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    messageLower.includes('permission denied for table') ||
    (messageLower.includes('audience_profiles') && messageLower.includes('schema cache')) ||
    (messageLower.includes('could not find the table') && messageLower.includes('audience_profiles'))
  );
}

async function fetchArtistIdFromArtistAccounts(userId: string): Promise<string | null> {
  try {
    const { data } = await (supabase as any)
      .from('artist_accounts')
      .select('artist_id')
      .eq('user_id', userId)
      .maybeSingle();

    const artistId = (data as any)?.artist_id;
    return artistId != null ? String(artistId) : null;
  } catch {
    return null;
  }
}

async function ensureArtistAccountMapping(userId: string, resolvedArtistId: string, artistIdFromDb: string | null) {
  if (!resolvedArtistId) return;
  if (artistIdFromDb) return;

  try {
    await (supabase as any)
      .from('artist_accounts')
      .upsert(
        { artist_id: resolvedArtistId, user_id: userId, updated_at: new Date().toISOString() },
        { onConflict: 'artist_id' }
      );
  } catch {
    return;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [audienceProfile, setAudienceProfile] = useState<AudienceProfile | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isWalletDetected, setIsWalletDetected] = useState(false);
  const bootstrapIdRef = useRef(0);

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

  const fetchUserRole = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (data) {
        setIsAdmin(data.role === 'admin');
      }
    } catch {
      return;
    }
  }, []);

  const fetchAudienceProfile = useCallback(async (userId: string, options?: { skipOnboarding?: boolean }) => {
    if (!isSupabaseConfigured) return;
    try {
      const { data } = await supabase
        .from('audience_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (data) {
        setAudienceProfile(data as AudienceProfile);
        if ((data as any)?.onboarding_completed) {
          try {
            localStorage.removeItem('songchainn_needs_onboarding');
          } catch {
            void 0;
          }
        }
        setNeedsOnboarding(options?.skipOnboarding ? false : !data.onboarding_completed);
      } else {
        setAudienceProfile(null);
        setNeedsOnboarding(options?.skipOnboarding ? false : shouldRequireOnboardingFromStorage());
      }
    } catch (err) {
      if (isAudienceProfilesUnavailableError(err)) {
        setAudienceProfile(null);
        setNeedsOnboarding(false);
        try {
          localStorage.removeItem('songchainn_needs_onboarding');
        } catch {
          void 0;
        }
        return;
      }

      setAudienceProfile(null);
      setNeedsOnboarding(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchAudienceProfile(user.id, { skipOnboarding: isArtist });
    }
  }, [fetchAudienceProfile, isArtist, user]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }
    const bootstrapFromSession = async (nextSession: Session | null) => {
      const currentId = ++bootstrapIdRef.current;
      setIsLoading(true);

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      const baseWalletAddress =
        (nextSession?.user?.user_metadata as any)?.base_wallet_address != null
          ? String((nextSession?.user?.user_metadata as any)?.base_wallet_address)
          : null;
      setWalletAddress(baseWalletAddress);

      if (!nextSession?.user) {
        setIsAdmin(false);
        setIsArtist(false);
        setArtistId(null);
        setAudienceProfile(null);
        setNeedsOnboarding(false);
        setIsLoading(false);
        return;
      }

      try {
        const artistIdFromDb = await fetchArtistIdFromArtistAccounts(nextSession.user.id);
        const resolvedArtistId = artistIdFromDb ?? resolveArtistIdFromUser(nextSession.user);
        if (resolvedArtistId) {
          await ensureArtistAccountMapping(nextSession.user.id, resolvedArtistId, artistIdFromDb);
        }
        setIsArtist(Boolean(resolvedArtistId));
        setArtistId(resolvedArtistId);
        await fetchUserRole(nextSession.user.id);
        await fetchAudienceProfile(nextSession.user.id, { skipOnboarding: Boolean(resolvedArtistId) });
      } catch {
        setIsAdmin(false);
        setIsArtist(false);
        setArtistId(null);
        setAudienceProfile(null);
        setNeedsOnboarding(false);
      } finally {
        if (bootstrapIdRef.current === currentId) {
          setIsLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void bootstrapFromSession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: existingSession } }) => bootstrapFromSession(existingSession))
      .catch(() => setIsLoading(false));

    return () => subscription.unsubscribe();
  }, [fetchAudienceProfile, fetchUserRole]);

  /**
   * Wallet Sign-In Flow with SIWE Signature Verification
   * 
   * Works with any EIP-1193 compatible wallet:
   * - MetaMask
   * - Coinbase Wallet
   * - Rainbow
   * - Base App
   * - And any other Web3 wallet
   */
  const signInWithWallet = useCallback(async () => {
    try {
      // Check if wallet is available
      if (!hasWalletProvider()) {
        return {
          error: new Error(
            'No wallet detected. Please install MetaMask, Coinbase Wallet, or another Web3 wallet.'
          ),
        };
      }

      // Connect wallet and get address
      const connectionResult = await connectWallet();

      if (!connectionResult.success || !connectionResult.address) {
        return {
          error: new Error(
            connectionResult.error || 'Failed to connect wallet. Please try again.'
          ),
        };
      }

      const address = connectionResult.address;

      // Generate nonce for SIWE message
      const nonce = generateNonce();

      // Create SIWE message
      const message = createSIWEMessage(address, nonce);

      // Request signature from wallet
      const signResult = await signMessage(message, address);

      if (signResult.error || !signResult.signature) {
        return {
          error: new Error(
            signResult.error || 'Signature request was rejected. Please try again.'
          ),
        };
      }

      const signature = signResult.signature;

      // Verify signature and authenticate via edge function
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'verify-base-signature',
        {
          body: {
            action: 'verify',
            address,
            message,
            signature,
            nonce,
          },
        }
      );

      if (verifyError || !verifyData?.success) {
        return {
          error: new Error(
            verifyData?.error || 'Wallet signature verification failed. Please try again.'
          ),
        };
      }

      // Set session from edge function response
      if (verifyData.session) {
        await supabase.auth.setSession({
          access_token: verifyData.session.access_token,
          refresh_token: verifyData.session.refresh_token,
        });
        setWalletAddress(verifyData.walletAddress);
      }

      try {
        localStorage.setItem('songchainn_needs_onboarding', '1');
      } catch {
        void 0;
      }

      return { error: null };
    } catch (err: any) {
      return {
        error: new Error(err?.message || 'Wallet connection failed. Please try again.'),
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
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
      session,
      isAuthenticated: !!session, 
      isAdmin,
      isArtist,
      artistId,
      isLoading,
      audienceProfile, 
      needsOnboarding,
      walletAddress,
      isWalletDetected,
      signInWithWallet,
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
