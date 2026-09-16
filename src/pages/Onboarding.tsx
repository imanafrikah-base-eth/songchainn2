import { PhotoPositioner } from '@/components/PhotoPositioner';
import { cropImage, CENTRE_CROP, type PhotoCrop } from '@/lib/cropImage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, FileText, Link2, Loader2, MapPin, Camera, CalendarDays, Music } from 'lucide-react';
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
import { realNameProblem } from '@/lib/realName';

/*
 * Two steps, and only the first is required.
 *
 * This used to be one long form: photos, pronouns, date of birth, location,
 * bio and an X link, all before a single song played. 34 of 201 accounts never
 * got through it, every one of them without a name, 24 of them in July alone.
 *
 * Step 1 is the founder rule and nothing else: a real name (and whether you
 * make music, because that decides where you land). Saving it completes
 * onboarding, so a person who closes the app on step 2 comes back to the
 * music, not to this page.
 *
 * Step 2 is all optional. The date of birth is no longer demanded here: every
 * door that needs an age (messaging, uploads, money, launching) is closed by
 * AdultOnly until it is given, and asks for it right there.
 *
 * Answers are kept in this browser as they are typed, so a reload or a
 * backgrounded tab does not wipe them.
 */

const nameSchema = z.string().trim().min(1, 'Add the name people know you by.').max(50, 'Keep it under 50 characters.');
const detailsSchema = z.object({
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

type Draft = {
  step?: 1 | 2;
  profileName?: string;
  makesMusic?: boolean;
  bio?: string;
  location?: string;
  xProfileLink?: string;
  dateOfBirth?: string;
  gender?: string;
};

const draftKey = (userId: string) => `songchainn_onboarding_draft:${userId}`;

function readDraft(userId: string | undefined): Draft {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as Draft) : {};
  } catch {
    return {};
  }
}

const TOTAL_STEPS = 2;

