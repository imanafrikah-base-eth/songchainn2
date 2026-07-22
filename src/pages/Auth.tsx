import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ExternalLink, Loader2, Shield, Users, CheckCircle2, Mail, Phone, ChevronDown, Eye, EyeOff, ArrowLeft, AlertCircle, Play, Disc3, Flame, Sparkles, Headphones, LineChart, ArrowRight, Search, Shuffle, Bot, Store, Mic, Lock, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
const logo = '/songchainn-logo.webp';
const wavewarzHeroBackground = '/wavewarz-africa-background.png';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { SearchModal } from '@/components/SearchModal';
import { CountryCodeSelector } from '@/components/CountryCodeSelector';
import { COUNTRY_CODES, CountryCode } from '@/data/countryCodes';
import { cn } from '@/lib/utils';
import { useFarcasterContext } from '@/context/FarcasterContext';
import sdk from '@farcaster/miniapp-sdk';
import { fcOpenUrl } from '@/lib/farcasterActions';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { CATALOGS, SONGS, type Song } from '@/data/musicData';
import { usePlayerActions, usePlayerState, usePlayerTime } from '@/context/PlayerContext';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useRankedArtists, useSongPopularity, useTodayHotSongs } from '@/hooks/usePopularity';
import { useSongCoins } from '@/hooks/useSongCoins';
import { OnchainVerifiedBadge } from '@/components/OnchainVerifiedBadge';
import { WalletPicker } from '@/components/WalletPicker';
import { useDiscoveredWallets } from '@/hooks/useDiscoveredWallets';
import { GoogleSignIn } from '@/components/GoogleSignIn';
import { AmbientBackground, TileBackdrop } from '@/components/AmbientBackground';
import { CARD_TILES } from '@/data/backgroundPools';
import { ZabalGamezSection } from '@/components/ZabalGamezSection';

type ConnectionState = 'idle' | 'connecting' | 'signing' | 'verifying' | 'success';
type AuthMode = 'signin' | 'signup';
type AuthView = 'landing' | 'main' | 'email' | 'phone' | 'verify-otp' | 'connect-wallet';

// Default to Zambia
const DEFAULT_COUNTRY = COUNTRY_CODES.find(c => c.code === 'ZM') || COUNTRY_CODES[0];
const DAILY_MIX_ID = 'songchainn-daily-mix-preview';
const DAILY_MIX_URL = 'https://pub-6e7e2bb48a994314926f27fb90fa198f.r2.dev/SongChainn%20Playlist%201.mp3';
const GUEST_LOCKED_SONGS_KEY = 'songchainn_guest_locked_songs';
const ABOUT_HIGHLIGHTS = [
  {
    title: 'The Room',
    description: 'Jump into a live listening session, chat with the community, and feel the room bounce in real time.',
    icon: Headphones,
    accent: 'text-primary',
    surface: 'bg-primary/10',
    photo: CARD_TILES.theRoom,
  },
  {
    title: 'WaveWarz Africa',
    description: 'Two artists. One battle. Back your favorite in a live song battle and watch the crowd decide.',
    icon: Waves,
    accent: 'text-orange-400',
    surface: 'bg-orange-500/10',
    photo: CARD_TILES.waveWarz,
  },
  {
    title: 'DJ $huffle',
    description: "Can't decide what to play? Pick your artists, songs or catalogs and let DJ $huffle keep it flowing.",
    icon: Shuffle,
    accent: 'text-emerald-400',
    surface: 'bg-emerald-500/10',
    photo: CARD_TILES.djShuffle,
  },
  {
    title: 'Mo$ha',
    description: "Your vibe guide around $ongChainn. Ask Mo$ha anything, get put on to new music, never feel lost.",
    icon: Bot,
    accent: 'text-purple-400',
    surface: 'bg-purple-500/10',
    photo: CARD_TILES.moSha,
  },
  {
    title: 'Marketplace',
    description: 'Show love to a song early and support the artist directly. Early fans get to matter, not just the algorithm.',
    icon: Store,
    accent: 'text-cyan-400',
    surface: 'bg-cyan-500/10',
    photo: CARD_TILES.marketplace,
  },
] as const;

