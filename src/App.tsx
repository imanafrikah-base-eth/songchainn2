"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WORLDS_ENABLED, WORLD_BUILDER_ENABLED } from "@/lib/features";
import { lazyWithRecovery } from "@/lib/chunkRecovery";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, matchPath } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PlayerProvider } from "@/context/PlayerContext";
import { EngagementProvider } from "@/context/EngagementContext";
import { OfflineQueueProvider } from "@/hooks/useOfflineQueue";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ConnectWalletModal } from "@/components/ConnectWalletModal";
import { AgePrompt } from "@/components/AgePrompt";
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";
import { PointsMilestones } from "@/components/PointsMilestones";
import { RoomPresenceKeeper } from "@/components/RoomPresenceKeeper";
import { NotificationBanner } from "@/components/NotificationBanner";
import { GlobalAmbientLayer } from "@/components/GlobalAmbientLayer";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
const VibeAgent = lazyWithRecovery(() => import("@/components/VibeAgent").then(m => ({ default: m.VibeAgent })));
const BehaviorCtaPopups = lazyWithRecovery(() => import("@/components/BehaviorCtaPopups").then(m => ({ default: m.BehaviorCtaPopups })));
import { useUserPresence } from "@/hooks/useUserPresence";
import { FarcasterProvider, useFarcasterContext } from "@/context/FarcasterContext";
import { FacebookProvider } from "@/context/FacebookContext";
import { supabase } from "@/integrations/supabase/client";
// Lazy load pages for better initial load performance
const Home = lazyWithRecovery(() => import("./pages/Home"));
const Discover = lazyWithRecovery(() => import("./pages/Discover"));
const Artists = lazyWithRecovery(() => import("./pages/Artists"));
const ArtistDetail = lazyWithRecovery(() => import("./pages/ArtistDetail"));
const CatalogDetail = lazyWithRecovery(() => import("./pages/CatalogDetail"));
const SongDetail = lazyWithRecovery(() => import("./pages/SongDetail"));
const PlaylistDetail = lazyWithRecovery(() => import("./pages/PlaylistDetail"));
const Playlists = lazyWithRecovery(() => import("./pages/Playlists"));
const Marketplace = lazyWithRecovery(() => import("./pages/Marketplace"));
const Wallet = lazyWithRecovery(() => import("./pages/Wallet"));
const Admin = lazyWithRecovery(() => import("./pages/Admin"));
const Auth = lazyWithRecovery(() => import("./pages/Auth"));
const Onboarding = lazyWithRecovery(() => import("./pages/Onboarding"));
const Profile = lazyWithRecovery(() => import("./pages/Profile"));
const Social = lazyWithRecovery(() => import("./pages/Social"));
const Community = lazyWithRecovery(() => import("./pages/Community"));
const AudienceProfile = lazyWithRecovery(() => import("./pages/AudienceProfile"));
const Install = lazyWithRecovery(() => import("./pages/Install"));
const NotFound = lazyWithRecovery(() => import("./pages/NotFound"));
const ResetPassword = lazyWithRecovery(() => import("./pages/ResetPassword"));
const Room = lazyWithRecovery(() => import("./pages/Room"));
const About = lazyWithRecovery(() => import("./pages/About"));
const Leaderboard = lazyWithRecovery(() => import("./pages/Leaderboard"));
const WaveWarzBattleZoneFeature = lazyWithRecovery(() => import("./pages/WaveWarzBattleZoneFeature"));
const DjShuffle = lazyWithRecovery(() => import("./pages/DjShuffle"));
const Inbox = lazyWithRecovery(() => import("./pages/Inbox"));
const BetterCallZaal = lazyWithRecovery(() => import("./pages/BetterCallZaal"));
const SlugResolver = lazyWithRecovery(() => import("./pages/SlugResolver"));
const World = lazyWithRecovery(() => import("./pages/World"));
const WorldBuilder = lazyWithRecovery(() => import("@/pages/WorldBuilder"));
const Studio = lazyWithRecovery(() => import("./pages/Studio"));
const Launch = lazyWithRecovery(() => import("./pages/Launch"));
const NftLauncher = lazyWithRecovery(() => import("./pages/NftLauncher"));
const ClaimArtist = lazyWithRecovery(() => import("./pages/ClaimArtist"));
const Policy = lazyWithRecovery(() => import("./pages/Policy"));
const DeleteAccountPage = lazyWithRecovery(() => import("./pages/DeleteAccountPage"));
const Licensing = lazyWithRecovery(() => import("./pages/Licensing"));
const Keys = lazyWithRecovery(() => import("./pages/Keys"));
const Console = lazyWithRecovery(() => import("./pages/Console"));


