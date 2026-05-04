import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Sparkles, Headphones, Users, ArrowRight, Music, Coins, Home as HomeIcon, Flame, ListMusic, Globe, Lock, Plus, Heart, PlayCircle, Disc3, Info, Sword, Wand2 } from 'lucide-react';
import { CATALOGS, ARTISTS, SONGS, type Catalog, type Song } from '@/data/musicData';
import { useRankedArtists, useTodayHotSongs } from '@/hooks/usePopularity';
import { useAuth } from '@/context/AuthContext';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { usePlayerActions, useSafePlayerState } from '@/context/PlayerContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useSocial } from '@/hooks/useSocial';
import { useNotifications } from '@/hooks/useNotifications';
import { supabase } from '@/integrations/supabase/client';
import { ArtistCard } from '@/components/ArtistCard';
import { CatalogCard } from '@/components/CatalogCard';
import { CatalogGrid } from '@/components/CatalogGrid';
import { SongCard } from '@/components/SongCard';
import { EngagementPanel } from '@/components/EngagementPanel';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { DownloadAppBanner, getDeferredInstallPrompt, clearDeferredInstallPrompt } from '@/components/DownloadAppBanner';
import { UpdateAvailableBanner } from '@/components/UpdateAvailableBanner';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { WaveWarzHomeHero } from '@/components/wavewarz/WaveWarzHomeHero';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import djShuffleBranding from '@/assets/Dj Suffle Branding.png';
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

const PLAYLIST_GRADIENTS = [
  'from-emerald-500/70 via-emerald-400/40 to-cyan-500/70',
  'from-purple-500/70 via-fuchsia-400/40 to-pink-500/70',
  'from-orange-500/70 via-amber-400/40 to-red-500/70',
  'from-sky-500/70 via-cyan-400/40 to-indigo-500/70',
];

