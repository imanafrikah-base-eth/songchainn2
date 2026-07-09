import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Pause, Heart, Music, ListMusic, Lock, Globe } from 'lucide-react';
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
import { useMemo, useEffect, useCallback, useState } from 'react';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function SongDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentSong, isPlaying } = usePlayerState();
  const { playSong, togglePlay } = usePlayerActions();
  const { toggleLike, isLiked } = useEngagement();
  const { data: popularityData } = useSongPopularity();
  const { playlists, addSongToPlaylist, createPlaylist } = useAudienceInteractions();

  const [isPlaylistDialogOpen, setIsPlaylistDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');
  const [newPlaylistIsPublic, setNewPlaylistIsPublic] = useState(false);
  const [isSubmittingPlaylist, setIsSubmittingPlaylist] = useState(false);

  const { songs: publishedSongs, artists: publishedArtists } = usePublishedCatalog();
  const song = SONGS.find(s => s.id === id) ?? publishedSongs.find(s => s.id === id);
  const artist = song ? (ARTISTS.find(a => a.id === song.artistId) ?? publishedArtists.find(a => a.id === song.artistId)) : null;
  const isCurrentSong = currentSong?.id === song?.id;
  const liked = song ? isLiked(song.id) : false;
  const { coinAddress } = useSongOwnership(song?.id ?? '');

  const handleAddToExistingPlaylist = useCallback(async (playlistId: string) => {
    if (!song || isSubmittingPlaylist) return;
    setIsSubmittingPlaylist(true);
    try {
      await addSongToPlaylist(playlistId, song.id);
      setIsPlaylistDialogOpen(false);
    } finally {
      setIsSubmittingPlaylist(false);
    }
  }, [addSongToPlaylist, isSubmittingPlaylist, song]);

  const handleCreatePlaylistAndAdd = useCallback(async () => {
    if (!song || !newPlaylistName.trim() || isSubmittingPlaylist) return;
    setIsSubmittingPlaylist(true);
    try {
      const playlist = await createPlaylist(
        newPlaylistName.trim(),
        newPlaylistDescription.trim() || undefined,
        newPlaylistIsPublic,
      );
      if (playlist) {
        await addSongToPlaylist(playlist.id, song.id);
        setIsPlaylistDialogOpen(false);
        setNewPlaylistName('');
        setNewPlaylistDescription('');
        setNewPlaylistIsPublic(false);
      }
    } finally {
      setIsSubmittingPlaylist(false);
    }
  }, [
    addSongToPlaylist,
    createPlaylist,
    newPlaylistDescription,
    newPlaylistIsPublic,
    newPlaylistName,
    isSubmittingPlaylist,
    song,
  ]);

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
        document.title = '$ongChainn â€” Audience-First Music Streaming';
      };
    }
  }, [song, artist]);

  // Get real stats from database
  const songStats = useMemo(() => {
    if (!song) return { likes: 0 };
    const data = popularityData?.find(p => p.song_id === song.id);
    return {
      likes: data?.like_count || 0,
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
                <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground">
                  {song.title}
                </h1>
                {song.isTokenGated && (
                  <Link
                    to="/marketplace"
                    className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 text-primary text-xs px-3 py-1 font-medium"
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
                  {artist.name}
                </span>
              </Link>

              {coinAddress && (
                <div className="mb-6">
                  <OnchainVerifiedBadge coinAddress={coinAddress} size="md" />
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-6 mb-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Heart className="w-5 h-5" />
                  <span className="text-lg font-medium">{songStats.likes.toLocaleString()} likes</span>
                </div>
              </div>

              {/* Genre Badge */}
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <span className="text-sm text-primary font-medium">{song.genre}</span>
              </div>

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

        {/* Comments Section */}
        <SongComments songId={song.id} songTitle={song.title} artistName={artist.name} />

        {/* More from Artist */}
        {moreSongs.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                More from {artist.name}
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

      <Dialog open={isPlaylistDialogOpen} onOpenChange={setIsPlaylistDialogOpen}>
        <DialogContent className="max-w-sm w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Add to playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {playlists.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Choose one of your playlists
                </p>
                <ScrollArea className="max-h-48 pr-2">
                  <div className="space-y-2">
                    {playlists.map((playlist) => (
                      <Button
                        key={playlist.id}
                        type="button"
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => void handleAddToExistingPlaylist(playlist.id)}
                        disabled={isSubmittingPlaylist}
                      >
                        <span className="truncate">{playlist.name}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
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
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-playlist-name">Or create a new playlist</Label>
              <Input
                id="new-playlist-name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                maxLength={80}
                placeholder="Give your playlist a name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-playlist-description">Description</Label>
              <Textarea
                id="new-playlist-description"
                value={newPlaylistDescription}
                onChange={(e) => setNewPlaylistDescription(e.target.value)}
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
                  variant={newPlaylistIsPublic ? 'ghost' : 'default'}
                  className="flex-1"
                  onClick={() => setNewPlaylistIsPublic(false)}
                >
                  <Lock className="w-4 h-4 mr-1" />
                  Private
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={newPlaylistIsPublic ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setNewPlaylistIsPublic(true)}
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
              onClick={() => setIsPlaylistDialogOpen(false)}
              disabled={isSubmittingPlaylist}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreatePlaylistAndAdd()}
              disabled={!newPlaylistName.trim() || isSubmittingPlaylist}
            >
              Save to playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AudioPlayer />
    </div>
  );
}
