import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, Music, Radio } from "lucide-react";
import { supabase } from "@/battlezone/integrations/supabase/client";

/**
 * The battle stage: the songs actually play here, in the room, while the battle
 * is live.
 *
 * The room used to show a "Now Playing" label with nothing behind it. Battles
 * carry songs_a and songs_b as [{id, title}], those ids are real rows in the
 * songs table with working audio, so the only thing missing was a player and
 * one shared idea of what is cued.
 *
 * How the sync works, and why it works this way:
 *
 *   The host owns the cue. Pressing play writes battles.now_playing, which is
 *   { side, songId, startedAt, paused }. Everyone else reads that column and
 *   plays the same track, seeking to (now - startedAt) so someone who walks in
 *   halfway lands where the room already is.
 *
 *   A listener still has to tap once. Browsers refuse to start audio without a
 *   gesture and no amount of code gets around that, so the first tap is the
 *   listener's own. After that tap they are following: every later cue from the
 *   host starts on its own, because the gesture has been given.
 *
 * This is host-driven, not sample-accurate. Two phones will be a fraction of a
 * second apart. For a room listening to a battle that is the right trade.
 */

interface StageSong {
  id: string;
  title: string;
  artistName: string;
  audioUrl: string;
  coverUrl: string | null;
}

/**
 * The host's cue, stored as jsonb on the battle. The index signature is there so
 * it satisfies the generated Json type on the way into the column.
 */
export interface NowPlaying {
  side: "A" | "B";
  songId: string;
  startedAt: string;
  paused?: boolean;
  [key: string]: string | boolean | undefined;
}

interface BattleStageProps {
  battleId: string;
  round: number;
  songsA: Array<{ id: string; title: string }>;
  songsB: Array<{ id: string; title: string }>;
  artistAName: string;
  artistBName: string;
  isHost: boolean;
  compact?: boolean;
}

async function loadSong(id: string | undefined): Promise<StageSong | null> {
  if (!id) return null;
  const { data } = await supabase
    .from("songs")
    .select("id, title, artist_name, audio_url, cover_art_url")
    .eq("id", id)
    .maybeSingle();
  if (!data?.audio_url) return null;
  return {
    id: String(data.id),
    title: data.title || "Untitled",
    artistName: data.artist_name || "",
    audioUrl: data.audio_url,
    coverUrl: data.cover_art_url || null,
  };
}

