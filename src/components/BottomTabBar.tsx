import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Compass, Users, MessageCircle, User, Headphones, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafePlayerState } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { SearchModal } from '@/components/SearchModal';

type TabItem =
  | { kind: 'link'; path: string; label: string; icon: React.ElementType }
  | { kind: 'action'; label: string; icon: React.ElementType; onPress: () => void };

export function BottomTabBar() {
  const location = useLocation();
  const playerState = useSafePlayerState();
  const currentSong = playerState?.currentSong;
  const { user, isArtist, artistId } = useAuth();
  const roomOnlineCount = useRoomOnlineCount({ roomId: 'global', viewerUserId: user?.id });
  const profilePath = isArtist && artistId ? `/artist/${artistId}` : '/profile';
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const tabItems: TabItem[] = [
    { kind: 'link', path: '/', label: 'Home', icon: Home },
    { kind: 'link', path: '/discover', label: 'Discover', icon: Compass },
    { kind: 'action', label: 'Search', icon: Search, onPress: () => setIsSearchOpen(true) },
    { kind: 'link', path: '/room', label: 'Room', icon: Headphones },
    { kind: 'link', path: '/community', label: 'Community', icon: Users },
    { kind: 'link', path: '/social', label: 'Feed', icon: MessageCircle },
    { kind: 'link', path: profilePath, label: 'Profile', icon: User },
  ];

  // Hide tab bar when music is playing — player takes its place
  if (currentSong) return null;
  if (location.pathname === '/install') return null;

  return (
    <>
      <AnimatePresence>
        <motion.nav
          className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        >
          <div className="glass-surface border-t border-border/50 pb-safe">
            <div className="flex items-center h-[54px]">
              {tabItems.map((item) => {
                const isActive =
                  item.kind === 'link' && location.pathname === item.path;
                const inner = (
                  <>
                    <div className="relative">
                      <item.icon
                        className={cn(
                          'w-[18px] h-[18px] transition-transform',
                          isActive && 'scale-110',
                        )}
                      />
                      {item.kind === 'link' && item.path === '/room' && roomOnlineCount > 0 && (
                        <span className="absolute -top-2 -right-3 inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-semibold">
                          {`${roomOnlineCount} live`}
                        </span>
                      )}
                      {isActive && (
                        <motion.div
                          layoutId="bottom-tab-indicator"
                          className="absolute -inset-2 bg-primary/10 rounded-xl -z-10"
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[9px] font-medium transition-all leading-none',
                        isActive ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {item.label}
                    </span>
                  </>
                );

                if (item.kind === 'action') {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.onPress}
                      className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all flex-1 min-w-0 text-muted-foreground hover:text-foreground"
                    >
                      {inner}
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all flex-1 min-w-0',
                      isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        </motion.nav>
      </AnimatePresence>

      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </>
  );
}
