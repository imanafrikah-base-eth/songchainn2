import { artistPath } from '@/lib/slugRoutes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { claimInterruption, releaseInterruption } from '@/lib/interruptions';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions, usePlayerState, usePlayerTime } from '@/context/PlayerContext';
import { ARTISTS, CATALOGS, SONGS, Song } from '@/data/musicData';
import { supabase } from '@/integrations/supabase/client';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useEngagement } from '@/context/EngagementContext';
import { useUserPoints } from '@/hooks/useUserPoints';
import { useToast } from '@/hooks/use-toast';
import moshaAvatar from '@/assets/Mo$ha chat pop up.webp';
import { AmbientBackground } from '@/components/AmbientBackground';
import { fcOpenUrl } from '@/lib/farcasterActions';
import { MoshaChat } from '@/components/mosha/MoshaChat';
import { useMoshaGreeting } from '@/hooks/useMoshaGreeting';

type AgentMode = 'unset' | 'music' | 'chill' | 'turnup' | 'focus' | 'feelings' | 'explore';
type MoodChoice = 'loving' | 'cool' | 'not_my_vibe';
type AgentStep =
  | 'welcome'
  | 'mode-picker'
  | 'mood'
  | 'next-song'
  | 'taste-lane'
  | 'room-invite'
  | 'discovery'
  | 'switch-check'
  | 'external-prompt';

interface RoomLiveUserRow {
  user_id: string;
  room_name: string | null;
  joined_at: string | null;
}

interface RoomInviteSummary {
  count: number;
  names: string[];
  energyLabel: string;
}

interface SignalState {
  skipCount: number;
  replayCount: number;
  likeCount: number;
  listenSecondsBySong: Record<string, number>;
  genreStarts: Record<string, number>;
  artistStarts: Record<string, number>;
  playedSongIds: string[];
}

interface ExternalPrompt {
  text: string;
  ctaLabel?: string;
  ctaPath?: string;
}

const STORAGE_MODE_KEY = 'songchainn_vibe_agent_mode_v2';
const STORAGE_DISMISSED_UNTIL_KEY = 'songchainn_vibe_agent_dismissed_until_v2';
const STORAGE_LANE_PLAYLIST_ID_KEY = 'songchainn_vibe_agent_lane_playlist_id';
const STORAGE_SESSION_START_KEY = 'songchainn_vibe_session_started_at';
// Closing Mo$ha means "not now": stay quiet for a full hour.
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60;

function modeTone(mode: AgentMode) {
  if (mode === 'chill') return 'soft';
  if (mode === 'turnup') return 'hype';
  if (mode === 'focus') return 'deep';
  if (mode === 'feelings') return 'emotional';
  if (mode === 'explore') return 'discovery';
  return 'neutral';
}

function modeLabel(mode: AgentMode) {
  if (mode === 'chill') return '🌊 Chill / Vibe';
  if (mode === 'turnup') return '🔥 Turn up';
  if (mode === 'focus') return '🧠 Focus';
  if (mode === 'feelings') return '💔 In my feelings';
  if (mode === 'explore') return '🌍 Explore new sounds';
  if (mode === 'music') return 'Play Music';
  return 'Vibe Session';
}

function getWaveWarzPrimer() {
  return 'WaveWarz Africa battles now run right here in $ongChainn -- watch live, vote, and speak in the room.';
}

function getTopCatalogBySong(song: Song) {
  return CATALOGS.find((catalog) => catalog.songIds.includes(song.id)) || null;
}

function buildTasteLane(mode: AgentMode, topGenre: string | null) {
  const genre = (topGenre || 'afro').toLowerCase();
  if (mode === 'chill') return `late night ${genre} chill`;
  if (mode === 'turnup') return `${genre} high-energy wave`;
  if (mode === 'focus') return `${genre} focus tunnel`;
  if (mode === 'feelings') return `melodic ${genre} wave`;
  if (mode === 'explore') return `underground ${genre} explorer`;
  if (mode === 'music') return `${genre} listener`;
  return `${genre} vibe explorer`;
}

