import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Compass, Users, MessageCircle, User, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafePlayerState } from '@/context/PlayerContext';

const tabItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/discover', label: 'Discover', icon: Compass },
  { path: '/room', label: 'Room', icon: Headphones },
  { path: '/community', label: 'Community', icon: Users },
  { path: '/social', label: 'Feed', icon: MessageCircle },
  { path: '/profile', label: 'Profile', icon: User },
];

export function BottomTabBar() {
  const location = useLocation();
  const playerState = useSafePlayerState();
  const currentSong = playerState?.currentSong;

  // Hide tab bar when music is playing - player takes its place
  if (currentSong) return null;

  if (location.pathname === '/install') return null;

  return (
    <AnimatePresence>
      <motion.nav 
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
      >
        {/* Glass background with blur */}
        <div className="glass-surface border-t border-border/50 pb-safe">
          <div className="flex items-center justify-around h-16 px-2">
            {tabItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[60px]",
                    isActive 
                      ? "text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="relative">
                    <item.icon className={cn(
                      "w-5 h-5 transition-transform",
                      isActive && "scale-110"
                    )} />
                    {isActive && (
                      <motion.div
                        layoutId="bottom-tab-indicator"
                        className="absolute -inset-2 bg-primary/10 rounded-xl -z-10"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium transition-all",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </AnimatePresence>
  );
}
