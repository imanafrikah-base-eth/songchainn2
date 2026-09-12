import { artistPath } from '@/lib/slugRoutes';
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Gift, Menu, X, LogOut, Wallet, Headphones, Sparkles, Disc3, Bot, Lightbulb, Bug, Search, MoreHorizontal, ChevronDown, RefreshCw, type LucideIcon , Globe2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { applyAppUpdate, subscribeAppUpdate, getAppUpdate } from '@/lib/appUpdate';
import { useEngagement } from '@/context/EngagementContext';
import { useUserPoints } from '@/hooks/useUserPoints';
import { useAuth } from '@/context/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { useSafePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { cn } from '@/lib/utils';
const logo = '/songchainn-logo.webp';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { NavRail } from '@/components/NavRail';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { InviteFriends } from '@/components/InviteFriends';
import { SearchModal } from '@/components/SearchModal';
import { SuggestionDialog } from '@/components/SuggestionDialog';
import { ReportBug } from '@/components/ReportBug';
import { WalletChip } from '@/components/WalletChip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SONGS } from '@/data/musicData';
import { PulseAlert } from '@/components/PulseAlert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NAV_HOME, resolveNavGroups, isGroupActive } from '@/components/navGroups';

export function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lifetimePoints, streak } = useUserPoints();
  const { signOut, walletAddress, user, isArtist, artistId } = useAuth();
  const { balance, isLoading: isBalanceLoading } = useWalletBalance(walletAddress);
  const [showInvite, setShowInvite] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* The drawer covers the right edge, which is where Mo$ha's tab lives. It
     says so on the body so the tab can step out of the way rather than
     sitting on top of the menu. */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.menuOpen = mobileMenuOpen ? 'true' : 'false';
    return () => { document.body.dataset.menuOpen = 'false'; };
  }, [mobileMenuOpen]);
  const [showOfflineSaveAnnouncement, setShowOfflineSaveAnnouncement] = useState(false);
  const [showProfilePhotoAnnouncement, setShowProfilePhotoAnnouncement] = useState(false);
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const [showMore, setShowMore] = useState(false);
  // Which group is expanded in the mobile sheet. Starts on whichever group
  // holds the page you are already looking at.
  const [openMobileGroup, setOpenMobileGroup] = useState<string | null>(null);
  const playerState = useSafePlayerState();
  const roomUsername = (() => {
    if (!user?.id) return null;
    try {
      return localStorage.getItem(`room_username:${user.id}`) || (user.email ? user.email.split('@')[0] : null) || 'Guest';
    } catch {
      return (user.email ? user.email.split('@')[0] : null) || 'Guest';
    }
  })();
  const roomOnlineCount = useRoomOnlineCount({
    roomId: 'global',
    viewerUserId: user?.id,
    isListening: Boolean(playerState?.isRoomMode),
    username: roomUsername,
  });
  const { showRoom } = usePlayerActions();
  const profilePath = isArtist && artistId ? artistPath(artistId) : '/profile';
  const navGroups = resolveNavGroups(profilePath, Boolean(isArtist));
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

  // Open the sheet on the group you are already inside, so the page you came
  // from is one tap away instead of buried.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const active = navGroups.find((group) => isGroupActive(group, location.pathname));
    setOpenMobileGroup(active?.id ?? null);
    // navGroups is derived from auth state and rebuilt each render, so it is
    // deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileMenuOpen, location.pathname]);

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
      // No explicit navigate needed — auth state change re-renders to Auth page
    } catch (error) {
      toast.error('Could not sign you out');
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <>
      <header className="sticky top-0 z-40 glass-surface border-b border-border/50">
        <div className="px-4 sm:px-5 max-w-[1400px] mx-auto">
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

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Search button — always visible */}
              <motion.button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-1.5 h-10 sm:h-10 px-2.5 rounded-xl glass text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
                aria-label="Search"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-medium">Search</span>
              </motion.button>
              {showReturnToRoom && (
                <motion.button
                  onClick={() => {
                    showRoom();
                    navigate('/room');
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/15 text-primary text-xs sm:text-sm font-semibold shadow-[0_0_0_1px_hsl(var(--primary)/0.3)] min-h-10"
                >
                  <Headphones className="w-4 h-4" />
                  <span>Return to Room</span>
                  <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] sm:text-xs leading-none">
                    {`${roomOnlineCount} live`}
                  </span>
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

              {/* Streak and points, the two numbers worth carrying in the bar */}
              {/* A shared song is the most passed-around surface in the product,
                  and this bar is what renders above it. Without this there was
                  no way in from a share link at all: a stranger played the song,
                  wanted to join, and found nothing to tap. */}
              {!user && (
                <button
                  onClick={() => navigate('/auth')}
                  className="inline-flex items-center h-10 px-4 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow"
                >
                  Join
                </button>
              )}

              <div className="hidden xl:flex items-center gap-2">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass text-xs sm:text-sm"
                >
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-foreground font-medium">{streak}</span>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  animate={{ boxShadow: ['0 0 0 0 rgba(139,92,246,0.7)', '0 0 30px 0 rgba(139,92,246,0.9)', '0 0 0 0 rgba(139,92,246,0.7)'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="px-2.5 py-1.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-xs sm:text-sm shadow-glow"
                >
                  {lifetimePoints.toLocaleString()} pts
                </motion.div>
              </div>

              <WalletChip />

              <UpdateButton />

              <NotificationDropdown />

              {/* Everything that used to sit loose in the bar, in one place */}
              <Popover open={showMore} onOpenChange={setShowMore}>
                <PopoverTrigger asChild>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="hidden lg:inline-flex items-center gap-1.5 h-10 px-2.5 rounded-xl glass text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
                    aria-label="More"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                    <span className="text-xs font-medium">More</span>
                  </motion.button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={10} className="w-60 p-1.5">
                  <MoreRow
                    icon={Gift}
                    label="Invite friends"
                    onClick={() => {
                      setShowMore(false);
                      setShowInvite(true);
                    }}
                  />
                  <MoreRow
                    icon={Bot}
                    label="Mosha"
                    onClick={() => {
                      setShowMore(false);
                      window.dispatchEvent(new CustomEvent('songchainn:open-mosha'));
                    }}
                  />
                  <MoreRow
                    icon={Wallet}
                    label="Your wallet"
                    onClick={() => {
                      setShowMore(false);
                      navigate('/wallet');
                    }}
                  />
                  <MoreRow
                    icon={Globe2}
                    label="Artist Worlds"
                    onClick={() => {
                      setShowMore(false);
                      navigate('/worlds');
                    }}
                  />
                  <MoreRow
                    icon={Disc3}
                    label="DJ Shuffle"
                    onClick={() => {
                      setShowMore(false);
                      navigate('/dj-shuffle');
                    }}
                  />
                  <MoreRow
                    icon={Sparkles}
                    label="About $ongChainn"
                    onClick={() => {
                      setShowMore(false);
                      navigate('/about');
                    }}
                  />
                  <MoreRow
                    icon={Lightbulb}
                    label="Suggest improvement"
                    onClick={() => {
                      setShowMore(false);
                      setShowSuggestionDialog(true);
                    }}
                  />
                  {/* Reporting a PERSON already had a route. Reporting the APP
                      did not, so a broken player or a blank page had nowhere to
                      go and people just left instead. */}
                  <MoreRow
                    icon={Bug}
                    label="Report a bug"
                    onClick={() => {
                      setShowMore(false);
                      setShowBugReport(true);
                    }}
                  />
                  <div className="my-1 h-px bg-border/60" />
                  <MoreRow
                    icon={LogOut}
                    label="Sign out"
                    onClick={() => {
                      setShowMore(false);
                      handleLogout();
                    }}
                  />
                </PopoverContent>
              </Popover>

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

      <NavRail />

      <SuggestionDialog open={showSuggestionDialog} onOpenChange={setShowSuggestionDialog} />
      {showBugReport && <ReportBug onClose={() => setShowBugReport(false)} />}
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />

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

      <PulseAlert />

      {showOfflineSaveAnnouncement && (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm">
          <div className="container mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm text-emerald-100">
              You can now save songs and play them even without internet.
            </span>
            <button
              type="button"
              onClick={() => setShowOfflineSaveAnnouncement(false)}
              className="inline-flex min-h-10 items-center px-3 text-xs sm:text-sm text-emerald-200 hover:text-emerald-100"
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
                <Popover open={showStreakInfo} onOpenChange={setShowStreakInfo}>
                  <PopoverTrigger asChild>
                    <button type="button" className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-sm">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <span className="text-foreground font-medium">{streak} streak</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-xs">
                    Your streak is how many days in a row you use $ongChainn. Longer streaks increase your points bonus.
                  </PopoverContent>
                </Popover>
                <Popover open={showPointsInfo} onOpenChange={setShowPointsInfo}>
                  <PopoverTrigger asChild>
                    <button type="button" className="px-3 py-2 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow">
                      {lifetimePoints.toLocaleString()} pts
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-xs">
                    Points track your activity. They set your tier and your place on the leaderboard.
                  </PopoverContent>
                </Popover>
              </div>

              {/* Nav Links, grouped. One section per group, and the group
                  holding the page you are on opens first. */}
              <div className="p-4 space-y-2 h-[calc(100vh-9.5rem)] overflow-y-auto pb-24">
                <motion.button
                  onClick={() => handleNavClick(NAV_HOME.path)}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all",
                    location.pathname === NAV_HOME.path
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "glass text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <NAV_HOME.icon className="w-5 h-5" />
                  <span>{NAV_HOME.label}</span>
                </motion.button>

                {navGroups.map((group, groupIndex) => {
                  const expanded = openMobileGroup === group.id;
                  const active = isGroupActive(group, location.pathname);
                  return (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (groupIndex + 1) * 0.05 }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenMobileGroup(expanded ? null : group.id)}
                        aria-expanded={expanded}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all",
                          active
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "glass text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        <group.icon className="w-5 h-5" />
                        <span className="flex-1">{group.label}</span>
                        <ChevronDown
                          className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-1 ml-3 space-y-1 border-l border-border/50 pl-3">
                              {group.items.map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                  <button
                                    key={item.path}
                                    type="button"
                                    onClick={() => handleNavClick(item.path)}
                                    className={cn(
                                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                                      isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                  >
                                    <item.icon className="w-4 h-4 flex-shrink-0" />
                                    <span className="flex items-center gap-2 text-sm font-medium">
                                      {item.label}
                                      {item.path === '/room' && roomOnlineCount > 0 && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-semibold px-1.5 py-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                          <span>{roomOnlineCount} live</span>
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}

                <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
                  <motion.button
                    onClick={() => {
                      setShowInvite(true);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all glass text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                  >
                    <Gift className="w-5 h-5" />
                    <span>Invite friends</span>
                  </motion.button>

                  <motion.button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('songchainn:open-mosha'));
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all glass text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                  >
                    <Bot className="w-5 h-5" />
                    <span>Mosha</span>
                  </motion.button>

                  <motion.button
                    onClick={() => {
                      setShowSuggestionDialog(true);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all glass text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                  >
                    <Lightbulb className="w-5 h-5" />
                    <span>Suggest improvement</span>
                  </motion.button>

                  <motion.button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-all glass text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                  </motion.button>
                </div>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** One line in the header More menu. */
function MoreRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
    >
      <Icon className="h-4 w-4 flex-shrink-0 text-primary" />
      <span className="font-medium">{label}</span>
    </button>
  );
}

/**
 * A newer build is waiting. Stays in the bar after the banner is put away,
 * and goes with the reload that applies the update.
 */
function UpdateButton() {
  const update = useSyncExternalStore(subscribeAppUpdate, getAppUpdate, getAppUpdate);
  if (!update.available) return null;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={() => void applyAppUpdate()}
      disabled={update.applying}
      aria-label="Update the app"
      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-2.5 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-70"
    >
      <RefreshCw className={`h-4 w-4 ${update.applying ? 'animate-spin' : ''}`} />
      <span>{update.applying ? 'Updating' : 'Update'}</span>
    </motion.button>
  );
}
