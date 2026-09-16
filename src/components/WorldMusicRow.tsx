import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Loader2, Lock, Play } from 'lucide-react';
import { getWorldBySlug } from '@/worlds/registry';
import { useWorldMusicDrops, type WorldTrack } from '@/hooks/useWorldTracks';
import { useWorldTrackPlay, type WorldTrackAnswer } from '@/hooks/useWorldTrackPlay';
import { WorldTrackLock } from '@/components/worlds/WorldTrackLock';
import { usePlayerActions } from '@/context/PlayerContext';
import type { Song } from '@/data/musicData';

/**
 * What artists have dropped inside their worlds, shown as the thing itself
 * rather than an advert for it.
 *
 * Each card is the artist's own preview video, playing quietly as it comes
 * into view. Anybody may watch it. Tapping play asks for the record, and the
 * answer comes from the artist's door, not from this screen: a holder hears
 * it, everybody else is told plainly what it would take.
 */
export function WorldMusicRow() {
  const { data: tracks = [] } = useWorldMusicDrops(8);
  const navigate = useNavigate();
  const { playSong } = usePlayerActions();
  const { ask, asking } = useWorldTrackPlay();
  const [locked, setLocked] = useState<WorldTrackAnswer | null>(null);
  const [lastAsked, setLastAsked] = useState<WorldTrack | null>(null);

  const worldOf = useCallback((slug: string) => getWorldBySlug(slug), []);

  const tryPlay = useCallback(async (track: WorldTrack) => {
    setLastAsked(track);
    const answer = await ask(track);
    if (!answer) return;
    if (answer.allowed && answer.url) {
      // A world track is not in the catalogue, so it is handed to the player
      // as itself: the signed link, the artist's cover, and a title that says
      // where it lives.
      const asSong: Song = {
        id: track.id,
        title: [track.title, track.partLabel].filter(Boolean).join(', '),
        artist: track.artistCredit || worldOf(track.worldSlug)?.artistName || '',
        artistId: track.artistId || '',
        audioUrl: answer.url,
        coverImage: track.artworkUrl || '',
        plays: 0,
        likes: 0,
        townSquare: '',
        genre: 'Afro',
        addedAt: track.publishedAt || new Date().toISOString(),
        volume: `${worldOf(track.worldSlug)?.artistName ?? 'The'} world`,
      } as Song;
      playSong(asSong, { force: true });
      return;
    }
    setLocked(answer);
  }, [ask, playSong, worldOf]);

  if (tracks.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-zinc-400 sm:h-5 sm:w-5" />
          <h2 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">
            Straight from the worlds
          </h2>
        </div>
        {/* Room on the right for the floating Mo$ha button, which used to sit
            on top of the end of this line. */}
        <p className="mt-1 max-w-[46ch] pr-16 text-xs text-muted-foreground sm:pr-0 sm:text-sm">
          Music artists keep inside their own world. Watch any preview. Holders hear the record.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tracks.map((track) => {
          const world = worldOf(track.worldSlug);
          const artist = track.artistCredit || world?.artistName || '';
          return (
            <article
              key={track.id}
              className="w-[190px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <PreviewFilm
                videoUrl={track.previewVideoUrl}
                poster={track.artworkUrl}
                title={track.title}
                onOpen={() => navigate(track.streetSlug ? `/world/${track.worldSlug}/${track.streetSlug}` : `/world/${track.worldSlug}`)}
              />
              <div className="space-y-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-100">
                    {track.title}
                    {track.partLabel ? <span className="text-zinc-400">{` ${track.partLabel.toLowerCase()}`}</span> : null}
                  </div>
                  <div className="truncate text-xs text-zinc-400">{artist}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void tryPlay(track)}
                  disabled={asking === track.id}
                  aria-label={`Play ${track.title}${track.partLabel ? ` ${track.partLabel}` : ''}`}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-60"
                >
                  {asking === track.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Lock className="h-3.5 w-3.5 text-zinc-400" />}
                  <span>Play the record</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <WorldTrackLock
        answer={locked}
        artistName={locked ? (worldOf(locked.worldSlug)?.artistName ?? 'the artist') : ''}
        tokenSymbol={locked ? (worldOf(locked.worldSlug)?.tokenSymbol ?? 'the coin') : ''}
        onOpenChange={(open) => { if (!open) setLocked(null); }}
        onRetry={() => {
          setLocked(null);
          if (lastAsked) void tryPlay(lastAsked);
        }}
      />
    </section>
  );
}

/**
 * The preview itself. It plays without sound as soon as it is on screen, the
 * way a person expects a clip to, and stops the moment it is not, so a row of
 * them never fights the music that is already playing.
 */
function PreviewFilm({
  videoUrl,
  poster,
  title,
  onOpen,
}: {
  videoUrl: string | null;
  poster: string | null;
  title: string;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !videoUrl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => undefined);
        else el.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [videoUrl]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${title} in the world it lives in`}
      className="relative block aspect-[4/5] w-full overflow-hidden bg-zinc-900"
    >
      {videoUrl ? (
        <video
          ref={ref}
          src={videoUrl}
          poster={poster ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : poster ? (
        <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : null}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-zinc-100">
        <Play className="h-2.5 w-2.5" />
        Preview
      </span>
    </button>
  );
}