const BattleStage = ({
  battleId, round, songsA, songsB, artistAName, artistBName, isHost, compact = false,
}: BattleStageProps) => {
  const [songA, setSongA] = useState<StageSong | null>(null);
  const [songB, setSongB] = useState<StageSong | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [following, setFollowing] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const followingRef = useRef(false);
  followingRef.current = following;

  /* Resolve this round's two tracks. */
  useEffect(() => {
    let cancelled = false;
    const idA = songsA[round - 1]?.id ?? songsA[0]?.id;
    const idB = songsB[round - 1]?.id ?? songsB[0]?.id;
    void Promise.all([loadSong(idA), loadSong(idB)]).then(([a, b]) => {
      if (cancelled) return;
      setSongA(a);
      setSongB(b);
    });
    return () => { cancelled = true; };
  }, [songsA, songsB, round]);

  /* The host's cue, read by everyone. */
  const readCue = useCallback(async () => {
    const { data } = await supabase
      .from("battles")
      .select("now_playing")
      .eq("id", battleId)
      .maybeSingle();
    const cue = (data?.now_playing ?? null) as unknown as NowPlaying | null;
    setNowPlaying(cue && cue.songId ? cue : null);
  }, [battleId]);

  useEffect(() => {
    void readCue();
    const channel = supabase
      .channel(`battle-stage-${battleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "battles", filter: `id=eq.${battleId}` },
        (payload) => {
          const cue = ((payload.new as Record<string, unknown>)?.now_playing ?? null) as unknown as NowPlaying | null;
          setNowPlaying(cue && cue.songId ? cue : null);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [battleId, readCue]);

  const cuedSong = nowPlaying
    ? (nowPlaying.side === "A" ? songA : songB)
    : null;

  /* Follow the cue. The first tap is the listener's; every cue after that is ours. */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!nowPlaying || !cuedSong) {
      audio.pause();
      return;
    }
    if (!followingRef.current) return;

    const shouldChangeTrack = !audio.src.endsWith(encodeURI(cuedSong.audioUrl).slice(-40));
    if (audio.dataset.songId !== cuedSong.id) {
      audio.src = cuedSong.audioUrl;
      audio.dataset.songId = cuedSong.id;
      audio.load();
    } else if (shouldChangeTrack) {
      audio.dataset.songId = cuedSong.id;
    }

    if (nowPlaying.paused) {
      audio.pause();
      return;
    }

    const startedAt = new Date(nowPlaying.startedAt).getTime();
    const target = Math.max(0, (Date.now() - startedAt) / 1000);
    // Only correct a real drift. Nudging every tick makes the audio stutter.
    if (Number.isFinite(target) && Math.abs(audio.currentTime - target) > 2.5) {
      try { audio.currentTime = target; } catch { /* seek before metadata, harmless */ }
    }
    void audio.play().catch(() => {
      setFollowing(false);
      setAudioError("Tap listen to start the audio.");
    });
  }, [nowPlaying, cuedSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const setCue = useCallback(async (side: "A" | "B", song: StageSong | null) => {
    if (!song) return;
    const cue: NowPlaying = { side, songId: song.id, startedAt: new Date().toISOString(), paused: false };
    setNowPlaying(cue);
    await supabase.from("battles").update({ now_playing: cue }).eq("id", battleId);
  }, [battleId]);

  const pauseCue = useCallback(async () => {
    if (!nowPlaying) return;
    const cue: NowPlaying = { ...nowPlaying, paused: true };
    setNowPlaying(cue);
    await supabase.from("battles").update({ now_playing: cue }).eq("id", battleId);
  }, [battleId, nowPlaying]);

  const resumeCue = useCallback(async () => {
    if (!nowPlaying) return;
    const audio = audioRef.current;
    const at = audio?.currentTime ?? 0;
    const cue: NowPlaying = {
      ...nowPlaying,
      paused: false,
      startedAt: new Date(Date.now() - at * 1000).toISOString(),
    };
    setNowPlaying(cue);
    await supabase.from("battles").update({ now_playing: cue }).eq("id", battleId);
  }, [battleId, nowPlaying]);

  /* The listener's one tap. */
  const startListening = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !cuedSong || !nowPlaying) return;
    setAudioError(null);
    setFollowing(true);
    audio.src = cuedSong.audioUrl;
    audio.dataset.songId = cuedSong.id;
    audio.volume = volume;
    const startedAt = new Date(nowPlaying.startedAt).getTime();
    const target = Math.max(0, (Date.now() - startedAt) / 1000);
    audio.load();
    const seekAndPlay = () => {
      if (Number.isFinite(target)) {
        try { audio.currentTime = target; } catch { /* ignore */ }
      }
      void audio.play().catch(() => {
        setFollowing(false);
        setAudioError("Your browser blocked the audio. Tap listen again.");
      });
    };
    if (audio.readyState >= 1) seekAndPlay();
    else audio.addEventListener("loadedmetadata", seekAndPlay, { once: true });
  }, [cuedSong, nowPlaying, volume]);

  const stopListening = useCallback(() => {
    setFollowing(false);
    audioRef.current?.pause();
  }, []);

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  const neitherSongPlayable = !songA && !songB;
  const cuedArtist = nowPlaying?.side === "A" ? artistAName : artistBName;
  const isPaused = !!nowPlaying?.paused;

  return (
    <div className={`rounded-2xl border border-border bg-card/60 backdrop-blur ${compact ? "p-3.5" : "p-4 sm:p-5"}`}>
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setAudioError("That track would not load.")}
        onEnded={() => setElapsed(0)}
      />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-display text-muted-foreground flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5" /> The Stage
        </span>
        {nowPlaying && cuedSong && (
          <span className="text-[11px] text-primary flex items-center gap-1">
            {isPaused ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isPaused ? "Paused" : "Now playing"}
          </span>
        )}
      </div>

      {neitherSongPlayable ? (
        <p className="text-xs text-muted-foreground">
          No playable track is attached to this round yet. The host can add one from the battle page.
        </p>
      ) : (
        <>
          {nowPlaying && cuedSong ? (
            <div className="flex items-center gap-3 mb-3">
              {cuedSong.coverUrl && (
                <img
                  src={cuedSong.coverUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover border border-border shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground truncate">{cuedSong.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {cuedArtist}{cuedSong.artistName && cuedSong.artistName !== cuedArtist ? ` (${cuedSong.artistName})` : ""}
                </p>
              </div>
              {following && duration > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {fmt(elapsed)} / {fmt(duration)}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mb-3">
              {isHost ? "Pick a side below to start the music." : "Waiting for the host to start the music."}
            </p>
          )}

          {/* The listener's one tap, and the volume that follows it. */}
          {nowPlaying && cuedSong && (
            <div className="flex items-center gap-2 mb-3">
              {!following ? (
                <button
                  onClick={startListening}
                  className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="h-4 w-4" /> Listen along
                </button>
              ) : (
                <>
                  <button
                    onClick={stopListening}
                    className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
                  >
                    <Pause className="h-3.5 w-3.5" /> Mute me
                  </button>
                  <div className="flex items-center gap-2 flex-1">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                      aria-label="Volume"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {audioError && <p className="text-[11px] text-live mb-3">{audioError}</p>}

          {/* Host controls the cue for the whole room. */}
          {isHost && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Host, cue a track</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCue("A", songA)}
                  disabled={!songA}
                  className={`flex-1 min-w-[130px] rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    nowPlaying?.side === "A"
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-background/60 text-foreground hover:bg-muted"
                  }`}
                >
                  <Music className="h-3.5 w-3.5 inline mr-1.5" />
                  {artistAName}
                  <span className="block text-[10px] font-normal text-muted-foreground truncate">
                    {songA?.title || "no track"}
                  </span>
                </button>
                <button
                  onClick={() => setCue("B", songB)}
                  disabled={!songB}
                  className={`flex-1 min-w-[130px] rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    nowPlaying?.side === "B"
                      ? "border-secondary bg-secondary/15 text-secondary"
                      : "border-border bg-background/60 text-foreground hover:bg-muted"
                  }`}
                >
                  <Music className="h-3.5 w-3.5 inline mr-1.5" />
                  {artistBName}
                  <span className="block text-[10px] font-normal text-muted-foreground truncate">
                    {songB?.title || "no track"}
                  </span>
                </button>
                {nowPlaying && (
                  <button
                    onClick={() => (isPaused ? void resumeCue() : void pauseCue())}
                    className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                  >
                    {isPaused ? "Resume room" : "Pause room"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BattleStage;
