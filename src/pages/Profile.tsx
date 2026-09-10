import { PhotoPositioner } from '@/components/PhotoPositioner';
import { ArtistName } from '@/components/ArtistName';
import { cropImage, CENTRE_CROP, type PhotoCrop } from '@/lib/cropImage';
import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Camera, Edit3, ExternalLink, Gift, Heart, ListMusic, Loader2, Save, Star, Users, X as XIcon, HardDrive, Plus, Lock, Globe, Trash2, Flame, Download, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountNotice } from '@/components/AccountNotice';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useEngagement } from '@/context/EngagementContext';
import { useUserPoints } from '@/hooks/useUserPoints';
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
import { ProfileConnections } from '@/components/ProfileConnections';
import { safeHref, type SocialLink } from '@/components/ArtistLinks';
import { Plus as PlusIcon, Trash2 as TrashIcon } from 'lucide-react';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ChangePassword } from '@/components/ChangePassword';
import { ChangeEmail } from '@/components/ChangeEmail';
import { LikedActivity } from '@/components/LikedActivity';
import { MusicActivity } from '@/components/MusicActivity';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BlockedPeople } from '@/components/BlockedPeople';
import { DeleteAccount } from '@/components/DeleteAccount';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
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

// The artist links live in their own audience_profiles columns. Kept as one
// list so the state, the form, the validation and the payload agree.
const ARTIST_LINK_FIELDS = [
  { key: 'spotify_url', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/...' },
  { key: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'youtube_url', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
  { key: 'soundcloud_url', label: 'SoundCloud', placeholder: 'https://soundcloud.com/yourname' },
  { key: 'apple_music_url', label: 'Apple Music', placeholder: 'https://music.apple.com/artist/...' },
] as const;
type ArtistLinkKey = (typeof ARTIST_LINK_FIELDS)[number]['key'];
type ArtistLinks = Record<ArtistLinkKey, string>;

const readExtraLinks = (profile: unknown): SocialLink[] => {
  const raw = (profile as { social_links?: unknown } | null | undefined)?.social_links;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ label: typeof (l as SocialLink)?.label === 'string' ? (l as SocialLink).label : '', url: typeof (l as SocialLink)?.url === 'string' ? (l as SocialLink).url : '' }))
    .filter((l) => l.url);
};

/** Only links that resolve, named or not, at most thirty of them. */
const cleanExtraLinks = (list: SocialLink[]): SocialLink[] =>
  list
    .map((l) => ({ label: l.label.trim().slice(0, 40), url: safeHref(l.url) ?? '' }))
    .filter((l) => l.url)
    .slice(0, 30);

const readArtistLinks = (profile: unknown): ArtistLinks => {
  const p = (profile || {}) as Record<string, unknown>;
  const out = {} as ArtistLinks;
  ARTIST_LINK_FIELDS.forEach(({ key }) => {
    out[key] = typeof p[key] === 'string' ? (p[key] as string) : '';
  });
  return out;
};

