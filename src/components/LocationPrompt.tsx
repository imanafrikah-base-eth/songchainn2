import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Loader2, X, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { updateProfile } from '@/lib/localDb';

const locationSchema = z.string()
  .trim()
  .min(1, 'Location is required')
  .max(100, 'Location must be less than 100 characters');

interface LocationPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LocationPrompt({ isOpen, onClose, onSuccess }: LocationPromptProps) {
  const { user, audienceProfile } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = locationSchema.safeParse(location);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    if (!user || !audienceProfile) return;

    setIsLoading(true);

    try {
      updateProfile(user.id, { location: location.trim() });

      toast({ title: 'Location updated!', description: 'Thanks for sharing where you listen from.' });
      try {
        localStorage.setItem('location_prompt_dismissed', 'true');
      } catch {
        void 0;
      }
      onSuccess();
    } catch (err: any) {
      toast({ title: 'Error updating location', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    try {
      localStorage.setItem('location_prompt_dismissed', 'true');
    } catch {
      void 0;
    }
    onClose();
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={handleSkip}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] mx-4 bg-background rounded-3xl p-4 sm:p-6 z-50 shadow-2xl border border-border overflow-y-auto"
          >
            {/* Close Button */}
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring' }}
                className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4"
              >
                <Globe className="w-8 h-8 text-primary" />
              </motion.div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                Where are you listening from?
              </h2>
              <p className="text-sm text-muted-foreground">
                Help us connect you with music fans in your area and personalize your experience.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Your Location
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Lusaka, Zambia"
                  maxLength={100}
                  className={error ? 'border-destructive' : ''}
                  autoFocus
                />
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-2" />
                  )}
                  Save Location
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={handleSkip}
                >
                  Maybe Later
                </Button>
              </div>
            </form>

            {/* Privacy note */}
            <p className="text-xs text-muted-foreground text-center mt-4">
              Your location is visible on your profile. You can change it anytime.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
