import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { cn } from '@/lib/utils';
import { navItems } from './Navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Desktop counterpart to BottomTabBar — takes over navigation at the same
// `lg:` breakpoint BottomTabBar hides at, reusing Navigation's nav item list
// and active-indicator motion pattern rather than duplicating either.
export function NavRail() {
  const location = useLocation();
  const { user, isArtist, artistId } = useAuth();
  const roomOnlineCount = useRoomOnlineCount({ roomId: 'global', viewerUserId: user?.id });
  const profilePath = isArtist && artistId ? `/artist/${artistId}` : '/profile';
  const effectiveNavItems = navItems.map((item) =>
    item.path === '/profile' ? { ...item, path: profilePath } : item
  );

  return (
    <nav className="hidden lg:flex fixed left-0 top-14 sm:top-16 bottom-0 z-30 w-20 flex-col items-center gap-1 py-4 border-r border-border/50 glass-surface">
      {effectiveNavItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Tooltip key={item.path} delayDuration={200}>
            <TooltipTrigger asChild>
              <Link
                to={item.path}
                aria-label={item.label}
                className={cn(
                  'relative flex items-center justify-center w-12 h-12 rounded-xl transition-colors press-effect',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-rail-indicator"
                    className="absolute inset-0 glass rounded-xl"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">
                  <item.icon className="w-5 h-5" />
                  {item.path === '/room' && roomOnlineCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold">
                      {roomOnlineCount}
                    </span>
                  )}
                </span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
