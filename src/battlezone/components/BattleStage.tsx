import { useEffect, useMemo, useRef, useState } from "react";
import { Music } from "lucide-react";
import { supabase } from "@/battlezone/integrations/supabase/client";
import { SONGS } from "@/data/musicData";
import { buildClock } from "@/battlezone/lib/battleStages";
import { durationFromUrl } from "@/battlezone/lib/songDuration";
import { getBattleAudioElement, setBattleAudioBlocked } from "@/battlezone/lib/audioUnlock";

/**
 * The battle stage: the battle's songs play here for EVERYONE in the room, on
 * their own, following the battle clock.
 *
 * How the sync works:
 *
 *   The clock is the battle row. When a battle goes live the host's screen
 *   writes music_ends_at (and closes_at) worked out from the songs' lengths,
 *   measured with durationFromUrl and falling back to the standard slot.
 *   Every screen measures the same files the same way, so every screen can
 *   work backwards to the same start instant:
 *
 *     start = launched_at, when the row has it (the song slots are then
 *             stretched to fit exactly between launched_at and music_ends_at)
 *     start = music_ends_at minus the sum of the slots, otherwise
 *
 *   Songs play in battle order (A1, B1, A2, B2 ...). Once a second each screen
 *   works out which song should be playing and how far in, and seeks only
 *   when it is more than two seconds out, so a late joiner lands on the same
 *   song at the same moment and nobody stutters. After the last song comes
 *   the closing window (silence, last call), then the host's screen ends the
 *   battle.
 *
 *   There is no listen button and no mute. Everyone in the room hears the
 *   battle. The browser's own gesture rule is handled by lib/audioUnlock.
 */

interface OrderedSong {
  id: string;
  title: string;
  side: "A" | "B";
}

interface ResolvedTrack {
  key: string;
  id: string;
  side: "A" | "B";
  title: string;
  artistName: string;
  audioUrl: string | null;
  coverUrl: string | null;
  measured: number | null;
}

interface ScheduledTrack extends ResolvedTrack {
  /** Seconds from the start of the music. */
  start: number;
  slot: number;
}

type Phase = "off" | "waiting" | "playing" | "closing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIFT_SECONDS = 2;

interface BattleStageProps {
  songsA: Array<{ id: string; title: string }>;
  songsB: Array<{ id: string; title: string }>;
  artistAName: string;
  artistBName: string;
  musicEndsAt?: string | null;
  launchedAt?: string | null;
  /** The battle is live and not ended. Music only plays while this is true. */
  live: boolean;
  ended: boolean;
  compact?: boolean;
}

function playOrder(songsA: OrderedSong[], songsB: OrderedSong[]): OrderedSong[] {
  const out: OrderedSong[] = [];
  const n = Math.max(songsA.length, songsB.length);
  for (let i = 0; i < n; i++) {
    if (songsA[i]) out.push(songsA[i]);
    if (songsB[i]) out.push(songsB[i]);
  }
  return out;
}