const ABOUT_STEPS = [
  'Hit play. Preview real songs, artists and catalogs, no account needed.',
  'Sign up free to unlock The Room, DJ $huffle, Mo$ha and your full profile.',
  'Connect a wallet later to collect and support songs on the Marketplace.',
] as const;

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithWallet, isWalletDetected, walletAddress, user, signUpWithEmail, signInWithEmail, signInWithFarcasterContext } = useAuth();
  const { isInFarcaster, context: farcasterContext } = useFarcasterContext();
  const [isFarcasterLoading, setIsFarcasterLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  
  // Auth state
  const [authView, setAuthView] = useState<AuthView>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(0);
  const [showMixFinishedPrompt, setShowMixFinishedPrompt] = useState(false);
  const [mixFinishedHandled, setMixFinishedHandled] = useState(false);
  const [guestLockedSongIds, setGuestLockedSongIds] = useState<Set<string>>(new Set());
  const [isMoshaOpen, setIsMoshaOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [moshaTransient, setMoshaTransient] = useState<string | null>(null);
  const [moshaLeadMessage, setMoshaLeadMessage] = useState(
    "I'm Mo$ha, your vibe mate and listening buddy. I can guide you through $ongChainn without pressure.",
  );
  const [isMoshaTourRunning, setIsMoshaTourRunning] = useState(false);
  const [isMoshaTourCompleted, setIsMoshaTourCompleted] = useState(false);
  const transientTimeoutRef = useRef<number | null>(null);
  const tourTimeoutsRef = useRef<number[]>([]);
  const mixPrompt30sSentRef = useRef(false);
  const mixPrompt60sSentRef = useRef(false);

  // Track if user signed in via email/phone but needs wallet
  const [pendingWalletConnection, setPendingWalletConnection] = useState(false);
  const { playSong, pause } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerState();
  const { currentTime, duration } = usePlayerTime();
  const { rankedArtists } = useRankedArtists();
  const { data: popularityData = [] } = useSongPopularity();
  const { data: hotTodaySongs = [] } = useTodayHotSongs(10);
  const { data: songCoins = [] } = useSongCoins();

  const dailyMixSong = useMemo<Song>(() => ({
    id: DAILY_MIX_ID,
    title: '$ongChainn Daily Mix',
    artist: '$ongChainn',
    artistId: 'songchainn',
    audioUrl: DAILY_MIX_URL,
    coverImage: logo,
    duration: 0,
    plays: 0,
    likes: 0,
    townSquare: 'Livingstone Town Square',
    genre: 'Afro',
  }), []);

  const popularityBySongId = useMemo(() => {
    const map = new Map<string, number>();
    popularityData.forEach((row) => {
      if (!row.song_id) return;
      map.set(row.song_id, Number(row.play_count || 0));
    });
    return map;
  }, [popularityData]);

  const previewCatalogs = useMemo(() => {
    return [...CATALOGS]
      .map((catalog) => {
        const livePlays = catalog.songIds.reduce((sum, songId) => sum + (popularityBySongId.get(songId) || 0), 0);
        const mergedPlays = Math.max(catalog.totalPlays, livePlays);
        return { ...catalog, totalPlays: mergedPlays };
      })
      .sort((a, b) => b.totalPlays - a.totalPlays)
      .slice(0, 6);
  }, [popularityBySongId]);

  const previewArtists = useMemo(() => rankedArtists.slice(0, 8), [rankedArtists]);

  const previewSongs = useMemo(() => {
    return [...SONGS].sort(
      (a, b) => (popularityBySongId.get(b.id) || b.plays || 0) - (popularityBySongId.get(a.id) || a.plays || 0)
    );
  }, [popularityBySongId]);

  // New music grouped by release: catalog drops collapse into one catalog
  // card (title + track count) while singles stand alone, pro-app style.
  const newMusicReleases = useMemo(() => {
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 7;
    type NewRelease =
      | { kind: 'single'; song: Song; addedAt: number }
      | { kind: 'catalog'; title: string; artist: string; coverImage?: string; songs: Song[]; addedAt: number };

    const catalogsByKey = new Map<string, Extract<NewRelease, { kind: 'catalog' }>>();
    const releases: NewRelease[] = [];

    SONGS.forEach((song) => {
      if (!song.addedAt) return;
      const addedAt = new Date(song.addedAt).getTime();
      if (addedAt < cutoff) return;

      if (!song.volume || song.volume === 'Single') {
        releases.push({ kind: 'single', song, addedAt });
        return;
      }
      const key = `${song.artistId}-${song.volume}`;
      const existing = catalogsByKey.get(key);
      if (existing) {
        existing.songs.push(song);
        existing.addedAt = Math.max(existing.addedAt, addedAt);
      } else {
        const entry = {
          kind: 'catalog' as const,
          title: song.volume,
          artist: song.artist,
          coverImage: song.coverImage,
          songs: [song],
          addedAt,
        };
        catalogsByKey.set(key, entry);
        releases.push(entry);
      }
    });

    return releases.sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  }, []);

  const coinAddressBySongId = useMemo(() => {
    const map = new Map<string, string>();
    songCoins.forEach((coin) => {
      if (coin.mint_status === 'minted' && coin.zora_coin_address) {
        map.set(coin.song_id, coin.zora_coin_address);
      }
    });
    return map;
  }, [songCoins]);

  // Detect installed wallets: EIP-6963 announcements plus legacy window.ethereum
  const discoveredWallets = useDiscoveredWallets();
  const hasWallet = discoveredWallets.length > 0 || (typeof window !== 'undefined' && (() => {
    const ethereum = (window as any).ethereum;
    return !!ethereum?.request;
  })());

  const fullPhoneNumber = `${selectedCountry.dialCode}${phoneNumber.replace(/\D/g, '')}`;

  const handleWalletSignIn = useCallback(async (walletRdns?: string) => {
    setError(null);
    setConnectionState('connecting');

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      setConnectionState('signing');

      const result = await signInWithWallet(walletRdns);

      if (result.error) {
        setError(result.error.message);
        setConnectionState('idle');
      } else {
        setConnectionState('verifying');
        await new Promise((resolve) => setTimeout(resolve, 350));
        setConnectionState('success');
        setPendingWalletConnection(false);
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
      setConnectionState('idle');
    }
  }, [signInWithWallet]);

  const handleFarcasterSignIn = useCallback(async () => {
    setError(null);
    setIsFarcasterLoading(true);
    try {
      // Prefer the already-resolved miniapp context; fall back to a fresh fetch
      // in case this fires before FarcasterProvider has populated it.
      let fc = farcasterContext?.user;
      if (!fc?.fid) {
        try {
          const ctx = await sdk.context;
          fc = ctx?.user;
        } catch { /* outside miniapp */ }
      }
      if (!fc?.fid) {
        setError('Could not read your Farcaster account. Open this app inside Warpcast or the Base App.');
        return;
      }
      const result = await signInWithFarcasterContext({
        fid: fc.fid,
        username: fc.username,
        displayName: fc.displayName,
        pfpUrl: fc.pfpUrl,
        location: fc.location?.description,
      });
      if (result.error) setError(result.error.message);
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (!msg.includes('cancel') && !msg.includes('reject')) {
        setError('Farcaster sign-in failed. Please try again.');
      }
    } finally {
      setIsFarcasterLoading(false);
    }
  }, [farcasterContext, signInWithFarcasterContext]);

  // Auto-open the auth modal when in Farcaster so users see the button if quickAuth fails.
  useEffect(() => {
    if (isInFarcaster && authView === 'landing') {
      setAuthView('main');
    }
  }, [isInFarcaster, authView]);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(GUEST_LOCKED_SONGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
      setGuestLockedSongIds(new Set(normalized));
    } catch {
      setGuestLockedSongIds(new Set());
    }
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (authMode === 'signup') {
        const result = await signUpWithEmail(email, password);
        if (result.error) throw result.error;
        toast.success('Account created!');
        localStorage.setItem('songchainn_needs_onboarding', '1');
        try {
          localStorage.setItem('songchainn_show_profile_photo_hint', '1');
        } catch {
          void 0;
        }
        setPendingWalletConnection(false);
        setAuthMode('signin');
      } else {
        const result = await signInWithEmail(email, password);
        if (result.error) throw result.error;
        toast.success('Signed in!');
        setPendingWalletConnection(false);
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      const lower = msg.toLowerCase();
      if (authMode === 'signup' && (lower.includes('user already registered') || lower.includes('already exists'))) {
        setError('Account already exists. Please Sign In or Reset Password.');
        setAuthMode('signin');
        setAuthView('email');
      } else if (lower.includes('invalid login credentials')) {
        setError('Invalid email or password');
      } else {
        setError(msg || 'Authentication failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    if (!email) {
      setError('Enter your email to reset your password');
      return;
    }
    if (!isSupabaseConfigured) {
      setError('Password reset is not available right now.');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setError(error.message || 'Failed to send reset email');
        return;
      }
      toast.success('Password reset email sent. Check your inbox.');
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmailLink = async () => {
    setError('Email link sign-in is currently unavailable.');
    toast.error('Email link sign-in is currently unavailable.');
  };

  const handlePhoneAuth = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      setError('Phone sign-in is currently unavailable.');
      toast.error('Phone sign-in is currently unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      setError('Phone sign-in is currently unavailable.');
      toast.error('Phone sign-in is currently unavailable.');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
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

  const showMoshaTransient = useCallback((text: string, durationMs = 10000) => {
    setMoshaTransient(text);
    if (transientTimeoutRef.current) {
      window.clearTimeout(transientTimeoutRef.current);
    }
    transientTimeoutRef.current = window.setTimeout(() => {
      setMoshaTransient(null);
      transientTimeoutRef.current = null;
    }, durationMs);
  }, []);

  const clearMoshaTourTimers = useCallback(() => {
    tourTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    tourTimeoutsRef.current = [];
  }, []);

  const handleStartDailyMix = useCallback((source: 'auto' | 'manual' = 'manual') => {
    setMixFinishedHandled(false);
    setShowMixFinishedPrompt(false);
    mixPrompt30sSentRef.current = false;
    mixPrompt60sSentRef.current = false;
    playSong(dailyMixSong, { force: true });
    if (source === 'manual') {
      toast.success('Now playing $ongChainn Daily Mix');
    }
  }, [dailyMixSong, playSong]);

  const handleSongPlayAttempt = useCallback((song: Song) => {
    if (user) {
      playSong(song, { force: true });
      return;
    }
    if (guestLockedSongIds.has(song.id)) {
      toast.error('Preview used. Sign in to unlock your full sound profile.');
      setError('Unlock your full sound profile · Save your vibe · Join live rooms · Get smarter recommendations');
      setAuthView('main');
      setAuthMode('signin');
      return;
    }
    playSong(song, { force: true });
    setGuestLockedSongIds((prev) => {
      const next = new Set(prev);
      next.add(song.id);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(GUEST_LOCKED_SONGS_KEY, JSON.stringify(Array.from(next)));
        } catch {
          void 0;
        }
      }
      return next;
    });
    setError(null);
    toast.success('Preview unlocked. After this play, sign in to save your vibe and keep going.');
  }, [guestLockedSongIds, playSong, user]);

  const handleBrowseWithoutAuthModal = useCallback(() => {
    setShowMixFinishedPrompt(false);
    setAuthMode('signin');
    setAuthView('main');
  }, []);

  const handleNewMusicPlayAttempt = useCallback(() => {
    setAuthMode('signup');
    setAuthView('main');
    setError('Sign in or create an account to play new music.');
  }, []);

  const openPublicAbout = useCallback(() => {
    navigate('/about');
    window.setTimeout(() => {
      const section = document.getElementById('about-songchainn');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, [navigate]);

  const tellAboutWaveWarz = useCallback(() => {
    showMoshaTransient(
      'WaveWarz Africa battles now run right here in $ongChainn: watch live, vote, and speak in the room. Sign up to join in, and register your music and country for rollout.',
      11000,
    );
  }, [showMoshaTransient]);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const startMoshaExploreTour = useCallback(() => {
    if (isMoshaTourRunning) return;
    clearMoshaTourTimers();
    setIsMoshaOpen(true);
    setIsMoshaTourRunning(true);
    setIsMoshaTourCompleted(false);

    const steps: Array<{ id?: string; text: string }> = [
      { text: 'This is Hot Today. It surfaces songs listeners are actively pushing right now.' },
      { id: 'about-songchainn', text: 'This section explains $ongChainn vision and what early listeners unlock first.' },
      { id: 'featured-catalogs', text: 'Featured Catalogs group the strongest drops so you can discover faster.' },
      { id: 'trending-artists', text: 'Trending Artists helps you catch talent early and stay ahead of the crowd.' },
      { id: 'all-songs', text: 'All Songs is your broad map. Sample quickly, then sign up to unlock full depth.' },
    ];

    const runStep = (index: number) => {
      if (index >= steps.length) {
        setMoshaLeadMessage('Tour complete. Are you ready to sign up, or do you want to have a taste first?');
        setIsMoshaTourRunning(false);
        setIsMoshaTourCompleted(true);
        return;
      }
      const step = steps[index];
      if (step.id) {
        scrollToSection(step.id);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setMoshaLeadMessage(step.text);
      showMoshaTransient(step.text, 3600);
      const timerId = window.setTimeout(() => runStep(index + 1), 4500);
      tourTimeoutsRef.current.push(timerId);
    };

    const starterId = window.setTimeout(() => runStep(0), 200);
    tourTimeoutsRef.current.push(starterId);
  }, [clearMoshaTourTimers, isMoshaTourRunning, scrollToSection, showMoshaTransient]);

  useEffect(() => {
    const isDailyMixActive = currentSong?.id === DAILY_MIX_ID;
    if (!isDailyMixActive || mixFinishedHandled) return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (currentTime < Math.max(1, duration - 0.35)) return;
    pause();
    setMixFinishedHandled(true);
    setShowMixFinishedPrompt(true);
    setAuthView('main');
    setError(null);
  }, [currentSong?.id, currentTime, duration, mixFinishedHandled, pause]);

  useEffect(() => {
    if (currentSong?.id !== DAILY_MIX_ID || !isPlaying) return;
    if (currentTime >= 30 && !mixPrompt30sSentRef.current) {
      mixPrompt30sSentRef.current = true;
      showMoshaTransient('Are you enjoying this mix so far?', 10000);
    }
    if (currentTime >= 60 && !mixPrompt60sSentRef.current) {
      mixPrompt60sSentRef.current = true;
      showMoshaTransient('Signup now to save your vibe and unlock full listening.', 10000);
    }
  }, [currentSong?.id, currentTime, isPlaying, showMoshaTransient]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    return () => {
      if (transientTimeoutRef.current) {
        window.clearTimeout(transientTimeoutRef.current);
      }
      clearMoshaTourTimers();
    };
  }, [clearMoshaTourTimers]);

  // Delay Mo$ha by 3 s so it doesn't block navigation on first load
  useEffect(() => {
    const t = window.setTimeout(() => setIsMoshaOpen(true), 3000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleOpen = () => setIsMoshaOpen(true);
    window.addEventListener('songchainn:open-mosha', handleOpen as EventListener);
    return () => {
      window.removeEventListener('songchainn:open-mosha', handleOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (isMoshaOpen) return;
    const cues: Array<{ id: string; text: string }> = [
      { id: 'about-songchainn', text: '$ongChainn turns listening into signal. Want the full story? Tap Learn More.' },
      { id: 'featured-catalogs', text: 'These catalogs are trending now. You can preview first, then sign in when ready.' },
      { id: 'trending-artists', text: 'Early ears catch artists before the crowd. Your taste matters here.' },
      { id: 'all-songs', text: 'Tap any track for a quick feel. Sign in later to unlock full playback.' },
    ];
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (!visible) return;
        const cue = cues.find((item) => item.id === visible.target.id);
        if (!cue || seen.has(cue.id)) return;
        seen.add(cue.id);
        showMoshaTransient(cue.text, 3400);
      },
      { threshold: 0.4 }
    );
    cues.forEach((cue) => {
      const el = document.getElementById(cue.id);
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
    };
  }, [isMoshaOpen, location.pathname, showMoshaTransient]);

  return (
    <div className="min-h-screen bg-background relative isolate overflow-x-hidden">
      <AnimatedBackground variant="subtle" />
      <AmbientBackground
        pool="presigninHero"
        opacity={0.14}
        overlay="text"
        zoom
        glow
        className="fixed -z-10"
      />
      <div className="relative z-10 min-h-screen pb-24">
        <div className="h-16 border-b border-border/40 bg-background/85 backdrop-blur sticky top-0 z-20 px-3 md:px-5">
          <div className="h-full max-w-[1400px] mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img src={logo} alt="$ongChainn" className="w-8 h-8 rounded-md object-contain" />
              <span className="font-heading font-semibold text-foreground text-lg hidden sm:inline">$ongChainn</span>
            </div>
            <div className="hidden lg:flex items-center gap-6 text-sm text-muted-foreground">
              <button type="button" onClick={() => scrollToSection('about-songchainn')} className="hover:text-foreground transition-colors">About</button>
              <button type="button" onClick={handleBrowseWithoutAuthModal} className="hover:text-foreground transition-colors">Premium Music</button>
              <button type="button" onClick={() => navigate('/install')} className="hover:text-foreground transition-colors">Install App</button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-xs"
                aria-label="Search"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Search</span>
              </button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-muted-foreground hover:text-foreground px-4"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthView('email');
                }}
              >
                Sign up
              </Button>
              <Button
                type="button"
                className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-5"
                onClick={() => {
                  setAuthMode('signin');
                  setAuthView('email');
                }}
              >
                Log in
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-3 md:px-4 pt-3 md:pt-4">
          <ZabalGamezSection source="auth" />
        </div>

        <div className={`max-w-[1400px] mx-auto p-3 md:p-4${hotTodaySongs.length > 0 ? ' lg:grid lg:grid-cols-[280px_1fr] lg:gap-4' : ''}`}>
          {hotTodaySongs.length > 0 && (
          <aside className="hidden lg:block rounded-xl border border-border/40 bg-background/80 backdrop-blur p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Hot Today</h3>
              <Flame className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {hotTodaySongs.slice(0, 10).map(({ song, playsToday }, index) => (
                <button
                  key={`sidebar-hot-${song.id}`}
                  type="button"
                  onClick={() => handleSongPlayAttempt(song)}
                  className={cn(
                    "w-full rounded-xl transition-colors p-2 text-left",
                    !user && guestLockedSongIds.has(song.id)
                      ? "bg-secondary/20 border border-primary/30"
                      : "bg-secondary/35 hover:bg-secondary/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-md overflow-hidden bg-background/60 flex items-center justify-center shrink-0">
                      {song.coverImage ? (
                        <img src={song.coverImage} alt={song.title} className="w-full h-full object-cover" loading="eager" width="40" height="40" />
                      ) : (
                        <img src={logo} alt={song.title} className="w-6 h-6 object-contain opacity-80" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground truncate">{song.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{song.artist}</p>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1.5">
                    <span className="text-[10px] text-primary font-semibold">#{index + 1}</span>
                    {coinAddressBySongId.has(song.id) && (
                      <OnchainVerifiedBadge coinAddress={coinAddressBySongId.get(song.id)!} size="sm" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </aside>
          )}

          <main className="rounded-xl border border-border/40 bg-background/80 backdrop-blur p-4 md:p-5">
            {/* Landing hero */}
            <section className="relative isolate overflow-hidden rounded-2xl mb-7 p-5 md:p-8 min-h-[13rem] flex flex-col justify-center">
              <TileBackdrop image={CARD_TILES.heroArtist} opacity={0.55} />
              <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground leading-[1.08]">
                Discover.
                <br />
                Vibe.
                <br />
                Support.
              </h1>
              <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-xs">
                Real music. Real people. Real connection.
              </p>
            </section>

            {hotTodaySongs.length > 0 && (
            <section id="hot-today" className="mb-7 lg:hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-heading text-foreground">Hot Today</h2>
                <button type="button" onClick={handleBrowseWithoutAuthModal} className="text-sm text-muted-foreground hover:text-foreground">Show all</button>
              </div>
              <div className="max-h-[420px] overflow-y-auto pr-1 sm:pr-2">
              <div className="grid grid-cols-2 gap-3">
                {hotTodaySongs.slice(0, 10).map(({ song, playsToday }, index) => (
                  <button
                    key={`mobile-hot-${song.id}`}
                    type="button"
                    onClick={() => handleSongPlayAttempt(song)}
                    className={cn(
                      "text-left rounded-xl transition-colors p-2.5",
                      !user && guestLockedSongIds.has(song.id)
                        ? "bg-secondary/20 border border-primary/30"
                        : "bg-secondary/30 hover:bg-secondary/45"
                    )}
                  >
                    <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-background/60 flex items-center justify-center">
                      {song.coverImage ? (
                        <img src={song.coverImage} alt={song.title} className="w-full h-full object-cover" loading="eager" />
                      ) : (
                        <img src={logo} alt={song.title} className="w-16 h-16 object-contain opacity-80" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    <div className="mt-1 flex items-center justify-between gap-1.5">
                      <span className="text-[11px] text-primary font-semibold">#{index + 1}</span>
                      {coinAddressBySongId.has(song.id) && (
                        <OnchainVerifiedBadge coinAddress={coinAddressBySongId.get(song.id)!} size="sm" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              </div>
            </section>
            )}

            <div className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border border-primary/20 p-4 md:p-5 mb-6">
              <TileBackdrop image={CARD_TILES.dailyMix} opacity={0.32} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-primary font-semibold flex items-center gap-1.5 mb-1">
                    <Disc3 className="w-3.5 h-3.5" />
                    Daily mix preview
                  </p>
                  <h1 className="font-heading text-2xl md:text-3xl text-foreground mb-1">Have a taste</h1>
                  <p className="text-sm text-muted-foreground">
                    Use accents and playlists. Find this and more mixes on $ongChainn.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => scrollToSection('about-songchainn')}
                    className="rounded-full border-primary/30 text-primary hover:bg-primary/10"
                  >
                    About $ongChainn
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button type="button" onClick={() => handleStartDailyMix('manual')} className="gradient-primary text-primary-foreground rounded-full px-5">
                    <Play className="w-4 h-4 mr-2" />
                    {currentSong?.id === DAILY_MIX_ID && isPlaying ? 'Playing' : 'Play mix'}
                  </Button>
                </div>
              </div>
            </div>

            <section id="about-songchainn" className="mb-7 scroll-mt-24">
              <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-background via-background to-primary/5 p-5 md:p-6">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary mb-3">
                      <Sparkles className="w-3.5 h-3.5" />
                      About $ongChainn
                    </div>
                    <h2 className="font-heading text-2xl md:text-3xl text-foreground mb-3">
                      This is $ongChainn. Come have some fun.
                    </h2>
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-5">
                      Press play, hang out in The Room, back your favorite in a WaveWarz Africa battle, or just let
                      DJ $huffle and Mo$ha keep you company. Preview it all right now, no account needed.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                      {ABOUT_HIGHLIGHTS.map(({ title, description, icon: Icon, accent, surface, photo }) => (
                        <div key={title} className="relative isolate overflow-hidden rounded-2xl border border-border/40 bg-background/70 p-4">
                          <TileBackdrop image={photo} opacity={0.38} />
                          <div className={`inline-flex rounded-xl p-2 ${surface} mb-3`}>
                            <Icon className={`w-4 h-4 ${accent}`} />
                          </div>
                          <h3 className="text-sm font-semibold text-foreground mb-1.5">{title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                        </div>
                      ))}
                    </div>

                    <div className="relative isolate overflow-hidden mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <TileBackdrop image={CARD_TILES.makeMusic} opacity={0.28} />
                      <div className="flex items-start gap-2.5">
                        <Mic className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Make music?</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Submit your music to $ongChainn and get discovered by early listeners.
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full border-primary/30 text-primary hover:bg-primary/10 shrink-0"
                        onClick={() => navigate('/about#artist-submission')}
                      >
                        Submit Your Music
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 md:p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                        How your journey works
                      </p>
                      <div className="space-y-3">
                        {ABOUT_STEPS.map((step, index) => (
                          <div key={step} className="flex items-start gap-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                              {index + 1}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="relative isolate overflow-hidden rounded-2xl border border-border/40 bg-background/80 p-4 md:p-5">
                      <TileBackdrop image={CARD_TILES.signupCrowd} opacity={0.4} />
                      <p className="text-sm font-semibold text-foreground mb-2">Ready to jump in?</p>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                        Create a free account and unlock the full experience, The Room, DJ $huffle, Mo$ha and more.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="rounded-full gradient-primary text-primary-foreground"
                          onClick={() => {
                            setAuthMode('signup');
                            setAuthView('email');
                          }}
                        >
                          Sign up free
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => {
                            setAuthMode('signin');
                            setAuthView('email');
                          }}
                        >
                          Log in
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="featured-catalogs" className="mb-7">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-heading text-foreground">Today’s Featured Catalogs</h2>
                <button type="button" onClick={handleBrowseWithoutAuthModal} className="text-sm text-muted-foreground hover:text-foreground">Show all</button>
              </div>
              <div className="max-h-[420px] overflow-y-auto pr-1 sm:pr-2">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {previewCatalogs.map((catalog) => (
                  <button
                    key={catalog.id}
                    type="button"
                    onClick={handleBrowseWithoutAuthModal}
                    className="text-left rounded-xl bg-secondary/30 hover:bg-secondary/45 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg p-2.5 group"
                  >
                    <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-background/60 flex items-center justify-center">
                      {catalog.coverImage ? (
                        <img src={catalog.coverImage} alt={catalog.title} className="w-full h-full object-cover" />
                      ) : (
                        <img src={logo} alt={catalog.title} className="w-16 h-16 object-contain opacity-80" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                          <Play className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{catalog.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{catalog.artist}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{catalog.trackCount} tracks • {catalog.totalPlays.toLocaleString()} plays</p>
                  </button>
                ))}
              </div>
              </div>
            </section>

            {newMusicReleases.length > 0 && (
            <section id="new-music" className="mb-7">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-heading text-foreground">New Music</h2>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-primary/15 text-primary">
                    <Sparkles className="w-3 h-3" />
                    Just Dropped
                  </span>
                </div>
                <button type="button" onClick={handleNewMusicPlayAttempt} className="text-sm text-muted-foreground hover:text-foreground">Show all</button>
              </div>
              <div className="max-h-[420px] overflow-y-auto pr-1 sm:pr-2">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {newMusicReleases.map((release) => (
                    release.kind === 'catalog' ? (
                      <button
                        key={`catalog-${release.artist}-${release.title}`}
                        type="button"
                        onClick={handleNewMusicPlayAttempt}
                        className="text-left rounded-xl bg-secondary/30 hover:bg-secondary/45 border border-primary/25 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg p-2.5 group"
                      >
                        <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-background/60 flex items-center justify-center">
                          {release.coverImage ? (
                            <img src={release.coverImage} alt={release.title} className="w-full h-full object-cover" />
                          ) : (
                            <img src={logo} alt={release.title} className="w-16 h-16 object-contain opacity-80" />
                          )}
                          <span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-full bg-background/85 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Catalog
                          </span>
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4">
                            <p className="text-[10px] font-medium text-white/90">{release.songs.length} tracks</p>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                              <Play className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" />
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{release.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{release.artist}</p>
                      </button>
                    ) : (
                      <button
                        key={release.song.id}
                        type="button"
                        onClick={handleNewMusicPlayAttempt}
                        className="text-left rounded-xl bg-secondary/30 hover:bg-secondary/45 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg p-2.5 group"
                      >
                        <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-background/60 flex items-center justify-center">
                          {release.song.coverImage ? (
                            <img src={release.song.coverImage} alt={release.song.title} className="w-full h-full object-cover" />
                          ) : (
                            <img src={logo} alt={release.song.title} className="w-16 h-16 object-contain opacity-80" />
                          )}
                          <span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-full bg-background/85 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Single
                          </span>
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                              <Play className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" />
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{release.song.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{release.song.artist}</p>
                        {coinAddressBySongId.has(release.song.id) && (
                          <OnchainVerifiedBadge coinAddress={coinAddressBySongId.get(release.song.id)!} size="sm" className="mt-1.5" />
                        )}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </section>
            )}

            <section id="trending-artists" className="mb-7">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-heading text-foreground">Trending Artists</h2>
                <button type="button" onClick={handleBrowseWithoutAuthModal} className="text-sm text-muted-foreground hover:text-foreground">Show all</button>
              </div>
              <div className="max-h-[340px] overflow-y-auto pr-1 sm:pr-2">
              <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-8 gap-3">
                {previewArtists.map((artist) => (
                  <button key={artist.id} type="button" onClick={handleBrowseWithoutAuthModal} className="text-center group">
                    <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden bg-secondary/40 border border-border/40 mx-auto mb-2 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                      {artist.profileImage ? (
                        <>
                          <img
                            src={artist.profileImage}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110"
                          />
                          <img
                            src={artist.profileImage}
                            alt={artist.name}
                            className="relative w-full h-full object-contain"
                            loading="lazy"
                          />
                        </>
                      ) : (
                        <Users className="w-7 h-7 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-foreground truncate">{artist.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{artist.location}</p>
                  </button>
                ))}
              </div>
              </div>
            </section>

            <section id="all-songs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-heading text-foreground">All Songs</h2>
                <div className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium bg-primary/10 text-primary">
                  One free play per song
                </div>
              </div>
              <div className="max-h-[420px] overflow-y-auto pr-1 sm:pr-2">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {previewSongs.map((song) => (
                    <div
                      key={song.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSongPlayAttempt(song)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSongPlayAttempt(song); } }}
                      className={cn(
                        "text-left rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg p-2.5 group cursor-pointer",
                        !user && guestLockedSongIds.has(song.id)
                          ? "bg-secondary/20 border border-primary/30"
                          : "bg-secondary/30 hover:bg-secondary/45"
                      )}
                    >
                      <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-background/60 flex items-center justify-center">
                        {song.coverImage ? (
                          <img src={song.coverImage} alt={song.title} className="w-full h-full object-cover" />
                        ) : (
                          <img src={logo} alt={song.title} className="w-16 h-16 object-contain opacity-80" />
                        )}
                        {!user && guestLockedSongIds.has(song.id) ? (
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center">
                            <Lock className="w-3 h-3 text-primary" />
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                              <Play className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" />
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                      <p className="text-[11px] text-muted-foreground truncate mt-1">{song.genre}</p>
                      {coinAddressBySongId.has(song.id) && (
                        <OnchainVerifiedBadge coinAddress={coinAddressBySongId.get(song.id)!} size="sm" className="mt-1.5" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </main>
        </div>

        {isMoshaOpen ? (
          <div className="fixed right-3 sm:right-5 bottom-24 z-[64] w-[min(calc(100vw-1.25rem),22rem)]">
            <div className="rounded-2xl border border-primary/30 bg-background/95 backdrop-blur p-3 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">Hey fam.</span> {moshaLeadMessage}
                </p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setIsMoshaOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button type="button" className="h-9 text-xs" onClick={openPublicAbout}>
                  Learn more about $ongChainn
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 text-xs border-primary/30 text-primary"
                  onClick={startMoshaExploreTour}
                  disabled={isMoshaTourRunning}
                >
                  {isMoshaTourRunning ? 'Exploring...' : 'Click here if ready to explore'}
                </Button>
              </div>
              {isMoshaTourCompleted && !isMoshaTourRunning && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-9 text-xs"
                    onClick={() => {
                      setAuthMode('signup');
                      setAuthView('email');
                    }}
                  >
                    Signup now
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 text-xs border-primary/30 text-primary"
                    onClick={() => handleStartDailyMix('manual')}
                  >
                    Want to have a taste
                  </Button>
                </div>
              )}
              {moshaTransient && (
                <div className="mt-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground">
                  {moshaTransient}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="fixed right-3 sm:right-5 bottom-24 z-[64] flex flex-col items-end gap-2">
            {moshaTransient && (
              <div className="max-w-xs rounded-xl border border-primary/30 bg-background/95 px-3 py-2 text-xs text-foreground shadow-xl">
                {moshaTransient}
              </div>
            )}
            <Button type="button" className="rounded-full h-10 px-4 gradient-primary text-primary-foreground" onClick={() => setIsMoshaOpen(true)}>
              Call Mo$ha
            </Button>
          </div>
        )}

        {(authView !== 'landing' || connectionState === 'success') && (
          <div className="fixed inset-0 z-[65] bg-background/70 backdrop-blur-sm p-3 sm:p-4 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-[90vw] max-w-[18.5rem] sm:w-full sm:max-w-sm border border-primary/25 bg-background/95 shadow-2xl rounded-2xl p-3 sm:p-5 shine-overlay max-h-[80vh] sm:max-h-[88vh] overflow-auto"
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
                    Connect with Base App and Base-supported wallets like Coinbase Wallet, MetaMask, Rainbow, and more.
                  </p>
                </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 mb-6">
                  <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your wallet supports culture, identity, and future ownership on $ongChainn.
                    You can connect it now or later.
                  </p>
                </div>

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                    <p className="text-sm text-destructive text-center">{error}</p>
                  </div>
                )}

                <WalletPicker
                  onConnect={handleWalletSignIn}
                  busy={isWalletLoading}
                  busyContent={getButtonContent()}
                />

                {!hasWallet && !isWalletDetected && connectionState === 'idle' && (
                  <div className="text-center pt-4 mt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-3">No wallet? Install one:</p>
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
                    setAuthView('landing');
                    setError(null);
                  }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-3 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Back</span>
                </button>
                <div className="mb-6 text-center">
                  <h2 className="font-heading text-2xl font-semibold text-foreground">Log in to $ongChainn</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Continue your music journey or create a new account.
                  </p>
                </div>

                {/* Farcaster sign-in — auto-fires via quickAuth; button is fallback */}
                {isInFarcaster && (
                  <button
                    onClick={handleFarcasterSignIn}
                    disabled={isFarcasterLoading}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#7c3aed] text-white hover:opacity-95 transition-colors press-effect mb-3 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-3">
                      {isFarcasterLoading
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.24 0H5.76A5.76 5.76 0 0 0 0 5.76v12.48A5.76 5.76 0 0 0 5.76 24h12.48A5.76 5.76 0 0 0 24 18.24V5.76A5.76 5.76 0 0 0 18.24 0ZM7.92 18l-3.12-9h2.4l1.8 5.64L10.8 9h2.4l1.8 5.64L16.8 9h2.4L16.08 18h-2.4l-1.68-5.28L10.32 18H7.92Z"/></svg>
                      }
                      <span className="font-semibold">
                        {isFarcasterLoading ? 'Signing you in…' : 'Continue with Farcaster'}
                      </span>
                    </span>
                    {!isFarcasterLoading && <span className="text-xs opacity-80">Tap if not auto-signed</span>}
                  </button>
                )}

                {/* Google sign-in: official button + One Tap auto prompt */}
                <GoogleSignIn oneTap onError={setError} />

                <button
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthView('email');
                    setError(null);
                  }}
                  className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-primary text-primary-foreground hover:opacity-95 transition-colors press-effect mb-3"
                >
                  <span className="flex items-center gap-3">
                    <Mail className="w-5 h-5" />
                    <span className="font-semibold">Sign in with Email</span>
                  </span>
                  <span className="text-xs opacity-90">Returning user</span>
                </button>

                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthView('email');
                    setError(null);
                  }}
                  className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl border border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10 transition-colors press-effect mb-5"
                >
                  <span className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-primary" />
                    <span className="font-semibold">Create new account</span>
                  </span>
                  <span className="text-xs text-muted-foreground">First time</span>
                </button>

                {/* Wallet Primary CTA */}
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-medium text-primary mb-4">
                    <Shield className="w-3.5 h-3.5" />
                    Base Wallet (optional)
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Connect Base App or any Base-supported wallet for on-chain features.
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

                <WalletPicker
                  onConnect={handleWalletSignIn}
                  busy={isWalletLoading}
                  busyContent={getButtonContent()}
                />

                {!hasWallet && !isWalletDetected && connectionState === 'idle' && (
                  <div className="text-center pt-4 mt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-3">No wallet? Install one:</p>
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
                            Phone sign-in works without a wallet. You can connect one later.
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

                <div className="inline-flex items-center rounded-2xl bg-muted/40 p-1 mb-5 w-full">
                  <button
                    type="button"
                    onClick={() => setAuthMode('signin')}
                    className={cn(
                      "flex-1 h-9 rounded-xl text-sm font-medium transition-colors",
                      authMode === 'signin'
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('signup')}
                    className={cn(
                      "flex-1 h-9 rounded-xl text-sm font-medium transition-colors",
                      authMode === 'signup'
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Sign Up
                  </button>
                </div>

                <h3 className="font-heading text-xl font-semibold text-foreground mb-1">
                  {authMode === 'signup' ? 'Create Account' : 'Sign In'}
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  {authMode === 'signup'
                    ? 'Pick your way in: Google, Base wallet, or email.'
                    : 'Welcome back. Google, Base wallet, or email.'}
                </p>

                {/* All sign-in options up front: Google + wallets first */}
                <GoogleSignIn oneTap onError={setError} />

                <WalletPicker
                  onConnect={handleWalletSignIn}
                  busy={isWalletLoading}
                  busyContent={getButtonContent()}
                />

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-xs text-muted-foreground">
                    or {authMode === 'signup' ? 'sign up' : 'sign in'} with email
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>

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

                  {authMode === 'signup' && (
                    <p className="text-xs text-muted-foreground">
                      Create your new password.
                    </p>
                  )}

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
                    className={cn(
                      "w-full font-semibold h-12 rounded-xl",
                      authMode === 'signup'
                        ? "bg-green-600 hover:bg-green-600/90 text-white"
                        : "gradient-primary text-primary-foreground"
                    )}
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : authMode === 'signup' ? 'Create new account' : 'Log in'}
                  </Button>

                  {authMode === 'signup' && (
                    <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                      By creating an account you agree to the{' '}
                      <Link to="/terms" className="text-primary underline-offset-2 hover:underline">
                        $ongChainn Terms of Use and Privacy Notice
                      </Link>
                      , including how we handle your data.
                    </p>
                  )}

                  {authMode === 'signin' && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isLoading}
                        onClick={handleSendEmailLink}
                        className="w-full h-12 rounded-xl border-border/50 hover:bg-secondary/30 text-foreground font-medium"
                      >
                        Email me a sign-in link
                      </Button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={handleForgotPassword}
                        className="w-full text-xs text-muted-foreground hover:text-foreground mt-2 underline-offset-2 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </>
                  )}
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
          </div>
        )}

      </div>
      {showMixFinishedPrompt && (
        <div className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-primary font-semibold mb-2">Daily Mix Finished</p>
            <h3 className="font-heading text-xl text-foreground mb-2">Want more music?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Sign in or sign up to keep playing catalogs, discover artists, and unlock the full $ongChainn experience.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setAuthView('email');
                  setShowMixFinishedPrompt(false);
                }}
                className="gradient-primary text-primary-foreground"
              >
                Sign In
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthView('email');
                  setShowMixFinishedPrompt(false);
                }}
                className="border-primary/40 text-primary"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      )}
      <AudioPlayer />
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
}
