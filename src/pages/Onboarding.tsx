import { PhotoPositioner } from '@/components/PhotoPositioner';
import { cropImage, CENTRE_CROP, type PhotoCrop } from '@/lib/cropImage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Headphones, User, FileText, Link2, Loader2, MapPin, Camera, CalendarDays, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
const logo = '/songchainn-logo.webp';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { uploadPublicImage } from '../lib/storage';
import { MIN_AGE, POLICY_VERSIONS } from '@/legal/policies';
import { yearsSince } from '@/hooks/useCompliance';

// Validation schema
const profileSchema = z.object({
  profileName: z.string().trim().min(1, 'Profile name is required').max(50, 'Profile name must be less than 50 characters'),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  location: z.string().trim().max(100, 'Location must be less than 100 characters').optional().or(z.literal('')),
  xProfileLink: z.string().trim().max(200, 'Link must be less than 200 characters').optional().or(z.literal('')),
});

// Accepts a full URL, a bare domain path, or an @handle and returns a usable URL.
const normalizeXLink = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('@')) return `https://x.com/${value.slice(1)}`;
  if (/^(x\.com|twitter\.com)\//i.test(value)) return `https://${value}`;
  if (/^[A-Za-z0-9_]{1,15}$/.test(value)) return `https://x.com/${value}`;
  return `https://${value}`;
};

