import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Smartphone, 
  Monitor, 
  Share, 
  Plus, 
  Download, 
  Check, 
  ArrowRight,
  Apple,
  Chrome
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { clearDeferredInstallPrompt, getDeferredInstallPrompt } from '@/components/DownloadAppBanner';
import { AnimatePresence } from 'framer-motion';

export default function Install() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showInstallConfirm, setShowInstallConfirm] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const deferredPromptRef = useRef<any>(null);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://songchainn.xyz';
  const installUrl = `${appUrl}/install`;
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Check if mobile
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };

    const onGlobalPromptCaptured = () => {
      const prompt = getDeferredInstallPrompt();
      if (prompt) {
        deferredPromptRef.current = prompt;
      }
    };

    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setIsInstalled(true);
    };

    const onGlobalAppInstalled = () => {
      deferredPromptRef.current = null;
      setIsInstalled(true);
    };

    const existingPrompt = getDeferredInstallPrompt();
    if (existingPrompt) {
      deferredPromptRef.current = existingPrompt;
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('pwa:installprompt', onGlobalPromptCaptured);
    window.addEventListener('pwa:appinstalled', onGlobalAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('pwa:installprompt', onGlobalPromptCaptured);
      window.removeEventListener('pwa:appinstalled', onGlobalAppInstalled);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (isInstalled) return;
    const deferredPrompt = deferredPromptRef.current ?? getDeferredInstallPrompt();
    if (!deferredPrompt) {
      if (isIOS) {
        setShowIOSInstructions(true);
        return;
      }
      toast({
        title: 'Install not available',
        description: 'Use your browser menu to "Add to Home Screen" or "Install App".',
      });
      return;
    }

    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast({
          title: 'Installing…',
          description: 'If prompted, confirm to add the app to your home screen.',
        });
      }
    } finally {
      deferredPromptRef.current = null;
      clearDeferredInstallPrompt();
    }
  }, [isInstalled, isIOS]);

  const steps = {
    ios: [
      {
        icon: <Share className="w-6 h-6" />,
        title: 'Tap the Share button',
        description: 'Look for the Share icon at the bottom of Safari'
      },
      {
        icon: <Plus className="w-6 h-6" />,
        title: 'Select "Add to Home Screen"',
        description: 'Scroll down in the share menu and tap this option'
      },
      {
        icon: <Check className="w-6 h-6" />,
        title: 'Tap "Add"',
        description: 'Confirm by tapping Add in the top right corner'
      }
    ],
    android: [
      {
        icon: <Chrome className="w-6 h-6" />,
        title: 'Open in Chrome',
        description: 'Make sure you\'re using Chrome browser'
      },
      {
        icon: <Download className="w-6 h-6" />,
        title: 'Tap "Install App"',
        description: 'Look for the install banner or tap the menu (⋮)'
      },
      {
        icon: <Check className="w-6 h-6" />,
        title: 'Confirm Installation',
        description: 'Tap Install to add the app to your home screen'
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="px-4 pt-4 sm:pt-6 relative z-10">
        <AnimatePresence>
          {showIOSInstructions && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
              onClick={() => setShowIOSInstructions(false)}
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
                      Add to Home Screen
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Follow these steps in {isSafari ? 'Safari' : 'your browser'}.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowIOSInstructions(false)}
                    className="p-1 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground flex-shrink-0"
                  >
                    <Plus className="w-4 h-4 rotate-45" />
                  </button>
                </div>

                <div className="space-y-3 mb-4">
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
                      <p className="text-foreground text-sm font-medium">Tap “Add to Home Screen”</p>
                      <p className="text-muted-foreground text-xs mt-1">Scroll down in the share menu to find it</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-sm">3</span>
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-medium">Tap “Add” to confirm</p>
                      <p className="text-muted-foreground text-xs mt-1">The app will appear on your home screen</p>
                    </div>
                  </div>
                </div>

                <Button onClick={() => setShowIOSInstructions(false)} className="w-full gradient-primary">
                  Got it!
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {showInstallConfirm && (
          <div
            className="fixed inset-0 z-[110] bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowInstallConfirm(false)}
          >
            <div
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
                  <Plus className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowInstallConfirm(false)}
                >
                  No
                </Button>
                <Button
                  className="flex-1 gradient-primary"
                  onClick={async () => {
                    setShowInstallConfirm(false);
                    await handleInstallClick();
                  }}
                >
                  Yes
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <div className="w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow">
            <Smartphone className="w-10 h-10 text-primary-foreground" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-4">
            Install $ongChainn
          </h1>
          <p className="text-muted-foreground text-lg">
            Get the full app experience with offline access, push notifications, and faster performance.
          </p>

          {isInstalled && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 text-green-500"
            >
              <Check className="w-5 h-5" />
              <span className="font-medium">Already Installed!</span>
            </motion.div>
          )}
        </motion.div>

        {/* Desktop QR Code Section */}
        {!isMobile && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-md mx-auto mb-12"
          >
            <div className="glass-card rounded-2xl p-8 text-center border border-border">
              <div className="flex items-center justify-center gap-2 mb-4 text-muted-foreground">
                <Monitor className="w-5 h-5" />
                <span className="text-sm">You're on desktop</span>
              </div>
              
              <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
                Scan to Install on Mobile
              </h2>
              
              <div className="bg-white p-4 rounded-xl inline-block mb-4">
                <QRCodeSVG 
                  value={installUrl}
                  size={180}
                  level="H"
                  includeMargin={false}
                  fgColor="#0A0A0F"
                  bgColor="#FFFFFF"
                />
              </div>
              
              <p className="text-sm text-muted-foreground">
                Scan to open the install page on your phone
              </p>
            </div>
          </motion.section>
        )}

        {/* Installation Instructions */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-2xl mx-auto"
        >
          <h2 className="text-2xl font-heading font-semibold text-foreground text-center mb-8">
            Installation Instructions
          </h2>

          <Tabs defaultValue="ios" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="ios" className="gap-2">
                <Apple className="w-4 h-4" />
                iPhone / iPad
              </TabsTrigger>
              <TabsTrigger value="android" className="gap-2">
                <Chrome className="w-4 h-4" />
                Android
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ios">
              <div className="space-y-4">
                {steps.ios.map((step, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                    className="glass-card rounded-xl p-4 border border-border flex items-start gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
                      {step.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                          Step {index + 1}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-xl bg-secondary/30 border border-border">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Note:</strong> Make sure you're using Safari browser on iOS. 
                  The "Add to Home Screen" option is only available in Safari.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="android">
              <div className="space-y-4">
                {steps.android.map((step, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                    className="glass-card rounded-xl p-4 border border-border flex items-start gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
                      {step.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                          Step {index + 1}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {isMobile && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mt-6"
                >
                  <Button 
                    onClick={() => setShowInstallConfirm(true)}
                    className="w-full gradient-primary gap-2"
                    size="lg"
                  >
                    <Download className="w-5 h-5" />
                    Install Now
                  </Button>
                </motion.div>
              )}
            </TabsContent>
          </Tabs>
        </motion.section>

        {/* Features Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-2xl mx-auto mt-12"
        >
          <h2 className="text-xl font-heading font-semibold text-foreground text-center mb-6">
            Why Install the App?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: '🚀', title: 'Faster Loading', desc: 'Instant access without browser delays' },
              { icon: '📴', title: 'Offline Mode', desc: 'Listen to cached music anywhere' },
              { icon: '🔔', title: 'Push Notifications', desc: 'Never miss new releases' }
            ].map((feature, index) => (
              <div key={index} className="glass-card rounded-xl p-4 text-center border border-border">
                <div className="text-3xl mb-2">{feature.icon}</div>
                <h3 className="font-semibold text-foreground text-sm">{feature.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{feature.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>
      </main>
    </div>
  );
}