export default function Onboarding() {
  const { user, refreshProfile, refreshArtistStatus, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft] = useState<Draft>(() => readDraft(user?.id));
  const [step, setStep] = useState<1 | 2>(draft.step === 2 ? 2 : 1);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tooYoung, setTooYoung] = useState(false);
  /** Whether become_artist worked, so the finish lands a musician in the Studio. */
  const [artistReady, setArtistReady] = useState(false);

  const [profileName, setProfileName] = useState(draft.profileName ?? '');
  // No default. A listener finished onboarding as a musician because this
  // question came pre-answered and neither answer said what it meant
  // (founder, 16 Sep 2026). Nothing is chosen until they choose it.
  const [makesMusic, setMakesMusic] = useState<boolean | null>(draft.makesMusic ?? null);
  const [bio, setBio] = useState(draft.bio ?? '');
  const [location, setLocation] = useState(draft.location ?? '');
  const [xProfileLink, setXProfileLink] = useState(draft.xProfileLink ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(draft.dateOfBirth ?? '');
  const [gender, setGender] = useState(draft.gender ?? 'unsaid');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  /** Where each photo sits in its frame. Cut from the full file at submit. */
  const [coverCrop, setCoverCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const [avatarCrop, setAvatarCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // Keep partial answers as they are typed.
  useEffect(() => {
    if (!user?.id) return;
    try {
      const next: Draft = { step, profileName, makesMusic, bio, location, xProfileLink, dateOfBirth, gender };
      localStorage.setItem(draftKey(user.id), JSON.stringify(next));
    } catch {
      void 0;
    }
  }, [user?.id, step, profileName, makesMusic, bio, location, xProfileLink, dateOfBirth, gender]);

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
    // auth state change re-renders to Auth page, no explicit navigate needed
  }, [signOut]);

  const pickImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    previous: string | null,
    setPreview: (url: string) => void,
    setFile: (file: File) => void,
  ) => {
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
    if (previous) URL.revokeObjectURL(previous);
    setPreview(URL.createObjectURL(file));
    setFile(file);
  };

  /** Step 1: the name. Saving it completes onboarding. */
  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!user) return;

    const parsed = nameSchema.safeParse(profileName);
    if (!parsed.success) {
      setErrors({ profileName: parsed.error.errors[0]?.message ?? 'Add your name.' });
      return;
    }
    // A name somebody chose, never their email or wallet handle. Community
    // only shows people with a real name, so nobody gets through without one.
    const nameProblem = realNameProblem(profileName, user.email);
    if (nameProblem) {
      setErrors({ profileName: nameProblem });
      return;
    }

    setIsLoading(true);
    try {
      const authedUserId = user.id;
      const now = new Date().toISOString();
      const fields = {
        user_id: authedUserId,
        profile_name: profileName.trim(),
        display_name: profileName.trim(),
        onboarding_completed: true,
        terms_accepted_at: now,
        updated_at: now,
      };

      const { data: existing } = await supabase
        .from('audience_profiles')
        .select('id')
        .eq('user_id', authedUserId)
        .maybeSingle();

      const saveResult = existing?.id
        ? await supabase.from('audience_profiles').update(fields).eq('user_id', authedUserId)
        : await supabase.from('audience_profiles').insert({ id: authedUserId, ...fields });

      if (saveResult.error) {
        console.error('Onboarding profile save failed', saveResult.error);
        setErrors({
          profileName: /taken|duplicate|unique/i.test(saveResult.error.message)
            ? 'Somebody already goes by that name. Pick another one.'
            : 'Could not save your name. Try again.',
        });
        return;
      }

      try {
        localStorage.setItem('songchainn_needs_onboarding', '0');
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

      /* Saying you make music IS the application: the account gets a page of
         its own now (become_artist). It does not mark them verified, and
         claiming an EXISTING artist's page still goes through review. */
      if (makesMusic) {
        const { error: artistErr } = await supabase.rpc('become_artist' as never);
        if (artistErr) console.error('become_artist failed at onboarding', artistErr);
        setArtistReady(!artistErr);
      }

      // Deliberately no refreshProfile yet: that would swap this page for the
      // app before the optional step could show. Leaving now is safe, because
      // the row already says onboarding is done.
      setStep(2);
    } catch (err: any) {
      console.error('Onboarding submit error', err);
      toast({
        title: 'Could not save your name',
        description: String(err?.message || 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const finish = async () => {
    if (user?.id) {
      try {
        localStorage.removeItem(draftKey(user.id));
        localStorage.setItem('songchainn_show_profile_photo_hint', '1');
      } catch {
        void 0;
      }
    }
    await refreshProfile();
    if (user?.id) {
      await queryClient.invalidateQueries({ queryKey: ['compliance', user.id] });
    }
    if (makesMusic && artistReady) {
      await refreshArtistStatus();
      toast({ title: 'Your Studio is open', description: 'Send a record and it goes live the same minute.' });
      navigate('/studio', { replace: true });
    } else {
      toast({ title: 'You are in. Press play.' });
      navigate('/', { replace: true });
    }
  };

  /** Step 2: everything else, all optional. */
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!user) return;

    let dobFields: Record<string, string> = {};
    if (dateOfBirth) {
      const age = yearsSince(dateOfBirth);
      if (!Number.isFinite(age) || age < 0 || age > 120) {
        setErrors({ dateOfBirth: 'That date does not look right.' });
        return;
      }
      if (age < MIN_AGE) {
        setTooYoung(true);
        return;
      }
      dobFields = { date_of_birth: dateOfBirth, age_confirmed_at: new Date().toISOString() };
    }

    const parsed = detailsSchema.safeParse({ bio: bio || undefined, location, xProfileLink: xProfileLink || undefined });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

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

      const { error } = await supabase
        .from('audience_profiles')
        .update({
          bio: bio.trim() || null,
          location: location.trim() || null,
          x_profile_link: normalizeXLink(xProfileLink),
          gender,
          updated_at: new Date().toISOString(),
          ...dobFields,
          ...(avatarUrl ? { profile_picture_url: avatarUrl } : {}),
          ...(coverUrl ? { cover_photo_url: coverUrl } : {}),
        } as never)
        .eq('user_id', authedUserId);

      if (error) {
        toast({ title: 'Could not save those details', description: 'You can add them later from your profile.', variant: 'destructive' });
      }
      await finish();
    } finally {
      setIsLoading(false);
    }
  };

  const progress = (
    <div className="mb-6">
      <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
        Step {step} of {TOTAL_STEPS}{step === 2 ? ', optional' : ''}
      </p>
      <div className="mx-auto flex max-w-[12rem] gap-1.5" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>
    </div>
  );

  if (tooYoung) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-md pt-8">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h1 className="font-heading text-lg font-semibold text-foreground">Come back in a few years</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You need to be at least {MIN_AGE} to have an account here. The music is not going anywhere.
            </p>
            <Button type="button" variant="outline" className="mt-4 h-11 w-full" onClick={() => void handleBackToSignIn()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <div className="max-w-lg mx-auto pt-4">
        <div className="mb-2">
          {step === 1 ? (
            <Button type="button" variant="ghost" className="h-11" onClick={handleBackToSignIn}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="h-11" onClick={() => setStep(1)} disabled={isLoading}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Change name
            </Button>
          )}
        </div>

        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
          <img src={logo} alt="$ongChainn" className="h-10 mx-auto mb-3" />
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {step === 1 ? 'What should we call you?' : 'Make it yours'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === 1
              ? 'One question and the music is yours.'
              : 'All optional. Skip it and add any of this later from your profile.'}
          </p>
        </motion.div>

        {progress}

        {step === 1 ? (
          <motion.form
            key="step1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleSaveName}
            className="space-y-6"
          >
            <div className="space-y-2">
              <Label htmlFor="profileName" className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                {makesMusic ? 'Artist name' : 'Your name'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => {
                  setProfileName(e.target.value);
                  if (errors.profileName) setErrors({});
                }}
                placeholder="The name people know you by"
                maxLength={50}
                autoFocus
                autoComplete="name"
                className={`h-12 ${errors.profileName ? 'border-destructive' : ''}`}
              />
              {errors.profileName ? (
                <p className="text-xs text-destructive">{errors.profileName}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Shown on your profile. Your email and wallet stay private.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Music className="w-4 h-4" />
                Do you make music?
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMakesMusic(false)}
                  aria-pressed={makesMusic === false}
                  className={`min-h-11 rounded-xl border px-3 py-3 text-left transition-all duration-300 ${
                    makesMusic === false
                      ? 'live-surface border-primary bg-card ring-1 ring-primary -translate-y-0.5'
                      : 'border-border/60 bg-transparent hover:bg-muted/50'
                  }`}
                >
                  <span className="block text-sm font-semibold text-foreground">I am here to listen</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Play anything, follow artists, join The Room.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMakesMusic(true)}
                  aria-pressed={makesMusic === true}
                  className={`min-h-11 rounded-xl border px-3 py-3 text-left transition-all duration-300 ${
                    makesMusic === true
                      ? 'live-surface border-primary bg-card ring-1 ring-primary -translate-y-0.5'
                      : 'border-border/60 bg-transparent hover:bg-muted/50'
                  }`}
                >
                  <span className="block text-sm font-semibold text-foreground">I make music</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Opens your Studio so you can release your own records. You can still listen.
                  </span>
                </button>
              </div>
              {makesMusic === null && (
                <p className="text-xs text-muted-foreground">
                  Pick one to carry on. You can change it later either way.
                </p>
              )}
              {makesMusic && (
                <p className="text-xs text-muted-foreground">
                  Your Studio opens when you finish. Records go live the same minute, no fee and no wallet needed.
                </p>
              )}
            </div>

            <Button type="submit" className="w-full font-semibold h-12" disabled={isLoading || makesMusic === null}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue'}
            </Button>

            {/* Consent, at the moment they proceed. The version agreed to is
                recorded against the account. */}
            <p className="text-xs text-muted-foreground text-center">
              By continuing you agree to the{' '}
              <Link to="/terms" className="text-primary underline-offset-2 hover:underline">Terms of Use</Link>
              , the{' '}
              <Link to="/privacy" className="text-primary underline-offset-2 hover:underline">Privacy Policy</Link>{' '}
              and the{' '}
              <Link to="/guidelines" className="text-primary underline-offset-2 hover:underline">Community Guidelines</Link>.
            </p>
          </motion.form>
        ) : (
          <motion.form
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleSaveDetails}
            className="space-y-6 pb-8"
          >
            <div className="space-y-4">
              <div className="relative w-full h-32 rounded-3xl border border-border/60 bg-secondary/20 flex items-center justify-center overflow-hidden">
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
                  className="relative min-h-11 px-4 rounded-full bg-background/80 text-sm font-medium hover:bg-background"
                  disabled={isLoading}
                >
                  {coverFile ? 'Change cover photo' : 'Add cover photo'}
                </button>
                <input
                  ref={coverInputRef}
                  id="cover"
                  type="file"
                  accept="image/*"
                  onChange={(e) => pickImage(e, coverPreviewUrl, setCoverPreviewUrl, setCoverFile)}
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
                    aria-label="Add a profile photo"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full bg-background border border-border flex items-center justify-center hover:bg-secondary/60 transition-colors"
                    disabled={isLoading}
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={(e) => pickImage(e, avatarPreviewUrl, setAvatarPreviewUrl, setAvatarFile)}
                    disabled={isLoading}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground">A photo helps people spot you.</p>
              </div>
            </div>

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
                className={`h-11 ${errors.dateOfBirth ? 'border-destructive' : ''}`}
              />
              {errors.dateOfBirth && <p className="text-xs text-destructive">{errors.dateOfBirth}</p>}
              <p className="text-xs text-muted-foreground">
                Needed before messaging, uploads or anything involving money. Listening never needs it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender" className="text-sm font-medium">How should Mo$ha refer to you?</Label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="unsaid">Rather not say</option>
                <option value="woman">She, her</option>
                <option value="man">He, him</option>
                <option value="other">They, them</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Where are you listening from?
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Lagos, London, Lusaka"
                maxLength={100}
                className={`h-11 ${errors.location ? 'border-destructive' : ''}`}
              />
              {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Bio
              </Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A line about you"
                maxLength={500}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="xLink" className="text-sm font-medium flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                X profile
              </Label>
              <Input
                id="xLink"
                value={xProfileLink}
                onChange={(e) => setXProfileLink(e.target.value)}
                placeholder="@yourhandle"
                className={`h-11 ${errors.xProfileLink ? 'border-destructive' : ''}`}
              />
              {errors.xProfileLink && <p className="text-xs text-destructive mt-1">{errors.xProfileLink}</p>}
            </div>

            <div className="space-y-2">
              <Button type="submit" className="w-full font-semibold h-12" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save and start listening'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full h-11"
                disabled={isLoading}
                onClick={() => void finish()}
              >
                Skip for now
              </Button>
            </div>
          </motion.form>
        )}
      </div>
    </div>
  );
}
