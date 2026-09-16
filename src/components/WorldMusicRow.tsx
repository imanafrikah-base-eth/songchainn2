import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Loader2, Lock, Play, Tag } from 'lucide-react';
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
 * One card is one project, however many songs are in it: the artist's own
 * preview, looping quietly, with what it takes to hear the record written on
 * it. Anybody may watch. Tapping play asks the artist's door, and the answer
 * comes from there, never from this screen.
 *
 * A drop stands here for a fortnight. After that it belongs to the world it
 * lives in, and this row moves on to whatever is new.
 */

/** "$1" rather than "$1.00" when a price is round, which is how a person says it. */
const holdLabel = (usd: number) => (Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`);

interface Drop {
  key: string;
  worldSlug: string;
  streetSlug: string | null;
  title: string;
  /** Every preview the project has; the card plays them one after another. */
  videoUrls: string[];
  artwork: string | null;
  unlockUsd: number;
  genres: string[];
  credit: string;
  /** The artist's own line about the project. */
  blurb: string | null;
  tracks: WorldTrack[];
}

function toDrops(tracks: WorldTrack[]): Drop[] {
  const byRelease = new Map<string, Drop>();
  for (const track of tracks) {
    const key = track.releaseSlug ?? track.id;
    const existing = byRelease.get(key);
    if (!existing) {
      byRelease.set(key, {
        key,
        worldSlug: track.worldSlug,
        streetSlug: track.streetSlug,
        title: track.releaseTitle ?? [track.title, track.partLabel].filter(Boolean).join(', '),
        videoUrls: track.previewVideoUrl ? [track.previewVideoUrl] : [],
        artwork: track.artworkUrl,
        unlockUsd: track.unlockUsd,
        genres: track.genre ? [track.genre] : [],
        credit: track.artistCredit ?? '',
        blurb: track.blurb,
        tracks: [track],
      });
      continue;
    }
    existing.tracks.push(track);
    if (track.previewVideoUrl && !existing.videoUrls.includes(track.previewVideoUrl)) {
      existing.videoUrls.push(track.previewVideoUrl);
    }
    if (!existing.artwork) existing.artwork = track.artworkUrl;
    if (track.genre && !existing.genres.includes(track.genre)) existing.genres.push(track.genre);
    if (!existing.blurb) existing.blurb = track.blurb;
    existing.unlockUsd = Math.min(existing.unlockUsd, track.unlockUsd);
  }
  return [...byRelease.values()];
}

export function WorldMusicRow() {
  const { data: tracks = [] } = useWorldMusicDrops();
  const navigate = useNavigate();
  const { playSong } = usePlayerActions();
  const { ask, asking } = useWorldTrackPlay();
  const [locked, setLocked] = useState<WorldTrackAnswer | null>(null);
  const [lastAsked, setLastAsked] = useState<WorldTrack | null>(null);

  const drops = useMemo(() => toDrops(tracks), [tracks]);
  const worldOf = useCallback((slug: string) => getWorldBySlug(slug), []);

  const tryPlay = useCallback(async (track: WorldTrack) => {
    setLastAsked(track);
    const answer = await ask(track);
    if (!answer) return;
    if (answer.allowed && answer.url) {
      // A world track is not in the catalogue, so it is handed to the player
      // as itself: the signed link, the artist's cover, and a name that says
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
        volume: track.releaseTitle || `${worldOf(track.worldSlug)?.artistName ?? 'The'} world`,
      } as Song;
      playSong(asSong, { force: true });
      return;
    }
    setLocked(answer);
  }, [ask, playSong, worldOf]);

  if (drops.length === 0) return null;

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
          New music artists keep inside their own world. Watch any preview. Holders hear the record.
        </p>
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:gap-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {drops.map((drop) => {
          const world = worldOf(drop.worldSlug);
          const artist = world?.artistName || drop.credit;
          const symbol = world?.tokenSymbol ?? 'the coin';
          const first = drop.tracks[0];
          const songs = drop.tracks.length;
          const meta = songs > 1
            ? `${songs} songs · ${drop.genres.slice(0, 3).join(', ')}`
            : [drop.genres[0], drop.credit].filter(Boolean).join(' · ');
          return (
            <article
              key={drop.key}
              className="w-[78vw] max-w-[300px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:w-[268px]"
            >
              <PreviewFilm
                videoUrls={drop.videoUrls}
                poster={drop.artwork}
                title={drop.title}
                priceTag={`Hold ${holdLabel(drop.unlockUsd)} of ${symbol}`}
                onOpen={() => navigate(drop.streetSlug ? `/world/${drop.worldSlug}/${drop.streetSlug}` : `/world/${drop.worldSlug}`)}
              />
              <div className="space-y-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-100">{drop.title}</div>
                  <div className="truncate text-xs text-zinc-400">{artist}</div>
                  <div className="truncate text-[11px] text-zinc-500">{meta}</div>
                  {/* What the artist says it is, in their own words. Two lines,
                      so a card stays a card. */}
                  {drop.blurb ? (
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-zinc-400">{drop.blurb}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void tryPlay(first)}
                  disabled={asking === first.id}
                  aria-label={`Play ${drop.title}`}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-60"
                >
                  {asking === first.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Lock className="h-3.5 w-3.5 text-zinc-400" />}
                  <span>{songs > 1 ? 'Play the project' : 'Play the record'}</span>
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
 * The preview itself: square, so a square clip and a wide one both sit well in
 * the same row on a phone and on a computer. It loops without sound as soon as
 * it is on screen, the way a person expects a clip to, and stops the moment it
 * is not, so a row of them never fights the music that is already playing.
 */
function PreviewFilm({
  videoUrls,
  poster,
  title,
  priceTag,
  onOpen,
}: {
  videoUrls: string[];
  poster: string | null;
  title: string;
  /** What it takes to hear the record, said on the card itself. */
  priceTag: string;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // A project with more than one preview shows them in turn, so a two part
  // release is not represented by half of itself.
  const [reel, setReel] = useState(0);
  const videoUrl = videoUrls.length > 0 ? videoUrls[reel % videoUrls.length] : null;

  useEffect(() => {
    const el = ref.current;
    if (!el || !videoUrl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => undefined);
        else el.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [videoUrl]);

  // A new clip in the same frame starts by itself, or the card would sit on a
  // still after the first one ends.
  useEffect(() => {
    const el = ref.current;
    if (!el || !videoUrl || reel === 0) return;
    void el.play().catch(() => undefined);
  }, [reel, videoUrl]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${title} in the world it lives in`}
      className="relative block aspect-square w-full overflow-hidden bg-zinc-900"
    >
      {/* The artwork sits under the clip, always. A video that has not decoded
          its first frame yet paints nothing, and a black square where a record
          should be is the difference between a shop and a building site. */}
      {poster ? (
        <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : null}
      {videoUrl ? (
        <video
          ref={ref}
          src={videoUrl}
          poster={poster ?? undefined}
          muted
          loop={videoUrls.length === 1}
          autoPlay
          playsInline
          preload="metadata"
          onEnded={() => setReel((n) => n + 1)}
          className="relative h-full w-full object-cover"
        />
      ) : null}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-zinc-100">
        <Play className="h-2.5 w-2.5" />
        Preview
      </span>
      <span className="absolute bottom-2 left-2 right-2 inline-flex items-center justify-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-zinc-100 backdrop-blur-[2px]">
        <Tag className="h-2.5 w-2.5 shrink-0 text-zinc-300" />
        <span className="truncate">{priceTag}</span>
      </span>
    </button>
  );
}
