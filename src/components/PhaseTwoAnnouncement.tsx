import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Coins, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const SEEN_KEY = 'songchainn_seen_phase2_marketplace_announcement_v1';

export function PhaseTwoAnnouncement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(SEEN_KEY) === 'true') return;
    } catch {
      // localStorage unavailable -- show once for this session instead of erroring.
    }
    const timer = setTimeout(() => setIsVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [user]);

  const dismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(SEEN_KEY, 'true');
    } catch {
      // Best-effort only -- worst case the banner reappears next session.
    }
  };

  const explore = () => {
    dismiss();
    navigate('/marketplace');
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed inset-x-0 top-16 z-[80] px-3 sm:px-4 flex justify-center"
        >
          <div className="relative glass-card rounded-2xl p-4 sm:p-5 border border-primary/30 shadow-glow max-w-lg w-full overflow-hidden">
            <div className="absolute inset-0 gradient-primary opacity-10 pointer-events-none" />

            <button
              onClick={dismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors z-10"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-glow">
                <Coins className="w-5.5 h-5.5 text-primary-foreground" />
              </div>

              <div className="flex-1 min-w-0 pr-4">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Phase Two is Live</span>
                </div>
                <h3 className="font-heading font-bold text-foreground text-base sm:text-lg mb-1">
                  The Music Marketplace has arrived 🎉
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                  Phase One was Audience First -- building your taste and community. Now in Phase Two,
                  songs become real, tradeable coins on Base. Buy them, sell them, and back the
                  artists you love directly, on-chain.
                </p>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={explore} className="gradient-primary text-primary-foreground text-xs h-8 gap-1.5">
                    <Coins className="w-3.5 h-3.5" />
                    Explore Marketplace
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismiss} className="text-xs h-8">
                    Maybe later
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
