import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Users, User, Flame, MessageCircle, Gift, Compass, Menu, X, Download, LogOut, Wallet, Headphones, Sparkles, ListMusic } from 'lucide-react';
import { useEngagement } from '@/context/EngagementContext';
import { useAuth } from '@/context/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { useSafePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { cn } from '@/lib/utils';
import logo from '@/assets/songchainn-logo.webp';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { InviteFriends } from '@/components/InviteFriends';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SONGS } from '@/data/musicData';

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/#playlists', label: 'Playlists', icon: ListMusic },
  { path: '/discover', label: 'Discover', icon: Compass },
  { path: '/room', label: 'The Room', icon: Headphones },
  { path: '/community', label: 'Community', icon: Users },
  { path: '/social', label: 'Feed', icon: MessageCircle },
  { path: '/profile', label: 'Profile', icon: User },
];

export function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { engagementPoints, currentStreak } = useEngagement();
  const { signOut, walletAddress, user, isArtist, artistId } = useAuth();
  const { balance, isLoading: isBalanceLoading } = useWalletBalance(walletAddress);
  const [showInvite, setShowInvite] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showOfflineSaveAnnouncement, setShowOfflineSaveAnnouncement] = useState(false);
  const [showProfilePhotoAnnouncement, setShowProfilePhotoAnnouncement] = useState(false);
  const [pulseBanner, setPulseBanner] = useState<{ songId: string; title: string } | null>(null);
  const playerState = useSafePlayerState();
  const roomOnlineCount = useRoomOnlineCount(user?.id, Boolean(playerState?.isRoomMode));
  const { showRoom } = usePlayerActions();
  const profilePath = isArtist && artistId ? `/artist/${artistId}` : '/profile';
  const effectiveNavItems = navItems.map((item) =>
    item.path === '/profile' ? { ...item, path: profilePath } : item
  );
  const showReturnToRoom =
    Boolean(playerState?.isRoomMode) && Boolean(playerState?.isRoomHidden) && location.pathname !== '/room';

  useEffect(() => {
    try {
      const key = 'offline-save-announcement-v1';
      const hasSeen = localStorage.getItem(key);
      if (!hasSeen) {
        setShowOfflineSaveAnnouncement(true);
        localStorage.setItem(key, 'shown');
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to read offline save announcement state', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    try {
      const key = 'songchainn_show_profile_photo_hint';
      const value = localStorage.getItem(key);
      if (value === '1') {
        setShowProfilePhotoAnnouncement(true);
        localStorage.setItem(key, 'shown');
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to read profile photo announcement state', error);
      }
    }
  }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('global-song-pulses')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'song_analytics' },
        (payload) => {
          const row = (payload as any)?.new as { event_type?: string; song_id?: string | null } | undefined;
          if (!row || row.event_type !== 'pulse') return;
          const songId = row.song_id || '';
          const song = SONGS.find((s) => s.id === songId);
          const title = song?.title || 'A song';
          setPulseBanner({ songId, title });
          window.setTimeout(() => {
            setPulseBanner((current) => (current && current.songId === songId ? null : current));
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  // Enable swipe gestures for mobile navigation
  useSwipeNavigation();

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setMobileMenuOpen(false);
      toast.success('Signed out successfully');
      navigate('/auth');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <>
      <header className="sticky top-0 z-40 glass-surface border-b border-border/50">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            {/* Logo - always visible */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
              <motion.img
                src={logo}
                alt="$ongChainn"
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain"
                whileHover={{ scale: 1.05, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400 }}
              />
              <span className="hidden sm:block font-heading font-bold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors">
                $ongChainn
              </span>
            </Link>

            {/* Desktop Nav Links - hidden on mobile */}
            <nav className="hidden lg:flex items-center gap-1">
              {effectiveNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "relative px-3 py-2 rounded-xl font-medium text-sm transition-all press-effect",
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-2 relative z-10">
                      <item.icon className="w-4 h-4" />
                      {item.label}
                      {item.path === '/room' && roomOnlineCount > 0 && (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-semibold px-1.5 py-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span>LIVE</span>
                          </span>
                          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-semibold">
                            {roomOnlineCount}
                          </span>
                        </>
                      )}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 glass rounded-xl"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {showReturnToRoom && (
                <motion.button
                  onClick={() => {
                    showRoom();
                    navigate('/room');
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/10 text-primary text-xs sm:text-sm font-medium"
                >
                  <Headphones className="w-4 h-4" />
                  <span>Return to Room</span>
                </motion.button>
              )}
              {/* Wallet Balance - shown when connected */}
              {walletAddress && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass text-xs sm:text-sm cursor-pointer"
                  onClick={() => navigate(profilePath)}
                  title={walletAddress}
                >
                  <Wallet className="w-3.5 h-3.5 text-primary" />
                  <span className="text-foreground font-medium">
                    {isBalanceLoading ? '...' : balance ? `${balance} ETH` : '0 ETH'}
                  </span>
                  <span className="text-muted-foreground text-xs hidden md:inline">
                    ({truncateAddress(walletAddress)})
                  </span>
                </motion.div>
              )}

              {/* Desktop stats - hidden on mobile */}
              <div className="hidden md:flex items-center gap-2">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass text-xs sm:text-sm"
                >
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-foreground font-medium">{currentStreak}</span>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  animate={{ boxShadow: ['0 0 0 0 rgba(139,92,246,0.7)', '0 0 30px 0 rgba(139,92,246,0.9)', '0 0 0 0 rgba(139,92,246,0.7)'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="px-2.5 py-1.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-xs sm:text-sm shadow-glow"
                >
                  {engagementPoints.toLocaleString()} pts
                </motion.div>
                <Link
                  to="/about"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-xs sm:text-sm text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>About $ongChainn</span>
                </Link>
              </div>

              {/* Invite button */}
              <motion.button
                onClick={() => setShowInvite(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-xl glass text-primary hover:bg-primary/10 transition-colors"
                aria-label="Invite friends"
              >
                <Gift className="w-4 h-4 sm:w-5 sm:h-5" />
              </motion.button>

              <NotificationDropdown />

              {/* Desktop Sign Out button */}
              <motion.button
                onClick={handleLogout}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden xl:inline">Sign Out</span>
              </motion.button>

              {/* Mobile Hamburger Menu Button */}
              <motion.button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                whileTap={{ scale: 0.95 }}
                className="lg:hidden p-2 rounded-xl glass text-foreground hover:bg-primary/10 transition-colors"
                aria-label="Toggle menu"
              >
                <AnimatePresence mode="wait">
                  {mobileMenuOpen ? (
                    <motion.div
                      key="close"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <X className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Menu className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>

        <InviteFriends isOpen={showInvite} onClose={() => setShowInvite(false)} />
      </header>

      {showProfilePhotoAnnouncement && (
        <div className="border-b border-indigo-500/30 bg-indigo-500/10 backdrop-blur-sm">
          <div className="container mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm text-indigo-50">
              You can now update your profile picture and cover photo from your profile.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowProfilePhotoAnnouncement(false);
                  navigate(profilePath);
                }}
                className="text-xs sm:text-sm text-indigo-100 hover:text-white underline"
              >
                Update now
              </button>
              <button
                type="button"
                onClick={() => setShowProfilePhotoAnnouncement(false)}
                className="text-xs sm:text-sm text-indigo-200 hover:text-indigo-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {pulseBanner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="fixed inset-x-0 top-16 z-40 pointer-events-none flex justify-center px-3 sm:px-4"
          >
            <div className="pointer-events-auto rounded-2xl bg-rose-500/90 text-rose-50 px-4 py-2 shadow-xl border border-rose-300/60 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-200 animate-ping" />
              <span className="text-sm font-semibold">
                {pulseBanner.title} got pulsed
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showOfflineSaveAnnouncement && (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm">
          <div className="container mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm text-emerald-100">
              You can now save songs and play them even without internet.
            </span>
            <button
              type="button"
              onClick={() => setShowOfflineSaveAnnouncement(false)}
              className="text-xs sm:text-sm text-emerald-200 hover:text-emerald-100"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 lg:hidden"
            />
            
            {/* Menu Panel */}
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-72 glass-surface border-l border-border/50 z-50 lg:hidden"
            >
              <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <span className="font-heading font-bold text-foreground">Menu</span>
                <motion.button
                  onClick={() => setMobileMenuOpen(false)}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 rounded-xl glass text-foreground"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Wallet Info for Mobile */}
              {walletAddress && (
                <div className="p-4 border-b border-border/50">
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl glass">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {truncateAddress(walletAddress)}
                      </p>
                      <p className="text-xs text-primary font-semibold">
                        {isBalanceLoading ? 'Loading...' : balance ? `${balance} ETH` : '0 ETH'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Stats */}
              <div className="p-4 border-b border-border/50 flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-sm">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="text-foreground font-medium">{currentStreak} streak</span>
                </div>
                <div className="px-3 py-2 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow">
                  {engagementPoints.toLocaleString()} pts
                </div>
              </div>

              {/* Nav Links */}
              <div className="p-4 space-y-2 h-[calc(100vh-9.5rem)] overflow-y-auto pb-24">
                {effectiveNavItems.map((item, index) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <motion.button
                      key={item.path}
                      onClick={() => handleNavClick(item.path)}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all",
                        isActive 
                          ? "bg-primary/10 text-primary border border-primary/20" 
                          : "glass text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="flex items-center gap-2">
                        {item.label}
                        {item.path === '/room' && roomOnlineCount > 0 && (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-semibold px-1.5 py-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              <span>LIVE</span>
                            </span>
                            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-semibold">
                              {roomOnlineCount}
                            </span>
                          </>
                        )}
                      </span>
                    </motion.button>
                  );
                })}

                {/* Install App Link */}
                <motion.button
                  onClick={() => handleNavClick('/install')}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: navItems.length * 0.05 }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all",
                    location.pathname === '/install'
                      ? "bg-primary/10 text-primary border border-primary/20" 
                      : "glass text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Download className="w-5 h-5" />
                  <span>Install App</span>
                </motion.button>

                <motion.button
                  onClick={() => handleNavClick('/about')}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (navItems.length + 1) * 0.05 }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all",
                    location.pathname === '/about'
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "glass text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span>About $ongChainn</span>
                </motion.button>

                {/* Logout Button */}
                <motion.button
                  onClick={handleLogout}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (navItems.length + 1) * 0.05 }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all glass text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </motion.button>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
