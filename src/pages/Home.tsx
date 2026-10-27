import { songPath } from '@/lib/slugRoutes';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { Headphones, Users, ArrowRight, Music, Coins, Flame, Globe, Lock, Plus, Play, Pause, Disc3, Info, Swords, Sparkles } from 'lucide-react';
import { CATALOGS, SONGS, type Catalog, type Song, buildCatalogs } from '@/data/musicData';
import { artistPath } from '@/lib/slugRoutes';
import { cn, compactCount } from '@/lib/utils';
import { thumb } from '@/lib/img';
import { ScrollRail } from '@/components/ScrollRail';
import { NowPlayingBars } from '@/components/NowPlayingBars';
import { useRankedArtists, useTodayHotSongs } from '@/hooks/usePopularity';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { catalogEarnedPlacement, earnedPlacement, indexSongs } from '@/lib/placement';
import { useAuth } from '@/context/AuthContext';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { usePlayerActions, useSafePlayerState } from '@/context/PlayerContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useToast } from '@/hooks/use-toast';
import { useSocial } from '@/hooks/useSocial';
import { useNotifications } from '@/hooks/useNotifications';
import { supabase } from '@/integrations/supabase/client';
import { SongCard } from '@/components/SongCard';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { WorldMusicRow } from '@/components/WorldMusicRow';
import { Hint } from '@/components/Hint';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { DownloadAppBanner } from '@/components/DownloadAppBanner';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { HomeHero, type HeroFeature } from '@/components/HomeHero';
import { useMoshaTour } from '@/hooks/useMoshaTour';
import { useSettledHero } from '@/hooks/useSettledHero';
import { pickHeroSong } from '@/lib/heroPick';
import { useFrontStore } from '@/hooks/useFrontStore';
import { ZABAL_GAMEZ_ENABLED, WORLDS_ENABLED } from '@/lib/features';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRoomTimeline, roomClock, roomEntriesAt } from '@/hooks/useRoomTimeline';
import { findSong } from '@/lib/liveCatalog';

/** How many genre shelves Home shows before the rest share one last shelf. */
const MAX_GENRE_SHELVES = 6;

/**
 * One record on a shelf: the cover at size, a play button that plays the
 * whole catalog from the shelf, and the bars when it is the one playing.
 */
