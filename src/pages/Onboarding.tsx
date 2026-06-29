import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Headphones, User, FileText, Link2, Loader2, MapPin, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
const logo = '/songchainn-logo.webp';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { uploadPublicImage } from '../lib/storage';

// Validation schema
const profileSchema = z.object({
  profileName: z.string().trim().min(1, 'Profile name is required').max(50, 'Profile name must be less than 50 characters'),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  location: z.string().trim().max(100, 'Location must be less than 100 characters').optional().or(z.literal('')),
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
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [xProfileLink, setXProfileLink] = useState('');
  const [baseProfileLink, setBaseProfileLink] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverCropMaxOffset, setCoverCropMaxOffset] = useState(0);
  const [avatarMaxOffsetX, setAvatarMaxOffsetX] = useState(0);
  const [avatarMaxOffsetY, setAvatarMaxOffsetY] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const coverPreviewRef = useRef<HTMLDivElement | null>(null);
  const avatarPreviewRef = useRef<HTMLDivElement | null>(null);
  const coverImgRef = useRef<HTMLImageElement | null>(null);
  const coverLiveOffsetRef = useRef(0);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const avatarLiveOffsetXRef = useRef(0);
  const avatarLiveOffsetYRef = useRef(0);
  const coverDragStateRef = useRef<{ startY: number; startOffset: number } | null>(null);
  const avatarDragStateRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const profileInitial =
    (profileName && profileName.trim().charAt(0).toUpperCase()) ||
    (user && typeof user.email === 'string' && user.email.trim().charAt(0).toUpperCase()) ||
    'N';

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [avatarPreviewUrl, coverPreviewUrl]);

  const handleBackToSignIn = useCallback(async () => {
    try {
      localStorage.removeItem('songchainn_needs_onboarding');
    } catch {
      void 0;
    }
    await signOut();
    // auth state change re-renders to Auth page — no explicit navigate needed
  }, [signOut]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files ?? [])[0];
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
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    const url = URL.createObjectURL(file);
    setAvatarPreviewUrl(url);
    setAvatarFile(file);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files ?? [])[0];
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
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    const url = URL.createObjectURL(file);
    setCoverPreviewUrl(url);
    setCoverFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

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
      const authedUserId = user.id;

      let avatarUrl: string | null = null;
      let coverUrl: string | null = null;

      if (avatarFile) {
        try {
          avatarUrl = await uploadPublicImage({
            bucket: 'avaters',
            userId: authedUserId,
            file: avatarFile,
          });
        } catch (err) {
          console.error('Onboarding avatar upload failed', err);
        }
      }

      if (coverFile) {
        try {
          coverUrl = await uploadPublicImage({
            bucket: 'covers',
            userId: authedUserId,
            file: coverFile,
          });
        } catch (err) {
          console.error('Onboarding cover upload failed', err);
        }
      }

      const profileFields = {
        user_id: authedUserId,
        profile_name: profileName.trim(),
        display_name: profileName.trim(),
        bio: bio.trim() || null,
        location: location.trim() || null,
        x_profile_link: xProfileLink.trim() || null,
        base_profile_link: baseProfileLink.trim() || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
        ...(avatarUrl ? { profile_picture_url: avatarUrl } : {}),
        ...(coverUrl ? { cover_photo_url: coverUrl } : {}),
      };

      const { data: existing } = await supabase
        .from('audience_profiles')
        .select('id')
        .eq('user_id', authedUserId)
        .maybeSingle();

      const saveResult = existing?.id
        ? await supabase.from('audience_profiles').update(profileFields).eq('user_id', authedUserId)
        : await supabase.from('audience_profiles').insert({ id: authedUserId, ...profileFields });

      if (saveResult.error) {
        console.error('Onboarding profile save failed', saveResult.error);
        toast({
          title: 'Could not save profile',
          description: saveResult.error.message,
          variant: 'destructive',
        });
        return;
      }

      try {
        localStorage.setItem('songchainn_needs_onboarding', '0');
        localStorage.setItem('songchainn_show_profile_photo_hint', '1');
      } catch {
        void 0;
      }
      await refreshProfile();
      toast({ title: 'Welcome to the Audience!' });
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Onboarding submit error', err);
      toast({
        title: 'Could not save profile',
        description: String(err?.message || 'Please try again.'),
        variant: 'destructive',
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
            <div
              ref={coverPreviewRef}
              className="relative w-full h-40 rounded-3xl border border-border/60 bg-secondary/20 flex items-center justify-center overflow-hidden touch-pan-y"
              onPointerDown={(e) => {
                if (!coverPreviewUrl) return;
                coverDragStateRef.current = {
                  startY: e.clientY,
                  startOffset: coverLiveOffsetRef.current,
                };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!coverDragStateRef.current) return;
                const deltaY = e.clientY - coverDragStateRef.current.startY;
                const nextOffset = coverDragStateRef.current.startOffset + deltaY;
                const clamped = Math.min(
                  coverCropMaxOffset,
                  Math.max(-coverCropMaxOffset, nextOffset)
                );
                coverLiveOffsetRef.current = clamped;
                if (coverImgRef.current) {
                  coverImgRef.current.style.transform = `translate(-50%, ${clamped}px)`;
                }
              }}
              onPointerUp={(e) => {
                if (!coverDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                coverDragStateRef.current = null;
              }}
              onPointerLeave={(e) => {
                if (!coverDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                coverDragStateRef.current = null;
              }}
            >
              {coverPreviewUrl && (
                <>
                  <img
                    ref={coverImgRef}
                    src={coverPreviewUrl}
                    alt="Cover preview"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      const container = coverPreviewRef.current;
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      const containerWidth = rect.width || 800;
                      const containerHeight = rect.height || 160;
                      const scale = containerWidth / img.naturalWidth;
                      const displayedHeight = img.naturalHeight * scale;
                      const maxOffset = Math.max(0, (displayedHeight - containerHeight) / 2);
                      setCoverCropMaxOffset(maxOffset);
                      coverLiveOffsetRef.current = 0;
                      img.style.transform = 'translate(-50%, 0px)';
                    }}
                    style={{ transform: 'translate(-50%, 0px)', width: '100%', height: 'auto' }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-2">
                    <div className="px-3 py-1 rounded-full bg-background/70 text-[10px] font-medium tracking-wide text-foreground/80">
                      Drag to reposition
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/10 to-background/40" />
                </>
              )}
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="relative px-4 py-2 rounded-full bg-background/80 text-sm font-medium hover:bg-background"
                disabled={isLoading}
              >
                {coverFile ? 'Change cover photo' : 'Add cover photo'}
              </button>
              <input
                ref={coverInputRef}
                id="cover"
                type="file"
                accept="image/*"
                onChange={handleCoverChange}
                disabled={isLoading}
                className="hidden"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  ref={avatarPreviewRef}
                  className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-lg font-semibold overflow-hidden touch-pan-y"
                  onPointerDown={(e) => {
                    if (!avatarPreviewUrl) return;
                    avatarDragStateRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      startOffsetX: avatarLiveOffsetXRef.current,
                      startOffsetY: avatarLiveOffsetYRef.current,
                    };
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!avatarDragStateRef.current) return;
                    const deltaX = e.clientX - avatarDragStateRef.current.startX;
                    const deltaY = e.clientY - avatarDragStateRef.current.startY;
                    const nextX = avatarDragStateRef.current.startOffsetX + deltaX;
                    const nextY = avatarDragStateRef.current.startOffsetY + deltaY;
                    const clampedX = Math.min(avatarMaxOffsetX, Math.max(-avatarMaxOffsetX, nextX));
                    const clampedY = Math.min(avatarMaxOffsetY, Math.max(-avatarMaxOffsetY, nextY));
                    avatarLiveOffsetXRef.current = clampedX;
                    avatarLiveOffsetYRef.current = clampedY;
                    if (avatarImgRef.current) {
                      avatarImgRef.current.style.transform = `translate(-50%, -50%) translate(${clampedX}px, ${clampedY}px)`;
                    }
                  }}
                  onPointerUp={(e) => {
                    if (!avatarDragStateRef.current) return;
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    avatarDragStateRef.current = null;
                  }}
                  onPointerLeave={(e) => {
                    if (!avatarDragStateRef.current) return;
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    avatarDragStateRef.current = null;
                  }}
                >
                  {avatarPreviewUrl ? (
                    <img
                      ref={avatarImgRef}
                      src={avatarPreviewUrl}
                      alt="Profile preview"
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        const container = avatarPreviewRef.current;
                        if (!container) return;
                        const rect = container.getBoundingClientRect();
                        const containerWidth = rect.width || 56;
                        const containerHeight = rect.height || 56;
                        const scale = containerWidth / img.naturalWidth;
                        const displayedHeight = img.naturalHeight * scale;
                        const displayedWidth = img.naturalWidth * scale;
                        const maxOffsetX = Math.max(0, (displayedWidth - containerWidth) / 2);
                        const maxOffsetY = Math.max(0, (displayedHeight - containerHeight) / 2);
                        setAvatarMaxOffsetX(maxOffsetX);
                        setAvatarMaxOffsetY(maxOffsetY);
                        avatarLiveOffsetXRef.current = 0;
                        avatarLiveOffsetYRef.current = 0;
                        img.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
                      }}
                      style={{ transform: 'translate(-50%, -50%) translate(0px, 0px)', width: '100%', height: 'auto' }}
                    />
                  ) : (
                    profileInitial
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-secondary/60 transition-colors"
                  disabled={isLoading}
                >
                  <Camera className="w-3 h-3" />
                </button>
                <input
                  ref={avatarInputRef}
                  id="avatar"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  disabled={isLoading}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-muted-foreground max-w-xs">
                Add a profile photo and cover so people can spot you in the town square.
              </p>
            </div>
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

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Where are you listening from? <span className="text-muted-foreground text-xs">(optional)</span>
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