// Artist links must be https. Anything without a scheme gets one; http is
// upgraded rather than rejected, since that is what people paste.
const normalizeHttpsUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return 'https://' + trimmed.slice(7);
  return 'https://' + trimmed;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
  // The server ledger, not the browser counter. These two used to disagree on
  // screen: the Leaderboard read user_points while this card read a localStorage
  // number that cleared with site data.
  const { lifetimePoints, streak } = useUserPoints();
  const { likedSongs, playlists, savedCatalogs, createPlaylist, deletePlaylist, updatePlaylistVisibility } = useAudienceInteractions();
  const { pointsEarned: referralPoints, completedReferrals, shareInviteLink } = useReferrals();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [playlistIsPublic, setPlaylistIsPublic] = useState(false);
  const { storageUsedBytes, cachedSongs, removeCachedSong } = useOfflineAudio();
  // Deleting a playlist is one tap on a trash icon, so it asks first.
  const [playlistToDelete, setPlaylistToDelete] = useState<{ id: string; name: string } | null>(null);
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
  const [coverCrop, setCoverCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const [isSavingCroppedCover, setIsSavingCroppedCover] = useState(false);
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null);
  const [isAvatarCropOpen, setIsAvatarCropOpen] = useState(false);
  const [avatarDraftFile, setAvatarDraftFile] = useState<File | null>(null);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const [isSavingCroppedAvatar, setIsSavingCroppedAvatar] = useState(false);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const wantsSettings = new URLSearchParams(useLocation().search).has('settings');
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
  const [artistLinks, setArtistLinks] = useState<ArtistLinks>(() => readArtistLinks(audienceProfile));
  const [bookingEmail, setBookingEmail] = useState(((audienceProfile as any)?.booking_email || '') as string);
  /* Every other door the artist wants on their page. Shown bundled, never as a wall. */
  const [extraLinks, setExtraLinks] = useState<SocialLink[]>(() => readExtraLinks(audienceProfile));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingProfileSnapshot, setPendingProfileSnapshot] = useState<{
    display_name: string;
    username: string | null;
    bio: string | null;
    location: string | null;
    website_url: string | null;
    twitter_url: string | null;
    base_profile_link: string | null;
    interests: string | null;
  } | null>(null);
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
      setArtistLinks(readArtistLinks(audienceProfile));
      setBookingEmail(((audienceProfile as any)?.booking_email || '') as string);
      setExtraLinks(readExtraLinks(audienceProfile));
      setFieldErrors({});
      setPendingProfileSnapshot(null);
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
      setAvatarCrop(CENTRE_CROP);
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
      setCoverCrop(CENTRE_CROP);
      setIsCoverCropOpen(true);
    },
    [toast]
  );

  const closeCoverCrop = useCallback(() => {
    setIsCoverCropOpen(false);
    setCoverDraftFile(null);
    setCoverCrop(CENTRE_CROP);
    if (coverDraftUrl) {
      URL.revokeObjectURL(coverDraftUrl);
    }
    setCoverDraftUrl(null);
  }, [coverDraftUrl]);

  const closeAvatarCrop = useCallback(() => {
    setIsAvatarCropOpen(false);
    setAvatarDraftFile(null);
    setAvatarCrop(CENTRE_CROP);
    if (avatarDraftUrl) {
      URL.revokeObjectURL(avatarDraftUrl);
    }
    setAvatarDraftUrl(null);
  }, [avatarDraftUrl]);

  const cropAndUploadCover = useCallback(async () => {
    if (!coverDraftFile || !user) return;
    // The window the person dragged into place, cut from the full-size file.
    const croppedFile = await cropImage(coverDraftFile, coverCrop, {
      outputWidth: 1600,
      quality: 0.9,
      fileName: coverDraftFile.name || 'cover.jpg',
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
  }, [coverCrop, coverDraftFile, uploadAndUpdateProfileImage, user]);

  const cropAndUploadAvatar = useCallback(async () => {
    if (!avatarDraftFile || !user) return;
    const croppedFile = await cropImage(avatarDraftFile, { ...avatarCrop, aspect: 1 }, {
      outputWidth: 600,
      circle: true,
      fileName: avatarDraftFile.name || 'avatar.png',
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
  }, [avatarCrop, avatarDraftFile, uploadAndUpdateProfileImage, user]);

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

    // Artist links: only checked, and only saved, for artist accounts.
    const nextArtistLinks: Partial<Record<ArtistLinkKey, string | null>> = {};
    let nextBookingEmail: string | null = null;
    if (isArtist) {
      ARTIST_LINK_FIELDS.forEach(({ key, label }) => {
        const normalized = normalizeHttpsUrl(artistLinks[key]);
        nextArtistLinks[key] = normalized;
        if (!normalized) return;
        try {
          const parsed = new URL(normalized);
          if (parsed.protocol !== 'https:' || !parsed.hostname.includes('.')) {
            nextErrors[key] = label + ' link must be a full https:// address.';
          }
        } catch {
          nextErrors[key] = 'Enter a valid ' + label + ' URL.';
        }
      });
      const cleanBooking = bookingEmail.trim();
      if (cleanBooking) {
        if (!cleanBooking.includes('@') || cleanBooking.startsWith('@') || cleanBooking.endsWith('@')) {
          nextErrors.booking_email = 'Enter a valid booking email.';
        } else {
          nextBookingEmail = cleanBooking;
        }
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
      const currentUsername = audienceProfile?.username || '';
      if (nextUsername && nextUsername !== currentUsername) {
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
        social_links: cleanExtraLinks(extraLinks),
        website: nextWebsite,
        twitter_url: nextXLink,
        x_profile_link: nextXLink,
        wallet_address: trimOrNull(nextBaseLink),
        base_profile_link: trimOrNull(nextBaseLink),
        interests: trimOrNull(nextInterests),
        genre: trimOrNull(nextInterests),
      };
      if (isArtist) {
        updatePayload = { ...updatePayload, ...nextArtistLinks, booking_email: nextBookingEmail };
      }

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

      // Optimistically show new values immediately; refreshProfile syncs context in background
      setPendingProfileSnapshot({
        display_name: nextDisplayName,
        username: nextUsername || null,
        bio: trimOrNull(nextBio),
        location: trimOrNull(nextLocation),
        website_url: nextWebsite,
        twitter_url: nextXLink,
        base_profile_link: trimOrNull(nextBaseLink),
        interests: trimOrNull(nextInterests),
      });
      setIsEditing(false);
      toast({
        title: 'Profile updated',
        description: 'Your changes are saved across $ongChainn.',
      });
      void refreshProfile();
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

  // An artist's /profile is their artist page. Their account settings still
  // live here (wallet, links, email, password, library, blocked people), so
  // the artist page and the Studio open this with ?settings=1 rather than
  // bouncing them straight back.
  if (isArtist && artistId && !wantsSettings) {
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
  const snap = pendingProfileSnapshot;
  const profileDisplayName =
    snap?.display_name ||
    audienceProfile.display_name ||
    audienceProfile.profile_name ||
    audienceProfile.username ||
    safeProfileName;
  const profileUsername = (snap ? snap.username : audienceProfile.username) || '';
  const profileLocation = (snap ? snap.location : audienceProfile.location) || '';
  const profileWebsite =
    (snap ? snap.website_url : null) ||
    ((audienceProfile as any)?.website_url as string | null | undefined) ||
    ((audienceProfile as any)?.website as string | null | undefined) ||
    '';
  const profileXLink =
    (snap ? snap.twitter_url : null) ||
    audienceProfile.twitter_url ||
    audienceProfile.x_profile_link ||
    '';
  const profileBaseLink =
    (snap ? snap.base_profile_link : null) ||
    audienceProfile.base_profile_link ||
    audienceProfile.wallet_address ||
    '';
  const profileInterests =
    (snap ? snap.interests : null) ||
    ((audienceProfile as any)?.interests as string | null | undefined) ||
    ((audienceProfile as any)?.genre as string | null | undefined) ||
    '';

  return (
    <div className="min-h-screen bg-background">
      {/* Anything in force on this account, and the way to argue with it.
          Top of the page on purpose: a restriction somebody cannot see reads
          as the app being broken. */}
      <div className="px-4 pt-4 empty:hidden">
        <AccountNotice />
      </div>

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
            <div className="relative w-full h-48 overflow-hidden rounded-xl bg-muted">
              {coverDraftUrl && (
                <PhotoPositioner
                  src={coverDraftUrl}
                  onChange={setCoverCrop}
                  className="absolute inset-0"
                  alt="Cover preview"
                  disabled={isSavingCroppedCover}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Drag the photo to choose which part shows in your cover. You can change
              the photo before saving.
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
            <div className="relative w-full max-w-xs mx-auto aspect-square overflow-hidden rounded-full bg-muted">
              {avatarDraftUrl && (
                <PhotoPositioner
                  src={avatarDraftUrl}
                  onChange={setAvatarCrop}
                  className="absolute inset-0"
                  alt="Profile preview"
                  disabled={isSavingCroppedAvatar}
                />
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

      <div className="px-4 sm:px-6 lg:px-8 lg:pl-28 -mt-16 max-w-[1400px] mx-auto">
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
                  <ArtistName name={profileDisplayName} userId={user?.id} size={18} />
                </h1>
                {profileUsername && (
                  <span className="text-sm text-muted-foreground">@{profileUsername}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">{isArtist ? 'Artist' : 'Audience Member'}</p>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{profilePresenceLabel}</span>
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
                    setArtistLinks(readArtistLinks(audienceProfile));
                    setBookingEmail(((audienceProfile as any)?.booking_email || '') as string);
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
                <Label htmlFor="profile-display-name">{isArtist ? 'Artist name' : 'Display Name'}</Label>
                <Input
                  id="profile-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={isArtist ? 'The name on your artist page' : 'How should people see your name?'}
                  maxLength={50}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className={fieldErrors.displayName ? 'text-destructive' : 'text-muted-foreground'}>
                    {fieldErrors.displayName || (isArtist ? 'Your artist page, your world and your drops all carry this name.' : '')}
                  </span>
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

              {isArtist && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Artist links</p>
                    <p className="text-xs text-muted-foreground">Where people can find you elsewhere. Shown on your artist page.</p>
                  </div>
                  {ARTIST_LINK_FIELDS.map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={'profile-' + key}>{label}</Label>
                      <Input
                        id={'profile-' + key}
                        type="url"
                        inputMode="url"
                        value={artistLinks[key]}
                        onChange={(e) => setArtistLinks((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        maxLength={300}
                      />
                      {fieldErrors[key] && <p className="text-xs text-destructive">{fieldErrors[key]}</p>}
                    </div>
                  ))}
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">More links</p>
                      <p className="text-xs text-muted-foreground">Anything else: Audiomack, Boomplay, Threads, a merch store, a WhatsApp line. As many as you like; the page shows the first few and folds the rest behind one tap.</p>
                    </div>
                    {extraLinks.map((l, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Input
                          aria-label="Link name"
                          value={l.label}
                          onChange={(e) => setExtraLinks((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                          placeholder="Name"
                          maxLength={40}
                          className="w-28 shrink-0"
                        />
                        <Input
                          aria-label="Link address"
                          type="url"
                          inputMode="url"
                          value={l.url}
                          onChange={(e) => setExtraLinks((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                          placeholder="https://"
                          maxLength={300}
                          className="min-w-0 flex-1"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${l.label || 'link'}`}
                          onClick={() => setExtraLinks((prev) => prev.filter((_, j) => j !== i))}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setExtraLinks((prev) => [...prev, { label: '', url: '' }])}>
                      <PlusIcon className="mr-1.5 h-4 w-4" /> Add a link
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Connections</p>
                      <p className="text-xs text-muted-foreground">Farcaster and Zora, shown with your links.</p>
                    </div>
                    <ProfileConnections />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-booking-email">Booking email</Label>
                    <Input
                      id="profile-booking-email"
                      type="email"
                      inputMode="email"
                      value={bookingEmail}
                      onChange={(e) => setBookingEmail(e.target.value)}
                      placeholder="bookings@yourlabel.com"
                      maxLength={160}
                    />
                    {fieldErrors.booking_email && <p className="text-xs text-destructive">{fieldErrors.booking_email}</p>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                {(snap ? snap.bio : audienceProfile.bio) || 'No bio yet'}
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
                    <p className="text-sm text-muted-foreground truncate">{song.genre}</p>
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
            <p className="text-2xl font-bold text-foreground">{lifetimePoints.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Points</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Flame className="w-5 h-5 mx-auto text-orange-500 mb-2" />
            <p className="text-2xl font-bold text-foreground">{streak}</p>
            <p className="text-sm text-muted-foreground">Streak</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Users className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{completedReferrals}</p>
            <p className="text-sm text-muted-foreground">Referrals</p>
          </div>
        </div>

        {/* What this person has liked, played and kept. Same components the
            public profile uses, pointed at the signed-in account. */}
        <div className="mb-8 space-y-8">
          <h2 className="font-heading text-lg font-semibold text-foreground">Your library</h2>
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Likes and follows</h3>
            <LikedActivity userId={user?.id} isOwnProfile />
          </section>
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Listening</h3>
            <MusicActivity userId={user?.id} isOwnProfile displayName={profileDisplayName} />
          </section>
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Downloaded
              <span className="ml-2 font-normal normal-case tracking-normal">{cachedSongs.length}</span>
            </h3>
            {cachedSongs.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <Download className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nothing kept on this device yet. Play a song once, then tap Keep this to have it offline.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...cachedSongs]
                  .sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0))
                  .map((cached) => {
                    const known = SONGS.find((s) => s.id === cached.songId);
                    const title = cached.title || known?.title || 'A song';
                    const artistName = cached.artist || known?.artist || '';
                    const size = formatBytes(Number(cached.sizeBytes ?? 0));
                    return (
                      <div
                        key={cached.songId}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
                      >
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {known?.coverImage ? (
                            <img src={known.coverImage} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Music className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {known ? (
                            <Link to={'/song/' + known.id} className="block truncate text-sm font-semibold text-foreground hover:text-primary">
                              {title}
                            </Link>
                          ) : (
                            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
                          )}
                          <p className="truncate text-xs text-muted-foreground">
                            {artistName}
                            {size ? ' · ' + size : ''}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 text-muted-foreground hover:text-destructive"
                          aria-label={'Remove ' + title + ' from this device'}
                          onClick={() => void removeCachedSong(cached.songId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
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
                        className="h-11 w-11 text-muted-foreground hover:text-primary"
                        onClick={() => updatePlaylistVisibility(playlist.id, !playlist.is_public)}
                      >
                        {playlist.is_public ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 text-muted-foreground hover:text-destructive"
                        aria-label={'Delete ' + playlist.name}
                        onClick={() => setPlaylistToDelete({ id: playlist.id, name: playlist.name })}
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
          className="bg-gradient-to-br from-primary/20 to-primary/5 border border-border rounded-xl p-5 mb-8"
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
          {/* A listening account and an artist account are the same account. This
              is where a person who makes music says so, and where an artist gets
              back to their tools. */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{isArtist ? 'Artist account' : 'Are you an artist?'}</p>
              <p className="text-xs text-muted-foreground">
                {isArtist
                  ? 'The Studio, your world, the launcher and your drops are open to you.'
                  : 'Make music? Switch and your Studio opens right now: no review, no fee, no wallet needed.'}
              </p>
            </div>
            <Button asChild size="sm" variant={isArtist ? 'outline' : 'default'}>
              <Link to="/studio">{isArtist ? 'Open the Studio' : 'Switch to artist account'}</Link>
            </Button>
          </div>
          <ChangePassword />
          <ChangeEmail />
          <BlockedPeople />
          <DeleteAccount />
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
        <div className="bg-primary/10 border border-border rounded-xl p-4 text-center">
          <p className="text-sm text-muted-foreground">
            What you play and post here builds your place on the leaderboard.
          </p>
        </div>
      </div>

      <Navigation />
      <InviteFriends isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />

      <AlertDialog open={playlistToDelete !== null} onOpenChange={(open) => { if (!open) setPlaylistToDelete(null); }}>
        <AlertDialogContent className="max-w-sm w-[95vw] sm:w-full">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              {playlistToDelete ? playlistToDelete.name : 'This playlist'} and its track list will be removed. The songs themselves stay in the catalog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (playlistToDelete) void deletePlaylist(playlistToDelete.id);
                setPlaylistToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
