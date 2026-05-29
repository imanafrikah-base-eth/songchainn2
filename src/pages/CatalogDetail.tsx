import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Pause, Heart, Music } from 'lucide-react';
import { CATALOGS, SONGS, ARTISTS, type Song } from '@/data/musicData';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SongCard } from '@/components/SongCard';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';

export default function CatalogDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentSong, isPlaying } = usePlayerState();
  const { playQueue, togglePlay } = usePlayerActions();
  const { toggleSaveCatalog, isCatalogSaved } = useAudienceInteractions();

  const catalog = useMemo(() => CATALOGS.find((item) => item.id === id), [id]);
  const artist = useMemo(() => (catalog ? ARTISTS.find((item) => item.id === catalog.artistId) : null), [catalog]);
  const songs = useMemo(() => {
    if (!catalog) return [];
    return catalog.songIds
      .map((songId) => SONGS.find((song) => song.id === songId))
      .filter(Boolean) as Song[];
  }, [catalog]);

  const isCurrentCatalog = Boolean(currentSong && catalog?.songIds.includes(currentSong.id));
  const isSaved = Boolean(catalog && isCatalogSaved(catalog.id));

  if (!catalog) {
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
          <h1 className="text-2xl font-heading font-bold text-foreground mb-3">Catalog Not Found</h1>
          <p className="text-muted-foreground mb-6">
            We couldn't find this catalog. It may have been moved or the link might be incorrect.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild>
              <Link to="/">Browse Catalogs</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/artists">View Artists</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="w-64 h-64 md:w-72 md:h-72 rounded-2xl bg-secondary overflow-hidden flex-shrink-0 shadow-float">
              {catalog.coverImage ? (
                <img
                  src={catalog.coverImage}
                  alt={catalog.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full gradient-primary opacity-40 flex items-center justify-center">
                  <Music className="w-20 h-20 text-foreground/50" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wide">Catalog</p>
              <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground mb-4">
                {catalog.title}
              </h1>

              {artist && (
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
              )}

              <div className="flex items-center gap-6 mb-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Heart className="w-5 h-5" />
                  <span className="text-lg font-medium">{catalog.totalLikes.toLocaleString()} likes</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Music className="w-5 h-5" />
                  <span className="text-lg font-medium">{catalog.trackCount} tracks</span>
                </div>
              </div>

              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <span className="text-sm text-primary font-medium">{catalog.genre}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Button
                  onClick={() => {
                    if (!songs.length) return;
                    if (isCurrentCatalog) {
                      togglePlay();
                    } else {
                      playQueue(songs, { startIndex: 0 });
                    }
                  }}
                  size="lg"
                  className="gap-2 gradient-primary shadow-glow"
                >
                  {isCurrentCatalog && isPlaying ? (
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
                  variant="outline"
                  size="lg"
                  className={isSaved ? 'text-primary border-primary/40' : undefined}
                  onClick={() => toggleSaveCatalog(catalog.id)}
                >
                  {isSaved ? 'Saved' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3"
        >
          <ScrollArea className="max-h-[480px] pr-2">
            <div className="space-y-3">
              {songs.map((song, index) => (
                <SongCard key={song.id} song={song} index={index} variant="compact" />
              ))}
            </div>
          </ScrollArea>
        </motion.section>
      </main>

      <AudioPlayer />
    </div>
  );
}
