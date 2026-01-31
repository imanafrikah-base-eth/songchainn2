import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Share, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

const BANNER_DISMISSED_KEY = 'download-app-banner-dismissed';

export function getDeferredInstallPrompt() {
  if (typeof window === 'undefined') return null;
  return (window as any).__songchainnDeferredInstallPrompt ?? null;
}

export function clearDeferredInstallPrompt() {
  if (typeof window === 'undefined') return;
  (window as any).__songchainnDeferredInstallPrompt = null;
}

type InstallState = 'idle' | 'prompting' | 'installing' | 'complete' | 'error';

export function DownloadAppBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [installProgress, setInstallProgress] = useState(0);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showInstallConfirm, setShowInstallConfirm] = useState(false);

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  useEffect(() => {
    // Check if app is already installed (PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check if banner was already dismissed
    const wasDismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
    
    // Only show on mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile && !wasDismissed) {
      const timer = setTimeout(() => setIsVisible(true), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Simulate installation progress
  useEffect(() => {
    if (installState === 'installing') {
      const interval = setInterval(() => {
        setInstallProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setInstallState('complete');
            return 100;
          }
          return prev + Math.random() * 15 + 5;
        });
      }, 200);
      return () => clearInterval(interval);
    }
  }, [installState]);

  // Play success chime using Web Audio API
  const playSuccessChime = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a pleasant two-tone chime
      const playTone = (frequency: number, startTime: number, duration: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        // Envelope for smooth sound
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      
      const now = audioContext.currentTime;
      // Play ascending notes for success feeling
      playTone(523.25, now, 0.15);        // C5
      playTone(659.25, now + 0.1, 0.15);  // E5
      playTone(783.99, now + 0.2, 0.25);  // G5
    } catch (error) {
      void error;
    }
  }, []);

  // Auto-hide after complete + haptic feedback + confetti + sound
  useEffect(() => {
    if (installState === 'complete') {
      // Trigger haptic feedback on supported devices
      if ('vibrate' in navigator) {
        // Success pattern: short-pause-long vibration
        navigator.vibrate([50, 50, 100]);
      }
      
      // Play success chime
      playSuccessChime();
      
      // Trigger confetti celebration
      const duration = 2000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.8 },
          colors: ['#8B5CF6', '#A78BFA', '#C4B5FD', '#7C3AED', '#6D28D9']
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.8 },
          colors: ['#8B5CF6', '#A78BFA', '#C4B5FD', '#7C3AED', '#6D28D9']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
      
      const timer = setTimeout(() => {
        setIsVisible(false);
        localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [installState, playSuccessChime]);

  const handleInstall = useCallback(async () => {
    setInstallState('prompting');

    try {
      // Check if we have a deferred prompt (Chrome/Android/Edge)
      const deferredPrompt = getDeferredInstallPrompt();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          setInstallState('installing');
          setInstallProgress(0);
          toast.success('Installing $ongChainn...', {
            description: 'The app will appear on your home screen shortly!'
          });
        } else {
          setInstallState('idle');
        }
        
        // Clear the prompt - it can only be used once
        clearDeferredInstallPrompt();
      } else if (isIOS) {
        // For iOS, show the instructions overlay
        setInstallState('idle');
        setShowIOSInstructions(true);
      } else {
        // For browsers that don't support beforeinstallprompt
        setInstallState('idle');
        toast.info('Add to Home Screen', {
          description: 'Use your browser menu to "Add to Home Screen" or "Install App"',
          duration: 5000
        });
      }
    } catch (error) {
      setInstallState('error');
      toast.error('Installation failed', {
        description: 'Please try using your browser menu to install the app'
      });
      setTimeout(() => setInstallState('idle'), 2000);
    }
  }, [isIOS]);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setIsVisible(false);
  };

  const getButtonContent = () => {
    switch (installState) {
      case 'prompting':
        return (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Waiting...
          </>
        );
      case 'installing':
        return (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Installing...
          </>
        );
      case 'complete':
        return (
          <>
            <CheckCircle2 className="w-3.5 h-3.5" />
            Installed!
          </>
        );
      case 'error':
        return 'Try Again';
      default:
        return (
          <>
            <Download className="w-3.5 h-3.5" />
            Install App
          </>
        );
    }
  };

  if (isInstalled) return null;

  return (
    <>
      <AnimatePresence>
        {showInstallConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowInstallConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm glass-card rounded-2xl border border-border p-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-foreground text-base">
                    Install app now?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Adds $ongChainn to your home screen.
                  </p>
                </div>
                <button
                  onClick={() => setShowInstallConfirm(false)}
                  className="p-1 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowInstallConfirm(false)}
                  disabled={installState !== 'idle'}
                >
                  No
                </Button>
                <Button
                  className="flex-1 gradient-primary"
                  onClick={async () => {
                    setShowInstallConfirm(false);
                    await handleInstall();
                  }}
                  disabled={installState !== 'idle'}
                >
                  Yes
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md"
          >
            <div className="glass-card rounded-2xl p-4 border border-border shadow-lg overflow-hidden relative">
              {/* Progress Bar */}
              {(installState === 'installing' || installState === 'complete') && (
                <motion.div 
                  className="absolute top-0 left-0 right-0 h-1 bg-secondary"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div 
                    className="h-full gradient-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(installProgress, 100)}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </motion.div>
              )}
              
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                  installState === 'complete' 
                    ? 'bg-green-500/20 shadow-[0_0_20px_hsl(142,76%,36%,0.3)]' 
                    : 'gradient-primary shadow-glow'
                }`}>
                  <AnimatePresence mode="wait">
                    {installState === 'complete' ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      >
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      </motion.div>
                    ) : installState === 'installing' ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <Loader2 className="w-6 h-6 text-primary-foreground animate-spin" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="phone"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <Smartphone className="w-6 h-6 text-primary-foreground" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <div className="flex-1 min-w-0">
                  <AnimatePresence mode="wait">
                    {installState === 'complete' ? (
                      <motion.div
                        key="complete"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <h3 className="font-heading font-semibold text-green-500 text-sm mb-1">
                          Successfully Installed!
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          $ongChainn is now on your home screen
                        </p>
                      </motion.div>
                    ) : installState === 'installing' ? (
                      <motion.div
                        key="installing"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <h3 className="font-heading font-semibold text-foreground text-sm mb-1">
                          Installing $ongChainn...
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(Math.min(installProgress, 100))}% complete
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="default"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <h3 className="font-heading font-semibold text-foreground text-sm mb-1">
                          Get the $ongChainn App
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                          Install to unlock one-tap song saving for offline playback, faster access, and notifications.
                        </p>
                        
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => setShowInstallConfirm(true)}
                            disabled={installState !== 'idle'}
                            className="gradient-primary text-xs h-8 gap-1.5"
                          >
                            {getButtonContent()}
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={handleDismiss}
                            className="text-xs h-8 text-muted-foreground"
                          >
                            Not Now
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                {installState !== 'installing' && installState !== 'complete' && (
                  <button
                    onClick={handleDismiss}
                    className="p-1 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Installation Instructions Overlay */}
      <AnimatePresence>
        {showIOSInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6"
            onClick={() => setShowIOSInstructions(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-sm w-full text-center space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto shadow-glow">
                <Smartphone className="w-8 h-8 text-primary-foreground" />
              </div>
              
              <div>
                <h2 className="text-xl font-heading font-bold text-foreground mb-2">
                  Install $ongChainn
                </h2>
                <p className="text-muted-foreground text-sm">
                  Follow these steps to add the app to your home screen:
                </p>
              </div>

              <div className="space-y-4 text-left">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-sm">1</span>
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">Tap the Share button</p>
                    <p className="text-muted-foreground text-xs flex items-center gap-1 mt-1">
                      <Share className="w-3.5 h-3.5" /> at the bottom of {isSafari ? 'Safari' : 'your browser'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-sm">2</span>
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">Scroll and tap "Add to Home Screen"</p>
                    <p className="text-muted-foreground text-xs mt-1">Look for the + icon in the share menu</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-sm">3</span>
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">Tap "Add" to confirm</p>
                    <p className="text-muted-foreground text-xs mt-1">The app will appear on your home screen!</p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => setShowIOSInstructions(false)}
                className="w-full gradient-primary"
              >
                Got it!
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