function isCatalogNew(catalog: { addedAt?: string }) {
  if (!catalog.addedAt) return false;
  const ts = new Date(catalog.addedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < NEW_SONG_WINDOW_MS;
}

function getPlaylistGradient(playlist: { id: string; name: string; mood?: string | null; vibe?: string | null }) {
  const key = (playlist.mood || playlist.vibe || playlist.name || playlist.id).toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PLAYLIST_GRADIENTS.length;
  return `bg-gradient-to-br ${PLAYLIST_GRADIENTS[index]}`;
}

export default function Home() {
  const { rankedArtists } = useRankedArtists();
  const { audienceProfile, refreshProfile, user } = useAuth();
  const { data: todayHotSongs = [] } = useTodayHotSongs(5);
  const { playlists, createPlaylist, addSongToPlaylist, likedArtists } = useAudienceInteractions();
  const { createPost } = useSocial();
  const { createNotification } = useNotifications();
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');
  const [newPlaylistIsPublic, setNewPlaylistIsPublic] = useState(false);
  const [newPlaylistMood, setNewPlaylistMood] = useState('');
  const [newPlaylistVibe, setNewPlaylistVibe] = useState('');
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [isSubmittingPlaylist, setIsSubmittingPlaylist] = useState(false);
  const [moshaInfoOpen, setMoshaInfoOpen] = useState(false);
  const playerState = useSafePlayerState();
  const { playQueue } = usePlayerActions();
  const roomOnlineCount = useRoomOnlineCount({
    roomId: 'global',
    viewerUserId: user?.id,
    isListening: Boolean(playerState?.isRoomMode),
  });

  const catalogs = useMemo(() => CATALOGS, []);
  const catalogBySongId = useMemo(() => {
    const map = new Map<string, Catalog>();
    catalogs.forEach((catalog) => {
      catalog.songIds.forEach((songId) => map.set(songId, catalog));
    });
    return map;
  }, [catalogs]);
  const hotScoreByCatalog = useMemo(() => {
    const scores = new Map<string, number>();
    for (const { song, playsToday } of todayHotSongs) {
      const catalog = catalogBySongId.get(song.id);
      if (!catalog) continue;
      scores.set(catalog.id, (scores.get(catalog.id) || 0) + playsToday);
    }
    return scores;
  }, [todayHotSongs, catalogBySongId]);
  const featuredCatalogs = useMemo(
    () =>
      [...catalogs]
        .sort((a, b) => {
          const scoreDelta = (hotScoreByCatalog.get(b.id) || 0) - (hotScoreByCatalog.get(a.id) || 0);
          if (scoreDelta !== 0) return scoreDelta;
          return a.title.localeCompare(b.title);
        })
        .slice(0, 6),
    [catalogs, hotScoreByCatalog],
  );
  const allCatalogs = useMemo(
    () =>
      [...catalogs].sort((a, b) => {
        const scoreDelta = (hotScoreByCatalog.get(b.id) || 0) - (hotScoreByCatalog.get(a.id) || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return a.title.localeCompare(b.title);
      }),
    [catalogs, hotScoreByCatalog],
  );
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
  const songsByCatalog = useMemo(
    () =>
      catalogs
        .map((catalog) => {
          const songs: Song[] = catalog.songIds
            .map((id) => SONGS.find((song) => song.id === id))
            .filter(Boolean) as Song[];
          return { catalog, songs };
        })
        .filter((entry) => entry.songs.length > 0),
    [catalogs],
  );
  const likedArtistSongs = useMemo(
    () => {
      const hotRank = new Map<string, number>(todayHotSongs.map((entry, index) => [entry.song.id, index]));
      return SONGS.filter((song) => likedArtists.includes(song.artistId))
        .sort((a, b) => {
          const rankA = hotRank.get(a.id);
          const rankB = hotRank.get(b.id);
          if (typeof rankA === 'number' && typeof rankB === 'number') return rankA - rankB;
          if (typeof rankA === 'number') return -1;
          if (typeof rankB === 'number') return 1;
          return a.title.localeCompare(b.title);
        })
        .slice(0, 8);
    },
    [likedArtists, todayHotSongs],
  );
  const allCatalogsCardRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: allCatalogsScrollProgress } = useScroll({
    target: allCatalogsCardRef,
    offset: ['start 0.9', 'end 0.1'],
  });
  const allCatalogsGlowY = useTransform(allCatalogsScrollProgress, [0, 1], [24, -24]);
  const allCatalogsGlowOpacity = useTransform(allCatalogsScrollProgress, [0, 1], [0.12, 0.35]);

  const songsFromCatalogs = useCallback((catalogList: Catalog[]) => {
    const songIds = Array.from(new Set(catalogList.flatMap((catalog) => catalog.songIds)));
    return songIds
      .map((songId) => SONGS.find((song) => song.id === songId))
      .filter(Boolean) as Song[];
  }, []);

  const handlePlayAllHotToday = useCallback(() => {
    const queueSongs = todayHotSongs.map((entry) => entry.song);
    if (queueSongs.length) playQueue(queueSongs);
  }, [playQueue, todayHotSongs]);

  const handlePlayAllNewReleases = useCallback(() => {
    const queueSongs = songsFromCatalogs(newReleases);
    if (queueSongs.length) playQueue(queueSongs);
  }, [newReleases, playQueue, songsFromCatalogs]);

  const handlePlayAllFeatured = useCallback(() => {
    const queueSongs = songsFromCatalogs(featuredCatalogs);
    if (queueSongs.length) playQueue(queueSongs);
  }, [featuredCatalogs, playQueue, songsFromCatalogs]);

  const handlePlayAllCatalogs = useCallback(() => {
    const queueSongs = songsFromCatalogs(allCatalogs);
    if (queueSongs.length) playQueue(queueSongs);
  }, [allCatalogs, playQueue, songsFromCatalogs]);

  const handleOpenMosha = useCallback(() => {
    window.dispatchEvent(new CustomEvent('songchainn:open-mosha'));
  }, []);

  const quickActions = useMemo(() => ([
    {
      label: 'Join The Room',
      description: 'Hop into live global listening now.',
      icon: Headphones,
      to: '/room',
    },
    {
      label: 'Open BattleZone',
      description: 'See live battles and enter your battle room.',
      icon: Sword,
      to: '/wavewarz-africa/battles/live',
    },
    {
      label: 'Open DJ Shuffle',
      description: 'Instant random vibe across $ongChainn.',
      icon: Wand2,
      to: '/dj-shuffle',
    },
    {
      label: 'Create Playlist',
      description: 'Save your taste lane in one tap.',
      icon: ListMusic,
      action: () => setIsCreatePlaylistOpen(true),
    },
  ]), []);

  useEffect(() => {
    if (!user?.id) return;
    const newUserKey = `songchainn:new-user-tour-prompt:v1:${user.id}`;
    const returningUserKey = `songchainn:returning-user-tour-prompt:v2:${user.id}`;
    try {
      if (localStorage.getItem(returningUserKey) === 'shown') return;
      const hasSeenNewUserPrompt = localStorage.getItem(newUserKey) === 'shown';

      if (!hasSeenNewUserPrompt) {
        localStorage.setItem(newUserKey, 'shown');
      } else {
        localStorage.setItem(returningUserKey, 'shown');
      }

      window.setTimeout(() => {
        const promptText = hasSeenNewUserPrompt
          ? 'Yo welcome back fam. New app experience is live: cleaner UI, faster feed autoplay flow, and upgraded WaveWarz BattleZone access. Click here to explore your navigation sections, quick actions, and live zones.'
          : 'Welcome to $ongChainn Phase One: Audience First. Want a quick guided tour of sections and features? Music trading and rewards are coming soon.';
        window.dispatchEvent(
          new CustomEvent('songchainn:mosha-prompt', {
            detail: {
              text: promptText,
              ctaLabel: hasSeenNewUserPrompt ? 'Click here to explore' : 'Learn more',
              ctaPath: hasSeenNewUserPrompt ? '/' : '/about',
            },
          }),
        );
      }, 900);
    } catch {
      void 0;
    }
  }, [user?.id]);

  const handleToggleSongSelection = (songId: string) => {
    setSelectedSongIds((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId],
    );
  };

  const handleCreatePlaylistFromHome = async () => {
    if (!newPlaylistName.trim() || isSubmittingPlaylist) return;
    setIsSubmittingPlaylist(true);
    try {
      const playlist = await createPlaylist(
        newPlaylistName.trim(),
        newPlaylistDescription.trim() || undefined,
        newPlaylistIsPublic,
        newPlaylistMood.trim() || undefined,
        newPlaylistVibe.trim() || undefined,
      );
      if (!playlist) return;

      if (selectedSongIds.length > 0) {
        for (const songId of selectedSongIds) {
          await addSongToPlaylist(playlist.id, songId);
        }
      }

      if (newPlaylistIsPublic) {
        const moodPart = newPlaylistMood.trim();
        const vibePart = newPlaylistVibe.trim();
        const metaParts = [];
        if (moodPart) metaParts.push(`Mood: ${moodPart}`);
        if (vibePart) metaParts.push(`Vibe: ${vibePart}`);
        const meta = metaParts.join(' · ');
        const content =
          meta ||
          `New playlist: ${playlist.name}`;

        await createPost(
          content,
          'playlist_share',
          undefined,
          playlist.id,
        );

        const { data: audienceRows } = await supabase
          .from('audience_profiles')
          .select('user_id');
        const targetUserIds =
          (audienceRows || [])
            .map((row: any) => row.user_id)
            .filter((id: string | null) => Boolean(id)) || [];

        const senderName =
          audienceProfile?.profile_name ||
          (user && typeof user.email === 'string'
            ? user.email.split('@')[0]
            : 'Someone');

        await Promise.all(
          targetUserIds.map((id: string) =>
            createNotification(
              id,
              'playlist',
              undefined,
              `${senderName} shared a new playlist: ${playlist.name}`,
            ),
          ),
        );
      }

      setNewPlaylistName('');
      setNewPlaylistDescription('');
      setNewPlaylistIsPublic(false);
      setNewPlaylistMood('');
      setNewPlaylistVibe('');
      setSelectedSongIds([]);
      setIsCreatePlaylistOpen(false);
    } finally {
      setIsSubmittingPlaylist(false);
    }
  };

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
                  <span className="inline-flex items-center rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[10px] sm:text-xs font-semibold">
                    {`${roomOnlineCount} live`}
                  </span>
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </div>
        )}
        <section className="mb-4 sm:mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">$ongChainn Quick Actions</h2>
            <span className="text-[11px] sm:text-xs text-muted-foreground">Smart shortcuts</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {quickActions.map((item) => {
              const Icon = item.icon;
              const content = (
                <div className="h-full min-h-[98px] rounded-xl border border-border bg-card/60 px-3 py-2.5 text-left hover:border-primary/35 hover:bg-primary/5 transition-colors">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <span className="text-[13px] sm:text-sm font-semibold leading-tight text-foreground">{item.label}</span>
                  </div>
                  <p className="text-[10px] sm:text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              );

              if (item.to) {
                return (
                  <Link key={item.label} to={item.to} className="block h-full">
                    {content}
                  </Link>
                );
              }

              return (
                <button key={item.label} type="button" onClick={item.action} className="h-full w-full text-left">
                  {content}
                </button>
              );
            })}
          </div>
        </section>

        <WaveWarzHomeHero />

        <div className="my-4 sm:my-6 flex items-center gap-2">
          <Button
            type="button"
            onClick={handleOpenMosha}
            className="flex-1 h-11 sm:h-12 rounded-2xl gradient-primary text-primary-foreground shadow-glow-intense text-sm sm:text-base font-semibold tracking-wide"
          >
            Call Mo$ha
          </Button>
          <div className="shrink-0">
            <TooltipProvider>
              <div className="hidden sm:block">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What this button does"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/35 bg-background/80 text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[16rem] text-xs">
                    Opens Mo$ha instantly if you closed chat and want help again.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            <div className="sm:hidden">
              <Popover open={moshaInfoOpen} onOpenChange={setMoshaInfoOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="What this button does"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/35 bg-background/80 text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[16rem] p-3">
                  <p className="text-xs text-foreground">
                    Opens Mo$ha instantly if you closed chat and want help again.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8 w-full text-xs"
                    onClick={() => setMoshaInfoOpen(false)}
                  >
                    Close
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-8">
          {/* Main Content */}
          <motion.div
            className="lg:col-span-2 space-y-6 sm:space-y-12"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {todayHotSongs.length > 0 && (
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
                          Most played songs in the last 24 hours on $ongChainn.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs border-sky-400/40 text-sky-100 bg-sky-500/10 hover:bg-sky-500/20" onClick={handlePlayAllHotToday}>
                          <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                          Play All
                        </Button>
                        <div className="hidden sm:flex items-center gap-2 text-xs text-sky-300">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                            <span>Live Heat</span>
                          </span>
                        </div>
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

            {newReleases.length > 0 && (
              <motion.section variants={itemVariants}>
                <div className="relative glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay overflow-hidden">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div>
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                        New Releases
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Fresh catalogs from the town square, just arrived on $ongChainn.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <Button size="sm" variant="outline" className="h-8 text-xs border-primary/40 bg-primary/10 hover:bg-primary/20" onClick={handlePlayAllNewReleases}>
                        <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                        Play All
                      </Button>
                      <div className="hidden sm:flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        <span>{newReleases.length} catalogs</span>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto pr-2">
                    <CatalogGrid>
                      {newReleases.map((catalog) => (
                        <CatalogCard
                          key={catalog.id}
                          catalog={catalog}
                          isNew={isCatalogNew(catalog)}
                        />
                      ))}
                    </CatalogGrid>
                  </div>
                </div>
              </motion.section>
            )}

            {likedArtistSongs.length > 0 && (
              <motion.section variants={itemVariants}>
                <div className="relative glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay overflow-hidden">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div>
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                        From Artists You Like
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Songs from artists you have tapped heart on.
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-xs text-primary">
                      <Heart className="w-4 h-4" />
                      <span>{likedArtistSongs.length} songs</span>
                    </div>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto pr-2">
                    <div className="space-y-3">
                      {likedArtistSongs.map((song, index) => (
                        <SongCard key={song.id} song={song} index={index} variant="compact" />
                      ))}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            {featuredCatalogs.length > 0 && (
              <motion.section variants={itemVariants}>
                <div className="glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay border border-primary/20">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div>
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                        Featured Catalogs
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Signature collections surfacing from the town square.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <Button size="sm" variant="outline" className="h-8 text-xs border-primary/40 bg-primary/10 hover:bg-primary/20" onClick={handlePlayAllFeatured}>
                        <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                        Play All
                      </Button>
                      <div className="hidden sm:flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        <span>{featuredCatalogs.length} catalogs</span>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto pr-2">
                    <CatalogGrid>
                      {featuredCatalogs.map((catalog) => (
                        <CatalogCard key={catalog.id} catalog={catalog} />
                      ))}
                    </CatalogGrid>
                  </div>
                </div>
              </motion.section>
            )}

            <motion.section variants={itemVariants}>
              <div
                ref={allCatalogsCardRef}
                className="relative glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay overflow-hidden"
              >
                <motion.div
                  aria-hidden="true"
                  style={{ y: allCatalogsGlowY, opacity: allCatalogsGlowOpacity }}
                  className="pointer-events-none absolute -inset-x-10 -top-16 h-24 bg-gradient-to-r from-primary/40 via-cyan-400/25 to-emerald-400/35 blur-3xl"
                />
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                    <div>
                      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                        All Catalogs
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Every project on $ongChainn, ready to explore.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Button size="sm" variant="outline" className="h-8 text-xs border-primary/40 bg-primary/10 hover:bg-primary/20" onClick={handlePlayAllCatalogs}>
                        <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                        Play All
                      </Button>
                      <div className="hidden sm:flex items-center gap-2">
                        <Music className="w-4 h-4 text-primary" />
                        <span>{allCatalogs.length} catalogs</span>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto pr-2">
                    <CatalogGrid>
                      {allCatalogs.map((catalog) => (
                        <CatalogCard key={catalog.id} catalog={catalog} />
                      ))}
                    </CatalogGrid>
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

            <motion.section variants={itemVariants} id="playlists">
              <div className="glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shine-overlay">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-2">
                    <ListMusic className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    <h2 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                      Your Playlists
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {playlists.length === 1 ? '1 playlist' : `${playlists.length} playlists`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="inline-flex"
                      onClick={() => setIsCreatePlaylistOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      New
                    </Button>
                  </div>
                </div>
                {playlists.length === 0 ? (
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      You have not created any playlists yet.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="gradient-primary"
                      onClick={() => setIsCreatePlaylistOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Start a playlist
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="max-h-80 pr-2">
                    <div className="space-y-3">
                      {playlists.map((playlist) => (
                        <div
                          key={playlist.id}
                          className="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl hover:bg-card/70 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xs sm:text-sm font-semibold text-primary-foreground ${getPlaylistGradient(playlist)}`}
                            >
                              <span className="truncate max-w-[2.5rem] sm:max-w-[3rem]">
                                {playlist.name.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/playlist/${playlist.id}`}
                                className="block"
                              >
                                <p className="font-medium text-foreground truncate">
                                  {playlist.name}
                                </p>
                                {playlist.description && (
                                  <p className="text-sm text-muted-foreground truncate">
                                    {playlist.description}
                                  </p>
                                )}
                                {(playlist.mood || playlist.vibe) && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {[playlist.mood, playlist.vibe].filter(Boolean).join(' • ')}
                                  </p>
                                )}
                              </Link>
                            </div>
                          </div>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-border flex-shrink-0"
                          >
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
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </motion.section>

            {/* Marketplace CTA - Featured Ad Style */}
            <motion.section variants={itemVariants}>
              <Link to="/dj-shuffle" className="block group">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-cyan-300/35 bg-black/60 p-4 sm:p-5">
                  <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr] items-center">
                    <div className="space-y-2">
                      <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100">
                        <Disc3 className="w-3.5 h-3.5" />
                        DJ Shuffle
                      </p>
                      <h3 className="text-xl sm:text-2xl font-semibold text-white">Meet DJ $huffle</h3>
                      <p className="text-sm text-zinc-200">
                        Shuffle artist picks, catalogs, or all songs with nonstop random playback.
                      </p>
                      <Button size="sm" className="bg-emerald-400 text-black hover:bg-emerald-300">
                        Open DJ Shuffle
                        <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                    <div className="rounded-2xl border border-cyan-300/25 bg-black/35 p-2">
                      <img src={djShuffleBranding} alt="DJ Shuffle branding" className="h-full w-full rounded-xl object-cover" />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.section>

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

      <Dialog open={isCreatePlaylistOpen} onOpenChange={setIsCreatePlaylistOpen}>
        <DialogContent className="max-w-2xl w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Create playlist</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="home-playlist-name">Name</Label>
                <Input
                  id="home-playlist-name"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  maxLength={80}
                  placeholder="Give your playlist a name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="home-playlist-description">Description</Label>
                <Textarea
                  id="home-playlist-description"
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
              <div className="space-y-2">
                <Label htmlFor="home-playlist-mood">Mood</Label>
                <Input
                  id="home-playlist-mood"
                  value={newPlaylistMood}
                  onChange={(e) => setNewPlaylistMood(e.target.value)}
                  maxLength={40}
                  placeholder="Add a mood (e.g., Happy, Sad, Energetic)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="home-playlist-vibe">Vibe</Label>
                <Input
                  id="home-playlist-vibe"
                  value={newPlaylistVibe}
                  onChange={(e) => setNewPlaylistVibe(e.target.value)}
                  maxLength={40}
                  placeholder="Add a vibe (e.g., Chill, Party, Relaxing)"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Choose songs from the catalogs
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tap songs to add or remove them from this playlist.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {selectedSongIds.length === 0
                    ? 'No songs selected'
                    : `${selectedSongIds.length} selected`}
                </span>
              </div>
              <ScrollArea className="h-64 pr-2">
                <div className="space-y-3">
                  {songsByCatalog.map(({ catalog, songs }) => (
                    <div
                      key={catalog.id}
                      className="border border-border rounded-xl p-3 bg-card/60"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        {catalog.coverImage && (
                          <img
                            src={catalog.coverImage}
                            alt={catalog.title}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            loading="lazy"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {catalog.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {catalog.artist}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {songs.map((song) => {
                          const isSelected = selectedSongIds.includes(song.id);
                          return (
                            <button
                              key={song.id}
                              type="button"
                              onClick={() => handleToggleSongSelection(song.id)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                                isSelected
                                  ? 'bg-primary/10 border border-primary/40 text-foreground'
                                  : 'bg-muted/40 border border-transparent text-muted-foreground hover:bg-muted/60'
                              }`}
                            >
                              <span className="truncate">{song.title}</span>
                              {isSelected && (
                                <span className="ml-2 text-[10px] font-semibold text-primary">
                                  Added
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreatePlaylistOpen(false)}
              disabled={isSubmittingPlaylist}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreatePlaylistFromHome()}
              disabled={!newPlaylistName.trim() || isSubmittingPlaylist}
            >
              Create playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