export default function Onboarding() {
  const { user, refreshProfile, refreshArtistStatus, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [profileName, setProfileName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [xProfileLink, setXProfileLink] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('unsaid');
  const [makesMusic, setMakesMusic] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  /** Where each photo sits in its frame. Cut from the full file at submit. */
  const [coverCrop, setCoverCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const [avatarCrop, setAvatarCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

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

    /* Age, before anything else is saved.
       Collected as a date rather than a tickbox, because a tick tells us
       nothing we could act on and this decides what the app opens. Under the
       floor is refused outright; between the floor and adulthood the account
       exists and simply has messaging, uploads and money closed. */
    if (!dateOfBirth) {
      setErrors({ dateOfBirth: 'We need your date of birth.' });
      return;
    }
    const age = yearsSince(dateOfBirth);
    if (!Number.isFinite(age) || age < 0 || age > 120) {
      setErrors({ dateOfBirth: 'That date does not look right.' });
      return;
    }
    if (age < MIN_AGE) {
      setErrors({
        dateOfBirth: `You need to be at least ${MIN_AGE} to have an account here. The music is not going anywhere.`,
      });
      return;
    }

    const validationResult = profileSchema.safeParse({
      profileName,
      bio: bio || undefined,
      location,
      xProfileLink: xProfileLink || undefined,
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
          // The drag used to be decoration: the raw photo went up whatever
          // was chosen. Now the framed window is what uploads.
          avatarUrl = await uploadPublicImage({
            bucket: 'avaters',
            userId: authedUserId,
            file: await cropImage(avatarFile, { ...avatarCrop, aspect: 1 }, { outputWidth: 600, circle: true, fileName: 'avatar.png' }).catch(() => avatarFile),
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
            file: await cropImage(coverFile, coverCrop, { outputWidth: 1600, quality: 0.9, fileName: 'cover.jpg' }).catch(() => coverFile),
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
        x_profile_link: normalizeXLink(xProfileLink),
        onboarding_completed: true,
        terms_accepted_at: new Date().toISOString(),
        date_of_birth: dateOfBirth,
        gender,
        age_confirmed_at: new Date().toISOString(),
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
      /* Record what they agreed to, and which version of it. Never let this
         fail the sign-up: a missing consent row is ours to notice, not a
         reason to bounce somebody out of onboarding. */
      try {
        await (supabase.from('policy_acceptances' as never) as any).upsert(
          (['terms', 'privacy', 'guidelines'] as const).map((policy) => ({
            user_id: authedUserId,
            policy_key: policy,
            version: POLICY_VERSIONS[policy],
            context: 'onboarding',
          })),
          { onConflict: 'user_id,policy_key,version', ignoreDuplicates: true },
        );
      } catch (consentErr) {
        console.error('Could not record policy acceptance', consentErr);
      }

      await refreshProfile();
      /* The age answer was cached as unknown before this form saved it, so
         without this the Studio greets a brand-new musician with the age
         prompt over the Send button. Seen on production, 9 Sep 2026. */
      await queryClient.invalidateQueries({ queryKey: ['compliance', authedUserId] });

      /* Two different people finish this form, and sending both to the feed
         wastes the one moment a musician is most ready to act. Somebody who
         said they make music goes straight to the Studio with their name
         already filled in; everybody else goes to the music.

         Note what this deliberately does NOT do: it does not mark them an
         artist. Saying you make music is an intention. The artist_accounts row
         is written when an admin approves their claim (Admin > Claims), and
         until then the Studio and upload-url both refuse them. Nobody gets an
         artist page for ticking a box. */
      if (makesMusic) {
        // Saying you make music IS the application. The account gets a page
        // of its own right now (become_artist) and the Studio is the first
        // thing they see. Claiming an EXISTING artist's page is the one thing
        // that still goes through review, from /claim.
        const { error: artistErr } = await supabase.rpc('become_artist' as never);
        if (artistErr) {
          console.error('become_artist failed at onboarding', artistErr);
          toast({
            title: 'You are in.',
            description: 'Open the Studio from your profile when you are ready to send a record.',
          });
          navigate('/', { replace: true });
        } else {
          await refreshArtistStatus();
          toast({
            title: 'Your Studio is open',
            description: 'Send a record and it goes live the same minute. No fee, no wallet needed.',
          });
          navigate('/studio', { replace: true });
        }
      } else {
        toast({ title: 'Welcome to the Audience!' });
        navigate('/', { replace: true });
      }
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
            <div className="relative w-full h-40 rounded-3xl border border-border/60 bg-secondary/20 flex items-center justify-center overflow-hidden">
              {coverPreviewUrl && (
                <>
                  <PhotoPositioner
                    src={coverPreviewUrl}
                    onChange={setCoverCrop}
                    className="absolute inset-0"
                    alt="Cover preview"
                    disabled={isLoading}
                  />
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
                <div className="relative w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-lg font-semibold overflow-hidden">
                  {avatarPreviewUrl ? (
                    <PhotoPositioner
                      src={avatarPreviewUrl}
                      onChange={setAvatarCrop}
                      className="absolute inset-0"
                      alt="Profile preview"
                      hint={null}
                      disabled={isLoading}
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
                Add a profile photo and cover so people can spot you in the community.
              </p>
            </div>
          </div>

          {/* Which of the two people finishing this form is this?
              Asked first because the answer changes where they land, and asked
              in plain words rather than "artist or listener", because plenty of
              people who make music would not call themselves an artist yet. */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Music className="w-4 h-4" />
              Do you make music?
            </Label>
            {/* The one moment in this form worth making feel like something.
                The chosen seat lifts off the page and catches the light; the
                other stays flat. Depth carries the choice, not colour, so it
                still reads as a real surface rather than a lit-up button. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMakesMusic(false)}
                aria-pressed={!makesMusic}
                className={`rounded-xl border px-4 py-3 text-left transition-all duration-300 ${
                  !makesMusic
                    ? 'live-surface border-border bg-card -translate-y-0.5'
                    : 'border-border/60 bg-transparent hover:bg-muted/50'
                }`}
              >
                <span className="block text-sm font-semibold text-foreground">I am here to listen</span>
                <span className="block text-xs text-muted-foreground">Find music, follow artists</span>
              </button>
              <button
                type="button"
                onClick={() => setMakesMusic(true)}
                aria-pressed={makesMusic}
                className={`rounded-xl border px-4 py-3 text-left transition-all duration-300 ${
                  makesMusic
                    ? 'live-surface border-border bg-card -translate-y-0.5'
                    : 'border-border/60 bg-transparent hover:bg-muted/50'
                }`}
              >
                <span className="block text-sm font-semibold text-foreground">I make music</span>
                <span className="block text-xs text-muted-foreground">Put your own records out</span>
              </button>
            </div>
            {makesMusic && (
              <p className="live-surface rounded-lg border border-border/60 bg-card px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Your Studio opens the moment you finish this form, and every record you send
                goes live the same minute. No fee, no wallet needed. Already have a page on
                SONGCHAINN? Claim it from your profile and we hand it over once we confirm it is you.
              </p>
            )}
          </div>

          {/* Profile Name */}
          <div className="space-y-2">
            <Label htmlFor="profileName" className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              {makesMusic ? 'Artist name' : 'Profile Name'} <span className="text-destructive">*</span>
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

          {/* Date of birth. Asked once, and the account is held to it. */}
          <div className="space-y-2">
            <Label htmlFor="dob" className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              When were you born?
            </Label>
            <Input
              id="dob"
              type="date"
              value={dateOfBirth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={errors.dateOfBirth ? 'border-destructive' : ''}
            />
            {errors.dateOfBirth && <p className="text-xs text-destructive">{errors.dateOfBirth}</p>}
            <p className="text-xs text-muted-foreground">
              This decides which parts of SONGCHAINN are open to you. Under 18, private messaging,
              uploads and anything involving money stay closed. Everything else works the same.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender" className="text-sm font-medium">How should Mo$ha refer to you?</Label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="unsaid">Rather not say</option>
              <option value="woman">She, her</option>
              <option value="man">He, him</option>
              <option value="other">They, them</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Optional. Mo$ha is the guide in the app; this only shapes how it talks to you and about you.
            </p>
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
              placeholder="e.g. Lagos, London, Lusaka"
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
                  X (Twitter) Profile <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="xLink"
                  value={xProfileLink}
                  onChange={(e) => setXProfileLink(e.target.value)}
                  placeholder="@yourhandle or https://x.com/yourhandle"
                  className={errors.xProfileLink ? 'border-destructive' : ''}
                />
                {errors.xProfileLink && (
                  <p className="text-xs text-destructive mt-1">{errors.xProfileLink}</p>
                )}
              </div>
            </div>
          </div>

          {/* Wallet note */}
          <div className="rounded-2xl border border-border/60 bg-secondary/20 p-4">
            <p className="text-sm text-foreground font-medium mb-1">No wallet needed to join</p>
            <p className="text-xs text-muted-foreground">
              You can connect any wallet that supports the Base network, like Base App, Coinbase Wallet, MetaMask, or Rainbow, whenever you want to collect songs.
            </p>
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

          {/* Consent, at the moment they proceed, not buried three pages back.
              The version agreed to is recorded against the account. */}
          <p className="text-xs text-muted-foreground text-center">
            By continuing you agree to the{' '}
            <Link to="/terms" className="text-primary underline-offset-2 hover:underline">
              Terms of Use
            </Link>
            , the{' '}
            <Link to="/privacy" className="text-primary underline-offset-2 hover:underline">
              Privacy Policy
            </Link>{' '}
            and the{' '}
            <Link to="/guidelines" className="text-primary underline-offset-2 hover:underline">
              Community Guidelines
            </Link>
            , and you confirm the date above is your real date of birth.
          </p>

          {/* Early Access Note */}
          <p className="text-xs text-muted-foreground text-center">
            You're early. What you play and post here builds your place on the leaderboard.
          </p>
        </motion.form>
      </div>
    </div>
  );
}
