import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ExternalLink, Loader2, Shield, Music, Users, CheckCircle2, Mail, Phone, ChevronDown, Eye, EyeOff, ArrowLeft, AlertCircle, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logo from '@/assets/songchainn-logo.webp';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { CountryCodeSelector } from '@/components/CountryCodeSelector';
import { COUNTRY_CODES, CountryCode } from '@/data/countryCodes';
import { ARTISTS } from '@/data/musicData';
import { cn } from '@/lib/utils';
import { useWeb3Wallet } from '@/hooks/useWeb3Wallet';
import { useNavigate } from 'react-router-dom';

type ConnectionState = 'idle' | 'connecting' | 'signing' | 'verifying' | 'success';
type AuthMode = 'signin' | 'signup';
type AuthView = 'main' | 'email' | 'phone' | 'verify-otp' | 'connect-wallet' | 'artist';

// Default to Zambia
const DEFAULT_COUNTRY = COUNTRY_CODES.find(c => c.code === 'ZM') || COUNTRY_CODES[0];

export default function Auth() {
  const navigate = useNavigate();
  const { signInWithWallet, isWalletDetected, walletAddress, user } = useAuth();
  const { openConnectModal, isConnected, address: web3Address } = useWeb3Wallet();
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  
  // Auth state
  const [authView, setAuthView] = useState<AuthView>('main');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(0);
  const [artistUsername, setArtistUsername] = useState('');
  const [artistPassword, setArtistPassword] = useState('');

  // Track if user signed in via email/phone but needs wallet
  const [pendingWalletConnection, setPendingWalletConnection] = useState(false);

  // Detect any wallet provider (MetaMask, Coinbase, Rainbow, etc.)
  const hasWallet = typeof window !== 'undefined' && (() => {
    const ethereum = (window as any).ethereum;
    return !!ethereum?.request;
  })();

  const fullPhoneNumber = `${selectedCountry.dialCode}${phoneNumber.replace(/\D/g, '')}`;

  const normalizeArtistKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

  const ARTIST_LOGIN_CODES: Record<string, string> = {
    [normalizeArtistKey('Santana')]: '01',
    [normalizeArtistKey('Sanchy')]: '02',
    [normalizeArtistKey('PRP')]: '03',
    [normalizeArtistKey('NDA')]: '04',
    [normalizeArtistKey('IMan Afrikah')]: '05',
    [normalizeArtistKey('DenaJah')]: '06',
    [normalizeArtistKey('7ROO7H BASED')]: '07',
  };

  const resolveArtistLogin = (usernameRaw: string) => {
    const key = normalizeArtistKey(usernameRaw);
    const artist = ARTISTS.find(a => normalizeArtistKey(a.name) === key);
    if (!artist) return null;
    const code = ARTIST_LOGIN_CODES[normalizeArtistKey(artist.name)];
    if (!code) return null;
    const email = `artist+${artist.id}@songchainn.app`;
    const password = `${artist.name.replace(/\s+/g, '')}${code}`;
    return { artist, code, email, password };
  };

  const upsertArtistAudienceProfile = async (artist: (typeof ARTISTS)[number]) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;
    await supabase
      .from('audience_profiles')
      .upsert(
        {
          user_id: userId,
          profile_name: artist.name,
          bio: artist.bio || null,
          profile_picture_url: artist.profileImage || null,
          cover_photo_url: null,
          x_profile_link: null,
          base_profile_link: null,
          location: artist.location || null,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'user_id' }
      );
  };

  const handleWalletSignIn = useCallback(async () => {
    setError(null);
    // Proceed if any wallet is available (injected or WalletConnect)
    if (!hasWallet && !isWalletDetected && !isConnected) {
      return;
    }

    setConnectionState('connecting');

    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      setConnectionState('signing');

      const result = await signInWithWallet();

      if (result.error) {
        setError(result.error.message);
        setConnectionState('idle');
      } else {
        setConnectionState('verifying');
        await new Promise((resolve) => setTimeout(resolve, 400));
        setConnectionState('success');
        setPendingWalletConnection(false);
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
      setConnectionState('idle');
    }
  }, [hasWallet, isWalletDetected, isConnected, signInWithWallet]);

  // Handle WalletConnect connection success
  useEffect(() => {
    if (isConnected && web3Address && connectionState === 'idle') {
      // User connected via WalletConnect modal, now sign in
      handleWalletSignIn();
    }
  }, [isConnected, web3Address, connectionState, handleWalletSignIn]);

  const handleWalletConnect = async () => {
    setError(null);
    await openConnectModal();
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success('Account created! Now connect your Base Wallet.');
        setPendingWalletConnection(true);
        setAuthView('connect-wallet');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Signed in! Now connect your Base Wallet.');
        setPendingWalletConnection(true);
        setAuthView('connect-wallet');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: fullPhoneNumber });
      if (error) throw error;
      toast.success('OTP sent to your phone!');
      setAuthView('verify-otp');
      startResendTimer();
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpCode.join('');
    if (code.length !== 6) return;

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: fullPhoneNumber,
        token: code,
        type: 'sms',
      });
      if (error) throw error;
      toast.success('Verified! Now connect your Base Wallet.');
      setPendingWalletConnection(true);
      setAuthView('connect-wallet');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleArtistLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const resolved = resolveArtistLogin(artistUsername);
      if (!resolved) {
        throw new Error('Unknown artist username');
      }

      const typed = artistPassword.trim().replace(/\s+/g, '');
      const expected = resolved.password;
      if (normalizeArtistKey(typed) !== normalizeArtistKey(expected)) {
        throw new Error('Incorrect artist password');
      }

      const signInRes = await supabase.auth.signInWithPassword({
        email: resolved.email,
        password: expected,
      });

      const signInError = signInRes?.error;
      if (signInError) {
        const signUpRes = await supabase.auth.signUp({
          email: resolved.email,
          password: expected,
          options: {
            data: { artist_id: resolved.artist.id, artist_name: resolved.artist.name },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (signUpRes?.error) {
          throw signInError;
        }

        const retryRes = await supabase.auth.signInWithPassword({
          email: resolved.email,
          password: expected,
        });
        if (retryRes?.error) throw retryRes.error;
      }

      await supabase.auth.updateUser({
        data: { artist_id: resolved.artist.id, artist_name: resolved.artist.name },
      });
      await supabase.auth.refreshSession();

      await upsertArtistAudienceProfile(resolved.artist);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        await (supabase as any)
          .from('artist_accounts')
          .upsert({ artist_id: resolved.artist.id, user_id: userId }, { onConflict: 'artist_id' });
      }
      toast.success(`Signed in as ${resolved.artist.name}`);
      navigate(`/artist/${resolved.artist.id}`, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Artist login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);
    
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  // Auto-trigger wallet sign-in when wallet is detected (only on main view)
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    if ((isWalletDetected || hasWallet) && connectionState === 'idle' && !error && authView === 'main') {
      const timer = setTimeout(() => handleWalletSignIn(), 500);
      return () => clearTimeout(timer);
    }
  }, [isWalletDetected, hasWallet, authView, connectionState, error, handleWalletSignIn]);

  React.useEffect(() => {
    if (walletAddress && connectionState === 'success') {
      setConnectedAddress(walletAddress);
    }
  }, [walletAddress, connectionState]);

  const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  const getButtonContent = () => {
    switch (connectionState) {
      case 'connecting':
        return (<><Loader2 className="w-5 h-5 animate-spin mr-2" />Connecting to Wallet...</>);
      case 'signing':
        return (<><Loader2 className="w-5 h-5 animate-spin mr-2" />Sign the message...</>);
      case 'verifying':
        return (<><Loader2 className="w-5 h-5 animate-spin mr-2" />Verifying...</>);
      case 'success':
        return (<><CheckCircle2 className="w-5 h-5 mr-2" />Connected!</>);
      default:
        return (<><Wallet className="w-5 h-5 mr-2" />{hasWallet || isWalletDetected ? 'Connect Wallet' : 'Sign in with Base Wallet'}</>);
    }
  };

  const isWalletLoading = connectionState !== 'idle' && connectionState !== 'success';

  const getPasswordStrength = () => {
    if (!password) return { level: 0, label: '' };
    if (password.length < 6) return { level: 1, label: 'Weak' };
    if (password.length < 10) return { level: 2, label: 'Fair' };
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) return { level: 3, label: 'Strong' };
    return { level: 2, label: 'Fair' };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <AnimatedBackground variant="subtle" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.img
            src={logo}
            alt="$ongChainn"
            className="h-20 mx-auto mb-6"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          />
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-heading text-3xl font-bold text-foreground mb-2"
          >
            Welcome to $ongChainn
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground"
          >
            The Audience experience awaits
          </motion.p>
        </div>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="glass-card rounded-3xl p-6 shine-overlay"
        >
          <AnimatePresence mode="wait">
            {connectionState === 'success' && !pendingWalletConnection ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                  className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </motion.div>
                <h3 className="font-heading text-xl font-semibold text-foreground mb-2">Wallet Connected!</h3>
                {connectedAddress && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glass mb-4">
                    <Wallet className="w-4 h-4 text-primary" />
                    <code className="text-sm font-mono text-foreground">{formatAddress(connectedAddress)}</code>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">Entering $ongChainn...</p>
                <div className="mt-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
              </motion.div>
            ) : authView === 'connect-wallet' ? (
              <motion.div key="connect-wallet" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                    <Wallet className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
                    Connect Your Wallet
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Any wallet that supports Base network works — MetaMask, Coinbase Wallet, Rainbow, and more.
                  </p>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 mb-6">
                  <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your wallet supports culture, identity, and future ownership on $ongChainn. 
                    Music streaming requires wallet verification on Base network.
                  </p>
                </div>

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                    <p className="text-sm text-destructive text-center">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleWalletSignIn}
                  disabled={isWalletLoading}
                  className="w-full gradient-primary text-primary-foreground font-semibold h-14 rounded-2xl shadow-glow hover-scale press-effect text-base"
                >
                  {getButtonContent()}
                </Button>

                {/* WalletConnect QR Option */}
                <Button
                  onClick={handleWalletConnect}
                  disabled={isWalletLoading}
                  variant="outline"
                  className="w-full h-12 rounded-2xl mt-3 border-border/50 hover:bg-secondary/30 text-foreground font-medium"
                >
                  <QrCode className="w-5 h-5 mr-2" />
                  Scan QR with Mobile Wallet
                </Button>

                {!hasWallet && (
                  <div className="text-center pt-4 mt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-3">
                      Or install a browser wallet:
                    </p>
                    <div className="flex gap-2">
                      <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
                      >
                        MetaMask
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href="https://www.coinbase.com/wallet"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
                      >
                        Coinbase
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : authView === 'main' ? (
              <motion.div key="main" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthView('email');
                    setError(null);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl glass hover:bg-secondary/50 transition-colors press-effect mb-4"
                >
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <span className="text-foreground font-medium">Sign up with Email</span>
                </button>

                <button
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthView('email');
                    setError(null);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl glass hover:bg-secondary/50 transition-colors press-effect mb-4"
                >
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <span className="text-foreground font-medium">Sign in with Email</span>
                </button>

                <button
                  onClick={() => {
                    setArtistUsername('');
                    setArtistPassword('');
                    setAuthView('artist');
                    setError(null);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl glass hover:bg-secondary/50 transition-colors press-effect mb-4"
                >
                  <Music className="w-5 h-5 text-muted-foreground" />
                  <span className="text-foreground font-medium">Log in as Artist</span>
                </button>

                {/* Wallet Primary CTA */}
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-medium text-primary mb-4">
                    <Shield className="w-3.5 h-3.5" />
                    Base Network Wallet Required
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Connect with any wallet that supports Base network — MetaMask, Coinbase Wallet, Rainbow, etc.
                  </p>
                </div>

                {(isWalletDetected || hasWallet) && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-2 mb-4 py-2 px-3 rounded-xl bg-green-500/10 border border-green-500/20"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-400 font-medium">Wallet detected</span>
                  </motion.div>
                )}

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                    <p className="text-sm text-destructive text-center">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleWalletSignIn}
                  disabled={isWalletLoading}
                  className="w-full gradient-primary text-primary-foreground font-semibold h-14 rounded-2xl shadow-glow hover-scale press-effect text-base"
                >
                  {getButtonContent()}
                </Button>

                {/* WalletConnect QR Option - always show for mobile wallet users */}
                <Button
                  onClick={handleWalletConnect}
                  disabled={isWalletLoading}
                  variant="outline"
                  className="w-full h-12 rounded-2xl mt-3 border-border/50 hover:bg-secondary/30 text-foreground font-medium"
                >
                  <QrCode className="w-5 h-5 mr-2" />
                  Scan QR with Mobile Wallet
                </Button>

                {!hasWallet && (
                  <div className="text-center pt-4 mt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-3">
                      Or install a browser wallet:
                    </p>
                    <div className="flex gap-2">
                      <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
                      >
                        MetaMask
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href="https://www.coinbase.com/wallet"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
                      >
                        Coinbase
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Other Sign-in Options Toggle */}
                <div className="mt-6">
                  <button
                    onClick={() => setShowOtherOptions(!showOtherOptions)}
                    className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  >
                    <span>Other sign-in options (optional)</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", showOtherOptions && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {showOtherOptions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 space-y-3">
                          <p className="text-xs text-center text-muted-foreground mb-3">
                            Phone can be used alongside Base Wallet. You'll still need to connect your wallet to access music.
                          </p>
                          <button
                            onClick={() => setAuthView('phone')}
                            className="w-full flex items-center gap-3 p-3 rounded-xl glass hover:bg-secondary/50 transition-colors press-effect"
                          >
                            <Phone className="w-5 h-5 text-muted-foreground" />
                            <span className="text-foreground font-medium">Continue with Phone</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : authView === 'email' ? (
              <motion.div key="email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button
                  onClick={() => { setAuthView('main'); setError(null); }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Back</span>
                </button>

                <h3 className="font-heading text-xl font-semibold text-foreground mb-1">
                  {authMode === 'signup' ? 'Create Account' : 'Sign In'}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  You'll still need to connect Base Wallet after signing in.
                </p>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 rounded-xl glass border-border/50"
                  />
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-12 rounded-xl glass border-border/50 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {authMode === 'signup' && password && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-colors",
                              passwordStrength.level >= level
                                ? level === 1 ? "bg-red-500" : level === 2 ? "bg-yellow-500" : "bg-green-500"
                                : "bg-muted"
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{passwordStrength.label}</p>
                    </div>
                  )}

                  {error && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                      <p className="text-sm text-destructive text-center">{error}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full gradient-primary text-primary-foreground font-semibold h-12 rounded-xl"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : authMode === 'signup' ? 'Create Account' : 'Sign In'}
                  </Button>
                </form>
              </motion.div>
            ) : authView === 'artist' ? (
              <motion.div key="artist" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button
                  onClick={() => { setAuthView('main'); setError(null); }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Back</span>
                </button>

                <h3 className="font-heading text-xl font-semibold text-foreground mb-1">Log in as Artist</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  No sign up. Use your artist name and password.
                </p>

                <form onSubmit={handleArtistLogin} className="space-y-4">
                  <Input
                    placeholder="Username"
                    value={artistUsername}
                    onChange={(e) => setArtistUsername(e.target.value)}
                    required
                    className="h-12 rounded-xl glass border-border/50"
                    autoComplete="username"
                  />
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={artistPassword}
                      onChange={(e) => setArtistPassword(e.target.value)}
                      required
                      className="h-12 rounded-xl glass border-border/50 pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {error && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                      <p className="text-sm text-destructive text-center">{error}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading || !artistUsername.trim() || !artistPassword.trim()}
                    className="w-full gradient-primary text-primary-foreground font-semibold h-12 rounded-xl"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Log In'}
                  </Button>
                </form>
              </motion.div>
            ) : authView === 'phone' ? (
              <motion.div key="phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button
                  onClick={() => { setAuthView('main'); setError(null); }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Back</span>
                </button>

                <h3 className="font-heading text-xl font-semibold text-foreground mb-1">Phone Login</h3>
                <p className="text-sm text-muted-foreground mb-6">We'll send a verification code to your number.</p>

                <form onSubmit={handlePhoneAuth} className="space-y-4">
                  <div className="flex gap-2">
                    <CountryCodeSelector
                      selectedCountry={selectedCountry}
                      onSelect={setSelectedCountry}
                    />
                    <Input
                      type="tel"
                      placeholder="Phone number"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required
                      className="h-12 rounded-xl glass border-border/50 flex-1"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Full number: <span className="font-mono text-foreground">{fullPhoneNumber || `${selectedCountry.dialCode}...`}</span>
                  </p>

                  {error && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                      <p className="text-sm text-destructive text-center">{error}</p>
                    </div>
                  )}

                  <Button type="submit" disabled={isLoading || !phoneNumber} className="w-full gradient-primary text-primary-foreground font-semibold h-12 rounded-xl">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Verification Code'}
                  </Button>
                </form>
              </motion.div>
            ) : authView === 'verify-otp' ? (
              <motion.div key="verify-otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button
                  onClick={() => { setAuthView('phone'); setOtpCode(['', '', '', '', '', '']); setError(null); }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Change number</span>
                </button>

                <h3 className="font-heading text-xl font-semibold text-foreground mb-1">Enter Code</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  We sent a 6-digit code to <span className="font-mono text-foreground">{fullPhoneNumber}</span>
                </p>

                <div className="flex gap-2 justify-center mb-6">
                  {otpCode.map((digit, index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-12 h-14 text-center text-xl font-semibold rounded-xl glass border-border/50 bg-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  ))}
                </div>

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                    <p className="text-sm text-destructive text-center">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otpCode.join('').length !== 6}
                  className="w-full gradient-primary text-primary-foreground font-semibold h-12 rounded-xl"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Continue'}
                </Button>

                <div className="text-center mt-4">
                  {resendTimer > 0 ? (
                    <p className="text-sm text-muted-foreground">Resend code in <span className="font-mono text-foreground">{resendTimer}s</span></p>
                  ) : (
                    <button onClick={handlePhoneAuth} disabled={isLoading} className="text-sm text-primary hover:underline font-medium">
                      Resend code
                    </button>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 gap-3 mt-6"
        >
          <div className="py-4 px-3 rounded-2xl glass-card text-center shine-overlay">
            <Music className="w-6 h-6 mx-auto text-primary mb-2" />
            <p className="text-sm font-medium text-foreground">Stream Music</p>
            <p className="text-xs text-muted-foreground">Curated tracks</p>
          </div>
          <div className="py-4 px-3 rounded-2xl glass-card text-center shine-overlay">
            <Users className="w-6 h-6 mx-auto text-primary mb-2" />
            <p className="text-sm font-medium text-foreground">Join Community</p>
            <p className="text-xs text-muted-foreground">Town Squares</p>
          </div>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-xs text-muted-foreground mt-6"
        >
          Audience Edition • Building culture before ownership
        </motion.p>
      </motion.div>
    </div>
  );
}
