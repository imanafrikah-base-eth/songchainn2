import { useParams, Link } from 'react-router-dom';
import { ArtistName } from '@/components/ArtistName';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Pause, Heart, Music, ListMusic, ListPlus, Clock, Headphones } from 'lucide-react';
import { SONGS, ARTISTS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { usePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { useEngagement } from '@/context/EngagementContext';
import { useSongPopularity } from '@/hooks/usePopularity';
import { useSongOwnership } from '@/hooks/useSongOwnership';
import { cn } from '@/lib/utils';
import { SongCard } from '@/components/SongCard';
import { SongComments } from '@/components/SongComments';
import { ShareSongButton } from '@/components/ShareSongButton';
import { OnchainVerifiedBadge } from '@/components/OnchainVerifiedBadge';
import { SongInfoSections } from '@/components/song/SongInfoSections';
import { SongActivity } from '@/components/song/SongActivity';
import { AddToPlaylistDialog } from '@/components/song/AddToPlaylistDialog';
import { earnedPlacement } from '@/lib/placement';
import { useSongDetails } from '@/lib/songDetails';
import { toast } from '@/hooks/use-toast';
import { useMemo, useEffect, useCallback, useState } from 'react';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins + ':' + secs.toString().padStart(2, '0');
}

export default function SongDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentSong, isPlaying } = usePlayerState();
  const { playSong, togglePlay, addToQueue } = usePlayerActions();
  const { toggleLike, isLiked } = useEngagement();
  const { data: popularityData } = useSongPopularity();

  const [isPlaylistDialogOpen, setIsPlaylistDialogOpen] = useState(false);

  const { songs: publishedSongs, artists: publishedArtists } = usePublishedCatalog();
  const song = SONGS.find(s => s.id === id) ?? publishedSongs.find(s => s.id === id);
  const artist = song ? (ARTISTS.find(a => a.id === song.artistId) ?? publishedArtists.find(a => a.id === song.artistId)) : null;
  const isCurrentSong = currentSong?.id === song?.id;
  const liked = song ? isLiked(song.id) : false;
  const { coinAddress } = useSongOwnership(song?.id ?? '');
  // The record's facts (the explicit flag among them) come from song_details.
  const { data: songDetails } = useSongDetails(song?.id ?? '');
  const isExplicit = Boolean(songDetails?.explicit);
  // Song.duration is seconds. Songs without one (most of the catalog until the
  // catalog hook fills `duration`) simply do not show it.
  const durationSeconds = song && typeof song.duration === 'number' && Number.isFinite(song.duration) && song.duration > 0
    ? song.duration
    : null;

  const handleAddToQueue = useCallback(() => {
    if (!song) return;
    addToQueue(song);
    toast({ title: 'Added to queue', description: song.title + ' will play after the current queue.' });
  }, [addToQueue, song]);

  // Update document meta tags for sharing
  useEffect(() => {
    if (song && artist) {
      document.title = `${song.title} by ${artist.name} | $ongChainn`;
      
      // Update OG meta tags dynamically
      const updateMeta = (property: string, content: string) => {
        let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('property', property);
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
      };

      const updateMetaName = (name: string, content: string) => {
        let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', name);
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
      };

      const shareUrl = `${window.location.origin}/song/${song.id}`;
      const description = `Listen to "${song.title}" by ${artist.name} on $ongChainn and shape your discovery in real time.`;
      const imageUrl = song.coverImage || `${window.location.origin}/og.png`;

      updateMeta('og:title', `${song.title} - ${artist.name}`);
      updateMeta('og:description', description);
      updateMeta('og:url', shareUrl);
      updateMeta('og:image', imageUrl);
      updateMeta('og:type', 'music.song');

      updateMetaName('twitter:title', `${song.title} - ${artist.name}`);
      updateMetaName('twitter:description', description);
      updateMetaName('twitter:image', imageUrl);

      return () => {
        document.title = '$ongChainn. Own the music you love.';
      };
    }
  }, [song, artist]);

  // Get real stats from database
  const songStats = useMemo(() => {
    if (!song) return { likes: 0, plays: 0 };
    const data = popularityData?.find(p => p.song_id === song.id);
    return {
      likes: data?.like_count || 0,
      plays: data?.play_count || 0,
    };
  }, [popularityData, song]);

  // Get more songs from same artist
  const moreSongs = useMemo(() => {
    if (!song) return [];
    return SONGS.filter(s => s.artistId === song.artistId && s.id !== song.id).slice(0, 4);
  }, [song]);

  if (!song || !artist) {
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
          <h1 className="text-2xl font-heading font-bold text-foreground mb-3">Song Not Found</h1>
          <p className="text-muted-foreground mb-6">
            We couldn't find this song. It may have been removed or the link might be incorrect.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild>
              <Link to="/">Browse Music</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/artists">View Artists</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const handlePlay = () => {
    if (isCurrentSong) {
      togglePlay();
    } else {
      playSong(song);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 lg:pl-28 pt-4 sm:pt-6">
        {/* Back Button */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>

        {/* Song Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Cover Art */}
            <div className="w-64 h-64 md:w-72 md:h-72 rounded-2xl bg-secondary overflow-hidden flex-shrink-0 shadow-float">
              {song.coverImage ? (
                <img 
                  src={song.coverImage} 
                  alt={song.title}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full gradient-primary opacity-40 flex items-center justify-center">
                  <Music className="w-20 h-20 text-foreground/50" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wide">Song</p>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground">
                    {song.title}
                  </h1>
                  {(isExplicit || durationSeconds !== null) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {isExplicit && (
                        <span
                          className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                          title="Explicit content"
                        >
                          Explicit
                        </span>
                      )}
                      {durationSeconds !== null && (
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDuration(durationSeconds)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {song.isTokenGated && (
                  <Link
                    to="/marketplace"
                    className="inline-flex items-center rounded-full border border-border bg-primary/10 text-primary text-xs px-3 py-1 font-medium"
                  >
                    On-chain on Marketplace
                  </Link>
                )}
              </div>
              
              <Link 
                to={`/artist/${artist.id}`}
                className="inline-flex items-center gap-3 mb-6 group"
              >
                <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden">
                  {artist.profileImage ? (
                    <img src={artist.profileImage} alt={artist.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full gradient-primary opacity-40 flex items-center justify-center">
                      <span className="text-sm font-bold">{artist.name.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <span className="text-lg text-foreground group-hover:text-primary transition-colors">
                  <ArtistName name={artist.name} artistId={artist.id} size={14} />
                </span>
              </Link>

              {coinAddress && earnedPlacement(song) && (
                <div className="mb-6">
                  <OnchainVerifiedBadge coinAddress={coinAddress} size="md" />
                </div>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-6 mb-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Headphones className="w-5 h-5" />
                  <span className="text-lg font-medium tabular-nums">{songStats.plays.toLocaleString()} plays</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Heart className="w-5 h-5" />
                  <span className="text-lg font-medium tabular-nums">{songStats.likes.toLocaleString()} likes</span>
                </div>
              </div>

              {/* Genre Badge: opens Discover with this genre selected */}
              <Link
                to={'/discover?genre=' + encodeURIComponent(song.genre)}
                className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-border mb-6 transition-colors hover:bg-primary/20"
                aria-label={'Discover more ' + song.genre}
              >
                <span className="text-sm text-primary font-medium">{song.genre}</span>
              </Link>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  onClick={handlePlay}
                  size="lg"
                  className="gap-2 gradient-primary shadow-glow"
                >
                  {isCurrentSong && isPlaying ? (
                    <>
                      <Pause className="w-5 h-5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 ml-0.5" />
                      Play
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={handleAddToQueue}
                  variant="outline"
                  size="lg"
                  className="gap-2"
                >
                  <ListPlus className="w-5 h-5" />
                  Add to queue
                </Button>

                <Button
                  onClick={() => toggleLike(song.id)}
                  variant={liked ? "default" : "outline"}
                  size="lg"
                  className={cn("gap-2", liked && "bg-primary/20 text-primary border-primary/30")}
                >
                  <Heart className={cn("w-5 h-5", liked && "fill-current")} />
                  {liked ? 'Liked' : 'Like'}
                </Button>

                <ShareSongButton 
                  songId={song.id} 
                  songTitle={song.title} 
                  artistName={artist.name}
                  coverImage={song.coverImage}
                  variant="button"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  onClick={() => setIsPlaylistDialogOpen(true)}
                >
                  <ListMusic className="w-5 h-5" />
                  Add to playlist
                </Button>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Lyrics, credits, the record's facts, and the licensing door */}
        <SongInfoSections songId={song.id} />

        {/* What is happening to it, counted on the server */}
        <SongActivity songId={song.id} />

        {/* Comments Section */}
        <SongComments songId={song.id} songTitle={song.title} artistName={artist.name} />

        {/* More from Artist */}
        {moreSongs.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                More from <ArtistName name={artist.name} artistId={artist.id} size={14} />
              </h2>
              <Link 
                to={`/artist/${artist.id}`}
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {moreSongs.map((s, index) => (
                <SongCard key={s.id} song={s} index={index} />
              ))}
            </div>
          </section>
        )}
      </main>

      <AddToPlaylistDialog
        open={isPlaylistDialogOpen}
        onOpenChange={setIsPlaylistDialogOpen}
        songId={song.id}
      />

      <AudioPlayer />
    </div>
  );
}
