import { useProfilePath } from '@/hooks/useProfilePath';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafePlayerState } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { SearchModal } from '@/components/SearchModal';
import { NAV_HOME, resolveNavGroups, isGroupActive, type NavGroup } from './navGroups';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Five tabs, not seven. Home and Search go straight through; Music, Community
// and You each open upward into their group, so every destination is two taps
// away at most and nothing is squeezed into a 9px label.
export function BottomTabBar() {
  const location = useLocation();
  const playerState = useSafePlayerState();
  const currentSong = playerState?.currentSong;
  const { user, isArtist } = useAuth();
  const roomOnlineCount = useRoomOnlineCount({ roomId: 'global', viewerUserId: user?.id });
  const profilePath = useProfilePath();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const groups = resolveNavGroups(profilePath, Boolean(isArtist));
  const [music, community, you] = groups;

  // Hide tab bar when music is playing — player takes its place
  if (currentSong) return null;
  if (location.pathname === '/install') return null;

  const homeActive = location.pathname === NAV_HOME.path;

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
              <Link
                to={NAV_HOME.path}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all flex-1 min-w-0',
                  homeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <div className="relative">
                  <NAV_HOME.icon className={cn('w-[18px] h-[18px] transition-transform', homeActive && 'scale-110')} />
                  {homeActive && (
                    <motion.div
                      layoutId="bottom-tab-indicator"
                      className="absolute -inset-2 bg-primary/10 rounded-xl -z-10"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    'text-[9px] font-medium leading-none',
                    homeActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {NAV_HOME.label}
                </span>
              </Link>

              <GroupTab
                group={music}
                open={openGroup === music.id}
                onOpenChange={(next) => setOpenGroup(next ? music.id : null)}
                roomOnlineCount={roomOnlineCount}
              />

              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all flex-1 min-w-0 text-muted-foreground hover:text-foreground min-h-10"
              >
                <div className="relative">
                  <Search className="w-[18px] h-[18px]" />
                </div>
                <span className="text-[9px] font-medium leading-none text-muted-foreground">Search</span>
              </button>

              <GroupTab
                group={community}
                open={openGroup === community.id}
                onOpenChange={(next) => setOpenGroup(next ? community.id : null)}
                roomOnlineCount={roomOnlineCount}
              />

              <GroupTab
                group={you}
                open={openGroup === you.id}
                onOpenChange={(next) => setOpenGroup(next ? you.id : null)}
                roomOnlineCount={roomOnlineCount}
              />
            </div>
          </div>
        </motion.nav>
      </AnimatePresence>

      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </>
  );
}

function GroupTab({
  group,
  open,
  onOpenChange,
  roomOnlineCount,
}: {
  group: NavGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomOnlineCount: number;
}) {
  const location = useLocation();
  const active = isGroupActive(group, location.pathname);
  const showsRoom = group.items.some((item) => item.path === '/room');

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={group.label}
          className={cn(
            'relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all flex-1 min-w-0 min-h-10',
            active || open ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <div className="relative">
            <group.icon className={cn('w-[18px] h-[18px] transition-transform', active && 'scale-110')} />
            {showsRoom && roomOnlineCount > 0 && (
              <span className="absolute -top-2 -right-3 inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-semibold">
                {`${roomOnlineCount} live`}
              </span>
            )}
            {active && (
              <motion.div
                layoutId="bottom-tab-indicator"
                className="absolute -inset-2 bg-primary/10 rounded-xl -z-10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
              />
            )}
          </div>
          <span
            className={cn(
              'text-[9px] font-medium leading-none',
              active || open ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {group.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={12} className="w-[min(20rem,calc(100vw-1.5rem))] p-1.5">
        <p className="px-2.5 pt-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {group.label}
        </p>
        {group.items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => onOpenChange(false)}
              className={cn(
                'flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/60',
              )}
            >
              <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium leading-tight">
                  {item.label}
                  {item.path === '/room' && roomOnlineCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      {`${roomOnlineCount} live`}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
