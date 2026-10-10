import { useProfilePath } from '@/hooks/useProfilePath';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Search } from 'lucide-react';
import { toast } from 'sonner';
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
          {/* A floating dock, not a bar glued to the edge (10 Oct 2026). 58px + 8px sits
              inside the 72px every page already keeps free (.pb-chrome). Blur is
              allowed here: this is fixed chrome over scrolling content. */}
          <div className="px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
            <div className="mx-auto flex h-[58px] max-w-md items-center rounded-[22px] border border-border/70 bg-background/75 px-1 shadow-float backdrop-blur-xl">
              <Link
                to={NAV_HOME.path}
                className={cn(
                  'relative flex h-full flex-1 min-w-0 flex-col items-center justify-center gap-1 transition-transform active:scale-90',
                  homeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {homeActive && <DockIndicator />}
                <NAV_HOME.icon className={cn('relative h-5 w-5 transition-transform', homeActive && 'scale-110')} />
                <span
                  className={cn(
                    'relative text-[10px] font-semibold leading-none',
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
                className="relative flex h-full flex-1 min-w-0 flex-col items-center justify-center gap-1 text-muted-foreground transition-transform hover:text-foreground active:scale-90"
              >
                <Search className="h-5 w-5" />
                <span className="text-[10px] font-semibold leading-none text-muted-foreground">Search</span>
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
            'relative flex h-full flex-1 min-w-0 flex-col items-center justify-center gap-1 transition-transform active:scale-90',
            active || open ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {active && <DockIndicator />}
          <div className="relative">
            <group.icon className={cn('h-5 w-5 transition-transform', active && 'scale-110')} />
            {showsRoom && roomOnlineCount > 0 && (
              <span className="absolute -top-2 -right-3 inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-semibold">
                {`${roomOnlineCount} live`}
              </span>
            )}
          </div>
          <span
            className={cn(
              'relative text-[10px] font-semibold leading-none',
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
        {group.id === 'you' && <SignOutRow onDone={() => onOpenChange(false)} />}
      </PopoverContent>
    </Popover>
  );
}

/** The filled pill behind the active tab. It slides from tab to tab (one layoutId). */
function DockIndicator() {
  return (
    <motion.span
      layoutId="bottom-tab-indicator"
      aria-hidden
      className="absolute inset-x-1 inset-y-1.5 rounded-2xl bg-primary/15"
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    />
  );
}

/** Log out, where people look for it: under You. The hamburger had the only one, and on a phone nobody found it. */
function SignOutRow({ onDone }: { onDone: () => void }) {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <>
      <div className="mx-2.5 my-1 h-px bg-border" />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signOut();
            onDone();
            toast.success('Signed out');
          } catch {
            toast.error('Could not sign you out. Try again.');
          } finally {
            setBusy(false);
          }
        }}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4 flex-shrink-0" />
        {busy ? 'Signing out...' : 'Log out'}
      </button>
    </>
  );
}
