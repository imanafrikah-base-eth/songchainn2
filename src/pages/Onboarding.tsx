import { useState } from 'react';
import { motion } from 'framer-motion';
import { Headphones, User, FileText, Link2, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/songchainn-logo.webp';
import { z } from 'zod';

// Validation schema
const profileSchema = z.object({
  profileName: z.string().trim().min(1, 'Profile name is required').max(50, 'Profile name must be less than 50 characters'),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  location: z.string().trim().min(1, 'Location is required').max(100, 'Location must be less than 100 characters'),
  xProfileLink: z.string().url('Invalid URL').optional().or(z.literal('')),
  baseProfileLink: z.string().max(200, 'Link too long').optional(),
});

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [profileName, setProfileName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [xProfileLink, setXProfileLink] = useState('');
  const [baseProfileLink, setBaseProfileLink] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Validate with zod
    const validationResult = profileSchema.safeParse({
      profileName,
      bio: bio || undefined,
      location,
      xProfileLink: xProfileLink || undefined,
      baseProfileLink: baseProfileLink || undefined,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast({ title: 'Please fix the errors below', variant: 'destructive' });
      return;
    }
    
    if (!user) return;
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase
        .from('audience_profiles')
        .insert({
          user_id: user.id,
          profile_name: profileName.trim(),
          bio: bio.trim() || null,
          location: location.trim(),
          profile_picture_url: null,
          cover_photo_url: null,
          x_profile_link: xProfileLink.trim() || null,
          base_profile_link: baseProfileLink.trim() || null,
          onboarding_completed: true
        });
      
      if (error) {
        throw error;
      }
      
      toast({ title: 'Welcome to the Audience!' });
      try {
        localStorage.removeItem('songchainn_needs_onboarding');
      } catch {
        void 0;
      }
      await refreshProfile();
    } catch (err: any) {
      console.error('Onboarding error:', err);
      const msg = String(err?.message || '');
      const msgLower = msg.toLowerCase();
      const isMissingAudienceProfiles =
        String(err?.code || '') === 'PGRST205' ||
        (msgLower.includes('audience_profiles') && msgLower.includes('schema cache')) ||
        (msgLower.includes('could not find the table') && msgLower.includes('audience_profiles'));

      toast({ 
        title: 'Error creating profile', 
        description: isMissingAudienceProfiles
          ? "Database table 'audience_profiles' is missing. Apply Supabase migrations to enable account creation."
          : msg,
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto pt-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.img
            src={logo}
            alt="$ongChainn"
            className="h-12 mx-auto mb-4"
          />
          <div className="flex items-center justify-center gap-2 mb-2">
            <Headphones className="w-6 h-6 text-primary" />
            <h1 className="font-heading text-2xl font-bold text-foreground">
              Prepare Your Seats
            </h1>
          </div>
          <p className="text-muted-foreground">
            Set up your Audience profile and take your place in the $ongChainn experience.
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Profile Name */}
          <div className="space-y-2">
            <Label htmlFor="profileName" className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              Profile Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="profileName"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Your display name"
              maxLength={50}
              className={errors.profileName ? 'border-destructive' : ''}
            />
            {errors.profileName && (
              <p className="text-xs text-destructive">{errors.profileName}</p>
            )}
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Where are you listening from? <span className="text-destructive">*</span>
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Lusaka, Zambia"
              maxLength={100}
              className={errors.location ? 'border-destructive' : ''}
            />
            {errors.location && (
              <p className="text-xs text-destructive">{errors.location}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Share your city or country to connect with nearby listeners
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Bio
            </Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
          </div>

          {/* Social Links */}
          <div className="space-y-4">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Social Links
            </Label>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="xLink" className="text-xs text-muted-foreground">
                  X (Twitter) Profile
                </Label>
                <Input
                  id="xLink"
                  value={xProfileLink}
                  onChange={(e) => setXProfileLink(e.target.value)}
                  placeholder="https://x.com/yourhandle"
                />
              </div>
              
              <div>
                <Label htmlFor="baseLink" className="text-xs text-muted-foreground">
                  Base Profile / Wallet
                </Label>
                <Input
                  id="baseLink"
                  value={baseProfileLink}
                  onChange={(e) => setBaseProfileLink(e.target.value)}
                  placeholder="https://base.app/yourprofile or 0x..."
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full gradient-primary text-primary-foreground font-semibold h-12 shadow-glow"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Enter $ongChainn'
            )}
          </Button>

          {/* Early Access Note */}
          <p className="text-xs text-muted-foreground text-center">
            You're early — your Audience activity here unlocks future access and ownership.
          </p>
        </motion.form>
      </div>
    </div>
  );
}
