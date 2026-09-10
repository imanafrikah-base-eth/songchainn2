import { useParams, Link } from 'react-router-dom';
import { ClaimArtistPage } from '@/components/ClaimArtistPage';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Music, UserPlus, UserCheck, Heart, Share2, Copy, Check, CheckCircle2, Camera, Edit3, Save, X as XIcon, Loader2, Users, PlayCircle, Search, KeyRound, Mic2 } from 'lucide-react';
import { ARTISTS, SONGS, getRelatedArtists, type Artist } from '@/data/musicData';
import { getWorldByArtistId } from '@/worlds/registry';
import { ArtistCoinPanel } from '@/components/ArtistCoinPanel';
import { WORLDS_ENABLED } from '@/lib/features';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { SongCard } from '@/components/SongCard';
import { ArtistCard } from '@/components/ArtistCard';
import { Navigation } from '@/components/Navigation';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ArtistLinks } from '@/components/ArtistLinks';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useAuth } from '@/context/AuthContext';
import { useSongPopularity, useArtistFollowerCounts } from '@/hooks/usePopularity';
import { useShare } from '@/hooks/useShare';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import { useSocial } from '@/hooks/useSocial';
import { PostComposer } from '@/components/social/PostComposer';
import { PostCard } from '@/components/social/PostCard';
import { BlockButton } from '@/components/social/BlockButton';
import { ArtistGallery } from '@/components/gallery/ArtistGallery';
import { ArtistStats } from '@/components/ArtistStats';
import { useArtistGallery } from '@/hooks/useArtistMedia';
import type { SocialPostWithProfile } from '@/types/social';
import { formatPresenceLabel, useUserPresence } from '@/hooks/useUserPresence';
import { useArtistCoinHolding, HOLDER_PERK_USD } from '@/hooks/useArtistCoinHolding';
import { GetKeyModal } from '@/worlds/components/GetKeyModal';
import { WORLDS } from '@/worlds/registry';
import { isNativeApp } from '@/lib/native';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const NEW_ARTIST_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;
function isArtistNew(addedAt?: string) {
  if (!addedAt) return false;
  const ts = new Date(addedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < NEW_ARTIST_WINDOW_MS;
}

export default function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isArtist, artistId } = useAuth();
  const { isArtistLiked, toggleLikeArtist } = useAudienceInteractions();
  const { data: popularityData } = useSongPopularity();
  const { data: followerCounts } = useArtistFollowerCounts();
  const { copyToClipboard, getShareUrl, shareToX, nativeShare, copied } = useShare();
  const queryClient = useQueryClient();
  const {
    createPost,
    deletePost,
    toggleLikePost,
    followUser,
    isFollowing: isFollowingUser,
    getPostComments,
    addComment,
    untagSelf,
  } = useSocial();
  
  const { songs: publishedSongs, artists: publishedArtists } = usePublishedCatalog();
  const catalogArtist = ARTISTS.find(a => a.id === id) ?? publishedArtists.find(a => a.id === id);
  const artistSongs = [...SONGS, ...publishedSongs].filter(s => s.artistId === id);
  const isFollowingArtist = id ? isArtistLiked(id) : false;

  const { data: artistAccount, isLoading: isArtistAccountLoading } = useQuery({
    queryKey: ['artist-account', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const { data, error } = await (supabase as any)
          .from('artist_accounts')
          .select('user_id, profile_theme, is_verified')
          .eq('artist_id', id)
          .maybeSingle();
        if (error) return null;
        return (data as { user_id: string; profile_theme?: string | null; is_verified?: boolean | null } | null) ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
    staleTime: 1000 * 10,
    retry: 1,
  });

  const shouldAutoCreateArtistAccount = !!id && !!user && isArtist && artistId === id;

  useEffect(() => {
    if (!shouldAutoCreateArtistAccount) return;
    // Wait for the read. Firing while it is still in flight means every artist
    // opening their own page attempts a write that is already unnecessary, and
    // artist_accounts has no insert policy for the artist by design, so it just
    // returns 403 twice and logs an error on a page that is working fine.
    if (isArtistAccountLoading) return;
    if (artistAccount?.user_id) return;

    let cancelled = false;

    const upsertArtistAccount = async () => {
      const { error } = await (supabase as any)
        .from('artist_accounts')
        .upsert(
          {
            artist_id: id,
            user_id: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'artist_id' }
        );

      if (cancelled) return;
      if (error) return;

      queryClient.invalidateQueries({ queryKey: ['artist-account', id] });
    };

    upsertArtistAccount();

    return () => {
      cancelled = true;
    };
  }, [artistAccount?.user_id, id, isArtistAccountLoading, queryClient, shouldAutoCreateArtistAccount, user?.id]);

  const ownerUserId = useMemo(() => {
    if (artistAccount?.user_id) return artistAccount.user_id;
    if (shouldAutoCreateArtistAccount && user) return user.id;
    return null;
  }, [artistAccount?.user_id, shouldAutoCreateArtistAccount, user]);
  const { isOnline: isArtistOnline, lastSeenAt: artistLastSeenAt } = useUserPresence(ownerUserId, { includeLastSeen: true });
  const artistPresenceLabel = formatPresenceLabel(isArtistOnline, artistLastSeenAt);
  // Seeing when the artist is online is a holder's perk: fifty cents of
  // their coin, read from the wallet on the account. The artist always sees
  // their own.
  const holding = useArtistCoinHolding(id);
  const [keyOpen, setKeyOpen] = useState(false);

  const { data: artistProfile } = useQuery({
    queryKey: ['artist-public-profile', ownerUserId],
    queryFn: async () => {
      const userId = ownerUserId;
      if (!userId) return null;
      try {
        // Try user_id column first (standard auth profiles)
        const { data: byUserId } = await supabase
          .from('audience_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (byUserId) return (byUserId as any);
        // Fall back to id column (legacy profiles where id = user_id)
        const { data: byId } = await supabase
          .from('audience_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        return (byId as any) ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!ownerUserId,
    staleTime: 1000 * 10,
    retry: 1,
  });

  // An artist who was granted an account but has no record in the catalogue
  // yet (a page claimed through "New here?", or a claimed page with nothing
  // published) still has a page: the account is the artist, and their own
  // profile dresses it until a record does. Without this, Profile sent a
  // newly approved artist to their own page and the page said Not Found.
  const artist: Artist | undefined = catalogArtist ?? (artistAccount?.user_id && id
    ? {
        id,
        name: (artistProfile as any)?.profile_name || (artistProfile as any)?.display_name || 'New artist',
        bio: (artistProfile as any)?.bio || '',
        location: (artistProfile as any)?.location || '',
        townSquare: '',
        profileImage: (artistProfile as any)?.profile_picture_url || (artistProfile as any)?.avatar_url || undefined,
        songs: [],
      }
    : undefined);

  const displayName = (artistProfile as any)?.profile_name || artist?.name;
  const displayBio = (artistProfile as any)?.bio || artist?.bio;
  const displayProfileImage =
    (artistProfile as any)?.profile_picture_url ||
    artist?.profileImage ||
    (artistProfile as any)?.avatar_url ||
    null;
  const displayCoverPhoto = (artistProfile as any)?.cover_photo_url || null;
  const isOwner = !!user && !!ownerUserId && user.id === ownerUserId;
  const isVerified = artistAccount?.is_verified ?? false;
  const profileTheme = (artistAccount?.profile_theme || 'default').toLowerCase();
  const isNewArtist = isArtistNew(artist?.addedAt);

  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const [isUploadingCoverPhoto, setIsUploadingCoverPhoto] = useState(false);
  const profilePictureObjectUrlRef = useRef<string | null>(null);
  const coverPhotoObjectUrlRef = useRef<string | null>(null);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');

  const uploadProfilePicture = useCallback(async (file: File) => {
    if (!ownerUserId) return;
    if (!isSupabaseConfigured) {
      toast.error('Image uploads are not configured yet.');
      return;
    }

    setIsUploadingProfilePicture(true);
    try {
      const extensionFromName = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
      const extensionFromType = file.type.includes('/') ? file.type.split('/').pop() || '' : '';
      const extension = (extensionFromName || extensionFromType || 'jpg').toLowerCase();
      const fileName = `avatar_url-${ownerUserId}-${Date.now()}.${extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avaters')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError || !uploadData?.path) {
        throw new Error('Failed to upload image to storage');
      }

      const { data: publicUrlData } = supabase.storage.from('avaters').getPublicUrl(uploadData.path);
      const imageUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('audience_profiles')
        .update({ avatar_url: imageUrl } as any)
        .eq('user_id', ownerUserId);
      if (updateError) throw updateError;

      queryClient.setQueryData(['artist-public-profile', ownerUserId], (prev: any) => {
        if (!prev) return prev;
        return { ...prev, profile_picture_url: imageUrl };
      });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profile', ownerUserId] });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profiles'] });
      toast.success('Profile picture updated');
    } catch (err: any) {
      toast.error('Could not update your profile picture', { description: 'Try a smaller image, or try again in a moment.' });
    } finally {
      setIsUploadingProfilePicture(false);
    }
  }, [ownerUserId, queryClient]);

  const uploadCoverPhoto = useCallback(async (file: File) => {
    if (!ownerUserId) return;
    if (!isSupabaseConfigured) {
      toast.error('Image uploads are not configured yet.');
      return;
    }

    setIsUploadingCoverPhoto(true);
    try {
      const extensionFromName = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
      const extensionFromType = file.type.includes('/') ? file.type.split('/').pop() || '' : '';
      const extension = (extensionFromName || extensionFromType || 'jpg').toLowerCase();
      const fileName = `cover_photo_url-${ownerUserId}-${Date.now()}.${extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('covers')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError || !uploadData?.path) {
        throw new Error('Failed to upload image to storage');
      }

      const { data: publicUrlData } = supabase.storage.from('covers').getPublicUrl(uploadData.path);
      const imageUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('audience_profiles')
        .update({ cover_photo_url: imageUrl } as any)
        .eq('user_id', ownerUserId);
      if (updateError) throw updateError;

      queryClient.setQueryData(['artist-public-profile', ownerUserId], (prev: any) => {
        if (!prev) return prev;
        return { ...prev, cover_photo_url: imageUrl };
      });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profile', ownerUserId] });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profiles'] });
      toast.success('Cover photo updated');
    } catch (err: any) {
      toast.error('Could not update your cover photo', { description: 'Try a smaller image, or try again in a moment.' });
    } finally {
      setIsUploadingCoverPhoto(false);
    }
  }, [ownerUserId, queryClient]);

  useEffect(() => {
    return () => {
      if (profilePictureObjectUrlRef.current) {
        URL.revokeObjectURL(profilePictureObjectUrlRef.current);
        profilePictureObjectUrlRef.current = null;
      }
      if (coverPhotoObjectUrlRef.current) {
        URL.revokeObjectURL(coverPhotoObjectUrlRef.current);
        coverPhotoObjectUrlRef.current = null;
      }
    };
  }, []);

  const handleProfilePictureChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isOwner) return;
    const userId = ownerUserId;
    if (!userId) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large', { description: 'Max size is 10MB.' });
      return;
    }

    if (profilePictureObjectUrlRef.current) {
      URL.revokeObjectURL(profilePictureObjectUrlRef.current);
      profilePictureObjectUrlRef.current = null;
    }
    profilePictureObjectUrlRef.current = URL.createObjectURL(file);
    queryClient.setQueryData(['artist-public-profile', userId], (prev: any) => {
      if (!prev) return prev;
      return { ...prev, profile_picture_url: profilePictureObjectUrlRef.current };
    });

    await uploadProfilePicture(file);
  }, [isOwner, ownerUserId, queryClient, uploadProfilePicture]);

  const handleCoverPhotoChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isOwner) return;
    const userId = ownerUserId;
    if (!userId) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large', { description: 'Max size is 10MB.' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('That is not an image', { description: 'Pick a JPG, PNG or WebP.' });
      return;
    }

    if (coverPhotoObjectUrlRef.current) {
      URL.revokeObjectURL(coverPhotoObjectUrlRef.current);
      coverPhotoObjectUrlRef.current = null;
    }
    coverPhotoObjectUrlRef.current = URL.createObjectURL(file);
    queryClient.setQueryData(['artist-public-profile', userId], (prev: any) => {
      if (!prev) return prev;
      return { ...prev, cover_photo_url: coverPhotoObjectUrlRef.current };
    });

    await uploadCoverPhoto(file);
  }, [isOwner, ownerUserId, queryClient, uploadCoverPhoto]);

  useEffect(() => {
    if (!isOwner) return;
    if (isEditingProfile) return;
    setProfileNameDraft(((artistProfile as any)?.profile_name || artist?.name || '').toString());
    setBioDraft(((artistProfile as any)?.bio || artist?.bio || '').toString());
  }, [artist?.bio, artist?.name, artistProfile, isEditingProfile, isOwner]);

  const saveProfile = useCallback(async () => {
    if (!isOwner) return;
    if (!ownerUserId) return;
    const nextName = profileNameDraft.trim();
    if (!nextName) {
      toast.error('Give the page a name first');
      return;
    }

    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from('audience_profiles')
        .upsert(
          {
            id: ownerUserId,
            profile_name: nextName,
            bio: bioDraft.trim() || null,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'id' }
        );
      if (error) throw error;

      queryClient.setQueryData(['artist-public-profile', ownerUserId], (prev: any) => {
        if (!prev) return prev;
        return { ...prev, profile_name: nextName, bio: bioDraft.trim() || null };
      });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profile', ownerUserId] });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profiles'] });
      setIsEditingProfile(false);
      toast.success('Artist page updated');
    } catch (err: any) {
      toast.error('Could not save your artist page', { description: 'Nothing was lost. Try again in a moment.' });
    } finally {
      setIsSavingProfile(false);
    }
  }, [bioDraft, isOwner, ownerUserId, profileNameDraft, queryClient]);

  const updateProfileTheme = useCallback(async (nextTheme: string) => {
    if (!id) return;
    if (!isOwner) return;
    const { error } = await (supabase as any)
      .from('artist_accounts')
      .update({ profile_theme: nextTheme })
      .eq('artist_id', id);
    if (error) {
      toast.error('Could not save that theme', { description: 'Your page is unchanged. Try again in a moment.' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['artist-account', id] });
    toast.success('Theme updated');
  }, [id, isOwner, queryClient]);

  const handleToggleFollow = async () => {
    if (!id) return;
    await toggleLikeArtist(id);
  };

  const timelineUserId = ownerUserId;

  const { data: timelinePosts = [], isLoading: isTimelineLoading } = useQuery({
    queryKey: ['artist-timeline-posts', timelineUserId, user?.id],
    queryFn: async (): Promise<SocialPostWithProfile[]> => {
      if (!timelineUserId) return [];

      const { data: postsData } = await supabase
        .from('social_posts')
        .select('*')
        .eq('user_id', timelineUserId)
        .order('created_at', { ascending: false })
        .limit(20);

      const rows = (postsData as any[]) || [];
      if (rows.length === 0) return [];

      const postIds = rows.map((p) => p.id);

      const [profileRes, likesRes, commentsRes, userLikesRes] = await Promise.all([
        supabase
          .from('audience_profiles')
          .select('*')
          .eq('id', timelineUserId)
          .maybeSingle(),
        supabase
          .from('post_likes')
          .select('post_id')
          .in('post_id', postIds),
        supabase
          .from('post_comments')
          .select('post_id')
          .in('post_id', postIds),
        user
          ? supabase
              .from('post_likes')
              .select('post_id')
              .eq('user_id', user.id)
              .in('post_id', postIds)
          : Promise.resolve({ data: [] } as any),
      ]);

      const likesCount = new Map<string, number>();
      likesRes.data?.forEach((l) => {
        likesCount.set(l.post_id, (likesCount.get(l.post_id) || 0) + 1);
      });

      const commentsCount = new Map<string, number>();
      commentsRes.data?.forEach((c) => {
        commentsCount.set(c.post_id, (commentsCount.get(c.post_id) || 0) + 1);
      });

      const userLikedPosts = new Set<string>((userLikesRes.data || []).map((l: any) => l.post_id));

      return rows.map((post) => ({
        artist_id: id ?? null,
        artist_is_verified: isVerified,
        id: post.id,
        user_id: post.user_id,
        content: post.content,
        song_id: post.song_id,
        playlist_id: post.playlist_id,
        image_url: (post as any).image_url ?? null,
        image_path: (post as any).image_path ?? null,
        post_type: post.post_type as SocialPostWithProfile['post_type'],
        created_at: post.created_at,
        updated_at: post.updated_at,
        profile: (profileRes.data as any) || undefined,
        likes_count: likesCount.get(post.id) || 0,
        comments_count: commentsCount.get(post.id) || 0,
        is_liked: userLikedPosts.has(post.id),
      }));
    },
    enabled: !!timelineUserId,
    staleTime: 1000 * 10,
  });

  useEffect(() => {
    if (!timelineUserId) return;
    const channel = supabase
      .channel(`artist-timeline-${timelineUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'social_posts', filter: `user_id=eq.${timelineUserId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['artist-timeline-posts', timelineUserId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, timelineUserId]);

  const artistStats = useMemo(() => {
    let totalPlays = 0;
    let totalLikes = 0;

    artistSongs.forEach(song => {
      const songData = popularityData?.find(p => p.song_id === song.id);
      totalPlays += songData?.play_count ?? song.plays ?? 0;
      totalLikes += songData?.like_count ?? song.likes ?? 0;
    });

    return { totalPlays, totalLikes };
  }, [artistSongs, popularityData]);
  const artistFollowers = useMemo(
    () => followerCounts?.find((entry) => entry.artist_id === id)?.follower_count || 0,
    [followerCounts, id],
  );

  const relatedArtists = useMemo(() => {
    if (!id) return [];
    const allArtists = [...ARTISTS, ...publishedArtists];
    const allSongs = [...SONGS, ...publishedSongs];
    return getRelatedArtists(id, allArtists, allSongs, 6);
  }, [id, publishedArtists, publishedSongs]);

  if (!artist) {
    // Still loading — show skeleton while artist account/profile resolves
    if (isArtistAccountLoading || (artistAccount?.user_id && artistProfile === undefined)) {
      return (
        <div className="min-h-screen bg-background">
          <Navigation />
          <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 lg:pl-28 pt-4 sm:pt-6">
            <div className="mb-6">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="relative h-48 md:h-64 rounded-3xl overflow-hidden mb-8">
              <Skeleton className="w-full h-full" />
            </div>
            <div className="flex flex-col md:flex-row gap-8">
              <Skeleton className="w-48 h-48 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-4">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-48" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
              </div>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Music className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-foreground mb-3">Artist Not Found</h1>
          <p className="text-muted-foreground mb-6">
            We couldn&apos;t find this artist. They may have been removed or the link might be incorrect.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild>
              <Link to="/artists">Browse Artists</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Go Home</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const handleShare = () => nativeShare({
    title: `${artist.name} on $ongChainn`,
    text: `Check out ${artist.name} on $ongChainn!`,
    url: getShareUrl('artist', artist.id),
  });
  const handleCopyLink = () => copyToClipboard(getShareUrl('artist', artist.id));
  const handleShareToX = () => shareToX(`Check out ${artist.name} on $ongChainn!`, getShareUrl('artist', artist.id));

  return (
    <div
      className={
        profileTheme === 'gold'
          ? 'min-h-screen bg-gradient-to-b from-yellow-500/10 via-background to-background'
          : profileTheme === 'neon'
            ? 'min-h-screen bg-gradient-to-b from-fuchsia-500/10 via-background to-background'
            : profileTheme === 'midnight'
              ? 'min-h-screen bg-gradient-to-b from-slate-800/20 via-background to-background'
              : 'min-h-screen bg-background'
      }
    >
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 lg:pl-28 pt-4 sm:pt-6">
        {/* Back Button */}
        <Link 
          to="/artists" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Artists</span>
        </Link>

        {/* Artist Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="relative h-48 md:h-64 rounded-3xl overflow-hidden mb-8 bg-secondary">
            <input
              ref={coverPhotoInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverPhotoChange}
              disabled={isUploadingCoverPhoto}
              className="hidden"
            />
            {displayCoverPhoto && (
              <img
                src={displayCoverPhoto}
                alt="Cover"
                className="w-full h-full object-cover"
                onError={handleImageError}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
            {isOwner && (
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

          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Profile Image */}
            <div className="w-48 flex-shrink-0">
              <div className="w-48 h-48 rounded-2xl bg-secondary overflow-hidden">
              {displayProfileImage && !profileImageFailed ? (
                <div className="relative w-full h-full">
                  <img
                    src={displayProfileImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110"
                    onError={handleImageError}
                  />
                  <img 
                    src={displayProfileImage} 
                    alt={displayName || artist.name}
                    className="relative w-full h-full object-contain"
                    onError={() => setProfileImageFailed(true)}
                  />
                </div>
              ) : (
                <div className="w-full h-full gradient-primary opacity-40 flex items-center justify-center">
                  <span className="text-6xl font-heading font-bold text-foreground">
                    {(displayName || artist.name).charAt(0)}
                  </span>
                </div>
              )}
              </div>
              {isOwner && (
                <div className="mt-3 space-y-2">
                  <input
                    ref={profilePictureInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureChange}
                    disabled={isUploadingProfilePicture}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={isUploadingProfilePicture}
                    onClick={() => profilePictureInputRef.current?.click()}
                  >
                    {isUploadingProfilePicture ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                    Change Photo
                  </Button>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 w-full min-w-0">
              <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4 mb-2">
                <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                  {isOwner && isEditingProfile ? (
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isArtistOnline ? 'bg-green-500' : 'bg-muted'}`} />
                      <Input
                        value={profileNameDraft}
                        onChange={(e) => setProfileNameDraft(e.target.value)}
                        maxLength={50}
                        className="font-heading text-2xl md:text-4xl font-bold"
                        disabled={isSavingProfile}
                      />
                    </div>
                  ) : (
                    <h1 className="font-heading text-3xl sm:text-4xl font-bold text-foreground min-w-0">
                      <span className="inline-flex max-w-full min-w-0 items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isArtistOnline ? 'bg-green-500' : 'bg-muted'}`} />
                        <span className="truncate">{displayName}</span>
                        {isNewArtist && (
                          <span className="px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            NEW
                          </span>
                        )}
                        {isVerified && <VerifiedBadge size={22} />}
                      </span>
                    </h1>
                  )}
                  {!isOwner && (
                    <div className="mt-2">
                      <ClaimArtistPage artistId={artist.id} artistName={displayName || artist.name} isClaimed={Boolean(artistAccount?.user_id)} />
                    </div>
                  )}
                  {isOwner || holding.holdsEnough ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${isArtistOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden="true" />
                      {artistPresenceLabel}
                    </p>
                  ) : holding.coin ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Hold ${HOLDER_PERK_USD.toFixed(2)} of {artist.name}'s coin to see when {artist.name} is online.{' '}
                      {!holding.wallet ? (
                        <Link to="/profile?settings=1" className="underline underline-offset-4 hover:text-foreground">Link a wallet</Link>
                      ) : !isNativeApp() ? (
                        <>
                          <button type="button" onClick={() => setKeyOpen(true)} className="underline underline-offset-4 hover:text-foreground">Get the coin</button>
                          <GetKeyModal
                            open={keyOpen}
                            onOpenChange={setKeyOpen}
                            coinAddress={holding.coin.coinAddress}
                            symbol={WORLDS.find((w) => w.artistId === artist.id)?.tokenSymbol ?? `${holding.coin.zoraHandle.toUpperCase()}`}
                            artistName={artist.name}
                            worldSlug={WORLDS.find((w) => w.artistId === artist.id)?.slug ?? null}
                          />
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <ArtistLinks profile={artistProfile as Record<string, unknown> | null} className="mt-3" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/*
                    The claim door is closed. "This is my page" showed on every
                    artist to every visitor, which made ownership look like one
                    tap away and put the burden of proof on a review queue that
                    nobody worked. Artist accounts are now created by us and
                    handed to the artist directly, so there is nothing to claim.
                    See scripts/create-artist-accounts.mjs.
                  */}
                  {/* Not on your own page. Offering an artist a Follow button
                      for themselves is the kind of small wrongness that makes
                      a product feel unfinished. */}
                  {user && !isOwner && (
                    <Button
                      onClick={handleToggleFollow}
                      variant={isFollowingArtist ? "secondary" : "default"}
                    >
                      {isFollowingArtist ? (
                        <>
                          <UserCheck className="w-4 h-4 mr-2" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Follow
                        </>
                      )}
                    </Button>
                  )}
                  {/* Same block control as an audience profile. Posts by an
                      artist link here, so this is where somebody bothered by
                      one comes to make it stop. Hidden on your own page and
                      until the artist's account is known. */}
                  {user && !isOwner && ownerUserId && (
                    <BlockButton userId={ownerUserId} displayName={displayName || artist.name} />
                  )}
                  {isOwner && (
                    <>
                      {isEditingProfile ? (
                        <>
                          <Button
                            variant="ghost"
                            disabled={isSavingProfile}
                            onClick={() => {
                              setIsEditingProfile(false);
                              setProfileNameDraft(((artistProfile as any)?.profile_name || artist?.name || '').toString());
                              setBioDraft(((artistProfile as any)?.bio || artist?.bio || '').toString());
                            }}
                          >
                            <XIcon className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                          <Button
                            disabled={isSavingProfile}
                            onClick={() => void saveProfile()}
                          >
                            {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button asChild>
                            <Link to="/studio">
                              <Mic2 className="w-4 h-4 mr-2" />
                              Open the Studio
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setIsEditingProfile(true)}
                          >
                            <Edit3 className="w-4 h-4 mr-2" />
                            Edit
                          </Button>
                          <Button asChild variant="outline">
                            <Link to="/profile?settings=1" aria-label="Account settings: wallet, links, email and password">
                              Settings
                            </Link>
                          </Button>
                        </>
                      )}
                      <select
                        value={profileTheme}
                        onChange={(e) => void updateProfileTheme(e.target.value)}
                        disabled={isUploadingProfilePicture || isUploadingCoverPhoto || isSavingProfile}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="default">Default</option>
                        <option value="gold">Gold</option>
                        <option value="neon">Neon</option>
                        <option value="midnight">Midnight</option>
                      </select>
                    </>
                  )}
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="default" className="gap-2">
                      <Share2 className="w-4 h-4" />
                      Share
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={handleShare} className="gap-2">
                      <Share2 className="w-4 h-4" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      Copy Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShareToX} className="gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      Share on X
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* The way into an artist's world. It sits on its own line rather
                  than in the button row, so on a narrow phone it cannot get
                  squeezed off the edge next to Follow and Share. */}
              {WORLDS_ENABLED && (() => {
                const world = getWorldByArtistId(artist.id);
                if (!world) return null;
                return (
                  <Link
                    to={`/world/${world.slug}`}
                    className="mb-4 flex w-full items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 transition-colors hover:bg-amber-400/20"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-400 text-black">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        Enter {displayName || artist.name}'s World
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        A place this artist built. Step inside and look around.
                      </span>
                    </span>
                  </Link>
                );
              })()}
              
              {/* The artist's coin, folded away until somebody asks for it.
                  Anyone who came here for the music is not shown a market. */}
              <div className="mb-4">
                <ArtistCoinPanel artistId={artist.id} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
                <div className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{artist.location}</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                  <Music className="w-4 h-4" />
                  <span>{artistSongs.length} songs</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                  <PlayCircle className="w-4 h-4" />
                  <span>{artistStats.totalPlays.toLocaleString()} streams</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{artistFollowers.toLocaleString()} followers</span>
                </div>
              </div>

              {isOwner && isEditingProfile ? (
                <div className="mb-6 max-w-2xl space-y-2">
                  <Textarea
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    rows={3}
                    maxLength={500}
                    disabled={isSavingProfile}
                    placeholder="Tell listeners about you..."
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {bioDraft.length}/500
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground mb-6 max-w-2xl">
                  {displayBio}
                </p>
              )}

              {/* What this artist has done here, with some life in it. */}
              <ArtistStats
                className="mb-6"
                songs={artistSongs.length}
                streams={artistStats.totalPlays}
                followers={artistFollowers}
                likes={artistStats.totalLikes}
                topSongs={artistSongs
                  .map((song) => ({
                    id: song.id,
                    title: song.title,
                    plays: popularityData?.find((d) => d.song_id === song.id)?.play_count ?? song.plays ?? 0,
                  }))
                  .sort((a, b) => b.plays - a.plays)}
              />

              {/* Location Badge */}
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-border">
                <span className="text-sm text-primary font-medium">{artist.location}</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Their visual work. Hidden entirely when there is none, rather than
            showing an empty shelf on somebody's page. */}
        <ArtistGallerySection artistId={id} />

        <section className="mb-10">
          <h2 className="font-heading text-xl font-semibold text-foreground mb-6">Timeline</h2>
          {isOwner && (
            <PostComposer
              onPost={async (content, type, songId, extras) => {
                await createPost(content, type, songId, undefined, extras);
                if (timelineUserId) {
                  queryClient.invalidateQueries({ queryKey: ['artist-timeline-posts', timelineUserId] });
                }
              }}
            />
          )}
          <div className="mt-4 space-y-4">
            {isTimelineLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : timelinePosts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No posts yet.
              </div>
            ) : (
              timelinePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={toggleLikePost}
                  onDelete={deletePost}
                  onFollow={followUser}
                  isFollowing={timelineUserId ? isFollowingUser(timelineUserId) : false}
                  onGetComments={getPostComments}
                  onAddComment={addComment}
                  onUntagSelf={untagSelf}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground mb-6">
            {isOwner ? 'My Music' : 'Discography'}
          </h2>
          {(() => {
            const sortByRecent = (songs: typeof artistSongs) =>
              [...songs].sort((a, b) => {
                const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
                const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
                if (timeA !== timeB) return timeB - timeA;
                const idA = Number(a.id) || 0;
                const idB = Number(b.id) || 0;
                return idB - idA;
              });

            // Group dynamically by the song's volume so every catalog (past
            // and future) gets its own section automatically; singles are
            // gathered into one "Singles" section. Newest release first.
            const groups = new Map<string, typeof artistSongs>();
            artistSongs.forEach((song) => {
              const label = song.volume
                ? song.volume === 'Single' ? 'Singles' : song.volume
                : 'Vol1';
              const list = groups.get(label);
              if (list) {
                list.push(song);
              } else {
                groups.set(label, [song]);
              }
            });

            // A release the artist numbered plays in track order; anything
            // else, newest first, as before.
            const inReleaseOrder = (songs: typeof artistSongs) =>
              songs.some((s) => s.trackNumber)
                ? [...songs].sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999))
                : sortByRecent(songs);
            const sections = Array.from(groups.entries())
              .map(([label, songs]) => ({ label, songs: inReleaseOrder(songs) }))
              .sort((a, b) => {
                const timeA = a.songs[0]?.addedAt ? new Date(a.songs[0].addedAt!).getTime() : 0;
                const timeB = b.songs[0]?.addedAt ? new Date(b.songs[0].addedAt!).getTime() : 0;
                return timeB - timeA;
              });

            return sections.map((section) => (
              <div
                key={section.label}
                className="relative overflow-hidden"
              >
                {/* glow removed */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
                        <span>{section.label}</span>
                        <span className="text-[11px] sm:text-xs text-muted-foreground">
                          {section.songs.length} tracks
                        </span>
                      </h3>
                    </div>
                  </div>
                  {isOwner ? (
                    <div className="space-y-1.5 sm:space-y-2 max-h-[360px] sm:max-h-[420px] overflow-y-auto pr-1">
                      {section.songs.map((song, index) => (
                        <SongCard key={song.id} song={song} index={index} variant="compact" />
                      ))}
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {section.songs.map((song, index) => (
                          <SongCard key={song.id} song={song} index={index} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ));
          })()}
        </section>

        {relatedArtists.length > 0 && (
          <section className="mt-10">
            <h2 className="font-heading text-xl font-semibold text-foreground mb-6">Related Artists</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              {relatedArtists.map((relatedArtist, index) => (
                <div key={relatedArtist.id} className="w-44 sm:w-52 shrink-0">
                  <ArtistCard artist={relatedArtist} index={index} />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <AudioPlayer />
    </div>
  );
}

/**
 * The artist's visual work, above the timeline.
 *
 * Its own component so the query only runs where the section renders, and so
 * the whole block disappears when the artist has published nothing. An empty
 * "Gallery" heading on somebody's page reads as a feature they failed to use.
 */
function ArtistGallerySection({ artistId }: { artistId: string | undefined }) {
  const { data: media = [] } = useArtistGallery(artistId);
  const { artistId: myArtistId } = useAuth();
  const isOwner = !!artistId && !!myArtistId && String(myArtistId) === String(artistId);
  // Visitors see the section only when there is something to see; the
  // artist always sees it, because that is where they manage the work.
  if (!media.length && !isOwner) return null;
  return (
    <section className="mb-10">
      <h2 className="font-heading text-xl font-semibold text-foreground mb-6">Gallery</h2>
      <ArtistGallery artistId={artistId} />
    </section>
  );
}
