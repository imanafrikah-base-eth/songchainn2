import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function NotificationBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const { isSupported, isSubscribed, permission, subscribe } = usePushNotifications();

  useEffect(() => {
    if (!isSupported) {
      setIsVisible(false);
      return;
    }

    if (permission === 'granted' || isSubscribed) {
      setIsVisible(false);
      return;
    }

    const timer = setTimeout(() => setIsVisible(true), 800);
    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, permission]);

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setIsVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 left-4 right-4 z-50 mx-auto max-w-lg"
        >
          <div className="glass-card rounded-2xl p-4 border border-primary/20 shadow-glow">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-semibold text-foreground text-sm mb-1">
                  Stay in the loop
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Get notified about activity on your posts and new drops.
                </p>
                
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleEnable}
                    className="gradient-primary text-xs h-8"
                    disabled={permission === 'denied'}
                  >
                    Enable Notifications
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