// Loading spinner component
function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RedirectHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  const redirectPath = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const r = searchParams.get('r');
    if (!r) return null;
    if (!r.startsWith('/')) return null;
    return r;
  }, [location.search]);

  useEffect(() => {
    if (!redirectPath) return;
    navigate(redirectPath, { replace: true });
  }, [navigate, redirectPath]);

  return null;
}

function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const hideChrome = location.pathname.startsWith('/room');
  const isWaveWarzEmbedRoute =
    location.pathname === '/wavewarz-africa/results';
  // Artist Worlds are a full-screen immersive layer with their own chrome
  const isWorldRoute = location.pathname.startsWith('/world/');
  const hideFloatingChrome = hideChrome || isWaveWarzEmbedRoute || isWorldRoute;
  const [isGlobalPulsing, setIsGlobalPulsing] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const pulseTimeoutRef = useRef<number | null>(null);

  const triggerGlobalPulse = useCallback((source: string, songId: string | null, senderId: string | null) => {
    if (import.meta.env.DEV) {
      console.log('pulse event received', { source, songId, senderId });
    }
    setIsGlobalPulsing(false);
    window.requestAnimationFrame(() => {
      setIsGlobalPulsing(true);
      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
      pulseTimeoutRef.current = window.setTimeout(() => {
        setIsGlobalPulsing(false);
      }, 650);
    });
  }, []);

  useEffect(() => {
    const channel = supabase.channel('global-pulse-effects');
    const onLocalPulse = (event: Event) => {
      const detail = (event as CustomEvent<{ songId?: string; userId?: string | null }>).detail;
      triggerGlobalPulse('local', detail?.songId ?? null, detail?.userId ?? null);
    };

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'song_analytics' }, payload => {
      const row = (payload as any)?.new as { event_type?: string; song_id?: string; user_id?: string | null } | undefined;
      if (!row || row.event_type !== 'pulse') return;
      if (row.user_id && row.user_id === user?.id) return;
      triggerGlobalPulse('realtime', row.song_id ?? null, row.user_id ?? null);
    });

    channel.subscribe();
    window.addEventListener('songchainn:pulse', onLocalPulse as EventListener);
    return () => {
      window.removeEventListener('songchainn:pulse', onLocalPulse as EventListener);
      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [triggerGlobalPulse, user?.id]);

  const rootPulseClass = isGlobalPulsing
    ? prefersReducedMotion
      ? 'app-global-pulse app-global-pulse--reduced'
      : 'app-global-pulse'
    : '';

  return (
    <>
      <div className={`${hideFloatingChrome ? '' : 'pb-chrome lg:pb-0'} ${rootPulseClass}`.trim()}>
        <GlobalAmbientLayer isGlobalPulsing={isGlobalPulsing} prefersReducedMotion={prefersReducedMotion} />
        <RedirectHandler />
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -8 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/artists" element={<Artists />} />
                <Route path="/artist/:id" element={<ArtistDetail />} />
                <Route path="/catalog/:id" element={<CatalogDetail />} />
                <Route path="/song/:id" element={<SongDetail />} />
                <Route path="/playlist/:id" element={<PlaylistDetail />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/post/:id" element={<Social />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/social" element={<Social />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/community" element={<Community />} />
                <Route path="/audience/:userId" element={<AudienceProfile />} />
                <Route path="/about" element={<About />} />
                <Route path="/terms" element={<Policy which="terms" />} />
                  <Route path="/guidelines" element={<Policy which="guidelines" />} />
                <Route path="/console" element={<Console />} />
                {/* Google Play's listing form requires a privacy policy URL. The
                    terms page is titled "Terms of Use and Privacy Notice", so
                    /privacy is an alias onto it. */}
                <Route path="/privacy" element={<Policy which="privacy" />} />
                <Route path="/delete-account" element={<DeleteAccountPage />} />
                <Route path="/license/:songId" element={<Licensing />} />
                <Route path="/license" element={<Licensing />} />
                <Route path="/keys" element={<Keys />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/studio" element={<Studio />} />
                <Route path="/launch" element={<Launch />} />
                <Route path="/drops/:worldSlug" element={<NftLauncher />} />
                <Route path="/claim" element={<ClaimArtist />} />
                <Route path="/wavewarz-africa/*" element={<WaveWarzBattleZoneFeature />} />
                <Route path="/dj-shuffle" element={<DjShuffle />} />
                <Route path="/install" element={<Install />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/room" element={<Room />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/bettercallzaal" element={<BetterCallZaal />} />
                {WORLDS_ENABLED && <Route path="/world/:worldSlug" element={<World />} />}
                {WORLD_BUILDER_ENABLED && <Route path="/world-builder" element={<WorldBuilder />} />}
                {WORLD_BUILDER_ENABLED && <Route path="/w/:slug" element={<World />} />}
                {WORLDS_ENABLED && <Route path="/world/:worldSlug/:roomSlug" element={<World />} />}
                <Route path="/auth" element={<Navigate to="/" replace />} />
                <Route path="/not-found" element={<NotFound />} />
                {/* Vanity slug routes — must be after all specific routes */}
                <Route path="/:artistSlug/:songSlug" element={<SlugResolver />} />
                <Route path="/:artistSlug" element={<SlugResolver />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </div>
      {!hideFloatingChrome && <ErrorBoundary fallback={null}><Suspense fallback={null}><VibeAgent /></Suspense></ErrorBoundary>}
      {!hideFloatingChrome && <ErrorBoundary fallback={null}><Suspense fallback={null}><BehaviorCtaPopups /></Suspense></ErrorBoundary>}
      {/* The Phase Two launch announcement has served its purpose. Nothing is
          in beta or in a phase any more; WhatsLive on Home says what is here. */}
      {!hideFloatingChrome && <ErrorBoundary fallback={null}><BottomTabBar /></ErrorBoundary>}
      {/* Accounts that existed before we asked for a date of birth. The age
          checks fail closed, so without this every one of them quietly loses
          uploads and messaging. */}
      {!hideFloatingChrome && <ErrorBoundary fallback={null}><AgePrompt /></ErrorBoundary>}
      <ErrorBoundary fallback={null}><UpdateAvailableBanner /></ErrorBoundary>
      <ErrorBoundary fallback={null}><ConnectWalletModal /></ErrorBoundary>
      <ErrorBoundary fallback={null}><PointsMilestones /></ErrorBoundary>
      <ErrorBoundary fallback={null}><RoomPresenceKeeper /></ErrorBoundary>
    </>
  );
}

// Routes that are visible to everyone — no auth gate, no auth spinner
const PUBLIC_PATTERNS = [
  '/about', '/artists', '/artist/:id', '/catalog/:id', '/song/:id', '/delete-account', '/license', '/license/:songId', '/keys',
  '/wavewarz-africa', '/wavewarz-africa/*', '/install', '/reset-password', '/bettercallzaal',
  ...(WORLDS_ENABLED ? ['/world/:worldSlug', '/world/:worldSlug/:roomSlug'] : []),
  // A world an artist built and shared is the whole point of building one. It
  // used to fall through to the not-found page for anyone not signed in.
  ...(WORLD_BUILDER_ENABLED ? ['/w/:slug'] : []),
];

function isPublicRoute(pathname: string) {
  return PUBLIC_PATTERNS.some((p) => matchPath(p, pathname));
}

// AppContent must be rendered inside AuthProvider and BrowserRouter
function AppContent() {
  const { isAuthenticated, isLoading, needsOnboarding, user } = useAuth();
  const { isInFarcaster, quickAuthFailed } = useFarcasterContext();
  const location = useLocation();
  useUserPresence(user?.id ?? null, { includeLastSeen: true });

  // Public routes bypass the auth loading spinner — render immediately
  if (isLoading && isPublicRoute(location.pathname)) {
    return (
      <ErrorBoundary>
        <PlayerProvider>
          <EngagementProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/about" element={<About />} />
                <Route path="/terms" element={<Policy which="terms" />} />
                  <Route path="/guidelines" element={<Policy which="guidelines" />} />
                <Route path="/privacy" element={<Policy which="privacy" />} />
                <Route path="/delete-account" element={<DeleteAccountPage />} />
                <Route path="/license/:songId" element={<Licensing />} />
                <Route path="/license" element={<Licensing />} />
                <Route path="/keys" element={<Keys />} />
                <Route path="/artists" element={<Artists />} />
                <Route path="/artist/:id" element={<ArtistDetail />} />
                <Route path="/catalog/:id" element={<CatalogDetail />} />
                <Route path="/song/:id" element={<SongDetail />} />
                <Route path="/wavewarz-africa/*" element={<WaveWarzBattleZoneFeature />} />
                <Route path="/install" element={<Install />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/bettercallzaal" element={<BetterCallZaal />} />
                {WORLDS_ENABLED && <Route path="/world/:worldSlug" element={<World />} />}
                {WORLDS_ENABLED && <Route path="/world/:worldSlug/:roomSlug" element={<World />} />}
                <Route path="*" element={<PageLoader />} />
              </Routes>
            </Suspense>
          </EngagementProvider>
        </PlayerProvider>
      </ErrorBoundary>
    );
  }

  if (isLoading) {
    return <PageLoader />;
  }

  // FC mini-app: auto-sign-in is in progress — show a silent loader so the user
  // never sees the Auth/landing page during the one-tap sign-in flow.
  if (!isAuthenticated && isInFarcaster && !quickAuthFailed) {
    return <PageLoader />;
  }

  return (
    <>
      <ErrorBoundary fallback={null}><NotificationBanner /></ErrorBoundary>
      {!isAuthenticated ? (
        <ErrorBoundary>
          <PlayerProvider>
            <EngagementProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes — accessible without login */}
                  <Route path="/about" element={<About />} />
                  <Route path="/terms" element={<Policy which="terms" />} />
                  <Route path="/guidelines" element={<Policy which="guidelines" />} />
                  <Route path="/privacy" element={<Policy which="privacy" />} />
                <Route path="/delete-account" element={<DeleteAccountPage />} />
                <Route path="/license/:songId" element={<Licensing />} />
                <Route path="/license" element={<Licensing />} />
                <Route path="/keys" element={<Keys />} />
                  <Route path="/artists" element={<Artists />} />
                  <Route path="/artist/:id" element={<ArtistDetail />} />
                  <Route path="/catalog/:id" element={<CatalogDetail />} />
                  <Route path="/song/:id" element={<SongDetail />} />
                  <Route path="/wavewarz-africa/*" element={<WaveWarzBattleZoneFeature />} />
                  <Route path="/install" element={<Install />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/bettercallzaal" element={<BetterCallZaal />} />
                  {WORLDS_ENABLED && <Route path="/world/:worldSlug" element={<World />} />}
                  {WORLDS_ENABLED && <Route path="/world/:worldSlug/:roomSlug" element={<World />} />}
                  {WORLD_BUILDER_ENABLED && <Route path="/w/:slug" element={<World />} />}
                  {/* Known auth-required routes → landing */}
                  <Route path="/" element={<Auth />} />
                  <Route path="/discover" element={<Auth />} />
                  <Route path="/social" element={<Auth />} />
                  <Route path="/room" element={<Auth />} />
                  <Route path="/community" element={<Auth />} />
                  <Route path="/profile" element={<Auth />} />
                  <Route path="/playlists" element={<Auth />} />
                  <Route path="/playlist/:id" element={<Auth />} />
                  <Route path="/marketplace" element={<Auth />} />
                  <Route path="/wallet" element={<Auth />} />
                  <Route path="/inbox" element={<Auth />} />
                  <Route path="/dj-shuffle" element={<Auth />} />
                  <Route path="/admin" element={<Auth />} />
                  <Route path="/audience/:userId" element={<Auth />} />
                  <Route path="/post/:id" element={<Auth />} />
                  {/* Shared links used to fall through to a not-found page that
                      redirected itself away before anyone could read it. */}
                  <Route path="/leaderboard" element={<Auth />} />
                  <Route path="/studio" element={<Auth />} />
                  <Route path="/launch" element={<Auth />} />
                  <Route path="/drops/:worldSlug" element={<Auth />} />
                  <Route path="/claim" element={<Auth />} />
                  <Route path="/console" element={<Auth />} />
                  <Route path="/not-found" element={<NotFound />} />
                  {/* Vanity slug routes — must be after all specific routes */}
                  <Route path="/:artistSlug/:songSlug" element={<SlugResolver />} />
                  <Route path="/:artistSlug" element={<SlugResolver />} />
                  {/* Unknown routes — show 404, not landing */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </EngagementProvider>
          </PlayerProvider>
        </ErrorBoundary>
      ) : needsOnboarding ? (
        <ErrorBoundary>
          <PlayerProvider>
            <EngagementProvider>
              <Suspense fallback={<PageLoader />}>
                <Onboarding />
              </Suspense>
            </EngagementProvider>
          </PlayerProvider>
        </ErrorBoundary>
      ) : (
        <ErrorBoundary>
          <OfflineQueueProvider>
            <PlayerProvider>
              <EngagementProvider>
                <Suspense fallback={<PageLoader />}>
                  <AppShell />
                </Suspense>
              </EngagementProvider>
            </PlayerProvider>
          </OfflineQueueProvider>
        </ErrorBoundary>
      )}
    </>
  );
}

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <FarcasterProvider>
        <FacebookProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AppContent />
          </TooltipProvider>
        </FacebookProvider>
      </FarcasterProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