async function resolveTracks(order: OrderedSong[], artistAName: string, artistBName: string): Promise<ResolvedTrack[]> {
  const ids = order.map((o) => o.id).filter((id) => UUID.test(id));
  const rows = new Map<string, { title: string | null; artist_name: string | null; audio_url: string | null; cover_art_url: string | null }>();
  if (ids.length) {
    const { data } = await supabase
      .from("songs")
      .select("id, title, artist_name, audio_url, cover_art_url")
      .in("id", ids);
    for (const r of data ?? []) rows.set(String(r.id), r);
  }
  const base = order.map((o, i) => {
    const row = rows.get(o.id);
    const cat = SONGS.find((s) => s.id === o.id);
    return {
      key: `${i}:${o.id}`,
      id: o.id,
      side: o.side,
      title: row?.title || cat?.title || o.title || "Untitled",
      artistName: row?.artist_name || cat?.artist || (o.side === "A" ? artistAName : artistBName),
      // The same preference the host screen used when it measured the clock.
      audioUrl: cat?.audioUrl || row?.audio_url || null,
      coverUrl: row?.cover_art_url || cat?.coverImage || null,
    };
  });
  const measured = await Promise.all(base.map((t) => durationFromUrl(t.audioUrl)));
  return base.map((t, i) => ({ ...t, measured: measured[i] }));
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const BattleStage = ({
  songsA, songsB, artistAName, artistBName, musicEndsAt, launchedAt, live, ended, compact = false,
}: BattleStageProps) => {
  const [resolved, setResolved] = useState<ResolvedTrack[] | null>(null);
  const [pos, setPos] = useState<{ index: number; offset: number; phase: Phase }>({ index: -1, offset: 0, phase: "off" });
  const [trackError, setTrackError] = useState<string | null>(null);

  /* The battle row is refetched every few seconds, so key on the songs, not the array. */
  const order = useMemo(
    () =>
      playOrder(
        songsA.map((s) => ({ ...s, side: "A" as const })),
        songsB.map((s) => ({ ...s, side: "B" as const })),
      ),
    [songsA, songsB],
  );
  const orderKey = order.map((o) => `${o.side}:${o.id}`).join("|");
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    void resolveTracks(orderRef.current, artistAName, artistBName).then((tracks) => {
      if (!cancelled) setResolved(tracks);
    });
    return () => {
      cancelled = true;
    };
  }, [orderKey, artistAName, artistBName]);

  const schedule = useMemo(() => {
    if (!resolved?.length || !musicEndsAt) return null;
    const endMs = Date.parse(musicEndsAt);
    if (!Number.isFinite(endMs)) return null;
    const slots = resolved.map((t) => buildClock([t.measured]).musicSeconds);
    const sum = slots.reduce((a, b) => a + b, 0);
    if (sum <= 0) return null;

    let startMs = endMs - sum * 1000;
    let scale = 1;
    const launched = launchedAt ? Date.parse(launchedAt) : NaN;
    if (Number.isFinite(launched) && launched < endMs) {
      startMs = launched;
      scale = (endMs - launched) / 1000 / sum;
    }
    let cursor = 0;
    const tracks: ScheduledTrack[] = resolved.map((t, i) => {
      const slot = slots[i] * scale;
      const track = { ...t, start: cursor, slot };
      cursor += slot;
      return track;
    });
    return { startMs, tracks, musicSeconds: cursor };
  }, [resolved, musicEndsAt, launchedAt]);

  /* Follow the clock, once a second. */
  useEffect(() => {
    const el = getBattleAudioElement();
    if (!el) return;

    const stop = () => {
      el.dataset.wantPlaying = "";
      if (!el.paused) el.pause();
    };

    if (!live || !schedule) {
      stop();
      setBattleAudioBlocked(false);
      setPos({ index: -1, offset: 0, phase: live ? "waiting" : "off" });
      return;
    }

    const onError = () => setTrackError(el.dataset.track ?? null);
    el.addEventListener("error", onError);

    const tick = () => {
      const elapsed = (Date.now() - schedule.startMs) / 1000;
      if (elapsed < 0) {
        stop();
        setPos({ index: -1, offset: 0, phase: "waiting" });
        return;
      }
      if (elapsed >= schedule.musicSeconds) {
        stop();
        setBattleAudioBlocked(false);
        setPos({ index: -1, offset: 0, phase: "closing" });
        return;
      }
      const index = Math.max(0, schedule.tracks.findIndex((t) => elapsed < t.start + t.slot));
      const track = schedule.tracks[index];
      const offset = elapsed - track.start;
      setPos({ index, offset, phase: "playing" });

      if (!track.audioUrl) {
        stop();
        return;
      }
      el.dataset.wantPlaying = "1";

      if (el.dataset.track !== track.key) {
        el.dataset.track = track.key;
        setTrackError(null);
        el.src = track.audioUrl;
        el.addEventListener(
          "loadedmetadata",
          () => {
            const off = (Date.now() - schedule.startMs) / 1000 - track.start;
            try {
              if (off > 0 && (!Number.isFinite(el.duration) || off < el.duration)) el.currentTime = off;
            } catch {
              /* a seek the browser will not take yet; the next tick corrects it */
            }
          },
          { once: true },
        );
        el.load();
      } else if (el.readyState >= 1) {
        // A song shorter than its slot: let it finish, then silence until the next.
        if (Number.isFinite(el.duration) && offset >= el.duration - 0.25) return;
        if (Math.abs(el.currentTime - offset) > DRIFT_SECONDS) {
          try {
            el.currentTime = offset;
          } catch {
            /* ignore */
          }
        }
      }

      if (el.paused && !el.ended) {
        el.play()
          .then(() => setBattleAudioBlocked(false))
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "NotAllowedError") setBattleAudioBlocked(true);
          });
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
      el.removeEventListener("error", onError);
      stop();
    };
  }, [live, schedule]);

  /* Leaving the room: silence, and forget the track so the next room starts clean. */
  useEffect(
    () => () => {
      const el = getBattleAudioElement();
      if (el) {
        el.dataset.wantPlaying = "";
        el.pause();
        delete el.dataset.track;
      }
      setBattleAudioBlocked(false);
    },
    [],
  );

  const current = pos.phase === "playing" && schedule ? schedule.tracks[pos.index] : null;
  const cuedArtist = current ? (current.side === "A" ? artistAName : artistBName) : "";
  const noClock = live && resolved !== null && !schedule;
  const nothingPlayable = resolved !== null && resolved.every((t) => !t.audioUrl);

  let message: string | null = null;
  if (ended) message = "The battle is over. The music has stopped.";
  else if (!live) message = "The music starts when the battle goes live.";
  else if (resolved === null) message = "Getting the songs ready.";
  else if (nothingPlayable) message = "No playable track is attached to this battle.";
  else if (noClock) message = "This battle has no clock, so the music cannot follow it.";
  else if (pos.phase === "waiting") message = "The music starts in a moment.";
  else if (pos.phase === "closing") message = "The music is done. Last call for votes.";
  else if (current && !current.audioUrl) message = "This song would not load, the next one follows on time.";

  return (
    <div className={`rounded-2xl border border-border bg-card/60 backdrop-blur ${compact ? "p-3.5" : "p-4 sm:p-5"}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-display text-muted-foreground">
          <Music className="h-3.5 w-3.5" /> The Stage
        </span>
        {current && schedule && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Song {pos.index + 1} of {schedule.tracks.length}
          </span>
        )}
      </div>

      {current && current.audioUrl ? (
        <div className="flex items-center gap-3">
          {current.coverUrl && (
            <img
              src={current.coverUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">{current.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {cuedArtist}
              {current.artistName && current.artistName !== cuedArtist ? ` (${current.artistName})` : ""}
            </p>
            {trackError === current.key && (
              <p className="text-[11px] text-muted-foreground">This song would not load, the next one follows on time.</p>
            )}
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {fmt(pos.offset)} / {fmt(current.slot)}
          </span>
        </div>
      ) : (
        message && <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
};

export default BattleStage;
