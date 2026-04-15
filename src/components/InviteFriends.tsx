import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Gift, Copy, Share2, Check, X, Star, Sparkles } from 'lucide-react';
import { useReferrals } from '@/hooks/useReferrals';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InviteFriendsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InviteFriends({ isOpen, onClose }: InviteFriendsProps) {
  const { 
    referralCode, 
    points, 
    completedReferrals, 
    copyInviteLink, 
    shareInviteLink,
    getInviteLink 
  } = useReferrals();
  const [copied, setCopied] = useState(false);
  const autoCloseTimerRef = useRef<number | null>(null);

  const resetAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current) {
      window.clearTimeout(autoCloseTimerRef.current);
    }
    autoCloseTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 10000);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      if (autoCloseTimerRef.current) {
        window.clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      return;
    }
    resetAutoCloseTimer();
    return () => {
      if (autoCloseTimerRef.current) {
        window.clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [isOpen, resetAutoCloseTimer]);

  const handleCopy = async () => {
    const success = await copyInviteLink();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto z-50"
            onMouseMove={resetAutoCloseTimer}
            onClick={resetAutoCloseTimer}
            onKeyDown={resetAutoCloseTimer}
            onTouchStart={resetAutoCloseTimer}
          >
            <div className="rounded-3xl p-6 shadow-glow border border-border/70 bg-background/98 backdrop-blur-xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl gradient-primary">
                    <Gift className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="font-heading text-xl font-bold text-foreground">Invite Friends</h2>
                    <p className="text-sm text-muted-foreground">Earn rewards together</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-secondary/50 transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-2xl p-4 text-center border border-border/60 bg-card/95">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Star className="w-4 h-4 text-primary" />
                    <span className="font-heading text-2xl font-bold text-foreground">
                      {points?.total_points || 0}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Total Points</p>
                </div>
                <div className="rounded-2xl p-4 text-center border border-border/60 bg-card/95">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-primary" />
                    <span className="font-heading text-2xl font-bold text-foreground">
                      {completedReferrals}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Friends Invited</p>
                </div>
              </div>

              {/* Rewards Info */}
              <div className="rounded-2xl p-4 mb-6 border border-border/60 bg-card/95">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      Earn 100 points per friend!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      When your friend signs up using your link, you both get rewarded. 
                      You get 100 points and they get 50 points to start!
                    </p>
                  </div>
                </div>
              </div>

              {/* Referral Code */}
              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-2">Your invite code</p>
                <div className="rounded-xl p-4 flex items-center justify-between border border-border/60 bg-card/95">
                  <code className="font-mono text-lg font-bold text-primary">
                    {referralCode || 'Loading...'}
                  </code>
                  <button 
                    onClick={handleCopy}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      copied ? "bg-green-500/20 text-green-500" : "hover:bg-secondary/50 text-muted-foreground"
                    )}
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Invite Link */}
              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-2">Or share this link</p>
                <div className="rounded-xl p-3 overflow-hidden border border-border/60 bg-card/95">
                  <p className="text-xs text-muted-foreground truncate">
                    {getInviteLink() || 'Generating link...'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button 
                  onClick={handleCopy}
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </Button>
                <Button 
                  onClick={shareInviteLink}
                  className="flex-1 gap-2 gradient-primary"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