function pickNextSong(params: {
  currentSong: Song;
  mood: MoodChoice;
  mode: AgentMode;
  genreStarts: Record<string, number>;
  artistStarts: Record<string, number>;
}) {
  const { currentSong, mood, mode, genreStarts, artistStarts } = params;
  const candidates = SONGS.filter((song) => song.id !== currentSong.id);
  if (!candidates.length) return null;

  const scored = candidates.map((song) => {
    let score = 0;
    if (song.genre === currentSong.genre) score += 10;
    if (song.artistId === currentSong.artistId) score += 6;
    score += (genreStarts[song.genre] || 0) * 4;
    score += (artistStarts[song.artistId] || 0) * 3;

    if (mode === 'explore') {
      if (song.genre !== currentSong.genre) score += 14;
      if (song.artistId !== currentSong.artistId) score += 10;
    }
    if (mode === 'turnup') {
      if (song.genre.includes('Dancehall') || song.genre.includes('HipHop') || song.genre.includes('Amapiano')) score += 8;
    }
    if (mode === 'chill' || mode === 'feelings') {
      if (song.genre.includes('Soul') || song.genre.includes('R&B') || song.genre.includes('Afro')) score += 7;
    }
    if (mode === 'focus') {
      if (song.genre.includes('LoFi') || song.genre.includes('House')) score += 8;
    }

    if (mood === 'loving' && song.genre === currentSong.genre) score += 8;
    if (mood === 'cool' && song.artistId !== currentSong.artistId) score += 5;
    if (mood === 'not_my_vibe' && song.genre !== currentSong.genre) score += 12;

    return { song, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.song || null;
}

/** True while a drawer, sheet or dialog owns the screen. */
function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Only the body's own attributes, and only the three that matter. An
    // earlier version watched every node in the document, which fired on
    // each animation frame of a playing app and pegged the main thread hard
    // enough to leave the page blank. A drawer or a dialog always leaves a
    // mark on the body, so the body is the only thing worth watching.
    const read = () => {
      const body = document.body;
      setOpen(
        body.hasAttribute('data-scroll-locked')
        || body.style.pointerEvents === 'none'
        || body.dataset.menuOpen === 'true'
        // Any hand-built panel that raised its hand through useOverlayFlag.
        || body.hasAttribute('data-overlay-open'),
      );
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'data-scroll-locked', 'data-menu-open', 'data-overlay-open'],
    });
    return () => mo.disconnect();
  }, []);
  return open;
}

