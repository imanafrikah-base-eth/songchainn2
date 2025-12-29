import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AudienceProfile } from '@/types/database';
import { 
  hasWalletProvider, 
  connectWallet,
  signMessage,
  generateNonce 
} from '@/lib/baseWallet';

const ALLOWED_ARTIST_IDS = new Set(['1', '2', '3', '4', '5', '6', '7']);

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

  const metaArtistId = (user.user_metadata as any)?.artist_id as string | undefined;
  if (metaArtistId && ALLOWED_ARTIST_IDS.has(metaArtistId)) return metaArtistId;

  const email = user.email || '';
  const match = email.match(/^artist\+(\d+)@/i);
  const fromEmail = match?.[1] || null;
  if (fromEmail && ALLOWED_ARTIST_IDS.has(fromEmail)) return fromEmail;

  return null;
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

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (data) {
      setIsAdmin(data.role === 'admin');
    }
  };

  const fetchAudienceProfile = async (userId: string) => {
    const { data } = await supabase
      .from('audience_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (data) {
      setAudienceProfile(data as AudienceProfile);
      setNeedsOnboarding(!data.onboarding_completed);
    } else {
      setAudienceProfile(null);
      setNeedsOnboarding(true);
    }
  };

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchAudienceProfile(user.id);
    }
  }, [user]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        const resolvedArtistId = resolveArtistIdFromUser(session?.user ?? null);
        setIsArtist(Boolean(resolvedArtistId));
        setArtistId(resolvedArtistId);
        
        // Extract wallet address from user metadata
        if (session?.user?.user_metadata?.base_wallet_address) {
          setWalletAddress(session.user.user_metadata.base_wallet_address);
        }
        
        if (session?.user) {
          // Defer data fetching with setTimeout to prevent deadlock
          setTimeout(() => {
            fetchUserRole(session.user.id);
            fetchAudienceProfile(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setIsArtist(false);
          setArtistId(null);
          setAudienceProfile(null);
          setNeedsOnboarding(false);
          setWalletAddress(null);
        }
        
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      const resolvedArtistId = resolveArtistIdFromUser(session?.user ?? null);
      setIsArtist(Boolean(resolvedArtistId));
      setArtistId(resolvedArtistId);
      
      if (session?.user?.user_metadata?.base_wallet_address) {
        setWalletAddress(session.user.user_metadata.base_wallet_address);
      }
      
      if (session?.user) {
        fetchUserRole(session.user.id);
        fetchAudienceProfile(session.user.id);
      }
      
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
