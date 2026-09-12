import { useProfilePath } from '@/hooks/useProfilePath';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { cn } from '@/lib/utils';
import { NAV_HOME, resolveNavGroups, isGroupActive, type NavGroup } from './navGroups';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Desktop counterpart to BottomTabBar — takes over navigation at the same
// `lg:` breakpoint BottomTabBar hides at, and renders the same four entries
// it does: Home, then Music, Community and You, each opening a panel.
export function NavRail() {
  const location = useLocation();
  const { user, isArtist } = useAuth();
  const roomOnlineCount = useRoomOnlineCount({ roomId: 'global', viewerUserId: user?.id });
  const profilePath = useProfilePath();
  const groups = resolveNavGroups(profilePath, Boolean(isArtist));
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const homeActive = location.pathname === NAV_HOME.path;

  return (
    <nav className="hidden lg:flex fixed left-0 top-14 sm:top-16 bottom-0 z-30 w-20 flex-col items-center gap-1 py-4 border-r border-border/50 glass-surface">
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Link
            to={NAV_HOME.path}
            aria-label={NAV_HOME.label}
            className={cn(
              'relative flex items-center justify-center w-12 h-12 rounded-xl transition-colors press-effect',
              homeActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {homeActive && (
              <motion.div
                layoutId="nav-rail-indicator"
                className="absolute inset-0 glass rounded-xl"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="relative z-10">
              <NAV_HOME.icon className="w-5 h-5" />
            </span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{NAV_HOME.label}</TooltipContent>
      </Tooltip>

      {groups.map((group) => (
        <RailGroup
          key={group.id}
          group={group}
          active={isGroupActive(group, location.pathname)}
          open={openGroup === group.id}
          onOpenChange={(next) => setOpenGroup(next ? group.id : null)}
          roomOnlineCount={roomOnlineCount}
        />
      ))}
    </nav>
  );
}

function RailGroup({
  group,
  active,
  open,
  onOpenChange,
  roomOnlineCount,
}: {
  group: NavGroup;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomOnlineCount: number;
}) {
  const location = useLocation();
  // The live count belongs to The Room, so it surfaces on whichever group is
  // carrying The Room rather than being hard-coded to a position.
  const showsRoom = group.items.some((item) => item.path === '/room');

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={group.label}
          className={cn(
            'relative flex items-center justify-center w-12 h-12 rounded-xl transition-colors press-effect',
            active || open ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {active && (
            <motion.div
              layoutId="nav-rail-indicator"
              className="absolute inset-0 glass rounded-xl"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
            />
          )}
          <span className="relative z-10">
            <group.icon className="w-5 h-5" />
            {showsRoom && roomOnlineCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold">
                {roomOnlineCount}
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={10} className="w-64 p-1.5">
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
                'flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors',
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
