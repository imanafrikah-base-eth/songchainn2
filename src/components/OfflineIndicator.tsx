import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, CloudOff, Loader2 } from 'lucide-react';
import { useOfflineQueueContext } from '@/hooks/useOfflineQueue';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const { pendingCount, isSyncing } = useOfflineQueueContext();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      // Hide the "back online" message after 3 seconds
      setTimeout(() => setShowReconnected(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showIndicator = !isOnline || showReconnected || (isSyncing && pendingCount > 0);

  return (
    <AnimatePresence>
      {showIndicator && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="fixed top-3 inset-x-0 z-[70] flex justify-center pointer-events-none"
        >
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium shadow-glow glass-card border pointer-events-auto ${
              isSyncing
                ? 'bg-primary/90 text-primary-foreground border-primary/60'
                : isOnline
                  ? 'bg-emerald-500/90 text-white border-emerald-400/70'
                  : 'bg-destructive/90 text-destructive-foreground border-destructive/60'
            }`}
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing {pendingCount} action{pendingCount !== 1 ? 's' : ''}...</span>
              </>
            ) : isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>
                  Back online
                  {pendingCount > 0 ? ` · Syncing ${pendingCount} queued action${pendingCount !== 1 ? 's' : ''}` : ''}
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                <span>
                  Offline mode
                  {pendingCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <CloudOff className="w-3 h-3" />
                      {pendingCount} pending
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
