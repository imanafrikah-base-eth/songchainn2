import { type ChangeEvent, useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Headphones, User, FileText, Link2, Loader2, MapPin, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/songchainn-logo.webp';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';

// Validation schema
const profileSchema = z.object({
  profileName: z.string().trim().min(1, 'Profile name is required').max(50, 'Profile name must be less than 50 characters'),
  username: z
    .string()
    .trim()
    .min(3, 'Username is required')
    .max(32, 'Username must be less than 32 characters')
    .regex(/^[a-z0-9_]+$/i, 'Username can only contain letters, numbers, and underscores'),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  location: z.string().trim().min(1, 'Location is required').max(100, 'Location must be less than 100 characters'),
  xProfileLink: z.string().url('Invalid URL').optional().or(z.literal('')),
  baseProfileLink: z.string().max(200, 'Link too long').optional(),
});

export default function Onboarding() {
  const { user, refreshProfile, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [profileName, setProfileName] = useState('');
   const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [xProfileLink, setXProfileLink] = useState('');
  const [baseProfileLink, setBaseProfileLink] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploadFailed, setAvatarUploadFailed] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploadFailed, setCoverUploadFailed] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const handleBackToSignIn = useCallback(async () => {
    try {
      await signOut();
      try {
        localStorage.removeItem('songchainn_needs_onboarding');
      } catch {
        void 0;
      }
    } finally {
      navigate('/auth', { replace: true });
    }
  }, [navigate, signOut]);

  const handleAvatarChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image too large (max 10MB)', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please select an image file', variant: 'destructive' });
      return;
    }
    const url = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarUploadFailed(false);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, [toast]);

  const handleCoverChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image too large (max 10MB)', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please select an image file', variant: 'destructive' });
      return;
    }
    const url = URL.createObjectURL(file);
    setCoverFile(file);
    setCoverUploadFailed(false);
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, [toast]);

  const uploadImage = useCallback(
    async (file: File, field: 'avatar_url' | 'cover_photo_url') => {
      if (!user || !isSupabaseConfigured) return null;
      const extensionFromName = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
      const extensionFromType = file.type.includes('/') ? file.type.split('/').pop() || '' : '';
      const extension = (extensionFromName || extensionFromType || 'jpg').toLowerCase();
      const bucket = field === 'avatar_url' ? 'avaters' : 'covers';
      let attempt = 0;
      let lastError: string | null = null;

      while (attempt < 2) {
        attempt += 1;
        const fileName = `${field}-${user.id}-${Date.now()}-${attempt}.${extension}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (!uploadError && uploadData?.path) {
          const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(uploadData.path);
          return publicUrlData.publicUrl;
        }

        lastError = uploadError?.message || 'Upload failed';
      }

      toast({ title: 'Image upload failed', description: lastError || 'Saving profile without this photo.' });
      return null;
    },
    [toast, user]
  );

  const retryAvatarUpload = useCallback(async () => {
    if (!avatarFile) return;
    const uploaded = await uploadImage(avatarFile, 'avatar_url');
    if (uploaded) {
      setAvatarUploadFailed(false);
      toast({ title: 'Profile photo uploaded' });
    } else {
      setAvatarUploadFailed(true);
    }
  }, [avatarFile, toast, uploadImage]);

  const retryCoverUpload = useCallback(async () => {
    if (!coverFile) return;
    const uploaded = await uploadImage(coverFile, 'cover_photo_url');
    if (uploaded) {
      setCoverUploadFailed(false);
      toast({ title: 'Cover photo uploaded' });
    } else {
      setCoverUploadFailed(true);
    }
  }, [coverFile, toast, uploadImage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Validate with zod
    const validationResult = profileSchema.safeParse({
      profileName,
      username,
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
    
    setIsLoading(true);
    
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const authedUser = authData.user;
      if (!authedUser) throw new Error('Not authenticated');

      const payload = {
        user_id: authedUser.id,
        profile_name: profileName.trim(),
        bio: bio?.trim() || null,
        location: location.trim(),
        base_profile_link: baseProfileLink?.trim() || null,
        x_profile_link: xProfileLink?.trim() || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('audience_profiles')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.error('Onboarding upsert error:', error);
        throw error;
      }
      
      toast({ title: 'Welcome to the Audience!' });
      try {
        localStorage.setItem('songchainn_needs_onboarding', '0');
        localStorage.setItem('songchainn_show_profile_photo_hint', '1');
      } catch {
        void 0;
      }
      await refreshProfile();
      navigate('/', { replace: true });
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('Onboarding error:', err);
      }
      const msg = String(err?.message || '');
      const msgLower = msg.toLowerCase();
      const code = String(err?.code || '');
      const isMissingAudienceProfiles =
        code === 'PGRST205' ||
        code === 'PGRST204' ||
        (msgLower.includes('audience_profiles') && msgLower.includes('schema cache')) ||
        (msgLower.includes('could not find the table') && msgLower.includes('audience_profiles')) ||
        (msgLower.includes('could not find the') &&
          msgLower.includes('base_profile_link') &&
          msgLower.includes('schema cache'));

      toast({ 
        title: 'Error creating profile', 
        description: isMissingAudienceProfiles
          ? "Database schema for 'audience_profiles' is missing or outdated. Apply Supabase migrations to enable account creation."
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
        <div className="mb-4">
          <Button type="button" variant="ghost" onClick={handleBackToSignIn}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
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
          <div className="space-y-4">
            {!isSupabaseConfigured && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-200">
                Storage is not configured. Photos will be skipped until Supabase storage is enabled.
              </div>
            )}
            <div className="relative h-32 sm:h-40 rounded-2xl overflow-hidden bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20 border border-primary/30">
              {coverPreview && (
                <img
                  src={coverPreview}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="backdrop-blur bg-background/80"
                  onClick={() => coverPhotoInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {coverPreview ? 'Change cover photo' : 'Add cover photo'}
                </Button>
              </div>
              <input
                ref={coverPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverChange}
              />
            </div>
            {coverUploadFailed && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs sm:text-sm text-destructive">
                <span>Cover upload failed. Retry?</span>
                <Button type="button" size="sm" variant="outline" onClick={retryCoverUpload}>
                  Retry
                </Button>
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-background bg-secondary overflow-hidden">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Profile preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      {(profileName.trim() || user?.email || 'L').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <input
                  ref={profilePictureInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute -bottom-1 -right-1 rounded-full bg-background/90 backdrop-blur"
                  onClick={() => profilePictureInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 text-xs sm:text-sm text-muted-foreground">
                Add a profile photo and cover so people can spot you in the town square.
              </div>
            </div>
            {avatarUploadFailed && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs sm:text-sm text-destructive">
                <span>Profile photo upload failed. Retry?</span>
                <Button type="button" size="sm" variant="outline" onClick={retryAvatarUpload}>
                  Retry
                </Button>
              </div>
            )}
          </div>

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

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. zamrock_fan"
              maxLength={32}
              className={errors.username ? 'border-destructive' : ''}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username}</p>
            )}
            <p className="text-xs text-muted-foreground">
              This is your handle for comments, community, and leaderboards.
            </p>
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
                  Base name
                </Label>
                <Input
                  id="baseLink"
                  value={baseProfileLink}
                  onChange={(e) => setBaseProfileLink(e.target.value)}
                  placeholder="example.base.eth"
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
