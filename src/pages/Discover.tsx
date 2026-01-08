import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Sparkles, TrendingUp, Heart, Shuffle, Filter, Users, ArrowRight, Headphones, Music } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SONGS, GENRES, Genre } from '@/data/musicData';
import { useRankedSongs } from '@/hooks/usePopularity';
import { SongCard } from '@/components/SongCard';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { getLikedSongs } from '@/lib/localDb';
import { useSafePlayerState } from '@/context/PlayerContext';

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
  const [showFilters, setShowFilters] = useState(true);
  const { rankedSongs } = useRankedSongs();
  const playerState = useSafePlayerState();
  const { data: likedSongIds = [] } = useUserLikes();

  // Get user's preferred genres based on likes
  const preferredGenres = useMemo(() => {
    const genreCounts: Record<Genre, number> = {
      'Trap': 0,
      'Afro': 0,
      'Dancehall': 0,
      'Kalind-Rock': 0,
      'Kali-Funk': 0,
      'ZamRock-Fusion': 0,
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

  // Filter songs by selected genre
  const filteredSongs = useMemo(() => {
    if (selectedGenre === 'all') return rankedSongs;
    return rankedSongs.filter(song => song.genre === selectedGenre);
  }, [rankedSongs, selectedGenre]);

  // Personalized recommendations based on liked genres
  const recommendedSongs = useMemo(() => {
    if (preferredGenres.length === 0) {
      // If no likes, show top trending songs
      return rankedSongs.slice(0, 3);
    }

    // Prioritize songs from preferred genres that user hasn't liked yet
    const unlikedSongs = rankedSongs.filter(song => !likedSongIds.includes(song.id));
    const recommended = unlikedSongs
      .sort((a, b) => {
        const aGenreIndex = preferredGenres.indexOf(a.genre);
        const bGenreIndex = preferredGenres.indexOf(b.genre);
        // Songs from preferred genres come first
        if (aGenreIndex !== -1 && bGenreIndex === -1) return -1;
        if (aGenreIndex === -1 && bGenreIndex !== -1) return 1;
        if (aGenreIndex !== -1 && bGenreIndex !== -1) return aGenreIndex - bGenreIndex;
        return 0;
      })
      .slice(0, 3);

    return recommended.length > 0 ? recommended : rankedSongs.slice(0, 3);
  }, [rankedSongs, preferredGenres, likedSongIds]);

  // Get a random selection for "shuffle" discovery
  const shuffledSongs = useMemo(() => {
    return [...rankedSongs].sort(() => Math.random() - 0.5).slice(0, 4);
  }, [rankedSongs]);

  const getGenreColor = (genre: Genre) => {
    const colors: Record<Genre, string> = {
      'Trap': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'Afro': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'Dancehall': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Kalind-Rock': 'bg-red-500/20 text-red-400 border-red-500/30',
      'Kali-Funk': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      'ZamRock-Fusion': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    };
    return colors[genre];
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
                <div className="flex items-center gap-1 text-[11px] sm:text-xs text-primary mb-0.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span>Now Playing in The Room</span>
                  </span>
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
                  {recommendedSongs.length > 0 && (
                    <motion.div
                      variants={itemVariants}
                      className="flex items-center gap-2 mb-4"
                    >
                      {recommendedSongs.slice(0, 3).map((song) => (
                        <div
                          key={song.id}
                          className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-black/40 border border-white/10"
                        >
                          <img
                            src={song.coverImage}
                            alt={song.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        </div>
                      ))}
                    </motion.div>
                  )}
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
                      <span>Personalized picks</span>
                    </div>
                  </motion.div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {recommendedSongs.map((song, index) => (
                      <motion.div key={song.id} variants={itemVariants}>
                        <SongCard song={song} index={index} variant="compact" />
                      </motion.div>
                    ))}
                  </div>
                  {recommendedSongs.length === 0 && (
                    <motion.p variants={itemVariants} className="text-muted-foreground text-sm py-4">
                      Like some songs to get personalized recommendations!
                    </motion.p>
                  )}
                </div>
              </div>
            </motion.section>

            {/* Filtered Songs / All Songs */}
            <motion.section
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              <div className="relative glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 md:p-6 shine-overlay overflow-hidden">
                <div className="pointer-events-none absolute -inset-x-10 -top-12 h-20 bg-gradient-to-r from-primary/30 via-purple-500/25 to-cyan-400/30 blur-3xl opacity-70" />
                <div className="relative z-10">
                  {filteredSongs.length > 0 && (
                    <motion.div
                      variants={itemVariants}
                      className="flex items-center gap-2 mb-4"
                    >
                      {filteredSongs.slice(0, 3).map((song) => (
                        <div
                          key={song.id}
                          className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-black/40 border border-white/10"
                        >
                          <img
                            src={song.coverImage}
                            alt={song.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        </div>
                      ))}
                    </motion.div>
                  )}
                  <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-xl font-semibold text-foreground">
                        {selectedGenre === 'all' ? 'Trending Now' : selectedGenre}
                      </h2>
                      <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                        <Music className="w-3.5 h-3.5 text-primary" />
                        <span>{filteredSongs.length} songs</span>
                      </span>
                    </div>
                  </motion.div>

                  <AnimatePresence mode="popLayout">
                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                      {filteredSongs.map((song, index) => (
                        <motion.div
                          key={song.id}
                          variants={itemVariants}
                          initial="hidden"
                          animate="show"
                          exit={{ opacity: 0, x: -20 }}
                          layout
                        >
                          <SongCard song={song} index={index} variant="compact" />
                        </motion.div>
                      ))}
                    </div>
                  </AnimatePresence>

                  {filteredSongs.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12"
                    >
                      <p className="text-muted-foreground">No songs in this genre yet</p>
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
                Random picks to discover something new
              </p>
              <div className="space-y-2">
                {shuffledSongs.slice(0, 3).map((song) => (
                  <div
                    key={song.id}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => {
                      // Could trigger play here
                    }}
                  >
                    <img
                      src={song.coverImage}
                      alt={song.title}
                      className="w-10 h-10 rounded-lg object-contain"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${getGenreColor(song.genre)}`}>
                      {song.genre}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Genre Stats */}
            <div className="glass-card rounded-3xl p-6 shine-overlay">
              <h3 className="font-heading font-semibold text-foreground mb-4">Genre Overview</h3>
              <div className="space-y-3">
                {GENRES.map((genre) => {
                  const count = SONGS.filter(s => s.genre === genre).length;
                  const percentage = (count / SONGS.length) * 100;
                  return (
                    <div key={genre}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-foreground">{genre}</span>
                        <span className="text-xs text-muted-foreground">{count} songs</span>
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
