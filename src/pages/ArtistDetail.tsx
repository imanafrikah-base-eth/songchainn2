import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Music, UserPlus, UserCheck, Headphones, Heart, Users, Share2, Copy, Check } from 'lucide-react';
import { ARTISTS, SONGS } from '@/data/musicData';
import { SongCard } from '@/components/SongCard';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useAuth } from '@/context/AuthContext';
import { useSongPopularity } from '@/hooks/usePopularity';
import { useShare } from '@/hooks/useShare';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isArtistLiked, toggleLikeArtist } = useAudienceInteractions();
  const { data: popularityData } = useSongPopularity();
  const { copyToClipboard, getShareUrl, shareToX, nativeShare, copied } = useShare();
  
  const artist = ARTISTS.find(a => a.id === id);
  const artistSongs = SONGS.filter(s => s.artistId === id);
  const isFollowing = id ? isArtistLiked(id) : false;

  // Fetch follower count from database
  const { data: followerCount = 0 } = useQuery({
    queryKey: ['artist-followers', id],
    queryFn: async () => {
      if (!id) return 0;
      const { data, error } = await supabase.rpc('get_artist_follower_count', { p_artist_id: id });
      if (error) {
        console.error('Error fetching follower count:', error);
        return 0;
      }
      return data ?? 0;
    },
    enabled: !!id,
  });

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
    <div className="min-h-screen bg-background pb-24">
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
            <div className="w-48 h-48 rounded-2xl bg-secondary overflow-hidden flex-shrink-0">
              {artist.profileImage ? (
                <img 
                  src={artist.profileImage} 
                  alt={artist.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full gradient-primary opacity-40 flex items-center justify-center">
                  <span className="text-6xl font-heading font-bold text-foreground">
                    {artist.name.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="font-heading text-4xl font-bold text-foreground">
                  {artist.name}
                </h1>
                {user && (
                  <Button
                    onClick={() => id && toggleLikeArtist(id)}
                    variant={isFollowing ? "secondary" : "default"}
                    className="flex-shrink-0"
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
                {artist.bio}
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
