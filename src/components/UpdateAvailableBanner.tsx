import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Pathname of the entry script this running session was booted from
// (e.g. /assets/index-VHTG525f.js). A deploy changes the hash, so comparing
// against the server's current index.html detects new versions even though
// sw.js itself never changes between deploys.
function getRunningEntryPath(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  if (!el?.src) return null;
  try {
    return new URL(el.src, window.location.origin).pathname;
  } catch {
    return null;
  }
}

export function UpdateAvailableBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Deploy detection: ask the server (bypassing every cache) which entry
  // bundle it currently serves and compare with the one we're running.
  useEffect(() => {
    let cancelled = false;
    const runningEntry = getRunningEntryPath();
    if (!runningEntry) return;

    const checkForNewDeploy = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/', {
          cache: 'no-store',
          headers: { accept: 'text/html' },
        });
        if (!res.ok || cancelled) return;
        const html = await res.text();
        const match = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
        if (match && match[0] !== runningEntry && !cancelled) {
          setShowUpdate(true);
        }
      } catch {
        // Offline or flaky network — try again on the next trigger.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForNewDeploy();
    };

    const startTimer = window.setTimeout(() => void checkForNewDeploy(), 15_000);
    const interval = window.setInterval(() => void checkForNewDeploy(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleUpdate = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowUpdate(true);
      }
    };

    // Check for updates on existing registration
    navigator.serviceWorker.ready.then((registration) => {
      // Check if there's already a waiting worker
      if (registration.waiting) {
        handleUpdate(registration);
      }

      // Listen for new updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              setWaitingWorker(newWorker);
              setShowUpdate(true);
            }
          });
        }
      });
    });

    // Listen for controller change (update applied)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // Periodically check for updates (every 5 minutes)
    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleUpdate = () => {
    setIsUpdating(true);

    if (waitingWorker) {
      // Tell the waiting worker to skip waiting; controllerchange reloads.
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    // New deploy detected: a plain reload is enough — index.html always
    // revalidates and the new HTML pulls the new hashed bundles.
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  return (
    <AnimatePresence>
      {showUpdate && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 left-4 right-4 z-[60] mx-auto max-w-md"
        >
          <div className="glass-card rounded-2xl p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-semibold text-foreground text-sm mb-1">
                  New Version Available
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Refresh to get the latest features and improvements.
                </p>
                
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="gradient-primary text-xs h-8 gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                    {isUpdating ? 'Updating...' : 'Update Now'}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={handleDismiss}
                    className="text-xs h-8 text-muted-foreground"
                  >
                    Later
                  </Button>
                </div>
              </div>
              
              <button
                onClick={handleDismiss}
                className="p-1 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
