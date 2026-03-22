import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Sparkles, TrendingUp, Heart, Shuffle, Filter, Users, ArrowRight, Headphones, Music, Flame, HardDrive } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CATALOGS, SONGS, GENRES, Genre, type Catalog } from '@/data/musicData';
import { useTodayHotSongs } from '@/hooks/usePopularity';
import { CatalogCard } from '@/components/CatalogCard';
import { CatalogGrid } from '@/components/CatalogGrid';
import { SongCard } from '@/components/SongCard';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { getLikedSongs } from '@/lib/localDb';
import { useSafePlayerState } from '@/context/PlayerContext';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const NEW_SONG_WINDOW_MS = 1000 * 60 * 60 * 24 * 5;

function isCatalogNew(catalog: { addedAt?: string }) {
  if (!catalog.addedAt) return false;
  const ts = new Date(catalog.addedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < NEW_SONG_WINDOW_MS;
}

// Hook to get user's liked songs for recommendations
function useUserLikes() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-likes', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return getLikedSongs(user.id);
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });
}

export default function Discover() {
  const [selectedGenre, setSelectedGenre] = useState<Genre | 'all'>('all');
  const [sortMode, setSortMode] = useState<'trending' | 'newest' | 'mostPlayed' | 'mostLiked'>('trending');
  const [showFilters, setShowFilters] = useState(true);
  const { data: todayHotSongs = [] } = useTodayHotSongs(5);
  const playerState = useSafePlayerState();
  const { data: likedSongIds = [] } = useUserLikes();
  const { isSongCached } = useOfflineAudio();
  const catalogs = useMemo(() => CATALOGS, []);

  // Get user's preferred genres based on likes
  const preferredGenres = useMemo(() => {
    const genreCounts: Record<Genre, number> = {
      Trap: 0,
      Afro: 0,
      Dancehall: 0,
      'Kalind-Rock': 0,
      'Kali-Funk': 0,
      'ZamRock-Fusion': 0,
      'Afro-Dancehall': 0,
      Alternative: 0,
      'Pop-Dancehall': 0,
    };

    likedSongIds.forEach(songId => {
      const song = SONGS.find(s => s.id === songId);
      if (song) {
        genreCounts[song.genre]++;
      }
    });

    return Object.entries(genreCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre as Genre);
  }, [likedSongIds]);

  const newReleases = useMemo(
    () =>
      [...catalogs]
        .sort((a, b) => {
          const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
          const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 5),
    [catalogs],
  );

  const catalogBySongId = useMemo(() => {
    const map = new Map<string, Catalog>();
    catalogs.forEach((catalog) => {
      catalog.songIds.forEach((id) => map.set(id, catalog));
    });
    return map;
  }, [catalogs]);

  const recommendedCatalogs = useMemo(() => {
    if (preferredGenres.length === 0) {
      return [...catalogs].sort((a, b) => b.totalPlays - a.totalPlays).slice(0, 6);
    }

    const catalogSet = new Map<string, Catalog>();
    preferredGenres.forEach((genre) => {
      catalogs
        .filter((catalog) => catalog.genre === genre)
        .forEach((catalog) => catalogSet.set(catalog.id, catalog));
    });

    return Array.from(catalogSet.values())
      .sort((a, b) => b.totalPlays - a.totalPlays)
      .slice(0, 6);
  }, [catalogs, preferredGenres]);

  const filteredCatalogs = useMemo(() => {
    if (selectedGenre === 'all') return catalogs;
    return catalogs.filter((catalog) => catalog.genre === selectedGenre);
  }, [catalogs, selectedGenre]);

  const sortedCatalogs = useMemo(() => {
    const items = [...filteredCatalogs];
    if (items.length === 0) return items;

    if (sortMode === 'newest') {
      return items.sort((a, b) => {
        const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (sortMode === 'mostPlayed') {
      return items.sort((a, b) => {
        if (a.totalPlays !== b.totalPlays) return b.totalPlays - a.totalPlays;
        return b.totalLikes - a.totalLikes;
      });
    }

    if (sortMode === 'mostLiked') {
      return items.sort((a, b) => {
        if (a.totalLikes !== b.totalLikes) return b.totalLikes - a.totalLikes;
        return b.totalPlays - a.totalPlays;
      });
    }

    return items.sort((a, b) => {
      const scoreA = a.totalPlays + a.totalLikes;
      const scoreB = b.totalPlays + b.totalLikes;
      return scoreB - scoreA;
    });
  }, [filteredCatalogs, sortMode]);

  const shuffledCatalogs = useMemo(() => {
    return [...catalogs].sort(() => Math.random() - 0.5).slice(0, 3);
  }, [catalogs]);

  const getGenreColor = (genre: Genre) => {
    const colors: Record<Genre, string> = {
      Trap: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      Afro: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      Reggae: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      RnB: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      Dancehall: 'bg-green-500/20 text-green-400 border-green-500/30',
      'Kalind-Rock': 'bg-red-500/20 text-red-400 border-red-500/30',
      'Kali-Funk': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      'ZamRock-Fusion': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      'Afro-Dancehall': 'bg-lime-500/20 text-lime-400 border-lime-500/30',
      Alternative: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      'Pop-Dancehall': 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    };
    return colors[genre] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  return (
    <div className="min-h-screen bg-background pb-24 relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="container mx-auto px-4 py-8 relative z-10">
        {playerState?.isRoomMode && playerState.currentSong && (
          <div className="mb-6">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-3 sm:gap-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-black/40 overflow-hidden flex-shrink-0">
                {playerState.currentSong.coverImage ? (
                  <img
                    src={playerState.currentSong.coverImage}
                    alt={playerState.currentSong.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-primary mb-0.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span>Now Playing in The Room</span>
                  </span>
                  {playerState.currentSong && isSongCached(playerState.currentSong.id) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5">
                      <HardDrive className="w-3 h-3" />
                      <span>Saved offline</span>
                    </span>
                  )}
                </div>
                <div className="text-sm sm:text-base font-medium text-foreground truncate">
                  {playerState.currentSong.title}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground truncate">
                  {playerState.currentSong.artist}
                </div>
              </div>
              <Link to="/room" className="flex-shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs sm:text-sm px-3 py-1.5"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Jump into Room</span>
                </button>
              </Link>
            </div>
          </div>
        )}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl glass-card p-4 sm:p-6 md:p-8 shine-overlay">
            <div className="absolute -top-16 -right-10 w-40 h-40 opacity-40">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, hsl(var(--primary) / 0.8) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
                animate={{ scale: [1, 1.1, 1], x: [0, 10, 0], y: [0, -10, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-xl gradient-primary shadow-glow-intense">
                    <Compass className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
                    Discover
                  </h1>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
                  Explore new music, filter by genre, and get personalized recommendations
                  based on what you actually like.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm">
                  <Sparkles className="w-3.5 h-3.5" />
                  Discovery mode
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs sm:text-sm">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Live taste signals
                </span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Hot Today - Top 5 */}
        {todayHotSongs.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mb-8"
          >
            <div className="relative glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 shine-overlay overflow-hidden">
              <div className="pointer-events-none absolute -inset-x-10 -top-12 h-20 bg-gradient-to-r from-sky-500/35 via-cyan-400/20 to-transparent blur-3xl opacity-70" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                        Hot Today
                      </h2>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Most played songs since midnight across the town square.
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-xs text-sky-300">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                      <span>Live Heat</span>
                    </span>
                  </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto pr-2">
                  <div className="space-y-3">
                    {todayHotSongs.map(({ song, playsToday }, index) => (
                      <div key={song.id} className="space-y-1">
                        <SongCard song={song} index={index} variant="compact" />
                        <div className="text-[10px] sm:text-xs text-muted-foreground px-1 flex items-center gap-2">
                          <span>{playsToday.toLocaleString()} plays today</span>
                          {playerState?.currentSong && playerState.currentSong.id === song.id && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-semibold uppercase text-sky-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                              Now Playing
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Meet the Artists CTA */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <Link to="/artists">
            <motion.div
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.99 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20 border border-primary/20 p-6 cursor-pointer group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/20 border border-primary/30">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                      Meet the Artists
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Discover talented creators on $ongChainn
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-primary">
                  <span className="text-sm font-medium hidden sm:block">View All</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.div>
          </Link>
        </motion.section>

        {newReleases.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mb-8"
          >
            <div className="relative glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 shine-overlay overflow-hidden">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div>
                  <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span>New Releases</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Fresh catalogs landing in the town square.
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs text-primary">
                  <Music className="w-4 h-4" />
                  <span>{newReleases.length} catalogs</span>
                </div>
                </div>
              <div className="max-h-[420px] overflow-y-auto pr-2">
                <CatalogGrid>
                  {newReleases.map((catalog) => (
                    <CatalogCard key={catalog.id} catalog={catalog} isNew={isCatalogNew(catalog)} />
                  ))}
                </CatalogGrid>
              </div>
            </div>
          </motion.section>
        )}

        {/* Genre Filters */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Filter by Genre</span>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showFilters ? 'Hide' : 'Show'}
            </button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2"
              >
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedGenre('all')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedGenre === 'all'
                      ? 'gradient-primary text-primary-foreground shadow-glow'
                      : 'glass text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Genres
                </motion.button>
                {GENRES.map((genre) => (
                  <motion.button
                    key={genre}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedGenre(genre)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                      selectedGenre === genre
                        ? getGenreColor(genre)
                        : 'glass text-muted-foreground hover:text-foreground border-transparent'
                    }`}
                  >
                    {genre}
                    {preferredGenres.includes(genre) && (
                      <Heart className="w-3 h-3 ml-1.5 inline fill-current" />
                    )}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-10">
            {/* For You - Personalized Recommendations */}
            <motion.section
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              <div className="relative glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 md:p-6 shine-overlay overflow-hidden">
                <div className="pointer-events-none absolute -inset-x-10 -top-12 h-20 bg-gradient-to-r from-primary/35 via-cyan-400/20 to-emerald-400/25 blur-3xl opacity-60" />
                <div className="relative z-10">
                  <motion.div variants={itemVariants} className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-xl font-semibold text-foreground">For You</h2>
                      {preferredGenres.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          Based on your {preferredGenres[0]} likes
                        </Badge>
                      )}
                    </div>
                    <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="w-3.5 h-3.5 text-primary" />
                      <span>Personalized catalogs</span>
                    </div>
                  </motion.div>
                  <div className="max-h-[420px] overflow-y-auto pr-2">
                    <CatalogGrid>
                      {recommendedCatalogs.map((catalog) => (
                        <CatalogCard key={catalog.id} catalog={catalog} />
                      ))}
                    </CatalogGrid>
                  </div>
                  {recommendedCatalogs.length === 0 && (
                    <motion.p variants={itemVariants} className="text-muted-foreground text-sm py-4">
                      Like some songs to get personalized recommendations!
                    </motion.p>
                  )}
                </div>
              </div>
            </motion.section>

            {/* Filtered Catalogs / All Catalogs */}
            <motion.section
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              <div className="relative glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 md:p-6 shine-overlay overflow-hidden">
                <div className="pointer-events-none absolute -inset-x-10 -top-12 h-20 bg-gradient-to-r from-primary/30 via-purple-500/25 to-cyan-400/30 blur-3xl opacity-70" />
                <div className="relative z-10">
                  <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-xl font-semibold text-foreground">
                        {selectedGenre === 'all' ? 'Trending Now' : selectedGenre}
                      </h2>
                      <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                        <Music className="w-3.5 h-3.5 text-primary" />
                        <span>{filteredCatalogs.length} catalogs</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs">
                      <span className="hidden sm:inline text-muted-foreground">Sort</span>
                      <button
                        type="button"
                        onClick={() => setSortMode('trending')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                          sortMode === 'trending'
                            ? 'border border-primary/50 bg-primary/15 text-primary shadow-soft'
                            : 'border border-border/40 bg-background/40 text-muted-foreground hover:bg-background/80 hover:text-foreground/90'
                        }`}
                      >
                        Trending
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortMode('newest')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                          sortMode === 'newest'
                            ? 'border border-primary/50 bg-primary/15 text-primary shadow-soft'
                            : 'border border-border/40 bg-background/40 text-muted-foreground hover:bg-background/80 hover:text-foreground/90'
                        }`}
                      >
                        Newest
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortMode('mostPlayed')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all hidden md:inline-flex ${
                          sortMode === 'mostPlayed'
                            ? 'border border-primary/50 bg-primary/15 text-primary shadow-soft'
                            : 'border border-border/40 bg-background/40 text-muted-foreground hover:bg-background/80 hover:text-foreground/90'
                        }`}
                      >
                        Plays
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortMode('mostLiked')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all hidden md:inline-flex ${
                          sortMode === 'mostLiked'
                            ? 'border border-primary/50 bg-primary/15 text-primary shadow-soft'
                            : 'border border-border/40 bg-background/40 text-muted-foreground hover:bg-background/80 hover:text-foreground/90'
                        }`}
                      >
                        Likes
                      </button>
                    </div>
                  </motion.div>

                  <div className="max-h-[520px] overflow-y-auto pr-2">
                    <AnimatePresence mode="popLayout">
                      <CatalogGrid>
                        {sortedCatalogs.map((catalog) => (
                          <motion.div
                            key={catalog.id}
                            variants={itemVariants}
                            initial="hidden"
                            animate="show"
                            exit={{ opacity: 0, x: -20 }}
                            layout
                          >
                            <CatalogCard catalog={catalog} />
                          </motion.div>
                        ))}
                      </CatalogGrid>
                    </AnimatePresence>
                  </div>

                  {sortedCatalogs.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12"
                    >
                      <p className="text-muted-foreground">No catalogs in this genre yet</p>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.section>
          </div>

          {/* Sidebar */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* Shuffle Discovery */}
            <div className="glass-card rounded-3xl p-6 shine-overlay">
              <div className="flex items-center gap-2 mb-4">
                <Shuffle className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-semibold text-foreground">Surprise Me</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Random catalog picks to discover something new
              </p>
              <div className="space-y-2">
                {shuffledCatalogs.map((catalog) => (
                  <Link
                    key={catalog.id}
                    to={`/catalog/${catalog.id}`}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    <img
                      src={catalog.coverImage}
                      alt={catalog.title}
                      className="w-10 h-10 rounded-lg object-cover"
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{catalog.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{catalog.artist}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${getGenreColor(catalog.genre)}`}>
                      {catalog.genre}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>

            {/* Genre Stats */}
            <div className="glass-card rounded-3xl p-6 shine-overlay">
              <h3 className="font-heading font-semibold text-foreground mb-4">Genre Overview</h3>
              <div className="space-y-3">
                {GENRES.map((genre) => {
                  const count = catalogs.filter((catalog) => catalog.genre === genre).length;
                  const percentage = catalogs.length > 0 ? (count / catalogs.length) * 100 : 0;
                  return (
                    <div key={genre}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-foreground">{genre}</span>
                        <span className="text-xs text-muted-foreground">{count} catalogs</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, delay: 0.2 }}
                          className={`h-full rounded-full ${getGenreColor(genre).split(' ')[0]}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Your Taste */}
            {preferredGenres.length > 0 && (
              <div className="glass-card rounded-3xl p-6 shine-overlay">
                <div className="flex items-center gap-2 mb-4">
                  <Heart className="w-5 h-5 text-primary fill-primary" />
                  <h3 className="font-heading font-semibold text-foreground">Your Taste</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Based on the songs you've liked
                </p>
                <div className="flex flex-wrap gap-2">
                  {preferredGenres.map((genre, index) => (
                    <Badge
                      key={genre}
                      variant="outline"
                      className={`${getGenreColor(genre as Genre)} ${index === 0 ? 'border-2' : ''}`}
                    >
                      {index === 0 && <span className="mr-1">👑</span>}
                      {genre}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </motion.aside>
        </div>

        <motion.footer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-10 sm:mt-12 mb-2"
        >
          <div className="glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-7 shine-overlay relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 opacity-25">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(var(--primary) / 0.7) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
                animate={{ scale: [1, 1.1, 1], x: [0, 8, 0], y: [0, -6, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="absolute -bottom-16 -left-10 w-40 h-40 opacity-20">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(210 100% 70% / 0.7) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
              <div className="space-y-2 sm:space-y-3 max-w-xl">
                <p className="text-xs sm:text-sm uppercase tracking-wide text-primary font-semibold flex items-center gap-2">
                  <Compass className="w-4 h-4" />
                  <span>Keep exploring</span>
                </p>
                <h2 className="font-heading text-lg sm:text-xl md:text-2xl font-semibold text-foreground">
                  Shuffle the catalog, follow your taste, and let new sounds find you.
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Use genres, For You picks, and surprise cards to map out your corner of $ongChainn.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Link to="/">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto gap-2 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>Back Home</span>
                  </Button>
                </Link>
                <Link to="/about">
                  <Button className="w-full sm:w-auto gradient-primary text-primary-foreground shadow-glow gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span>About $ongChainn</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.footer>
      </main>

      <AudioPlayer />
    </div>
  );
}