function ShelfCard({
  catalog,
  onPlay,
  isOn,
  isPlaying,
}: {
  catalog: Catalog;
  onPlay: (catalog: Catalog) => void;
  isOn: boolean;
  isPlaying: boolean;
}) {
  return (
    <li className="w-[38vw] max-w-[176px] flex-shrink-0 sm:w-44">
      <Link to={`/catalog/${catalog.id}`} className="group block">
        <div
          className={cn(
            'relative aspect-square w-full overflow-hidden rounded-xl bg-secondary shadow-soft',
            isOn && 'ring-2 ring-primary',
          )}
        >
          {catalog.coverImage ? (
            <img
              src={thumb(catalog.coverImage, 352)}
              alt={catalog.title}
              width={176}
              height={176}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          {isOn && (
            <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-background/85 px-2 py-1">
              <NowPlayingBars playing={isPlaying} />
            </span>
          )}
          <button
            type="button"
            aria-label={`Play ${catalog.title}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPlay(catalog);
            }}
            className={cn(
              'absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300',
              // Always there on a touch screen; rises in on hover with a mouse.
              '[@media(pointer:fine)]:translate-y-2 [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:translate-y-0 [@media(pointer:fine)]:group-hover:opacity-100',
              isOn && '[@media(pointer:fine)]:translate-y-0 [@media(pointer:fine)]:opacity-100',
            )}
          >
            {isOn && isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </button>
        </div>
        <p className={cn('mt-2 truncate text-sm font-medium', isOn ? 'text-primary' : 'text-foreground')}>{catalog.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          <ArtistName name={catalog.artist} artistId={catalog.artistId} size={12} />
        </p>
      </Link>
    </li>
  );
}

function Shelf({
  title,
  line,
  catalogs,
  onPlayCatalog,
  onPlayAll,
  playingSongId,
  isPlaying,
}: {
  title: string;
  line?: string;
  catalogs: Catalog[];
  onPlayCatalog: (catalog: Catalog) => void;
  onPlayAll: () => void;
  playingSongId?: string;
  isPlaying: boolean;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-xl sm:text-2xl font-semibold text-foreground">{title}</h2>
          {line && <p className="text-xs sm:text-sm text-muted-foreground">{line}</p>}
        </div>
        <Button size="sm" variant="outline" className="h-10 flex-shrink-0 rounded-full px-4 text-xs" onClick={onPlayAll}>
          <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
          Play all
        </Button>
      </div>
      <ScrollRail label={title} listClassName="-mx-1 gap-3 sm:gap-4 px-1 pb-1">
        {catalogs.map((catalog) => (
          <ShelfCard
            key={catalog.id}
            catalog={catalog}
            onPlay={onPlayCatalog}
            isOn={Boolean(playingSongId && catalog.songIds.includes(playingSongId))}
            isPlaying={isPlaying}
          />
        ))}
      </ScrollRail>
    </section>
  );
}

const NEW_SONG_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;

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
  const { rankedArtists: allRankedArtists } = useRankedArtists();
  const { songOnFront, catalogOnFront, artistOnFront } = useFrontStore();
  // The front of Home is the front store: only artists who rep the place.
  const rankedArtists = useMemo(
    () => allRankedArtists.filter((a) => artistOnFront(a.id)),
    [allRankedArtists, artistOnFront],
  );
  const { audienceProfile, refreshProfile, user } = useAuth();
  const { data: todayHotSongs = [], isPlaceholderData: hotStillComing } = useTodayHotSongs(10);
  const { playlists, createPlaylist, addSongsToPlaylist, likedArtists } = useAudienceInteractions();
  const { toast } = useToast();
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
  const playerState = useSafePlayerState();
  const { playQueue, togglePlay } = usePlayerActions();
  const roomOnlineCount = useRoomOnlineCount({
    roomId: 'global',
    viewerUserId: user?.id,
    isListening: Boolean(playerState?.isRoomMode),
  });

  const { songs: publishedSongs, isLoading: catalogLoading } = usePublishedCatalog();
  const allSongs = useMemo(() => [...SONGS, ...publishedSongs], [publishedSongs]);
  const songById = useMemo(() => indexSongs(allSongs), [allSongs]);
  const catalogs = useMemo(
    () => (publishedSongs.length ? buildCatalogs(allSongs) : CATALOGS),
    [allSongs, publishedSongs.length],
  );
  // Only while the published catalog is still on its way and the static one
  // has nothing to show in the meantime.
  const showCatalogSkeleton = catalogLoading && catalogs.length === 0;
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
  // Featured is a push, not a shelf, so only catalogs that earned placement
  // reach it. Everything else still sits in New Releases and All Catalogs.
  const featuredCatalogs = useMemo(
    () =>
      catalogs
        .filter((catalog) => catalogEarnedPlacement(catalog, songById) && catalogOnFront(catalog, songById))
        .sort((a, b) => {
          const scoreDelta = (hotScoreByCatalog.get(b.id) || 0) - (hotScoreByCatalog.get(a.id) || 0);
          if (scoreDelta !== 0) return scoreDelta;
          return a.title.localeCompare(b.title);
        })
        .slice(0, 6),
    [catalogs, hotScoreByCatalog, songById, catalogOnFront],
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
  const newReleases = useMemo(() => {
    const sorted = [...catalogs].sort((a, b) => {
      const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return timeB - timeA;
    });
    return sorted.filter((catalog) => isCatalogNew(catalog) && catalogOnFront(catalog, songById));
  }, [catalogs, catalogOnFront, songById]);
  const hotTodaySongs = useMemo(
    () => todayHotSongs.filter(({ song }) => earnedPlacement(song) && songOnFront(song)),
    [todayHotSongs, songOnFront],
  );
  // The page opens on one record at size rather than on copy about the app.
  // Newest release first, then whatever is hottest, then anything at all: Home
  // must never open on an empty frame.

  // Every artist, highest popularity first, the same order as Top Artists.
  // N3M3SIS used to be pinned beside IMan Afrikah here (13 Sep 2026); the
  // founder set it back to pure rank on 10 Oct 2026.
  const heroFaces = useMemo(
    () => rankedArtists.map((a) => ({ id: a.id, name: a.name, image: a.profileImage })),
    [rankedArtists],
  );
  // Whose song is playing in the Room this minute: that face wears the turning ring.
  const { data: roomTimeline } = useRoomTimeline(Boolean(user));
  // The same record shows in the strip under the hero.
  const roomSong = useMemo(() => {
    if (!roomTimeline) return null;
    const { current } = roomEntriesAt(roomTimeline, roomClock(roomTimeline));
    return current ? findSong(current.songId) ?? null : null;
  }, [roomTimeline]);
  const liveArtistId = roomSong?.artistId ?? null;

  const songsByCatalog = useMemo(
    () =>
      catalogs
        .map((catalog) => {
          const songs: Song[] = catalog.songIds
            .map((id) => allSongs.find((song) => song.id === id))
            .filter(Boolean) as Song[];
          return { catalog, songs };
        })
        .filter((entry) => entry.songs.length > 0),
    [catalogs, allSongs],
  );
  const likedArtistSongs = useMemo(
    () => {
      const hotRank = new Map<string, number>(todayHotSongs.map((entry, index) => [entry.song.id, index]));
      return allSongs.filter((song) => likedArtists.includes(song.artistId))
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
    [likedArtists, todayHotSongs, allSongs],
  );
  // All Catalogs used to be one long wall of squares. Now it is shelved by
  // sound, the genre with the most heat today first, so the rest of the page
  // reads like a record shop and not a spreadsheet.
  const genreShelves = useMemo(() => {
    const byGenre = new Map<string, Catalog[]>();
    for (const catalog of allCatalogs) {
      const genre = catalog.genre || 'More to find';
      const list = byGenre.get(genre) ?? [];
      list.push(catalog);
      byGenre.set(genre, list);
    }
    const heat = (list: Catalog[]) => list.reduce((sum, c) => sum + (hotScoreByCatalog.get(c.id) || 0), 0);
    const ordered = [...byGenre.entries()]
      .map(([genre, list]) => ({ genre, catalogs: list }))
      .sort((a, b) => heat(b.catalogs) - heat(a.catalogs) || b.catalogs.length - a.catalogs.length);
    if (ordered.length <= MAX_GENRE_SHELVES) return ordered;
    const kept = ordered.slice(0, MAX_GENRE_SHELVES - 1);
    const rest = ordered.slice(MAX_GENRE_SHELVES - 1).flatMap((shelf) => shelf.catalogs);
    return [...kept, { genre: 'More to find', catalogs: rest }];
  }, [allCatalogs, hotScoreByCatalog]);

  const songsFromCatalogs = useCallback((catalogList: Catalog[]) => {
    const songIds = Array.from(new Set(catalogList.flatMap((catalog) => catalog.songIds)));
    return songIds
      .map((songId) => allSongs.find((song) => song.id === songId))
      .filter(Boolean) as Song[];
  }, [allSongs]);

  // Same ranking as the landing page, from the same helper, so the two can
  // never disagree about what the record of the day is. See src/lib/heroPick.ts.
  const heroPick = useMemo<HeroFeature | null>(() => {
    const pick = pickHeroSong({
      hotToday: hotTodaySongs.map(({ song }) => song),
      newMusic: songsFromCatalogs(newReleases),
      allSongs: allSongs.filter(songOnFront),
    });
    if (!pick) return null;
    return {
      id: pick.song.id,
      title: pick.song.title,
      artist: pick.song.artist,
      artistId: pick.song.artistId,
      coverImage: pick.song.coverImage,
      label: pick.label,
      href: songPath(pick.song),
    };
  }, [hotTodaySongs, newReleases, allSongs, songsFromCatalogs, songOnFront]);
  // Nothing is shown until today's counts have actually landed, otherwise the
  // newest release wins the pick for a moment and is then swapped for the real
  // number one, which reads as a flash.
  const heroFeature = useSettledHero(heroPick, !hotStillComing && !catalogLoading);

  const handlePlayAllHotToday = useCallback(() => {
    const queueSongs = hotTodaySongs.map((entry) => entry.song);
    if (queueSongs.length) playQueue(queueSongs);
  }, [playQueue, hotTodaySongs]);

  const handlePlayHero = useCallback(() => {
    if (!heroFeature) return;
    const song = allSongs.find((s) => s.id === heroFeature.id);
    if (song) playQueue([song]);
  }, [heroFeature, allSongs, playQueue]);

  const handlePlayAllNewReleases = useCallback(() => {
    const queueSongs = songsFromCatalogs(newReleases);
    if (queueSongs.length) playQueue(queueSongs);
  }, [newReleases, playQueue, songsFromCatalogs]);

  const handlePlayAllFeatured = useCallback(() => {
    const queueSongs = songsFromCatalogs(featuredCatalogs);
    if (queueSongs.length) playQueue(queueSongs);
  }, [featuredCatalogs, playQueue, songsFromCatalogs]);

  // A shelf's play button: tap the one already playing to pause it.
  const handlePlayCatalog = useCallback((catalog: Catalog) => {
    const current = playerState?.currentSong;
    if (current && catalog.songIds.includes(current.id)) {
      togglePlay();
      return;
    }
    const queueSongs = songsFromCatalogs([catalog]);
    if (queueSongs.length) playQueue(queueSongs);
  }, [playerState?.currentSong, playQueue, songsFromCatalogs, togglePlay]);

  // Everything on $ongChainn that is not a record, reachable but out of the way.
  const moreDoors = useMemo(() => [
    { label: 'The Room', to: '/room', icon: Headphones },
    { label: 'DJ $huffle', to: '/dj-shuffle', icon: Disc3 },
    { label: 'WaveWarz Africa', to: '/wavewarz-africa', icon: Swords },
    ...(WORLDS_ENABLED ? [{ label: 'Artist Worlds', to: '/worlds', icon: Sparkles }] : []),
    { label: 'Marketplace', to: '/marketplace', icon: Coins },
    { label: 'Community', to: '/community', icon: Users },
    { label: 'About', to: '/about', icon: Info },
  ], []);

  // The old welcome fired a 40-word paragraph 900ms after login, before the
  // user had seen a single song. Replaced by a paced, signal-driven tour:
  // see src/lib/moshaTour.ts and useMoshaTour().
  useMoshaTour();

  // One-time Mo$ha plug for the Zabal Gamez Artist Track. Delayed so it never
  // collides with the welcome/tour prompt above, and never repeats once shown.
  useEffect(() => {
    if (!ZABAL_GAMEZ_ENABLED) return;
    if (!user?.id) return;
    const zabalKey = `songchainn:zabal-gamez-mosha-prompt:v1:${user.id}`;
    try {
      if (localStorage.getItem(zabalKey) === 'shown') return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(zabalKey, 'shown');
      } catch {
        void 0;
      }
      window.dispatchEvent(
        new CustomEvent('songchainn:mosha-prompt', {
          detail: {
            text: 'Yo, quick one: are you a musician? The Zabal Gamez Artist Track is open, free entry. Grab the cypher beat, drop your verse, and get on the wall.',
            ctaLabel: 'Join the Artist Track',
            ctaPath: '/about#zabal-gamez',
          },
        }),
      );
    }, 30000);
    return () => window.clearTimeout(timer);
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
        await addSongsToPlaylist(playlist.id, selectedSongIds);
      }
      toast({
        title: 'Playlist created!',
        description: selectedSongIds.length > 0 ? `${playlist.name} with ${selectedSongIds.length} songs.` : playlist.name,
      });

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
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground variant="default" />
      <OfflineIndicator />
      <Navigation />
      <DownloadAppBanner />

      {/* Music first (founder, 27 Oct 2026). Home used to stack quick actions,
          a Mo$ha button, zone tiles, a "what's here" mosaic, the worlds pitch,
          two adverts, a community card and an about card around the music.
          Now it is the record of the day, Hot Today, then shelves of records,
          and one quiet row of doors at the bottom for everything else. */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 lg:pl-28 pt-4 sm:pt-6 pb-8 relative z-10">
        {heroFeature ? (
          <HomeHero feature={heroFeature} onPlay={handlePlayHero} faces={heroFaces} liveArtistId={liveArtistId} />
        ) : (
          // Holds the space while today's counts arrive, so the page does not
          // jump when the record of the day lands.
          <section
            aria-hidden
            className="relative -mx-4 mb-7 h-[280px] animate-pulse bg-secondary/40 sm:-mx-6 sm:mb-10 sm:h-[320px] lg:-mx-8"
          />
        )}

        {/* What everyone is hearing in The Room this second, as a record, not a pitch. */}
        {roomSong && (
          <Link
            to="/room"
            className="group mb-6 sm:mb-10 flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-2.5 pr-3 sm:p-3 sm:pr-4 transition-colors hover:bg-card"
          >
            <div className="relative h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 overflow-hidden rounded-xl bg-secondary">
              {roomSong.coverImage ? (
                <img
                  src={thumb(roomSong.coverImage, 112)}
                  alt=""
                  width={56}
                  height={56}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <NowPlayingBars playing />
                <span>On in The Room</span>
              </div>
              <p className="truncate text-sm sm:text-base font-medium text-foreground">{roomSong.title}</p>
              <p className="truncate text-xs sm:text-sm text-muted-foreground">{roomSong.artist}</p>
            </div>
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              <Headphones className="h-3.5 w-3.5" />
              {roomOnlineCount > 0 ? `${roomOnlineCount} in` : 'Join'}
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}

        <div className="space-y-8 sm:space-y-12">
          {/* Hot Today: the ten records played most since midnight, numbered
              like a chart, with today's count beside each one. */}
          <section aria-labelledby="hot-today-heading">
            <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <h2 id="hot-today-heading" className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                    Hot Today
                  </h2>
                  <Hint label="What Hot Today means">
                    The songs played most across SONGCHAINN since midnight. It starts empty
                    every night and fills through the day, so a record released this morning
                    can be number one by evening.
                  </Hint>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  Top 10, counting live since midnight
                </p>
              </div>
              {hotTodaySongs.length > 0 && (
                <Button size="sm" className="h-10 flex-shrink-0 rounded-full px-4 text-xs" onClick={handlePlayAllHotToday}>
                  <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                  Play all
                </Button>
              )}
            </div>
            {hotTodaySongs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No streams yet today. Press play on anything and it starts the chart.
              </p>
            ) : (
              <ol className={cn('grid gap-x-6 gap-y-1', hotTodaySongs.length > 5 && 'lg:grid-cols-2 lg:grid-flow-col lg:grid-rows-[repeat(5,auto)]')}>
                {hotTodaySongs.map(({ song, playsToday }, index) => {
                  const isOn = playerState?.currentSong?.id === song.id;
                  return (
                    <li key={song.id} className="flex items-center gap-1 sm:gap-2">
                      <div className="flex w-9 sm:w-11 flex-shrink-0 flex-col items-center leading-none">
                        <span
                          className={cn(
                            'font-heading text-2xl sm:text-3xl font-bold tabular-nums',
                            isOn ? 'text-primary' : index < 3 ? 'text-foreground' : 'text-muted-foreground/70',
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="mt-1 text-[9px] sm:text-[10px] tabular-nums text-muted-foreground" title={`${playsToday} plays today`}>
                          {compactCount(playsToday)} today
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <SongCard song={song} index={index} variant="compact" />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {showCatalogSkeleton && (
            <section aria-busy="true" aria-label="Loading new releases">
              <Skeleton className="mb-3 h-7 w-40" />
              <div className="flex gap-3 overflow-hidden">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-[38vw] max-w-[176px] flex-shrink-0 space-y-2 sm:w-44">
                    <Skeleton className="aspect-square w-full rounded-xl" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {newReleases.length > 0 && (
            <Shelf
              title="New Releases"
              line="Fresh this week."
              catalogs={newReleases}
              onPlayCatalog={handlePlayCatalog}
              onPlayAll={handlePlayAllNewReleases}
              playingSongId={playerState?.currentSong?.id}
              isPlaying={Boolean(playerState?.isPlaying)}
            />
          )}

          {likedArtistSongs.length > 0 && (
            <section aria-labelledby="liked-artists-heading">
              <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 id="liked-artists-heading" className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                    From Artists You Like
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">Because you tapped the heart.</p>
                </div>
              </div>
              <div className="grid gap-1 lg:grid-cols-2 lg:gap-x-6">
                {likedArtistSongs.map((song, index) => (
                  <SongCard key={song.id} song={song} index={index} variant="compact" />
                ))}
              </div>
            </section>
          )}

          {featuredCatalogs.length > 0 && (
            <Shelf
              title="Featured"
              line="The records people keep coming back to."
              catalogs={featuredCatalogs}
              onPlayCatalog={handlePlayCatalog}
              onPlayAll={handlePlayAllFeatured}
              playingSongId={playerState?.currentSong?.id}
              isPlaying={Boolean(playerState?.isPlaying)}
            />
          )}

          {/* Top Artists as faces you can swipe, highest first. */}
          {rankedArtists.length > 0 && (
            <section aria-labelledby="top-artists-heading">
              <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
                <h2 id="top-artists-heading" className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                  Top Artists
                </h2>
                <Link to="/artists" className="inline-flex min-h-10 items-center gap-1 text-xs sm:text-sm font-semibold text-primary">
                  See all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <ScrollRail label="Top artists" listClassName="-mx-1 gap-3 sm:gap-5 px-1 pb-1">
                {rankedArtists.slice(0, 16).map((artist) => (
                  <li key={artist.id} className="w-[26vw] max-w-[132px] flex-shrink-0 sm:w-32">
                    <Link to={artistPath(artist.id)} className="group block text-center">
                      <div
                        className={cn(
                          'mx-auto aspect-square w-full overflow-hidden rounded-full bg-secondary ring-2 ring-offset-2 ring-offset-background transition-transform duration-300 group-hover:scale-[1.04]',
                          liveArtistId === artist.id ? 'ring-primary' : 'ring-transparent',
                        )}
                      >
                        {artist.profileImage ? (
                          <img
                            src={thumb(artist.profileImage, 160)}
                            alt=""
                            width={128}
                            height={128}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                      </div>
                      <p className="mt-2 truncate text-xs sm:text-sm font-medium text-foreground">
                        <ArtistName name={artist.name} artistId={artist.id} size={12} />
                      </p>
                    </Link>
                  </li>
                ))}
              </ScrollRail>
            </section>
          )}

          {/* Every catalog, shelved by sound instead of one long wall of squares. */}
          {genreShelves.map(({ genre, catalogs: shelfCatalogs }) => (
            <Shelf
              key={genre}
              title={genre}
              catalogs={shelfCatalogs}
              onPlayCatalog={handlePlayCatalog}
              onPlayAll={() => {
                const queueSongs = songsFromCatalogs(shelfCatalogs);
                if (queueSongs.length) playQueue(queueSongs);
              }}
              playingSongId={playerState?.currentSong?.id}
              isPlaying={Boolean(playerState?.isPlaying)}
            />
          ))}

          {/* What artists have put inside their own worlds. */}
          <WorldMusicRow />

          <section id="playlists" aria-labelledby="playlists-heading">
            <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
              <h2 id="playlists-heading" className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                Your Playlists
              </h2>
              <Button type="button" size="sm" variant="outline" className="h-10 rounded-full" onClick={() => setIsCreatePlaylistOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </div>
            {playlists.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsCreatePlaylistOpen(true)}
                className="w-full rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground transition-colors hover:bg-card/60"
              >
                No playlists yet. Tap to start one.
              </button>
            ) : (
              <ScrollRail label="Your playlists" listClassName="-mx-1 gap-3 sm:gap-4 px-1 pb-1">
                {playlists.map((playlist) => (
                  <li key={playlist.id} className="w-[38vw] max-w-[176px] flex-shrink-0 sm:w-44">
                    <Link to={`/playlist/${playlist.id}`} className="group block">
                      <div
                        className={`flex aspect-square w-full items-center justify-center rounded-xl text-2xl font-bold text-primary-foreground transition-transform duration-300 group-hover:scale-[1.03] ${getPlaylistGradient(playlist)}`}
                      >
                        {playlist.name.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="mt-2 truncate text-sm font-medium text-foreground">{playlist.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {playlist.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        {playlist.is_public ? 'Public' : 'Private'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ScrollRail>
            )}
          </section>

          {/* Everything that is not a record, as one quiet row of doors. */}
          <nav aria-label="More on $ongChainn" className="border-t border-border/60 pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">More on $ongChainn</p>
            <div className="flex flex-wrap gap-2">
              {moreDoors.map(({ label, to, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3.5 text-xs sm:text-sm font-medium text-foreground transition-colors hover:bg-card"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
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
                            <ArtistName name={catalog.artist} artistId={catalog.artistId} size={12} />
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
                              } min-h-10`}
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
