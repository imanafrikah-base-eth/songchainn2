import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Camera, Edit3, ExternalLink, Gift, Heart, ListMusic, Loader2, Save, Star, Users, X as XIcon, HardDrive, Plus, Lock, Globe, Trash2, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useEngagement } from '@/context/EngagementContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { formatPresenceLabel, useUserPresence } from '@/hooks/useUserPresence';
import { useReferrals } from '@/hooks/useReferrals';
import { useToast } from '@/hooks/use-toast';
import { Navigation } from '@/components/Navigation';
import { CATALOGS, SONGS } from '@/data/musicData';
import { CatalogCard } from '@/components/CatalogCard';
import { CatalogGrid } from '@/components/CatalogGrid';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InviteFriends } from '@/components/InviteFriends';
import { NotificationSettings } from '@/components/NotificationSettings';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
const logo = '/songchainn-logo.webp';
import { uploadPublicImage } from '../lib/storage';
import { fcViewProfile } from '@/lib/farcasterActions';

const first = <T,>(arr: T[] | null | undefined): T | undefined =>
  Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined;

const firstSplit = (
  value: string | null | undefined,
  delimiter: string | RegExp
): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const parts = value.split(delimiter).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts[0] : undefined;
};

const USERNAME_PATTERN = /^[a-z0-9._]+$/;

const trimOrNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeUsername = (value: string) => value.trim().toLowerCase();

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isMissingColumnError = (error: unknown) => {
  const message = typeof (error as any)?.message === 'string' ? (error as any).message : '';
  return message.includes("Could not find the '") && message.includes("' column");
};

const getMissingColumnName = (error: unknown) => {
  const message = typeof (error as any)?.message === 'string' ? (error as any).message : '';
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
};

// X (Twitter) and Base icons
const XTwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const BaseIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M12 6a6 6 0 100 12 6 6 0 000-12z" fill="hsl(var(--background))" />
  </svg>
);