export function VibeAgent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, audienceProfile } = useAuth();
  const { currentSong, isPlaying } = usePlayerState();
  const { currentTime } = usePlayerTime();
  const { playSong } = usePlayerActions();
  const { likedSongs, playlists, createPlaylist, addSongsToPlaylist, updatePlaylistVisibility } = useAudienceInteractions();
  const { engagementPoints, currentStreak } = useEngagement();
  const { lifetimePoints: ledgerPoints, streak: ledgerStreak } = useUserPoints();

  const [mode, setMode] = useState<AgentMode>('unset');
  const [step, setStep] = useState<AgentStep | null>(null);
  /** The conversation. The tab opens this; the scripted flows sit behind a chip inside it. */
  const [chatOpen, setChatOpen] = useState(false);

  // The launcher tab steps aside while the page is moving (see .agent-tab in
  // index.css). A body flag, so it is one listener for the whole app and the
  // CSS decides what "aside" looks like at each width.
  useEffect(() => {
    let timer: number | null = null;
    const onScroll = () => {
      document.body.dataset.scrolling = 'true';
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        delete document.body.dataset.scrolling;
        timer = null;
      }, 650);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) window.clearTimeout(timer);
      delete document.body.dataset.scrolling;
    };
  }, []);
  const [suggestedSong, setSuggestedSong] = useState<Song | null>(null);
  const [roomInvite, setRoomInvite] = useState<RoomInviteSummary | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState(0);
  const dismissedUntilRef = useRef(0);
  useEffect(() => { dismissedUntilRef.current = dismissedUntil; }, [dismissedUntil]);
  const [lanePlaylistId, setLanePlaylistId] = useState<string | null>(null);
  const [isBuildingLane, setIsBuildingLane] = useState(false);
  const { toast } = useToast();
  const overlayOpen = useOverlayOpen();
  /* Where Mo$ha does not belong.
     A tab parked on the right edge of every screen in the app is not helpful,
     it is furniture. He stays out of three kinds of place:

       - a battle, which is two artists, their names and the votes, and where a
         tab lands squarely on one of those names
       - a screen that already has its own Mo$ha, so he is not offering himself
         twice: The Room's chat and the world builder
       - a screen somebody is reading or working through rather than browsing:
         the legal pages, the admin console, the launcher, a world someone has
         walked into, and the account-deletion page

     Everywhere else he is one tap away, and a direct call always opens him
     wherever the person is. */
  const NO_MOSHA = [
    /^\/wavewarz-africa\/(battle|room|live)/,
    /^\/room\b/,
    /^\/world-builder\b/,
    /^\/world\//,
    /^\/w\//,
    /^\/launch\b/,
    /^\/drops\//,
    /^\/console\b/,
    /^\/admin\b/,
    /^\/terms\b/,
    /^\/privacy\b/,
    /^\/guidelines\b/,
    /^\/delete-account\b/,
    /^\/reset-password\b/,
  ];
  const noMoshaHere = NO_MOSHA.some((rx) => rx.test(location.pathname));
  const inABattle = /^\/wavewarz-africa\/(battle|room|live)/.test(location.pathname);
  /* A question handed in with the call, asked for them the moment it opens. */
  const [chatAsk, setChatAsk] = useState<string | null>(null);
  /**
   * A congratulations waiting to be said: a record went live, or an account was
   * verified. Mo$ha opens himself for this one rather than waiting to be
   * tapped, because the artist has no reason to know there is anything to open.
   */
  const { greeting: pendingGreeting, dismiss: dismissGreeting } = useMoshaGreeting();
  const [discoveryArtistName, setDiscoveryArtistName] = useState<string | null>(null);
  const [sessionStartAt, setSessionStartAt] = useState<number>(Date.now());
  const [externalPrompt, setExternalPrompt] = useState<ExternalPrompt | null>(null);
  const signalRef = useRef<SignalState>({
    skipCount: 0,
    replayCount: 0,
    likeCount: 0,
    listenSecondsBySong: {},
    genreStarts: {},
    artistStarts: {},
    playedSongIds: [],
  });
  const firstMoodAskedRef = useRef(false);
  const prevSongIdRef = useRef<string | null>(null);
  const prevSongTimeRef = useRef(0);
  const prevLikedSetRef = useRef<Set<string>>(new Set());
  const lastRoomPromptAtRef = useRef(0);
  const seenArtistsRef = useRef<Set<string>>(new Set());
  const lastSwitchPromptAtRef = useRef(0);
  const rewardsNudgeShownRef = useRef(false);

  const displayName = useMemo(() => {
    const profile = audienceProfile as any;
    return (
      profile?.display_name ||
      profile?.profile_name ||
      profile?.username ||
      user?.email?.split('@')[0] ||
      'there'
    );
  }, [audienceProfile, user?.email]);

  const topGenre = useMemo(() => {
    const entries = Object.entries(signalRef.current.genreStarts);
    if (!entries.length) return currentSong?.genre || null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0] || null;
  }, [currentSong?.genre]);

  const tasteLane = useMemo(() => buildTasteLane(mode, topGenre), [mode, topGenre]);

  const lanePlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === lanePlaylistId) || null,
    [lanePlaylistId, playlists]
  );

  const openStep = useCallback((next: AgentStep) => {
    // App-initiated. Mo$ha asks the interruption budget for the floor like
    // every other surface; a direct "Call Mo$ha" tap bypasses this on purpose.
    if (!claimInterruption('mosha-prompt', { priority: 'promo' })) return;
    setStep((prev) => prev || next);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedMode = localStorage.getItem(STORAGE_MODE_KEY);
      if (storedMode === 'music' || storedMode === 'chill' || storedMode === 'turnup' || storedMode === 'focus' || storedMode === 'feelings' || storedMode === 'explore') {
        setMode(storedMode);
      }
      const storedDismissedUntil = Number(localStorage.getItem(STORAGE_DISMISSED_UNTIL_KEY) || 0);
      if (Number.isFinite(storedDismissedUntil) && storedDismissedUntil > Date.now()) {
        setDismissedUntil(storedDismissedUntil);
      }
      const storedPlaylistId = localStorage.getItem(STORAGE_LANE_PLAYLIST_ID_KEY);
      if (storedPlaylistId) setLanePlaylistId(storedPlaylistId);
      const storedSessionStart = Number(localStorage.getItem(STORAGE_SESSION_START_KEY) || 0);
      if (Number.isFinite(storedSessionStart) && storedSessionStart > 0) {
        setSessionStartAt(storedSessionStart);
      } else {
        localStorage.setItem(STORAGE_SESSION_START_KEY, String(Date.now()));
      }
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    if (Date.now() < dismissedUntil) {
      setStep(null);
      return;
    }
    // Don't auto-expand the full panel for brand-new users — it covers most of
    // the screen (near-full-width on mobile) and blocks page-level controls like
    // the feed's floating create-post button. Show the small pill instead; the
    // user opens the full welcome flow with a tap.
    if (mode === 'unset') {
      return;
    }
    if (mode !== 'music' && currentSong && !firstMoodAskedRef.current) {
      firstMoodAskedRef.current = true;
      openStep('mood');
    }
  }, [currentSong, dismissedUntil, mode, openStep]);

  // Whenever the external prompt is not the thing on screen, the floor goes
  // back so the next surface in the queue can use it.
  useEffect(() => {
    if (step !== 'external-prompt') releaseInterruption('mosha-prompt');
  }, [step]);

  /**
   * A record went live, or an account was verified. Open and say so.
   *
   * This deliberately does NOT go through the interruption budget or the
   * dismissal cooldown that app-initiated prompts respect. Those exist to stop
   * marketing landing on somebody; this is the artist's own news about their
   * own work, they are owed it once, and it is marked said either way.
   */
  const [onOwnProfile, setOnOwnProfile] = useState(
    () => Boolean((window as Window & { __songchainnOwnProfile?: boolean }).__songchainnOwnProfile),
  );
  useEffect(() => {
    const onSignal = (e: Event) => setOnOwnProfile(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener('mosha:own-profile', onSignal);
    return () => window.removeEventListener('mosha:own-profile', onSignal);
  }, []);

  /**
   * Whether this is the right moment for the greeting at all.
   *  - The full welcome for a first record is said on the artist's own musician
   *    page and nowhere else, so it lands where it is true on screen.
   *  - A short "your song is live" or "you are verified" can be said anywhere
   *    Mo$ha is allowed, but never in the middle of a battle.
   * Until then the row simply waits; nothing is lost by waiting.
   */
  const greetingHere =
    pendingGreeting && !noMoshaHere && !inABattle && (pendingGreeting.kind !== 'first_song_live' || onOwnProfile)
      ? pendingGreeting
      : null;

  /**
   * Mo$ha opens himself for a greeting at most ONCE per visit, and never again
   * after the person has closed him. Closing is an answer. Before this, a
   * backlog of greetings (eleven songs going live) reopened him every time he
   * was shut, and any re-render (a scroll that refetched the greeting) could
   * bring him back: "I closed it and it pops up when I scroll".
   */
  const greetingAutoOpened = useRef(false);
  const closedByPerson = useRef(false);
  useEffect(() => {
    if (!greetingHere) return;
    if (chatOpen || step) return;
    if (greetingAutoOpened.current || closedByPerson.current) return;
    greetingAutoOpened.current = true;
    setChatOpen(true);
  }, [greetingHere, chatOpen, step]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      setDismissedUntil(0);
      // "Call Mo$ha" opens the conversation. The scripted vibe flow is one
      // chip away inside it. When something sent a question along with the
      // call (a purchase that failed, say), Mo$ha opens already holding it,
      // so the person does not have to explain their own problem twice.
      const asked = (event as CustomEvent<{ ask?: string } | undefined>)?.detail?.ask;
      setChatAsk(typeof asked === 'string' && asked.trim() ? asked.trim() : null);
      setChatOpen(true);
    };
    const handlePrompt = (event: Event) => {
      const detail = (event as CustomEvent<ExternalPrompt | undefined>)?.detail;
      const prompt: ExternalPrompt = {
        text: detail?.text || 'Hey fam, Mo$ha here.',
        ctaLabel: detail?.ctaLabel,
        ctaPath: detail?.ctaPath,
      };
      // App-initiated prompts respect a user's dismissal; only a direct
      // "Call Mo$ha" click (handleOpen) overrides the quiet period.
      if (Date.now() < dismissedUntilRef.current) return;
      // ...and they now also go through the app-wide interruption budget, so
      // Mo$ha cannot land on someone the second they arrive, and cannot stack
      // on top of a banner. A direct "Call Mo$ha" tap still always works.
      if (!claimInterruption('mosha-prompt', { priority: 'promo' })) return;
      setExternalPrompt(prompt);
      setStep('external-prompt');
    };
    window.addEventListener('songchainn:open-mosha', handleOpen as EventListener);
    window.addEventListener('songchainn:mosha-prompt', handlePrompt as EventListener);
    return () => {
      window.removeEventListener('songchainn:open-mosha', handleOpen as EventListener);
      window.removeEventListener('songchainn:mosha-prompt', handlePrompt as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!currentSong) return;
    if (prevSongIdRef.current === currentSong.id) return;

    const prevSongId = prevSongIdRef.current;
    if (prevSongId) {
      const listened = signalRef.current.listenSecondsBySong[prevSongId] || 0;
      const prevSongMeta = SONGS.find((song) => song.id === prevSongId);
      const duration = Number(prevSongMeta?.duration || 0);
      if (duration > 0 && listened < duration * 0.33) {
        signalRef.current.skipCount += 1;
      }
    }

    if (signalRef.current.playedSongIds.includes(currentSong.id)) {
      signalRef.current.replayCount += 1;
    } else {
      signalRef.current.playedSongIds.push(currentSong.id);
    }

    signalRef.current.genreStarts[currentSong.genre] = (signalRef.current.genreStarts[currentSong.genre] || 0) + 1;
    signalRef.current.artistStarts[currentSong.artistId] = (signalRef.current.artistStarts[currentSong.artistId] || 0) + 1;

    const distinctSongStarts = signalRef.current.playedSongIds.length;
    const canShowRewardsNudge =
      mode !== 'unset' &&
      mode !== 'music' &&
      !rewardsNudgeShownRef.current &&
      distinctSongStarts >= 4 &&
      Date.now() >= dismissedUntil &&
      !step;
    if (canShowRewardsNudge) {
      rewardsNudgeShownRef.current = true;
      setExternalPrompt({
        text:
          `You are on fire, ${displayName}. Song #${distinctSongStarts} just started and your momentum is building. ` +
          `Your points and streaks keep rising as you play music, chat in The Room, invite new users, and share songs to Feed. ` +
          `Right now you are on a ${ledgerStreak} day streak with ${ledgerPoints.toLocaleString()} points. ` +
          `Keep it going and you climb the leaderboard.`,
        ctaLabel: 'Show My Progress',
        ctaPath: '/profile',
      });
      if (claimInterruption('mosha-prompt', { priority: 'promo' })) {
        setStep('external-prompt');
      }
    }

    if (!seenArtistsRef.current.has(currentSong.artistId)) {
      seenArtistsRef.current.add(currentSong.artistId);
      const artist = ARTISTS.find((entry) => entry.id === currentSong.artistId);
      if (artist && mode !== 'music') {
        setDiscoveryArtistName(artist.name);
        openStep('discovery');
      }
    }

    prevSongIdRef.current = currentSong.id;
    prevSongTimeRef.current = currentTime;
  }, [currentSong, currentTime, ledgerStreak, dismissedUntil, displayName, ledgerPoints, mode, openStep, step]);

  useEffect(() => {
    if (!currentSong || !isPlaying) return;
    if (prevSongIdRef.current !== currentSong.id) return;
    const delta = Math.max(0, currentTime - prevSongTimeRef.current);
    if (delta <= 0 || delta > 6) {
      prevSongTimeRef.current = currentTime;
      return;
    }
    signalRef.current.listenSecondsBySong[currentSong.id] = (signalRef.current.listenSecondsBySong[currentSong.id] || 0) + delta;
    prevSongTimeRef.current = currentTime;
  }, [currentSong, currentTime, isPlaying]);

  useEffect(() => {
    const nextLikedSet = new Set(likedSongs);
    const prevLikedSet = prevLikedSetRef.current;
    nextLikedSet.forEach((songId) => {
      if (!prevLikedSet.has(songId)) {
        signalRef.current.likeCount += 1;
      }
    });
    prevLikedSetRef.current = nextLikedSet;
  }, [likedSongs]);

  useEffect(() => {
    if (mode === 'unset' || mode === 'music') return;
    if (Date.now() < dismissedUntil) return;
    const now = Date.now();
    if (now - sessionStartAt < 1000 * 60 * 15) return;
    if (now - lastSwitchPromptAtRef.current < 1000 * 60 * 25) return;
    if (step) return;
    lastSwitchPromptAtRef.current = now;
    setStep('switch-check');
  }, [dismissedUntil, mode, sessionStartAt, step]);

  useEffect(() => {
    if (!user?.id) return;
    if (mode === 'unset' || mode === 'music') return;
    if (Date.now() < dismissedUntil) return;

    let active = true;

    const pollRoom = async () => {
      const { data, error } = await (supabase as any)
        .from('room_live_users')
        .select('user_id, room_name, joined_at')
        .eq('room_id', 'global')
        .order('joined_at', { ascending: false })
        .limit(24);

      if (!active || error || !Array.isArray(data)) return;
      const rows = (data as RoomLiveUserRow[]).filter((row) => row.user_id && row.user_id !== user.id);
      if (rows.length < 1) return;
      const now = Date.now();
      if (now - lastRoomPromptAtRef.current < 1000 * 60 * 20) return;
      if (step) return;
      const names = rows
        .map((row) => (row.room_name || '').trim())
        .filter((name) => Boolean(name))
        .slice(0, 3);
      const energyLabel =
        mode === 'turnup'
          ? 'Afro Drill'
          : mode === 'chill'
            ? 'Afro Chill'
            : mode === 'focus'
              ? 'Deep Focus'
              : mode === 'feelings'
                ? 'Soul Waves'
                : mode === 'explore'
                  ? 'Discovery'
                  : currentSong?.genre || 'Global';
      setRoomInvite({ count: rows.length, names, energyLabel });
      lastRoomPromptAtRef.current = now;
      setStep('room-invite');
    };

    void pollRoom();
    const interval = window.setInterval(() => {
      void pollRoom();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentSong?.genre, dismissedUntil, mode, step, user?.id]);

  const closeAgent = useCallback(() => {
    const nextDismissedUntil = Date.now() + DISMISS_COOLDOWN_MS;
    setDismissedUntil(nextDismissedUntil);
    setStep(null);
    try {
      localStorage.setItem(STORAGE_DISMISSED_UNTIL_KEY, String(nextDismissedUntil));
    } catch {
      void 0;
    }
  }, []);

  const chooseVibe = useCallback((nextMode: AgentMode) => {
    setMode(nextMode);
    setStep(null);
    try {
      localStorage.setItem(STORAGE_MODE_KEY, nextMode);
    } catch {
      void 0;
    }
  }, []);

  const answerMood = useCallback((mood: MoodChoice) => {
    if (!currentSong) return;
    const next = pickNextSong({
      currentSong,
      mood,
      mode,
      genreStarts: signalRef.current.genreStarts,
      artistStarts: signalRef.current.artistStarts,
    });
    setSuggestedSong(next);
    setStep('next-song');
  }, [currentSong, mode]);

  const acceptNextSong = useCallback(() => {
    if (!suggestedSong) return;
    playSong(suggestedSong, { force: true });
    setStep('taste-lane');
  }, [playSong, suggestedSong]);

  const skipNextSong = useCallback(() => {
    setStep('taste-lane');
  }, []);

  const openWaveWarzPrimer = useCallback(() => {
    setExternalPrompt({
      text: `${getWaveWarzPrimer()} Want to watch or host a battle right now?`,
      ctaLabel: 'Watch Live Battles',
      ctaPath: '/wavewarz-africa/battles/live',
    });
    setStep('external-prompt');
  }, []);

  const recommendedCatalog = useMemo(() => {
    if (!suggestedSong && !currentSong) return null;
    return getTopCatalogBySong(suggestedSong || currentSong!);
  }, [currentSong, suggestedSong]);

  const recommendedArtist = useMemo(() => {
    const target = suggestedSong || currentSong;
    if (!target) return null;
    return ARTISTS.find((artist) => artist.id === target.artistId) || null;
  }, [currentSong, suggestedSong]);

  const toneLead = useMemo(() => {
    const tone = modeTone(mode);
    if (tone === 'soft') return 'This is your sound today 🔥';
    if (tone === 'hype') return 'Energy locked. We keep it moving.';
    if (tone === 'deep') return 'Locked in. Zero noise.';
    if (tone === 'emotional') return 'We stay in the feels lane.';
    if (tone === 'discovery') return 'Fresh finds loading.';
    return 'Vibe session active.';
  }, [mode]);

  const makeLanePlaylist = useCallback(async () => {
    if (isBuildingLane) return;
    setIsBuildingLane(true);
    try {
      const laneSongs = [...SONGS]
        .sort((a, b) => {
          const genreScoreA = signalRef.current.genreStarts[a.genre] || 0;
          const genreScoreB = signalRef.current.genreStarts[b.genre] || 0;
          const artistScoreA = signalRef.current.artistStarts[a.artistId] || 0;
          const artistScoreB = signalRef.current.artistStarts[b.artistId] || 0;
          const scoreA = genreScoreA * 4 + artistScoreA * 3 + Math.log10((a.plays || 0) + 1);
          const scoreB = genreScoreB * 4 + artistScoreB * 3 + Math.log10((b.plays || 0) + 1);
          return scoreB - scoreA;
        })
        .slice(0, 12);

      const playlist = await createPlaylist(
        `${tasteLane} session`,
        `Agent-generated lane for ${displayName}`,
        false,
        modeLabel(mode),
        tasteLane
      );
      if (!playlist) return;

      const addedCount = await addSongsToPlaylist(playlist.id, laneSongs.map((song) => song.id));
      setLanePlaylistId(playlist.id);
      try {
        localStorage.setItem(STORAGE_LANE_PLAYLIST_ID_KEY, playlist.id);
      } catch {
        void 0;
      }
      toast({
        title: 'Playlist ready!',
        description: `${addedCount} songs in your ${tasteLane} session.`,
      });
    } finally {
      setIsBuildingLane(false);
    }
  }, [addSongsToPlaylist, createPlaylist, displayName, isBuildingLane, mode, tasteLane, toast]);

  // Two things reaching for the same corner is one too many: while a menu,
  // a sheet or a dialog is open, Mo$ha waits its turn.
  /* Never in a battle, not even when called. Elsewhere the tab hides on the
     pages listed above and behind an overlay, but a direct call still opens
     him right where the person is standing. */
  if (inABattle) return null;
  if ((overlayOpen || noMoshaHere) && !chatOpen) return null;

  if (!step) {
    if (chatOpen) {
      return (
        <div className="agent-dock pointer-events-auto fixed z-[70] bottom-20 sm:bottom-24 md:bottom-6 right-2 sm:right-3 md:right-6 w-[min(calc(100vw-0.75rem),22rem)] sm:w-[23rem] md:w-[24rem]">
          <div className="overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur">
            <MoshaChat
              ask={chatAsk}
              onAsked={() => setChatAsk(null)}
              greeting={greetingHere?.body ?? null}
              suggestions={greetingHere?.suggestions ?? null}
              onClose={() => {
                // Said. Cleared on close rather than on open so that a panel
                // opened and shut in the same second still counts as read, and
                // a greeting can never be lost to a re-render before anyone
                // has seen it. Only the one actually shown: opening Mo$ha by
                // hand on another page must not use up a first-record welcome
                // that is still waiting for the artist's own page.
                if (greetingHere) dismissGreeting(greetingHere.id);
                closedByPerson.current = true;
                setChatOpen(false);
              }}
              extraChips={[
                {
                  label: mode === 'unset' ? 'Set my vibe' : `Change my vibe (${modeLabel(mode)})`,
                  onClick: () => {
                    setChatOpen(false);
                    setStep(mode === 'unset' ? 'welcome' : 'taste-lane');
                  },
                },
              ]}
            />
          </div>
        </div>
      );
    }
    if (mode === 'unset') {
      return (
        <div className="agent-dock agent-tab fixed z-[58]">
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            aria-label="Open Mo$ha"
            className="agent-tab-button border border-primary/50 bg-primary text-primary-foreground font-semibold shadow-xl shadow-primary/30 hover:bg-primary/90 active:scale-[0.98] transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            Mo$ha
          </button>
        </div>
      );
    }
    return (
      <div className="agent-dock agent-tab fixed z-[58]">
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          aria-label={`Open Mo$ha, ${modeLabel(mode)}`}
          className="agent-tab-button border border-primary/50 bg-primary text-primary-foreground font-semibold shadow-xl shadow-primary/30 hover:bg-primary/90 active:scale-[0.98] transition-colors"
        >
          Mo$ha
        </button>
      </div>
    );
  }

  return (
    <div className="agent-dock fixed z-[58] bottom-20 sm:bottom-24 md:bottom-6 right-2 sm:right-3 md:right-6 w-[min(calc(100vw-0.75rem),22rem)] sm:w-[23rem] md:w-[24rem]">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          className="relative isolate rounded-2xl border border-border bg-background/95 backdrop-blur shadow-2xl overflow-hidden"
        >
          <AmbientBackground pool="moSha" opacity={0.1} overlay="text" className="-z-10" />
          <div className="grid grid-cols-[5.2rem_minmax(0,1fr)] sm:grid-cols-[6.4rem_minmax(0,1fr)]">
            <div className="relative border-r border-border bg-gradient-to-b from-black/45 to-black/20">
              <img
                src={moshaAvatar}
                alt="Mosha"
                className="pointer-events-none select-none h-full w-full object-contain object-bottom p-1.5 sm:p-2"
              />
            </div>
            <div className="p-3 max-h-[68vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Sparkles className="w-3.5 h-3.5" />
              Mosha
            </div>
            <button
              type="button"
              onClick={closeAgent}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {step === 'welcome' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">Hey {displayName}, want to vibe-chat, explore WaveWarz Africa, or just play music?</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="h-10 text-xs" onClick={() => setStep('mode-picker')}>
                  Vibe chat
                </Button>
                <Button type="button" variant="outline" className="h-10 text-xs" onClick={() => chooseVibe('music')}>
                  Play Music
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-10 text-xs" onClick={() => navigate('/dj-shuffle')}>
                  Call DJ Shuffle
                </Button>
                <Button type="button" variant="outline" className="h-10 text-xs" onClick={openWaveWarzPrimer}>
                  WaveWarz Africa Info
                </Button>
              </div>
              <Button type="button" variant="outline" className="h-10 w-full text-xs" onClick={() => window.dispatchEvent(new CustomEvent('songchainn:open-suggestion-form'))}>
                Suggest improvement
              </Button>
            </div>
          )}

          {step === 'mode-picker' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">Pick your mood mode:</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button type="button" className="h-10 text-xs" onClick={() => chooseVibe('chill')}>🌊 Chill / Vibe</Button>
                <Button type="button" className="h-10 text-xs" onClick={() => chooseVibe('turnup')}>🔥 Turn up</Button>
                <Button type="button" className="h-10 text-xs" onClick={() => chooseVibe('focus')}>🧠 Focus</Button>
                <Button type="button" className="h-10 text-xs" onClick={() => chooseVibe('feelings')}>💔 In my feelings</Button>
                <Button type="button" className="h-10 text-xs" onClick={() => chooseVibe('explore')}>🌍 Explore new sounds</Button>
              </div>
            </div>
          )}

          {step === 'mood' && currentSong && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">
                {modeTone(mode) === 'hype'
                  ? `You just hit ${currentSong.title}. How is that energy?`
                  : modeTone(mode) === 'soft'
                    ? `How are you feeling ${currentSong.title} right now?`
                    : `How are you feeling ${currentSong.title}?`}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" className="h-10 text-[11px]" onClick={() => answerMood('loving')}>Loving it</Button>
                <Button type="button" variant="outline" className="h-10 text-[11px]" onClick={() => answerMood('cool')}>It&apos;s cool</Button>
                <Button type="button" variant="outline" className="h-10 text-[11px]" onClick={() => answerMood('not_my_vibe')}>Not my vibe</Button>
              </div>
            </div>
          )}

          {step === 'next-song' && suggestedSong && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">
                {mode === 'turnup'
                  ? `This next one keeps the same energy but hits harder: ${suggestedSong.title}.`
                  : mode === 'feelings'
                    ? `Switching you into a deeper emotional lane with ${suggestedSong.title}.`
                    : `You liked that vibe. Want more like this? ${suggestedSong.title} by ${suggestedSong.artist}.`}
                </p>
              </div>
              <p className="text-xs text-primary">{toneLead}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="h-10 text-xs" onClick={acceptNextSong}>Yes, play it</Button>
                <Button type="button" variant="outline" className="h-10 text-xs" onClick={skipNextSong}>Skip</Button>
              </div>
            </div>
          )}

          {step === 'taste-lane' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">This is your lane: <span className="font-semibold">{tasteLane}</span></p>
              </div>
              <p className="text-xs text-muted-foreground">
                Signals tracked: {signalRef.current.skipCount} skips · {signalRef.current.replayCount} replays · {signalRef.current.likeCount} likes
              </p>
              <div className="space-y-2">
                {recommendedCatalog && (
                  <button
                    type="button"
                    onClick={() => navigate(`/catalog/${recommendedCatalog.id}`)}
                    className="w-full text-left rounded-lg border border-border/60 bg-secondary/20 px-2.5 py-2 hover:bg-secondary/35 transition-colors"
                  >
                    <p className="text-xs text-muted-foreground">Catalog suggestion</p>
                    <p className="text-sm text-foreground font-medium truncate">{recommendedCatalog.title} · {recommendedCatalog.artist}</p>
                  </button>
                )}
                {recommendedArtist && (
                  <button
                    type="button"
                    onClick={() => navigate(artistPath(recommendedArtist.id))}
                    className="w-full text-left rounded-lg border border-border/60 bg-secondary/20 px-2.5 py-2 hover:bg-secondary/35 transition-colors"
                  >
                    <p className="text-xs text-muted-foreground">Artist to watch</p>
                    <p className="text-sm text-foreground font-medium truncate"><ArtistName name={recommendedArtist.name} artistId={recommendedArtist.id} size={14} /></p>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="h-10 text-xs" onClick={makeLanePlaylist} disabled={isBuildingLane}>
                  {isBuildingLane ? 'Building...' : 'Build playlist'}
                </Button>
                {lanePlaylist ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 text-xs"
                    onClick={() => navigate(`/playlist/${lanePlaylist.id}`)}
                  >
                    Open playlist
                  </Button>
                ) : (
                  <Button type="button" variant="outline" className="h-10 text-xs" onClick={() => setStep(null)}>
                    Close
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-10 text-xs" onClick={() => navigate('/dj-shuffle')}>
                  Want DJ Shuffle?
                </Button>
                <Button type="button" variant="outline" className="h-10 text-xs" onClick={openWaveWarzPrimer}>
                  Tell me about WaveWarz Africa
                </Button>
              </div>
              {lanePlaylist && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 text-xs"
                    onClick={async () => {
                      await updatePlaylistVisibility(lanePlaylist.id, !lanePlaylist.is_public);
                    }}
                  >
                    {lanePlaylist.is_public ? 'Make private' : 'Make public'}
                  </Button>
                  <Button type="button" variant="outline" className="h-10 text-xs" onClick={() => setStep(null)}>
                    Keep vibing
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 'room-invite' && roomInvite && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">
                {roomInvite.count} people are vibing in {roomInvite.energyLabel} room right now.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {roomInvite.names.length ? `Energy preview: ${roomInvite.names.join(', ')}` : 'Energy preview: live pulse and active chat.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="h-10 text-xs"
                  onClick={() => {
                    setStep(null);
                    navigate('/room');
                  }}
                >
                  Join room
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 text-xs"
                  onClick={() => {
                    setStep(null);
                    setRoomInvite(null);
                  }}
                >
                  Not now
                </Button>
              </div>
            </div>
          )}

          {step === 'discovery' && discoveryArtistName && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">
                {discoveryArtistName} is rising in Zambia. Early listeners are catching this wave.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="h-10 text-xs"
                  onClick={() => {
                    setStep('taste-lane');
                  }}
                >
                  Show picks
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 text-xs"
                  onClick={() => {
                    setStep(null);
                    setDiscoveryArtistName(null);
                  }}
                >
                  Nice
                </Button>
              </div>
            </div>
          )}

          {step === 'switch-check' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">You have been in this vibe for a while. Switch energy or stay here?</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="h-10 text-xs" onClick={() => setStep('mode-picker')}>
                  Switch up
                </Button>
                <Button type="button" variant="outline" className="h-10 text-xs" onClick={() => setStep(null)}>
                  Stay here
                </Button>
              </div>
            </div>
          )}

          {step === 'external-prompt' && externalPrompt && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm text-foreground">{externalPrompt.text}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {externalPrompt.ctaLabel && externalPrompt.ctaPath ? (
                  <Button
                    type="button"
                    className="h-10 text-xs"
                    onClick={() => {
                      const path = externalPrompt.ctaPath!;
                      if (/^https?:\/\//i.test(path)) {
                        void fcOpenUrl(path);
                      } else {
                        navigate(path);
                      }
                      setStep(null);
                    }}
                  >
                    {externalPrompt.ctaLabel}
                  </Button>
                ) : (
                  <Button type="button" className="h-10 text-xs" onClick={() => setStep(null)}>
                    Nice
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 text-xs"
                  onClick={() => setStep(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
