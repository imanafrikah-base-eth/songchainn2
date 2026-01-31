import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Sparkles, Headphones, Users, ArrowRight, Music, Coins, Home as HomeIcon, Flame, HardDrive } from 'lucide-react';
import { SONGS, ARTISTS } from '@/data/musicData';
import { useRankedSongs, useRankedArtists, useTodayHotSongs } from '@/hooks/usePopularity';
import { useAuth } from '@/context/AuthContext';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { useSafePlayerState, usePlayerTime } from '@/context/PlayerContext';
import { SongCard } from '@/components/SongCard';
import { ArtistCard } from '@/components/ArtistCard';
import { EngagementPanel } from '@/components/EngagementPanel';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { FeaturedTracksSection } from '@/components/FeaturedTracksSection';
import { DownloadAppBanner, getDeferredInstallPrompt, clearDeferredInstallPrompt } from '@/components/DownloadAppBanner';
import { UpdateAvailableBanner } from '@/components/UpdateAvailableBanner';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { LocationPrompt } from '@/components/LocationPrompt';
import { Button } from '@/components/ui/button';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';
import { toast } from '@/hooks/use-toast';
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const NEW_SONG_WINDOW_MS = 1000 * 60 * 60 * 24 * 5;

function isSongNew(song: { addedAt?: string }) {
  if (!song.addedAt) return false;
  const ts = new Date(song.addedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < NEW_SONG_WINDOW_MS;
}

export default function Home() {
  const { rankedSongs } = useRankedSongs();
  const { rankedArtists } = useRankedArtists();
  const { audienceProfile, refreshProfile, user } = useAuth();
  const { data: todayHotSongs = [] } = useTodayHotSongs(5);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const playerState = useSafePlayerState();
  const { currentTime } = usePlayerTime();
  const { cacheSong, isSongCached, cachingInProgress, isOnline, isInstalled } = useOfflineAudio();
  const roomOnlineCount = useRoomOnlineCount(user?.id, Boolean(playerState?.isRoomMode));
  
  const featuredSongs = rankedSongs.slice(0, 3);
  const allSongs = rankedSongs;
  const newSongs = rankedSongs.filter(isSongNew);
  const curatedHotTodayIds = ['86', '93', '57', '104', '84'];
  const curatedHotTodaySongs = curatedHotTodayIds
    .map(id => rankedSongs.find(song => song.id === id))
    .filter((song): song is typeof rankedSongs[number] => Boolean(song));
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const tomorrowMidnight = new Date(startOfToday);
  tomorrowMidnight.setDate(startOfToday.getDate() + 1);
  const useSampleHotToday = now < tomorrowMidnight;
  const sampleHotToday = curatedHotTodaySongs.map((song) => ({
    song,
    playsToday: song.plays || 0,
  }));
  const hotTodayEntries = useSampleHotToday ? sampleHotToday : todayHotSongs;
  const displayName =
    audienceProfile?.profile_name ||
    (user && typeof user.email === 'string'
      ? user.email.split('@')[0]
      : null);

  const allSongsCardRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: allSongsScrollProgress } = useScroll({
    target: allSongsCardRef,
    offset: ['start 0.9', 'end 0.1'],
  });
  const allSongsGlowY = useTransform(allSongsScrollProgress, [0, 1], [24, -24]);
  const allSongsGlowOpacity = useTransform(allSongsScrollProgress, [0, 1], [0.12, 0.35]);

  // Check if user needs to add location
  useEffect(() => {
    if (audienceProfile && !audienceProfile.location) {
      // Check if user has skipped recently (within last 24 hours)
      const skippedAt = localStorage.getItem('location_prompt_skipped');
      if (skippedAt) {
        const hoursSinceSkip = (Date.now() - parseInt(skippedAt)) / (1000 * 60 * 60);
        if (hoursSinceSkip < 24) {
          return; // Don't show again within 24 hours
        }
      }
      // Show prompt after a short delay
      const timer = setTimeout(() => setShowLocationPrompt(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [audienceProfile]);

  return (
    <div className="min-h-screen bg-background pb-24 relative">
      <AnimatedBackground variant="default" />
      <OfflineIndicator />
      <Navigation />
      <UpdateAvailableBanner />
      <DownloadAppBanner />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 relative z-10">
        {playerState?.isRoomMode && playerState.currentSong && (
          <div className="mb-4 sm:mb-6">
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
                <Button size="sm" className="text-xs sm:text-sm gap-1.5">
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Jump into Room</span>
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </div>
        )}
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="mb-6 sm:mb-12"
        >
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl glass-card p-4 sm:p-8 md:p-12 shine-overlay">
            {/* Animated gradient orb - smaller on mobile */}
            <div className="absolute top-0 right-0 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] opacity-30">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(217 91% 60% / 0.4) 0%, transparent 70%)',
                  filter: 'blur(60px)',
                }}
                animate={{
                  scale: [1, 1.2, 1],
                  x: [0, 30, 0],
                  y: [0, -20, 0],
                }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full glass text-xs font-medium text-primary mb-3 sm:mb-4"
              >
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Audience Edition</span>
              </motion.div>

              {displayName && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3"
                >
                  Hey {displayName}.
                </motion.p>
              )}

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="font-heading text-xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3 sm:mb-4 leading-tight"
              >
                Welcome to <span className="text-gradient">$ongChainn</span>
                <span className="block text-sm sm:text-base md:text-lg text-muted-foreground mt-2">
                  Your on-chain listening home for artists from Create On Base Local Town Squares around the world.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mb-3 sm:mb-4 leading-relaxed"
              >
                Think of this as your shared living room for onchain music.
                Settle in, explore the town squares, and let your listening build culture and future ownership.
              </motion.p>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <Link to="/room">
                  <motion.div
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    animate={{ boxShadow: ['0 0 0 0 rgba(16,185,129,0.4)', '0 0 40px 0 rgba(16,185,129,0.9)', '0 0 0 0 rgba(16,185,129,0.4)'] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="inline-block rounded-full"
                  >
                    <Button className="gradient-primary text-primary-foreground shadow-glow gap-2">
                      <Headphones className="w-4 h-4" />
                      <span>Enter The Room</span>
                      {roomOnlineCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/30 text-primary-foreground text-[10px] font-semibold px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Live now</span>
                        </span>
                      )}
                      {roomOnlineCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-black/25 text-primary-foreground text-[11px] font-semibold">
                          {roomOnlineCount}
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </motion.div>
                </Link>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex flex-wrap items-center gap-2 sm:gap-4"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl glass text-xs sm:text-sm">
                  <Headphones className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  <span className="text-foreground font-medium">{ARTISTS.length} Artists</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl glass text-xs sm:text-sm">
                  <span className="text-foreground font-medium">{SONGS.length} Songs</span>
                </div>
                <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-primary/10 text-primary text-xs sm:text-sm font-medium">
                  Zambia
                </div>
              </motion.div>
            </div>
          </div>
        </motion.section>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-8">
          {/* Main Content */}
          <motion.div
            className="lg:col-span-2 space-y-6 sm:space-y-12"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            <motion.section variants={itemVariants}>
              <div className="relative glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay overflow-hidden">
                  <motion.div
                    aria-hidden="true"
                    initial={{ opacity: 0.4, scale: 1 }}
                    animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.05, 1] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                    className="pointer-events-none absolute -inset-x-12 -top-20 h-28 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.7),_transparent_65%)] blur-3xl"
                  />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                          <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                            Hot Today
                          </h2>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          Most played songs since midnight on $ongChainn.
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 text-xs text-sky-300">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                          <span>Live Heat</span>
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:space-y-2 max-h-[360px] sm:max-h-[420px] overflow-y-auto pr-1">
                      {hotTodayEntries.map((entry, index) => {
                        const isCurrentSong = playerState?.currentSong?.id === entry.song.id;
                        const isSaved = isSongCached(entry.song.id);
                        const isSaving = cachingInProgress === entry.song.id;
                        const hasPlayedEnoughToSave = isCurrentSong && currentTime >= 20;

                        const handleKeepThis = async () => {
                          if (!isInstalled) {
                            const deferredPrompt = getDeferredInstallPrompt();
                            if (deferredPrompt) {
                              try {
                                deferredPrompt.prompt();
                                const { outcome } = await deferredPrompt.userChoice;
                                if (outcome === 'accepted') {
                                  toast({
                                    title: 'Installing $ongChainn...',
                                    description: 'The app will appear on your home screen shortly.',
                                  });
                                }
                              } finally {
                                clearDeferredInstallPrompt();
                              }
                            } else {
                              toast({
                                title: 'To keep songs on your device, add $ongChainn to your home screen.',
                              });
                            }
                            return;
                          }
                          if (!hasPlayedEnoughToSave) {
                            toast({
                              title: 'Play this song once to save it.',
                            });
                            return;
                          }
                          if (!isOnline) {
                            toast({
                              title: 'Offline – not saved',
                              description: 'Reconnect to save this song for offline playback.',
                            });
                            return;
                          }
                          if (isSaved || isSaving) return;
                          await cacheSong(entry.song.id, entry.song.audioUrl, {
                            title: entry.song.title,
                            artist: entry.song.artist,
                            duration: entry.song.duration,
                          });
                        };

                        return (
                          <div
                            key={entry.song.id}
                            className="relative rounded-xl sm:rounded-2xl p-[1.5px] bg-gradient-to-r from-sky-500/80 via-cyan-400/60 to-transparent"
                          >
                            <div className="flex items-center justify-between px-2 pt-2 pb-1">
                              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-sky-50/90">
                                <span className="px-1.5 py-0.5 rounded-full bg-black/40 font-semibold tabular-nums">
                                  #{index + 1}
                                </span>
                                <Flame className="w-3 h-3 text-sky-300" />
                                <span className="uppercase tracking-wide">Hot</span>
                                {isSaved && (
                                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/40 text-[9px] font-medium text-sky-100">
                                    <HardDrive className="w-3 h-3" />
                                    <span>Offline</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] sm:text-xs text-sky-50/85 tabular-nums">
                                {entry.playsToday.toLocaleString()} plays today
                              </span>
                            </div>
                            <div className="rounded-[0.85rem] sm:rounded-[1.1rem] bg-background/90">
                              <SongCard
                                song={entry.song}
                                index={index}
                                variant="compact"
                              />
                              <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  {isSaved
                                    ? 'Saved for offline'
                                    : isCurrentSong && hasPlayedEnoughToSave
                                      ? 'Tap to keep this on your device'
                                      : 'Play once to keep this offline'}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleKeepThis}
                                  disabled={isSaved || isSaving}
                                  className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 h-auto"
                                >
                                  {isSaved ? 'Saved' : isSaving ? 'Saving…' : 'Keep this'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
            </motion.section>

            <motion.section variants={itemVariants}>
              <div className="glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay border border-primary/20">
                <FeaturedTracksSection songs={featuredSongs} />
              </div>
            </motion.section>

            {newSongs.length > 0 && (
              <motion.section variants={itemVariants}>
                <div className="relative glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay overflow-hidden">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div>
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                        New Music
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Fresh drops from the town square, just arrived on $ongChainn.
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-xs text-primary">
                      <Sparkles className="w-4 h-4" />
                      <span>{newSongs.length} new tracks</span>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="space-y-1 sm:space-y-2 max-h-[360px] sm:max-h-[420px] overflow-y-auto pr-1">
                      {newSongs.map((song, index) => (
                        <SongCard
                          key={song.id}
                          song={song}
                          index={index}
                          variant="compact"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            {/* All Songs */}
            <motion.section variants={itemVariants}>
              <div
                ref={allSongsCardRef}
                className="relative glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay overflow-hidden"
              >
                <motion.div
                  aria-hidden="true"
                  style={{ y: allSongsGlowY, opacity: allSongsGlowOpacity }}
                  className="pointer-events-none absolute -inset-x-10 -top-16 h-24 bg-gradient-to-r from-primary/40 via-cyan-400/25 to-emerald-400/35 blur-3xl"
                />
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                    <div>
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                        All Songs
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Every track in $ongChainn, neatly stacked for deep listening.
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                      <Music className="w-4 h-4 text-primary" />
                      <span>{allSongs.length} tracks</span>
                    </div>
                  </div>
                  <div className="space-y-1 sm:space-y-2 max-h-[520px] sm:max-h-[600px] overflow-y-auto pr-1">
                    {allSongs.map((song, index) => (
                      <SongCard key={song.id} song={song} index={index} variant="compact" />
                    ))}
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Artists Preview - Ranked by popularity */}
            <motion.section variants={itemVariants}>
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">Top Artists</h2>
                <Link to="/artists">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-primary hover:text-primary/80 hover:bg-primary/10 gap-1.5 text-xs sm:text-sm"
                  >
                    <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Meet the Artists</span>
                    <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {rankedArtists.slice(0, 4).map((artist, index) => (
                  <ArtistCard key={artist.id} artist={artist} index={index} />
                ))}
              </div>
            </motion.section>

            {/* Marketplace CTA - Featured Ad Style */}
            <motion.section variants={itemVariants}>
              <Link to="/marketplace" className="block group">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-primary/40 hover:border-primary/60 transition-all duration-300">
                  {/* Animated gradient background */}
                  <div className="absolute inset-0 gradient-primary opacity-10 group-hover:opacity-20 transition-opacity" />
                  <div className="absolute top-0 right-0 w-64 h-64 opacity-40">
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'radial-gradient(circle, hsl(var(--primary) / 0.8) 0%, transparent 70%)',
                        filter: 'blur(60px)',
                      }}
                      animate={{ 
                        scale: [1, 1.4, 1],
                        x: [0, 20, 0],
                        y: [0, -10, 0]
                      }}
                      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                  <div className="absolute bottom-0 left-0 w-40 h-40 opacity-30">
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'radial-gradient(circle, hsl(217 91% 60% / 0.6) 0%, transparent 70%)',
                        filter: 'blur(40px)',
                      }}
                      animate={{ 
                        scale: [1, 1.2, 1],
                      }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                    />
                  </div>
                  
                  {/* Badge */}
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                    <span className="px-2 py-1 text-[10px] sm:text-xs font-semibold rounded-full bg-primary text-primary-foreground animate-pulse">
                      NEW
                    </span>
                  </div>
                  
                  <div className="relative z-10 p-5 sm:p-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                      {/* Icon */}
                      <div className="p-3 sm:p-4 rounded-2xl gradient-primary shadow-glow-intense flex-shrink-0">
                        <Coins className="w-7 h-7 sm:w-10 sm:h-10 text-primary-foreground" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1">
                        <h3 className="font-heading font-bold text-foreground text-lg sm:text-2xl mb-1 sm:mb-2 flex items-center gap-2">
                          Music Marketplace
                          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-primary group-hover:translate-x-1 transition-transform" />
                        </h3>
                        <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 max-w-lg">
                          Own songs on-chain with any Base wallet. Unlock unlimited streaming, 
                          1,000 offline plays, and support artists directly with 95% going to creators.
                        </p>
                        
                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs sm:text-sm font-medium">
                            <Music className="w-3.5 h-3.5" />
                            <span>On-Chain Songs</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-500 text-xs sm:text-sm font-medium">
                            <span>95% to Artists</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-xs sm:text-sm font-medium">
                            <span>Base Blockchain</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.section>

            {/* Discover Community Section */}
            <motion.section variants={itemVariants}>
              <div className="glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 shine-overlay relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-20">
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, hsl(var(--primary) / 0.6) 0%, transparent 70%)',
                      filter: 'blur(30px)',
                    }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="p-2.5 sm:p-3 rounded-xl gradient-primary shadow-glow flex-shrink-0">
                      <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold text-foreground text-base sm:text-lg mb-1">
                        Discover Community
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
                        Connect with fellow music lovers, see who's listening, and build your network in the $ongChainn community.
                      </p>
                    </div>
                  </div>
                  <Link to="/community" className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto gradient-primary text-primary-foreground shadow-glow gap-2">
                      <span>Explore</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.section>
          </motion.div>

          {/* Sidebar */}
          <motion.aside
            className="space-y-4 sm:space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <EngagementPanel />

            <Link to="/room" className="block group">
              <div className="rounded-2xl sm:rounded-3xl border border-border/60 bg-black/80 p-4 sm:p-6 transition-colors group-hover:border-primary/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="font-heading font-semibold text-zinc-100">The Room</div>
                    <div className="text-xs sm:text-sm text-zinc-400">
                      Global chat + one shared playlist. No distractions.
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <Headphones className="w-5 h-5 text-zinc-100" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px] sm:text-xs text-zinc-400">
                    {roomOnlineCount > 0 ? (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Live now</span>
                        </span>
                        <span>{roomOnlineCount} listening</span>
                      </>
                    ) : (
                      <span>Be the first to start the room</span>
                    )}
                  </div>
                  <Button className="w-full bg-white text-black hover:bg-white/90">
                    Enter
                  </Button>
                </div>
              </div>
            </Link>

            {/* Phase Info */}
            <div className="glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 shine-overlay">
              <h3 className="font-heading font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">Phase One</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-5 leading-relaxed">
                You're part of the early audience building listening culture.
                Ownership, minting, and rewards activate in later phases.
              </p>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full gradient-primary shadow-glow" />
                  <span className="text-foreground">Music Discovery</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full gradient-primary shadow-glow" />
                  <span className="text-foreground">Community Participation</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-primary" />
                  <span className="text-foreground">Music Ownership in Beta Mode</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-muted" />
                  <span className="text-muted-foreground">Rewards (Coming Soon)</span>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="container mx-auto px-3 sm:px-4 mt-8 sm:mt-12 mb-4 sm:mb-8"
        >
          <div className="glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shine-overlay relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 opacity-25">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(var(--primary) / 0.7) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
                animate={{ scale: [1, 1.1, 1], x: [0, 8, 0], y: [0, -6, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-8">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 rounded-2xl gradient-primary shadow-glow-intense flex-shrink-0">
                  <HomeIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="font-heading text-lg sm:text-2xl md:text-3xl font-semibold text-foreground">
                    Want the full $ongChainn story?
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mt-1">
                    Learn how listening, markets, and culture intersect, and why this
                    is more than just another music app.
                  </p>
                </div>
              </div>
              <div className="w-full md:w-auto flex md:justify-end">
                <Link to="/about" className="w-full md:w-auto">
                  <Button className="w-full md:w-auto gradient-primary text-primary-foreground shadow-glow gap-2">
                    <span>About $ongChainn</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      <AudioPlayer />

      {/* Location Prompt for existing users */}
      <LocationPrompt
        isOpen={showLocationPrompt}
        onClose={() => setShowLocationPrompt(false)}
        onSuccess={() => {
          setShowLocationPrompt(false);
          refreshProfile();
        }}
      />
    </div>
  );
}
