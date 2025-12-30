import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Music, UserPlus, UserCheck, Headphones, Heart, Users, Share2, Copy, Check, CheckCircle2 } from 'lucide-react';
import { ARTISTS, SONGS } from '@/data/musicData';
import { SongCard } from '@/components/SongCard';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useAuth } from '@/context/AuthContext';
import { useSongPopularity } from '@/hooks/usePopularity';
import { useShare } from '@/hooks/useShare';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export default function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isArtistLiked, toggleLikeArtist } = useAudienceInteractions();
  const { data: popularityData } = useSongPopularity();
  const { copyToClipboard, getShareUrl, shareToX, nativeShare, copied } = useShare();
  const queryClient = useQueryClient();
  
  const artist = ARTISTS.find(a => a.id === id);
  const artistSongs = SONGS.filter(s => s.artistId === id);
  const isFollowing = id ? isArtistLiked(id) : false;

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

  const { data: artistProfile } = useQuery({
    queryKey: ['artist-public-profile', artistAccount?.user_id],
    queryFn: async () => {
      const userId = artistAccount?.user_id;
      if (!userId) return null;
      const { data } = await supabase
        .from('audience_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      return (data as any) ?? null;
    },
    enabled: !!artistAccount?.user_id,
    staleTime: 1000 * 10,
  });

  const displayName = (artistProfile as any)?.profile_name || artist?.name;
  const displayBio = (artistProfile as any)?.bio || artist?.bio;
  const displayProfileImage = (artistProfile as any)?.profile_picture_url || artist?.profileImage;
  const isOwner = !!user && !!artistAccount?.user_id && user.id === artistAccount.user_id;
  const isVerified = artistAccount?.is_verified ?? true;
  const profileTheme = (artistAccount?.profile_theme || 'default').toLowerCase();

  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const profilePictureObjectUrlRef = useRef<string | null>(null);

  const uploadProfilePicture = useCallback(async (file: File) => {
    if (!artistAccount?.user_id) return;

    setIsUploadingProfilePicture(true);
    try {
      const extRaw = file.name.split('.').pop() || '';
      const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
      const path = `artists/${artistAccount.user_id}/profile-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const uploadRes = await supabase.storage
        .from('artist-posts')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadRes.error) throw uploadRes.error;

      const publicUrl = supabase.storage.from('artist-posts').getPublicUrl(path).data.publicUrl;

      const { error: updateError } = await supabase
        .from('audience_profiles')
        .update({ profile_picture_url: publicUrl })
        .eq('user_id', artistAccount.user_id);
      if (updateError) throw updateError;

      queryClient.setQueryData(['artist-public-profile', artistAccount.user_id], (prev: any) => {
        if (!prev) return prev;
        return { ...prev, profile_picture_url: publicUrl };
      });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profile', artistAccount.user_id] });
      queryClient.invalidateQueries({ queryKey: ['artist-public-profiles'] });
      toast.success('Profile picture updated');
    } catch (err: any) {
      toast.error('Failed to update profile picture', { description: err?.message });
    } finally {
      setIsUploadingProfilePicture(false);
    }
  }, [artistAccount?.user_id, queryClient]);

  useEffect(() => {
    return () => {
      if (profilePictureObjectUrlRef.current) {
        URL.revokeObjectURL(profilePictureObjectUrlRef.current);
        profilePictureObjectUrlRef.current = null;
      }
    };
  }, []);

  const handleProfilePictureChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isOwner) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large', { description: 'Max size is 10MB.' });
      return;
    }

    if (profilePictureObjectUrlRef.current) {
      URL.revokeObjectURL(profilePictureObjectUrlRef.current);
      profilePictureObjectUrlRef.current = null;
    }
    profilePictureObjectUrlRef.current = URL.createObjectURL(file);
    queryClient.setQueryData(['artist-public-profile', artistAccount.user_id], (prev: any) => {
      if (!prev) return prev;
      return { ...prev, profile_picture_url: profilePictureObjectUrlRef.current };
    });

    await uploadProfilePicture(file);
  }, [artistAccount?.user_id, isOwner, queryClient, uploadProfilePicture]);

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

  // Fetch follower count from database
  const { data: followerCount = 0 } = useQuery({
    queryKey: ['artist-followers', id],
    queryFn: async () => {
      if (!id) return 0;
      const { data, error } = await supabase.rpc('get_artist_follower_count', { p_artist_id: id });
      if (error) {
        const fallback = await supabase.functions.invoke('artist-follow-counts', {
          body: { artist_ids: [id] },
        });
        if (fallback.error) {
          console.error('Error fetching follower count:', error);
          return 0;
        }
        const rows = (fallback.data as any)?.data ?? (fallback.data as any);
        const arr = Array.isArray(rows) ? rows : [];
        const row = arr.find((r: any) => String(r?.artist_id) === String(id)) || arr[0];
        const raw = row?.follower_count;
        const parsed = typeof raw === 'string' ? Number(raw) : (raw ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      const raw = data as any;
      const parsed = typeof raw === 'string' ? Number(raw) : (raw ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    enabled: !!id,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`artist-followers-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'liked_artists', filter: `artist_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['artist-followers', id] });
          queryClient.invalidateQueries({ queryKey: ['all-artist-followers'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const handleToggleFollow = async () => {
    if (!id) return;
    await toggleLikeArtist(id);
    queryClient.invalidateQueries({ queryKey: ['artist-followers', id] });
    queryClient.invalidateQueries({ queryKey: ['all-artist-followers'] });
  };

  // Calculate real stats from database
  const artistStats = useMemo(() => {
    if (!artistSongs.length || !popularityData) return { totalPlays: 0, totalLikes: 0 };
    
    let totalPlays = 0;
    let totalLikes = 0;
    
    artistSongs.forEach(song => {
      const songData = popularityData.find(p => p.song_id === song.id);
      totalPlays += songData?.play_count || 0;
      totalLikes += songData?.like_count || 0;
    });
    
    return { totalPlays, totalLikes };
  }, [artistSongs, popularityData]);

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
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Profile Image */}
            <div className="w-48 flex-shrink-0">
              <div className="w-48 h-48 rounded-2xl bg-secondary overflow-hidden">
              {displayProfileImage ? (
                <img 
                  src={displayProfileImage} 
                  alt={displayName || artist.name}
                  className="w-full h-full object-cover"
                />
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
                    id="artist-profile-picture-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureChange}
                    disabled={isUploadingProfilePicture}
                    className="w-full text-sm"
                  />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="font-heading text-4xl font-bold text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span>{displayName}</span>
                    {isVerified && <CheckCircle2 className="w-5 h-5 text-yellow-400" />}
                  </span>
                </h1>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {user && (
                    <Button
                      onClick={handleToggleFollow}
                      variant={isFollowing ? "secondary" : "default"}
                    >
                      {isFollowing ? (
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
                  {artistAccount?.user_id && (
                    <Button variant="outline" asChild>
                      <Link to={`/audience/${artistAccount.user_id}`}>Social</Link>
                    </Button>
                  )}
                  {isOwner && (
                    <>
                      <Button variant="outline" asChild>
                        <Link to="/profile">Edit Profile</Link>
                      </Button>
                      <select
                        value={profileTheme}
                        onChange={(e) => void updateProfileTheme(e.target.value)}
                        disabled={isUploadingProfilePicture}
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

              <p className="text-muted-foreground mb-6 max-w-2xl">
                {displayBio}
              </p>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="glass-card p-4 rounded-xl text-center">
                  <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {followerCount.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Followers</p>
                </div>
                <div className="glass-card p-4 rounded-xl text-center">
                  <Music className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {artistSongs.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Songs</p>
                </div>
                <div className="glass-card p-4 rounded-xl text-center">
                  <Headphones className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {artistStats.totalPlays.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Streams</p>
                </div>
                <div className="glass-card p-4 rounded-xl text-center">
                  <Heart className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-heading font-bold text-foreground">
                    {artistStats.totalLikes.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Likes</p>
                </div>
              </div>

              {/* Town Square Badge */}
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-sm text-primary font-medium">{artist.townSquare}</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Songs */}
        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground mb-6">
            Discography
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {artistSongs.map((song, index) => (
              <SongCard key={song.id} song={song} index={index} />
            ))}
          </div>
        </section>
      </main>

      <AudioPlayer />
    </div>
  );
}
