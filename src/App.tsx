import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { PlayerProvider } from "@/context/PlayerContext";
import { EngagementProvider } from "@/context/EngagementContext";
import { OfflineQueueProvider } from "@/hooks/useOfflineQueue";
import { BottomTabBar } from "@/components/BottomTabBar";
import { NotificationBanner } from "@/components/NotificationBanner";
import { useUserPresence } from "@/hooks/useUserPresence";
// Lazy load pages for better initial load performance
const Home = lazy(() => import("./pages/Home"));
const Discover = lazy(() => import("./pages/Discover"));
const Artists = lazy(() => import("./pages/Artists"));
const ArtistDetail = lazy(() => import("./pages/ArtistDetail"));
const CatalogDetail = lazy(() => import("./pages/CatalogDetail"));
const SongDetail = lazy(() => import("./pages/SongDetail"));
const PlaylistDetail = lazy(() => import("./pages/PlaylistDetail"));
const Playlists = lazy(() => import("./pages/Playlists"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Admin = lazy(() => import("./pages/Admin"));
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Profile = lazy(() => import("./pages/Profile"));
const Social = lazy(() => import("./pages/Social"));
const Community = lazy(() => import("./pages/Community"));
const AudienceProfile = lazy(() => import("./pages/AudienceProfile"));
const Install = lazy(() => import("./pages/Install"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Room = lazy(() => import("./pages/Room"));
const About = lazy(() => import("./pages/About"));


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
  const hideChrome = location.pathname.startsWith('/room');

  return (
    <>
      <div className={hideChrome ? undefined : "pb-20 lg:pb-0"}>
        <RedirectHandler />
        <Routes>
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
          <Route path="/profile" element={<Profile />} />
          <Route path="/social" element={<Social />} />
          <Route path="/community" element={<Community />} />
          <Route path="/audience/:userId" element={<AudienceProfile />} />
          <Route path="/about" element={<About />} />
          <Route path="/install" element={<Install />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/room" element={<Room />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      {!hideChrome && <BottomTabBar />}
    </>
  );
}

// AppContent must be rendered inside AuthProvider
function AppContent() {
  const { isAuthenticated, isLoading, needsOnboarding, user } = useAuth();
  useUserPresence(user?.id ?? null, { includeLastSeen: true });

  if (isLoading) {
    return (
      <BrowserRouter>
        <PageLoader />
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <NotificationBanner />
      {!isAuthenticated ? (
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/install" element={<Install />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<Auth />} />
          </Routes>
        </Suspense>
      ) : needsOnboarding ? (
        <Suspense fallback={<PageLoader />}>
          <Onboarding />
        </Suspense>
      ) : (
        <OfflineQueueProvider>
          <PlayerProvider>
            <EngagementProvider>
              <Suspense fallback={<PageLoader />}>
                <AppShell />
              </Suspense>
            </EngagementProvider>
          </PlayerProvider>
        </OfflineQueueProvider>
      )}
    </BrowserRouter>
  );
}

const App = () => (
  <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
    </TooltipProvider>
  </AuthProvider>
);

export default App;
