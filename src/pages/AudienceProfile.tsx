import { useState, useEffect, useCallback, useRef, type ChangeEvent, type SyntheticEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  MapPin, 
  Link2, 
  Calendar,
  Music,
  Users,
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Camera,
  Loader2,
  Star,
  Flame
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigation } from '@/components/Navigation';
import { PostCard } from '@/components/social/PostCard';
import { useSocial } from '@/hooks/useSocial';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { AudienceProfile as AudienceProfileType } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { formatPresenceLabel, useUserPresence } from '@/hooks/useUserPresence';



export default function AudienceProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, audienceProfile: myProfile, isArtist, artistId } = useAuth();
  const {
    posts,
    isLoading: postsLoading,
    following,
    followers,
    toggleLikePost,
    deletePost,
    followUser,
    isFollowing,
    getPostComments,
    addComment
  } = useSocial();

  const [profile, setProfile] = useState<AudienceProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileFollowers, setProfileFollowers] = useState<string[]>([]);
  const [profileFollowing, setProfileFollowing] = useState<string[]>([]);
  const [likedSongsCount, setLikedSongsCount] = useState(0);
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const { isOnline: isProfileOnline, lastSeenAt: profileLastSeenAt } = useUserPresence(
    profile?.user_id ?? profile?.id,
    { includeLastSeen: true }
  );
  const [presenceRefreshAt, setPresenceRefreshAt] = useState(Date.now());
  const profilePresenceLabel =
    presenceRefreshAt >= 0
      ? formatPresenceLabel(
          isProfileOnline,
          profileLastSeenAt ?? (profile?.updated_at ? new Date(profile.updated_at).getTime() : null)
        )
      : '';
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  const isOwnProfile = userId === user?.id;
  const amFollowing = userId ? isFollowing(userId) : false;

  const fetchProfile = useCallback(async () => {
    if (!userId) return;

    setLoading(true);

    const { data: profileData } = await supabase
      .from('audience_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData as AudienceProfileType);
    }

    const { data: followersData } = await supabase
      .from('user_follows')
      .select('follower_id')
      .eq('following_id', userId);

    setProfileFollowers(followersData?.map((f) => f.follower_id) || []);

    const { data: followingData } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    setProfileFollowing(followingData?.map((f) => f.following_id) || []);

    const { count } = await supabase
      .from('liked_songs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    setLikedSongsCount(count || 0);

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPresenceRefreshAt(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`audience-profile-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_follows', filter: `following_id=eq.${userId}` },
        () => {
          void fetchProfile();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_follows', filter: `follower_id=eq.${userId}` },
        () => {
          void fetchProfile();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'liked_songs', filter: `user_id=eq.${userId}` },
        () => {
          void fetchProfile();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'audience_profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const nextProfile = payload.new as AudienceProfileType;
          setProfile((prev) => (prev ? { ...prev, ...nextProfile } : nextProfile));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'audience_profiles', filter: `user_id=eq.${userId}` },
        (payload) => {
          const nextProfile = payload.new as AudienceProfileType;
          setProfile((prev) => (prev ? { ...prev, ...nextProfile } : nextProfile));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchProfile]);

  const userPosts = posts.filter((p) => p.user_id === userId);
  const profilePoints = Number((profile as any)?.engagement_points ?? (profile as any)?.points ?? 0);
  const profileStreak = Number((profile as any)?.current_streak ?? 0);

  const handleProfilePictureChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!isOwnProfile || !userId) return;

      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Image too large (max 10MB)' });
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Please select an image file' });
        return;
      }

      if (!isSupabaseConfigured) {
        toast({ title: 'Image uploads are not configured yet' });
        return;
      }

      setIsUploadingProfilePicture(true);
      try {
        const extensionFromName = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
        const extensionFromType = file.type.includes('/') ? file.type.split('/').pop() || '' : '';
        const extension = (extensionFromName || extensionFromType || 'jpg').toLowerCase();
        const fileName = `avatar_url-${userId}-${Date.now()}.${extension}`;

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
          .eq('user_id', userId);
        if (updateError) throw updateError;

        setProfile((prev) => (prev ? { ...prev, avatar_url: imageUrl } : prev));
        toast({ title: 'Profile picture updated' });
      } catch (err: any) {
        toast({ title: 'Failed to update profile picture' });
      } finally {
        setIsUploadingProfilePicture(false);
      }
    },
    [isOwnProfile, userId]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="h-48 bg-gradient-to-b from-primary/20 to-background" />
        <div className="max-w-2xl mx-auto px-4 -mt-16">
          <Skeleton className="w-32 h-32 rounded-full mx-auto" />
          <div className="text-center mt-4 space-y-2">
            <Skeleton className="h-6 w-40 mx-auto" />
            <Skeleton className="h-4 w-60 mx-auto" />
          </div>
        </div>
        <Navigation />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center">
        <div className="text-center">
          <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Profile not found</h2>
          <p className="text-muted-foreground mb-4">This user doesn't exist or hasn't completed their profile.</p>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
        <Navigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="relative h-48 md:h-64">
        {profile.cover_photo_url ? (
          <img
            src={profile.cover_photo_url}
            alt="Cover"
            className="w-full h-full object-cover"
            onError={handleImageError}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 bg-background/50 backdrop-blur-sm"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      {/* Profile Info */}
      <div className="max-w-2xl mx-auto px-4 -mt-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          {/* Avatar */}
          <div className="relative inline-block">
            <Avatar className="w-32 h-32 mx-auto border-4 border-background shadow-xl">
              <AvatarImage src={profile.avatar_url || ''} onError={handleImageError} />
              <AvatarFallback className="text-4xl bg-primary/20 text-primary">
                {profile.profile_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            {isOwnProfile && (
              <>
                <input
                  ref={profilePictureInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  disabled={isUploadingProfilePicture}
                  onClick={() => profilePictureInputRef.current?.click()}
                  className="absolute bottom-0 right-0 rounded-full bg-background/90 backdrop-blur"
                >
                  {isUploadingProfilePicture ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Name & Bio */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className={`w-2 h-2 rounded-full ${isProfileOnline ? 'bg-green-500' : 'bg-muted'}`} />
            <h1 className="text-2xl font-bold">{profile.profile_name}</h1>
          </div>
          {profile.bio && (
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">{profile.bio}</p>
          )}

          {/* Links */}
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
            {profile.base_profile_link && (
              <a 
                href={profile.base_profile_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <Link2 className="w-4 h-4" />
                Base
              </a>
            )}
            {profile.x_profile_link && (
              <a 
                href={profile.x_profile_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <Link2 className="w-4 h-4" />
                X
              </a>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {profilePresenceLabel}
            </span>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-6">
            <div className="text-center">
              <p className="text-xl font-bold">{userPosts.length}</p>
              <p className="text-sm text-muted-foreground">Posts</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{profileFollowers.length}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{profileFollowing.length}</p>
              <p className="text-sm text-muted-foreground">Following</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{likedSongsCount}</p>
              <p className="text-sm text-muted-foreground">Liked</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{profilePoints.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-primary" />
                Points
              </p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{profileStreak}</p>
              <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                Streak
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          {!isOwnProfile && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button
                onClick={() => userId && followUser(userId)}
                variant={amFollowing ? 'secondary' : 'default'}
                className="min-w-[120px]"
              >
                {amFollowing ? 'Following' : 'Follow'}
              </Button>
              <Button variant="outline" onClick={() => toast({ title: 'Direct Messages', description: 'Messaging feature coming soon!' })}>
                <MessageCircle className="w-4 h-4 mr-2" />
                Message
              </Button>
            </div>
          )}

          {isOwnProfile && (
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => navigate(isArtist && artistId ? `/artist/${artistId}` : '/profile')}
            >
              Edit Profile
            </Button>
          )}
        </motion.div>

        {/* Content Tabs */}
        <Tabs defaultValue="posts" className="mt-8">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="posts" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              Posts
            </TabsTrigger>
            <TabsTrigger value="music" className="gap-2">
              <Music className="w-4 h-4" />
              Music
            </TabsTrigger>
            <TabsTrigger value="likes" className="gap-2">
              <Heart className="w-4 h-4" />
              Likes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-6 space-y-4">
            {postsLoading ? (
              <div className="space-y-4">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
              </div>
            ) : userPosts.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            ) : (
              userPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={toggleLikePost}
                  onDelete={deletePost}
                  onFollow={followUser}
                  isFollowing={isFollowing(post.user_id)}
                  onGetComments={getPostComments}
                  onAddComment={addComment}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="music" className="mt-6">
            <div className="text-center py-12">
              <Music className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Music activity coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="likes" className="mt-6">
            <div className="text-center py-12">
              <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{likedSongsCount} liked songs</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Navigation />
    </div>
  );
}