export default function Profile() {
  const { user, audienceProfile, refreshProfile, isArtist, artistId, needsOnboarding, isLoading } = useAuth();
  const { engagementPoints, currentStreak } = useEngagement();
  const { likedSongs, playlists, savedCatalogs, createPlaylist, deletePlaylist, updatePlaylistVisibility } = useAudienceInteractions();
  const { points, completedReferrals, shareInviteLink } = useReferrals();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [playlistIsPublic, setPlaylistIsPublic] = useState(false);
  const { storageUsedBytes } = useOfflineAudio();
  const { isOnline: isProfileOnline, lastSeenAt: profileLastSeenAt } = useUserPresence(
    audienceProfile?.user_id ?? audienceProfile?.id,
    { includeLastSeen: true }
  );
  const profilePresenceLabel = formatPresenceLabel(isProfileOnline, profileLastSeenAt);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const [isUploadingCoverPhoto, setIsUploadingCoverPhoto] = useState(false);
  const [isCoverCropOpen, setIsCoverCropOpen] = useState(false);
  const [coverDraftFile, setCoverDraftFile] = useState<File | null>(null);
  const [coverDraftUrl, setCoverDraftUrl] = useState<string | null>(null);
  const [coverCropOffsetY, setCoverCropOffsetY] = useState(0);
  const [coverCropMaxOffset, setCoverCropMaxOffset] = useState(0);
  const [isSavingCroppedCover, setIsSavingCroppedCover] = useState(false);
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null);
  const coverPreviewRef = useRef<HTMLDivElement | null>(null);
  const coverPreviewImageRef = useRef<HTMLImageElement | null>(null);
  const coverDragStateRef = useRef<{ startY: number; startOffset: number; liveOffset?: number } | null>(null);
  const [isAvatarCropOpen, setIsAvatarCropOpen] = useState(false);
  const [avatarDraftFile, setAvatarDraftFile] = useState<File | null>(null);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const [avatarMaxOffsetX, setAvatarMaxOffsetX] = useState(0);
  const [avatarMaxOffsetY, setAvatarMaxOffsetY] = useState(0);
  const [isSavingCroppedAvatar, setIsSavingCroppedAvatar] = useState(false);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const avatarPreviewRef = useRef<HTMLDivElement | null>(null);
  const avatarPreviewImageRef = useRef<HTMLImageElement | null>(null);
  const avatarDragStateRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    liveOffsetX?: number;
    liveOffsetY?: number;
  } | null>(null);
  
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleCreatePlaylist = useCallback(async () => {
    if (!playlistName.trim()) {
      toast({ title: 'Add a playlist name to continue', variant: 'destructive' });
      return;
    }
    const created = await createPlaylist(
      playlistName.trim(),
      playlistDescription.trim() || undefined,
      playlistIsPublic,
    );
    if (!created) return;
    setPlaylistName('');
    setPlaylistDescription('');
    setPlaylistIsPublic(false);
    setIsCreatePlaylistOpen(false);
  }, [createPlaylist, playlistDescription, playlistIsPublic, playlistName, toast]);
  
  const [displayName, setDisplayName] = useState(audienceProfile?.display_name || audienceProfile?.profile_name || '');
  const [username, setUsername] = useState(audienceProfile?.username || '');
  const [bio, setBio] = useState(audienceProfile?.bio || '');
  const [location, setLocation] = useState(audienceProfile?.location || '');
  const [websiteUrl, setWebsiteUrl] = useState(((audienceProfile as any)?.website_url || (audienceProfile as any)?.website || '') as string);
  const [xProfileLink, setXProfileLink] = useState(audienceProfile?.twitter_url || audienceProfile?.x_profile_link || '');
  const [baseProfileLink, setBaseProfileLink] = useState(audienceProfile?.base_profile_link || audienceProfile?.wallet_address || '');
  const [interests, setInterests] = useState((((audienceProfile as any)?.interests || (audienceProfile as any)?.genre || '') as string));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  useEffect(() => {
    if (audienceProfile) {
      setDisplayName(audienceProfile.display_name || audienceProfile.profile_name || audienceProfile.username || 'Listener');
      setUsername(audienceProfile.username || '');
      setBio(audienceProfile.bio || '');
      setLocation(audienceProfile.location || '');
      setWebsiteUrl(((audienceProfile as any)?.website_url || (audienceProfile as any)?.website || '') as string);
      setXProfileLink(audienceProfile.twitter_url || audienceProfile.x_profile_link || '');
      setBaseProfileLink(audienceProfile.base_profile_link || audienceProfile.wallet_address || '');
      setInterests((((audienceProfile as any)?.interests || (audienceProfile as any)?.genre || '') as string));
      setFieldErrors({});
    }
  }, [audienceProfile]);

  const uploadAndUpdateProfileImage = useCallback(
    async (file: File, field: 'avatar_url' | 'cover_photo_url') => {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured');
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const authedUser = authData.user;
      if (!authedUser) throw new Error('Not authenticated');

      const publicUrl = await uploadPublicImage({
        bucket: field === 'avatar_url' ? 'avaters' : 'covers',
        userId: authedUser.id,
        file,
      });

      const updatePayload =
        field === 'avatar_url' ? { avatar_url: publicUrl } : { cover_photo_url: publicUrl };

      const { error: dbError } = await supabase
        .from('audience_profiles')
        .update(updatePayload)
        .eq('user_id', authedUser.id);
      if (dbError) throw dbError;

      await refreshProfile();
      toast({
        title: field === 'avatar_url' ? 'Profile photo updated' : 'Cover photo updated',
        description: 'Looking sharp. Your profile is live on $ongChainn.',
      });
      return publicUrl;
    },
    [refreshProfile, toast]
  );

  const safeProfileName =
    displayName ||
    audienceProfile?.display_name ||
    audienceProfile?.profile_name ||
    audienceProfile?.username ||
    (user && typeof user.email === 'string' ? firstSplit(user.email, '@') ?? '' : '') ||
    'Listener';

  const handleProfilePictureChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = first(Array.from(e.target.files ?? []));
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
      setAvatarDraftFile(file);
      setAvatarDraftUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setAvatarOffsetX(0);
      setAvatarOffsetY(0);
      setAvatarMaxOffsetX(0);
      setAvatarMaxOffsetY(0);
      setIsAvatarCropOpen(true);
    },
    [toast]
  );

  const handleCoverPhotoChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = first(Array.from(e.target.files ?? []));
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
      setCoverDraftFile(file);
      setCoverDraftUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setCoverCropOffsetY(0);
      setCoverCropMaxOffset(0);
      setIsCoverCropOpen(true);
    },
    [toast]
  );

  const closeCoverCrop = useCallback(() => {
    setIsCoverCropOpen(false);
    setCoverDraftFile(null);
    setCoverCropOffsetY(0);
    setCoverCropMaxOffset(0);
    if (coverDraftUrl) {
      URL.revokeObjectURL(coverDraftUrl);
    }
    setCoverDraftUrl(null);
  }, [coverDraftUrl]);

  const closeAvatarCrop = useCallback(() => {
    setIsAvatarCropOpen(false);
    setAvatarDraftFile(null);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    setAvatarMaxOffsetX(0);
    setAvatarMaxOffsetY(0);
    if (avatarDraftUrl) {
      URL.revokeObjectURL(avatarDraftUrl);
    }
    setAvatarDraftUrl(null);
  }, [avatarDraftUrl]);

  const cropAndUploadCover = useCallback(async () => {
    if (!coverDraftFile || !user) return;
    const imgUrl = URL.createObjectURL(coverDraftFile);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = imgUrl;
      });

      const container = coverPreviewRef.current;
      if (!container) throw new Error('missing-container');

      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width || 800;
      const containerHeight = rect.height || 240;

      const scale = containerWidth / image.naturalWidth;
      const displayedHeight = image.naturalHeight * scale;
      const maxOffset = Math.max(0, (displayedHeight - containerHeight) / 2);
      const clampedOffset = Math.min(maxOffset, Math.max(-maxOffset, coverCropOffsetY));

      const centerDisplayedY = displayedHeight / 2 + clampedOffset;
      const topDisplayed = centerDisplayedY - containerHeight / 2;
      const topOriginal = topDisplayed / scale;
      const cropHeightOriginal = containerHeight / scale;

      const outputWidth = 1600;
      const outputHeight = Math.round((containerHeight / containerWidth) * outputWidth);

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('missing-context');

      ctx.drawImage(
        image,
        0,
        topOriginal,
        image.naturalWidth,
        cropHeightOriginal,
        0,
        0,
        outputWidth,
        outputHeight
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) throw new Error('missing-blob');

      const croppedFile = new File([blob], coverDraftFile.name || 'cover.jpg', {
        type: 'image/jpeg',
      });

      setIsUploadingCoverPhoto(true);
      try {
        const imageUrl = await uploadAndUpdateProfileImage(croppedFile, 'cover_photo_url');
        if (imageUrl) {
          setPendingCoverUrl(imageUrl);
        }
      } finally {
        setIsUploadingCoverPhoto(false);
      }
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }, [coverCropOffsetY, coverDraftFile, uploadAndUpdateProfileImage, user]);

  const cropAndUploadAvatar = useCallback(async () => {
    if (!avatarDraftFile || !user) return;
    const imgUrl = URL.createObjectURL(avatarDraftFile);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = imgUrl;
      });

      const container = avatarPreviewRef.current;
      if (!container) throw new Error('missing-container');

      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width || 240;
      const containerHeight = rect.height || 240;

      const scale = containerWidth / image.naturalWidth;
      const displayedWidth = image.naturalWidth * scale;
      const displayedHeight = image.naturalHeight * scale;

      const maxOffsetX = Math.max(0, (displayedWidth - containerWidth) / 2);
      const maxOffsetY = Math.max(0, (displayedHeight - containerHeight) / 2);
      const clampedOffsetX = Math.min(
        maxOffsetX,
        Math.max(-maxOffsetX, avatarOffsetX)
      );
      const clampedOffsetY = Math.min(
        maxOffsetY,
        Math.max(-maxOffsetY, avatarOffsetY)
      );

      const centerDisplayedX = displayedWidth / 2 + clampedOffsetX;
      const centerDisplayedY = displayedHeight / 2 + clampedOffsetY;

      const leftDisplayed = centerDisplayedX - containerWidth / 2;
      const topDisplayed = centerDisplayedY - containerHeight / 2;

      const leftOriginal = leftDisplayed / scale;
      const topOriginal = topDisplayed / scale;
      const cropSizeOriginal = containerWidth / scale;

      const outputSize = 600;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('missing-context');

      ctx.save();
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        image,
        leftOriginal,
        topOriginal,
        cropSizeOriginal,
        cropSizeOriginal,
        0,
        0,
        outputSize,
        outputSize
      );

      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 0.9)
      );
      if (!blob) throw new Error('missing-blob');

      const croppedFile = new File([blob], avatarDraftFile.name || 'avatar.png', {
        type: 'image/png',
      });

      setIsUploadingProfilePicture(true);
      try {
        const imageUrl = await uploadAndUpdateProfileImage(croppedFile, 'avatar_url');
        if (imageUrl) {
          setPendingAvatarUrl(imageUrl);
        }
      } finally {
        setIsUploadingProfilePicture(false);
      }
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }, [avatarDraftFile, avatarOffsetX, avatarOffsetY, uploadAndUpdateProfileImage, user]);

  const handleSave = async () => {
    if (!user) return;

    const nextErrors: Record<string, string> = {};
    const nextDisplayName = displayName.trim();
    const nextUsername = normalizeUsername(username);
    const nextBio = bio.trim();
    const nextLocation = location.trim();
    const nextWebsite = normalizeUrl(websiteUrl);
    const nextXLink = normalizeUrl(xProfileLink);
    const nextBaseLink = baseProfileLink.trim();
    const nextInterests = interests.trim();

    if (!nextDisplayName) nextErrors.displayName = 'Display name is required.';
    if (nextDisplayName.length > 50) nextErrors.displayName = 'Display name must be 50 characters or less.';
    if (nextUsername.length > 32) nextErrors.username = 'Username must be 32 characters or less.';
    if (nextUsername && !USERNAME_PATTERN.test(nextUsername)) {
      nextErrors.username = 'Use lowercase letters, numbers, periods, or underscores.';
    }
    if (nextBio.length > 160) nextErrors.bio = 'Bio must be 160 characters or less.';
    if (nextLocation.length > 80) nextErrors.location = 'Location must be 80 characters or less.';
    if (nextInterests.length > 120) nextErrors.interests = 'Interests must be 120 characters or less.';

    if (nextWebsite) {
      try {
        const parsed = new URL(nextWebsite);
        if (!/^https?:$/i.test(parsed.protocol)) nextErrors.websiteUrl = 'Website must start with http or https.';
      } catch {
        nextErrors.websiteUrl = 'Enter a valid website URL.';
      }
    }

    if (nextXLink) {
      try {
        const parsed = new URL(nextXLink);
        if (!/^https?:$/i.test(parsed.protocol)) nextErrors.xProfileLink = 'X link must start with http or https.';
      } catch {
        nextErrors.xProfileLink = 'Enter a valid X profile URL.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      toast({
        title: 'Please fix profile form errors',
        description: 'Some fields need attention before saving.',
        variant: 'destructive',
      });
      return;
    }

    setFieldErrors({});
    setIsSaving(true);

    try {
      if (nextUsername) {
        const { data: existingUsernameRows, error: usernameCheckError } = await (supabase as any)
          .from('audience_profiles')
          .select('id,user_id')
          .eq('username', nextUsername)
          .limit(1);

        if (usernameCheckError) {
          if (!isMissingColumnError(usernameCheckError)) throw usernameCheckError;
        } else {
          const existingUser = first(existingUsernameRows as Array<{ id?: string | null; user_id?: string | null }> | null | undefined);
          const existingOwnerId = existingUser?.user_id || existingUser?.id || null;
          if (existingOwnerId && existingOwnerId !== user.id) {
            setFieldErrors({ username: 'This username is already taken.' });
            setIsSaving(false);
            return;
          }
        }
      }

      let updatePayload: Record<string, any> = {
        display_name: nextDisplayName,
        profile_name: nextDisplayName,
        username: nextUsername || null,
        bio: trimOrNull(nextBio),
        location: trimOrNull(nextLocation),
        website_url: nextWebsite,
        website: nextWebsite,
        twitter_url: nextXLink,
        x_profile_link: nextXLink,
        wallet_address: trimOrNull(nextBaseLink),
        base_profile_link: trimOrNull(nextBaseLink),
        interests: trimOrNull(nextInterests),
        genre: trimOrNull(nextInterests),
      };

      while (true) {
        const { error } = await (supabase as any)
          .from('audience_profiles')
          .update(updatePayload as any)
          .eq('user_id', user.id);
        if (!error) break;
        if (!isMissingColumnError(error)) throw error;
        const missingColumn = getMissingColumnName(error);
        if (!missingColumn || !(missingColumn in updatePayload)) throw error;
        const { [missingColumn]: _removed, ...nextPayload } = updatePayload;
        updatePayload = nextPayload;
        if (Object.keys(updatePayload).length === 0) throw error;
      }

      await refreshProfile();
      setIsEditing(false);
      toast({
        title: 'Profile updated',
        description: 'Your changes are saved across $ongChainn.',
      });
    } catch {
      toast({
        title: 'Could not update your profile',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const savedCatalogsData = CATALOGS.filter((catalog) => savedCatalogs.includes(catalog.id));
  const artistSongsData = isArtist && artistId ? SONGS.filter(s => s.artistId === artistId) : [];

  const { data: artistFollowerCount = 0 } = useQuery({
    queryKey: ['artist-followers-profile', artistId],
    queryFn: async () => {
      if (!isArtist || !artistId) return 0;
      const { data, error } = await (supabase as any)
        .from('liked_artists')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId);
      if (error || typeof data !== 'number') return 0;
      return data;
    },
    enabled: !!isArtist && !!artistId,
    refetchInterval: 15000,
  });

  if (isArtist && artistId) {
    return <Navigate to={`/artist/${artistId}`} replace />;
  }

  if (!audienceProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const effectiveCoverUrl = pendingCoverUrl || audienceProfile.cover_photo_url;
  const effectiveAvatarUrl =
    pendingAvatarUrl || audienceProfile.avatar_url || audienceProfile.profile_picture_url;
  const profileDisplayName =
    audienceProfile.display_name ||
    audienceProfile.profile_name ||
    audienceProfile.username ||
    safeProfileName;
  const profileUsername = audienceProfile.username || '';
  const profileLocation = audienceProfile.location || '';
  const profileWebsite =
    ((audienceProfile as any)?.website_url as string | null | undefined) ||
    ((audienceProfile as any)?.website as string | null | undefined) ||
    '';
  const profileXLink = audienceProfile.twitter_url || audienceProfile.x_profile_link || '';
  const profileBaseLink = audienceProfile.base_profile_link || audienceProfile.wallet_address || '';
  const profileInterests =
    (((audienceProfile as any)?.interests as string | null | undefined) ||
      ((audienceProfile as any)?.genre as string | null | undefined) ||
      '');

  return (
    <div className="min-h-screen bg-background">
      {/* Cover Photo */}
      <div className="relative h-48 bg-gradient-to-br from-primary/30 to-primary/10">
        <input
          ref={coverPhotoInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverPhotoChange}
          className="hidden"
        />
        {effectiveCoverUrl && (
          <img
            src={effectiveCoverUrl}
            alt="Cover"
            className="w-full h-full object-cover"
            onError={handleImageError}
          />
        )}
        {user && (
          <div className="absolute top-3 right-3">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={isUploadingCoverPhoto}
              onClick={() => coverPhotoInputRef.current?.click()}
              className="bg-background/80 backdrop-blur"
            >
              {isUploadingCoverPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isCoverCropOpen} onOpenChange={(open) => !open && !isSavingCroppedCover && closeCoverCrop()}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Adjust cover photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              ref={coverPreviewRef}
              className="relative w-full h-48 overflow-hidden rounded-xl bg-muted touch-pan-y"
              onPointerDown={(e) => {
                if (!coverDraftUrl) return;
                coverDragStateRef.current = { startY: e.clientY, startOffset: coverCropOffsetY };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!coverDragStateRef.current) return;
                const deltaY = e.clientY - coverDragStateRef.current.startY;
                const nextOffset = coverDragStateRef.current.startOffset + deltaY;
                const clamped = Math.min(coverCropMaxOffset, Math.max(-coverCropMaxOffset, nextOffset));
                coverDragStateRef.current.liveOffset = clamped;
                if (coverPreviewImageRef.current) {
                  coverPreviewImageRef.current.style.transform = `translate(-50%, ${clamped}px)`;
                }
              }}
              onPointerUp={(e) => {
                if (!coverDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                const final = coverDragStateRef.current.liveOffset ?? coverDragStateRef.current.startOffset;
                coverDragStateRef.current = null;
                setCoverCropOffsetY(final);
              }}
              onPointerLeave={(e) => {
                if (!coverDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                const final = coverDragStateRef.current.liveOffset ?? coverDragStateRef.current.startOffset;
                coverDragStateRef.current = null;
                setCoverCropOffsetY(final);
              }}
            >
              {coverDraftUrl && (
                <>
                  <img
                    ref={coverPreviewImageRef}
                    src={coverDraftUrl}
                    alt="Cover preview"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      const container = coverPreviewRef.current;
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      const containerWidth = rect.width || 800;
                      const containerHeight = rect.height || 240;
                      const scale = containerWidth / img.naturalWidth;
                      const displayedHeight = img.naturalHeight * scale;
                      const maxOffset = Math.max(0, (displayedHeight - containerHeight) / 2);
                      setCoverCropMaxOffset(maxOffset);
                      setCoverCropOffsetY(0);
                    }}
                    style={{
                      transform: `translate(-50%, ${coverCropOffsetY}px)`,
                      width: '100%',
                      height: 'auto',
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                    <div className="px-3 py-1 rounded-full bg-background/70 text-[10px] font-medium tracking-wide text-foreground/80">
                      Drag to reposition
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Drag the photo up or down to choose which part shows in your cover. You
              can change the photo before saving.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => coverPhotoInputRef.current?.click()}
              disabled={isSavingCroppedCover}
            >
              Change photo
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (isSavingCroppedCover) return;
                closeCoverCrop();
              }}
              disabled={isSavingCroppedCover}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!coverDraftFile || isSavingCroppedCover) return;
                setIsSavingCroppedCover(true);
                try {
                  await cropAndUploadCover();
                  closeCoverCrop();
                } catch (err) {
                  toast({ title: 'Failed to update cover photo', variant: 'destructive' });
                } finally {
                  setIsSavingCroppedCover(false);
                }
              }}
              disabled={!coverDraftFile || isSavingCroppedCover}
            >
              {isSavingCroppedCover ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save photo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAvatarCropOpen} onOpenChange={(open) => !open && !isSavingCroppedAvatar && closeAvatarCrop()}>
        <DialogContent className="max-w-sm w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Adjust profile picture</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              ref={avatarPreviewRef}
              className="relative w-full max-w-xs mx-auto aspect-square overflow-hidden rounded-full bg-muted touch-pan-y"
              onPointerDown={(e) => {
                if (!avatarDraftUrl) return;
                avatarDragStateRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  startOffsetX: avatarOffsetX,
                  startOffsetY: avatarOffsetY,
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
                avatarDragStateRef.current.liveOffsetX = clampedX;
                avatarDragStateRef.current.liveOffsetY = clampedY;
                if (avatarPreviewImageRef.current) {
                  avatarPreviewImageRef.current.style.transform = `translate(-50%, -50%) translate(${clampedX}px, ${clampedY}px)`;
                }
              }}
              onPointerUp={(e) => {
                if (!avatarDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                const finalX = avatarDragStateRef.current.liveOffsetX ?? avatarDragStateRef.current.startOffsetX;
                const finalY = avatarDragStateRef.current.liveOffsetY ?? avatarDragStateRef.current.startOffsetY;
                avatarDragStateRef.current = null;
                setAvatarOffsetX(finalX);
                setAvatarOffsetY(finalY);
              }}
              onPointerLeave={(e) => {
                if (!avatarDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                const finalX = avatarDragStateRef.current.liveOffsetX ?? avatarDragStateRef.current.startOffsetX;
                const finalY = avatarDragStateRef.current.liveOffsetY ?? avatarDragStateRef.current.startOffsetY;
                avatarDragStateRef.current = null;
                setAvatarOffsetX(finalX);
                setAvatarOffsetY(finalY);
              }}
            >
              {avatarDraftUrl && (
                <>
                  <img
                    ref={avatarPreviewImageRef}
                    src={avatarDraftUrl}
                    alt="Profile preview"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      const container = avatarPreviewRef.current;
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      const containerWidth = rect.width || 240;
                      const containerHeight = rect.height || 240;
                      const scale = containerWidth / img.naturalWidth;
                      const displayedHeight = img.naturalHeight * scale;
                      const displayedWidth = img.naturalWidth * scale;
                      const maxOffsetX = Math.max(0, (displayedWidth - containerWidth) / 2);
                      const maxOffsetY = Math.max(0, (displayedHeight - containerHeight) / 2);
                      setAvatarMaxOffsetX(maxOffsetX);
                      setAvatarMaxOffsetY(maxOffsetY);
                      setAvatarOffsetX(0);
                      setAvatarOffsetY(0);
                    }}
                    style={{
                      transform: `translate(-50%, -50%) translate(${avatarOffsetX}px, ${avatarOffsetY}px)`,
                      width: '100%',
                      height: 'auto',
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                    <div className="px-3 py-1 rounded-full bg-background/70 text-[10px] font-medium tracking-wide text-foreground/80">
                      Drag to reposition
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Drag the photo to choose how it appears in your profile picture.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => profilePictureInputRef.current?.click()}
              disabled={isSavingCroppedAvatar}
            >
              Change photo
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (isSavingCroppedAvatar) return;
                closeAvatarCrop();
              }}
              disabled={isSavingCroppedAvatar}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!avatarDraftFile || isSavingCroppedAvatar) return;
                setIsSavingCroppedAvatar(true);
                try {
                  await cropAndUploadAvatar();
                  closeAvatarCrop();
                } catch (err) {
                  toast({ title: 'Failed to update profile picture', variant: 'destructive' });
                } finally {
                  setIsSavingCroppedAvatar(false);
                }
              }}
              disabled={!avatarDraftFile || isSavingCroppedAvatar}
            >
              {isSavingCroppedAvatar ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save photo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="px-4 sm:px-6 lg:px-8 -mt-16 max-w-[1400px] mx-auto">
        {/* Profile Picture & Info */}
        <div className="flex items-end gap-4 mb-6">
          <div className="relative">
            <input
              ref={profilePictureInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureChange}
              className="hidden"
            />
            <div className="w-28 h-28 rounded-full border-4 border-background overflow-hidden bg-secondary">
              {effectiveAvatarUrl ? (
                <img
                  src={effectiveAvatarUrl}
                  alt={safeProfileName}
                  className="w-full h-full object-contain"
                  onError={handleImageError}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                  {safeProfileName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {user && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                disabled={isUploadingProfilePicture}
                onClick={() => profilePictureInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 rounded-full bg-background/90 backdrop-blur"
              >
                {isUploadingProfilePicture ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </Button>
            )}
          </div>

          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isProfileOnline ? 'bg-green-500' : 'bg-muted'}`} />
                  <span className="font-heading text-xl font-bold text-foreground">Editing profile</span>
                </div>
                <p className="text-xs text-muted-foreground">Update your identity and links for the community.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isProfileOnline ? 'bg-green-500' : 'bg-muted'}`} />
                <h1 className="font-heading text-2xl font-bold text-foreground">
                  {profileDisplayName}
                </h1>
                {profileUsername && (
                  <span className="text-sm text-muted-foreground">@{profileUsername}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">{isArtist ? 'Artist' : 'Audience Member'}</p>
              <span className="text-xs text-muted-foreground">{profilePresenceLabel}</span>
              {isArtist && artistId && (
                <Link to={`/artist/${artistId}`} className="text-sm text-primary hover:underline">
                  View Artist Page
                </Link>
              )}
            </div>
          </div>

          <div>
            {isEditing ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsEditing(false);
                    setDisplayName(profileDisplayName || 'Listener');
                    setUsername(profileUsername);
                    setBio(audienceProfile.bio || '');
                    setLocation(profileLocation);
                    setWebsiteUrl(profileWebsite);
                    setXProfileLink(profileXLink);
                    setBaseProfileLink(profileBaseLink);
                    setInterests(profileInterests);
                    setFieldErrors({});
                  }}
                  disabled={isSaving}
                >
                  <XIcon className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Bio */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          {isEditing ? (
            <div className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
              <div className="space-y-1.5">
                <Label htmlFor="profile-display-name">Display Name</Label>
                <Input
                  id="profile-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How should people see your name?"
                  maxLength={50}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-destructive">{fieldErrors.displayName || ''}</span>
                  <span className="text-muted-foreground">{displayName.trim().length}/50</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-username">Username</Label>
                <Input
                  id="profile-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  maxLength={32}
                />
                <p className="text-xs text-muted-foreground">Use lowercase letters, numbers, periods, and underscores.</p>
                {fieldErrors.username && <p className="text-xs text-destructive">{fieldErrors.username}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-bio">Bio</Label>
                <Textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell people who you are in 160 characters."
                  maxLength={160}
                  rows={4}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-destructive">{fieldErrors.bio || ''}</span>
                  <span className="text-muted-foreground">{bio.trim().length}/160</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-location">Location</Label>
                <Input
                  id="profile-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, Country"
                  maxLength={80}
                />
                {fieldErrors.location && <p className="text-xs text-destructive">{fieldErrors.location}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-website">Website</Label>
                <Input
                  id="profile-website"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourwebsite.com"
                />
                {fieldErrors.websiteUrl && <p className="text-xs text-destructive">{fieldErrors.websiteUrl}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-x">X Link</Label>
                <Input
                  id="profile-x"
                  value={xProfileLink}
                  onChange={(e) => setXProfileLink(e.target.value)}
                  placeholder="https://x.com/yourhandle"
                />
                {fieldErrors.xProfileLink && <p className="text-xs text-destructive">{fieldErrors.xProfileLink}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-base">Base Link / Wallet</Label>
                <Input
                  id="profile-base"
                  value={baseProfileLink}
                  onChange={(e) => setBaseProfileLink(e.target.value)}
                  placeholder="example.base.eth or 0x..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-interests">Genre / Interests</Label>
                <Input
                  id="profile-interests"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="Afrobeats, Hip-hop, Alté..."
                  maxLength={120}
                />
                {fieldErrors.interests && <p className="text-xs text-destructive">{fieldErrors.interests}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                {audienceProfile.bio || 'No bio yet'}
              </p>
              {profileLocation && (
                <p className="text-sm text-muted-foreground">{profileLocation}</p>
              )}
              {profileInterests && (
                <p className="text-sm text-muted-foreground">{profileInterests}</p>
              )}
            </div>
          )}
        </motion.div>

        {!isEditing && (
          <div className="flex flex-wrap gap-3 mb-6">
            {(() => {
              const farcasterFid = Number((user?.user_metadata as any)?.farcaster_fid);
              if (!Number.isFinite(farcasterFid) || farcasterFid <= 0) return null;
              return (
                <button
                  type="button"
                  onClick={() => { void fcViewProfile(farcasterFid); }}
                  className="flex items-center gap-2 px-3 py-2 bg-[#7c3aed]/15 hover:bg-[#7c3aed]/25 text-[#c4b5fd] rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.24 0H5.76A5.76 5.76 0 0 0 0 5.76v12.48A5.76 5.76 0 0 0 5.76 24h12.48A5.76 5.76 0 0 0 24 18.24V5.76A5.76 5.76 0 0 0 18.24 0ZM7.92 18l-3.12-9h2.4l1.8 5.64L10.8 9h2.4l1.8 5.64L16.8 9h2.4L16.08 18h-2.4l-1.68-5.28L10.32 18H7.92Z"/></svg>
                  <span className="text-sm">Farcaster</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </button>
              );
            })()}
            {profileXLink && (
              <a
                href={profileXLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
              >
                <XTwitterIcon />
                <span className="text-sm">X</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            )}
            {profileBaseLink && (
              <a
                href={
                  profileBaseLink.startsWith('0x')
                    ? `https://basescan.org/address/${profileBaseLink}`
                    : profileBaseLink.startsWith('http')
                      ? profileBaseLink
                      : `https://base.app/${profileBaseLink}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
              >
                <BaseIcon />
                <span className="text-sm">Base</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            )}
            {profileWebsite && (
              <a
                href={profileWebsite.startsWith('http') ? profileWebsite : `https://${profileWebsite}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="text-sm">Website</span>
              </a>
            )}
          </div>
        )}

        {isArtist && artistSongsData.length > 0 && (
          <div className="mb-8">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">My Music</h2>
            <div className="space-y-2">
              {artistSongsData.map(song => (
                <Link
                  key={song.id}
                  to={`/song/${song.id}`}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-card/70 transition-colors"
                >
                  <img
                    src={song.coverImage}
                    alt={song.title}
                    className="w-12 h-12 rounded-lg object-contain"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.townSquare}</p>
                  </div>
                  <ListMusic className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Heart className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{savedCatalogs.length}</p>
            <p className="text-sm text-muted-foreground">Saved Catalogs</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <ListMusic className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{playlists.length}</p>
            <p className="text-sm text-muted-foreground">Playlists</p>
          </div>
          {isArtist && (
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <Users className="w-5 h-5 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold text-foreground">{artistFollowerCount.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </div>
          )}
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Star className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{engagementPoints.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Points</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Flame className="w-5 h-5 mx-auto text-orange-500 mb-2" />
            <p className="text-2xl font-bold text-foreground">{currentStreak}</p>
            <p className="text-sm text-muted-foreground">Streak</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Users className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{completedReferrals}</p>
            <p className="text-sm text-muted-foreground">Referrals</p>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Playlists
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCreatePlaylistOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New playlist
            </Button>
          </div>
          {playlists.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Start your first playlist to collect your favorite songs.
              </p>
              <Button
                size="sm"
                className="gradient-primary"
                onClick={() => setIsCreatePlaylistOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create playlist
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-80 pr-2">
              <div className="space-y-3">
                {playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl hover:bg-card/70 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/playlist/${playlist.id}`}
                        className="block"
                      >
                        <p className="font-medium text-foreground truncate">
                          {playlist.name}
                        </p>
                        {playlist.description && (
                          <p className="text-sm text-muted-foreground truncate">
                            {playlist.description}
                          </p>
                        )}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-border"
                      >
                        {playlist.is_public ? (
                          <>
                            <Globe className="w-3 h-3" />
                            Public
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            Private
                          </>
                        )}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => updatePlaylistVisibility(playlist.id, !playlist.is_public)}
                      >
                        {playlist.is_public ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deletePlaylist(playlist.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Invite Friends Section */}
        <motion.div 
          className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-xl p-5 mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading font-semibold text-foreground">Invite Friends</h3>
              <p className="text-sm text-muted-foreground">Earn 100 points for each friend who joins!</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => setShowInviteModal(true)}
              variant="outline"
              className="flex-1"
            >
              View Details
            </Button>
            <Button 
              onClick={shareInviteLink}
              className="flex-1 gradient-primary"
            >
              Share Invite
            </Button>
          </div>
        </motion.div>

        {/* Notification & Offline Settings */}
        <div className="mb-8 space-y-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
              Settings
            </h2>
            <NotificationSettings />
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                <span>Offline storage used</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Saved tracks stay on this device for offline playback.
              </p>
            </div>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {(storageUsedBytes / (1024 * 1024)).toFixed(1)} MB
            </p>
          </div>
        </div>

        {savedCatalogsData.length > 0 && (
          <div className="mb-8">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
              Saved Catalogs
            </h2>
            <ScrollArea className="max-h-[420px] pr-2">
              <CatalogGrid className="sm:grid-cols-3 lg:grid-cols-4">
                {savedCatalogsData.map((catalog) => (
                  <CatalogCard key={catalog.id} catalog={catalog} />
                ))}
              </CatalogGrid>
            </ScrollArea>
          </div>
        )}

        {/* Early Access Note */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Your Audience activity here unlocks future access and ownership.
          </p>
        </div>
      </div>

      <Navigation />
      <InviteFriends isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />

      <Dialog open={isCreatePlaylistOpen} onOpenChange={setIsCreatePlaylistOpen}>
        <DialogContent className="max-w-sm w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Create playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="playlist-name">Name</Label>
              <Input
                id="playlist-name"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                maxLength={80}
                placeholder="Give your playlist a name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="playlist-description">Description</Label>
              <Textarea
                id="playlist-description"
                value={playlistDescription}
                onChange={(e) => setPlaylistDescription(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder="Add a short description (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="inline-flex items-center gap-2 rounded-lg bg-muted p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={playlistIsPublic ? 'ghost' : 'default'}
                  className="flex-1"
                  onClick={() => setPlaylistIsPublic(false)}
                >
                  <Lock className="w-4 h-4 mr-1" />
                  Private
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={playlistIsPublic ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setPlaylistIsPublic(true)}
                >
                  <Globe className="w-4 h-4 mr-1" />
                  Public
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Private playlists are only visible to you. Public playlists can be shared.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreatePlaylistOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreatePlaylist()}
            >
              Create playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
