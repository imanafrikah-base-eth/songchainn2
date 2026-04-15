import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Music, UserPlus, UserCheck, Heart, Share2, Copy, Check, CheckCircle2, Camera, Edit3, Save, X as XIcon, Loader2 } from 'lucide-react';
import { ARTISTS, SONGS } from '@/data/musicData';
import { SongCard } from '@/components/SongCard';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useAuth } from '@/context/AuthContext';
import { useSongPopularity, usePulseCounts } from '@/hooks/usePopularity';
import { useShare } from '@/hooks/useShare';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import { useSocial } from '@/hooks/useSocial';
import { PostComposer } from '@/components/social/PostComposer';
import { PostCard } from '@/components/social/PostCard';
import type { SocialPostWithProfile } from '@/types/social';
import { formatPresenceLabel, useUserPresence } from '@/hooks/useUserPresence';
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
  const { data: pulseCounts } = usePulseCounts();
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
  } = useSocial();
  
  const artist = ARTISTS.find(a => a.id === id);
  const artistSongs = SONGS.filter(s => s.artistId === id);
  const isFollowingArtist = id ? isArtistLiked(id) : false;

  const { data: artistAccount } = useQuery({
    queryKey: ['artist-account', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from('artist_accounts')
        .select('user_id, profile_theme, is_verified')
        .eq('artist_id', id)
        .maybeSingle();
      if (error) return null;
      return (data as { user_id: string; profile_theme?: string | null; is_verified?: boolean | null } | null) ?? null;
    },
    enabled: !!id,
    staleTime: 1000 * 10,
  });

  const shouldAutoCreateArtistAccount = !!id && !!user && isArtist && artistId === id;

  useEffect(() => {
    if (!shouldAutoCreateArtistAccount) return;
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
  }, [artistAccount?.user_id, id, queryClient, shouldAutoCreateArtistAccount, user?.id]);

  const ownerUserId = useMemo(() => {
    if (artistAccount?.user_id) return artistAccount.user_id;
    if (shouldAutoCreateArtistAccount && user) return user.id;
    return null;
  }, [artistAccount?.user_id, shouldAutoCreateArtistAccount, user]);
  const { isOnline: isArtistOnline, lastSeenAt: artistLastSeenAt } = useUserPresence(ownerUserId, { includeLastSeen: true });
  const artistPresenceLabel = formatPresenceLabel(isArtistOnline, artistLastSeenAt);

  const { data: artistProfile } = useQuery({
    queryKey: ['artist-public-profile', ownerUserId],
    queryFn: async () => {
      const userId = ownerUserId;
      if (!userId) return null;
      const { data } = await supabase
        .from('audience_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      return (data as any) ?? null;
    },
    enabled: !!ownerUserId,
    staleTime: 1000 * 10,
  });

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
      toast.error('Failed to update profile picture', { description: err?.message });
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
      toast.error('Failed to update cover photo', { description: err?.message });
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
      toast.error('Invalid file', { description: 'Please select an image file.' });
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
      toast.error('Name is required');
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
      toast.error('Failed to update artist page', { description: err?.message });
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
      toast.error('Failed to update theme', { description: error.message });
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
    if (!artistSongs.length || !popularityData) {
      return { totalPlays: 0, totalLikes: 0, totalPulses: 0 };
    }

    let totalPlays = 0;
    let totalLikes = 0;
    let totalPulses = 0;

    artistSongs.forEach(song => {
      const songData = popularityData.find(p => p.song_id === song.id);
      totalPlays += songData?.play_count || 0;
      totalLikes += songData?.like_count || 0;
      const pulseData = pulseCounts?.find(p => p.song_id === song.id);
      totalPulses += pulseData?.pulse_count || 0;
    });

    return { totalPlays, totalLikes, totalPulses };
  }, [artistSongs, popularityData, pulseCounts]);

  if (!artist) {
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
            We couldn't find this artist. They may have been removed or the link might be incorrect.
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
          ? 'min-h-screen pb-24 bg-gradient-to-b from-yellow-500/10 via-background to-background'
          : profileTheme === 'neon'
            ? 'min-h-screen pb-24 bg-gradient-to-b from-fuchsia-500/10 via-background to-background'
            : profileTheme === 'midnight'
              ? 'min-h-screen pb-24 bg-gradient-to-b from-slate-800/20 via-background to-background'
              : 'min-h-screen bg-background pb-24'
      }
    >
      <Navigation />

      <main className="container mx-auto px-4 py-8">
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
          <div className="relative h-48 md:h-64 rounded-3xl overflow-hidden mb-8 bg-gradient-to-br from-primary/20 to-background">
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
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
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
                    <h1 className="font-heading text-4xl font-bold text-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isArtistOnline ? 'bg-green-500' : 'bg-muted'}`} />
                        <span className="truncate">{displayName}</span>
                        {isNewArtist && (
                          <span className="px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            NEW
                          </span>
                        )}
                        {isVerified && <CheckCircle2 className="w-5 h-5 text-yellow-400" />}
                      </span>
                    </h1>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">{artistPresenceLabel}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {user && (
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
                        <Button
                          variant="outline"
                          onClick={() => setIsEditingProfile(true)}
                        >
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
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
              
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{artist.location}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Music className="w-4 h-4" />
                  <span>{artistSongs.length} songs</span>
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

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="glass-card p-4 rounded-xl text-center">
                  <Music className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {artistSongs.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Songs</p>
                </div>
                <div className="glass-card p-4 rounded-xl text-center">
                  <Heart className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {artistStats.totalLikes.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Likes</p>
                </div>
                <div className="glass-card p-4 rounded-xl text-center">
                  <Heart className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {artistStats.totalPulses.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Pulses</p>
                </div>
              </div>

              {/* Town Square Badge */}
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-sm text-primary font-medium">{artist.townSquare}</span>
              </div>
            </div>
          </div>
        </motion.section>

        <section className="mb-10">
          <h2 className="font-heading text-xl font-semibold text-foreground mb-6">Timeline</h2>
          {isOwner && (
            <PostComposer
              onPost={async (content, type, songId) => {
                await createPost(content, type, songId);
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
            const volumeOrder: Array<"ER'TING FLEX" | '3.0' | 'Lovers EP' | 'Vol1' | 'Vol2' | 'Vol3' | 'Vol4' | 'Vol5' | 'Vol6' | 'Vol7'> = [
              "ER'TING FLEX",
              '3.0',
              'Lovers EP',
              'Vol7',
              'Vol6',
              'Vol5',
              'Vol4',
              'Vol3',
              'Vol2',
              'Vol1',
            ];

            const sortByRecent = (songs: typeof artistSongs) =>
              [...songs].sort((a, b) => {
                const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
                const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
                if (timeA !== timeB) return timeB - timeA;
                const idA = Number(a.id) || 0;
                const idB = Number(b.id) || 0;
                return idB - idA;
              });

            const volumeSections: Array<{
              label: (typeof volumeOrder)[number];
              songs: typeof artistSongs;
            } | null> = volumeOrder.map((volume) => {
              const songs = sortByRecent(
                artistSongs.filter((song) => {
                  if (song.volume) return song.volume === volume;
                  return volume === 'Vol1';
                })
              );
              return songs.length ? { label: volume, songs } : null;
            });

            const sections = volumeSections.filter(
              (section): section is { label: (typeof volumeOrder)[number]; songs: typeof artistSongs } =>
                Boolean(section)
            );

            return sections.map((section) => (
              <div
                key={section.label}
                className="mb-6 last:mb-0 glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay relative overflow-hidden"
              >
                <div className="pointer-events-none absolute -inset-x-10 -top-16 h-20 bg-gradient-to-r from-primary/30 via-purple-500/25 to-cyan-400/30 blur-3xl opacity-60" />
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
      </main>

      <AudioPlayer />
    </div>
  );
}
