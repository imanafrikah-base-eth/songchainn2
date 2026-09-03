import { useMemo, useState } from 'react';
import { Music, Sparkles, Check } from 'lucide-react';
import { SONGS, ARTISTS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { SongCardMotion, SONGCARD_STYLES, type SongCardData } from './SongCardMotion';

/**
 * The audience's way of making something.
 *
 * Uploading photos and video belongs to artists, so the audience needed a real
 * thing to make rather than a locked door. A song card is built from a track
 * already on SONGCHAINN, a look, and their own words, and it moves in the feed.
 *
 * It carries no file. The card is data, and the app draws it, which is why it
 * costs nothing to store, cannot become a way to smuggle arbitrary media in,
 * and still looks like theirs.
 */

interface Props {
  value: SongCardData | null;
  onChange: (card: SongCardData | null) => void;
}

export function SongCardMaker({ value, onChange }: Props) {
  const { songs: published } = usePublishedCatalog();
  const [query, setQuery] = useState('');

  const catalog = useMemo(() => {
    const all = [...SONGS, ...published];
    return Array.from(new Map(all.map((s) => [s.id, s])).values());
  }, [published]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const artistName = (id: string) => ARTISTS.find((a) => a.id === id)?.name ?? '';
    const list = q
      ? catalog.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            (s.artist ?? artistName(s.artistId)).toLowerCase().includes(q),
        )
      : catalog;
    return list.slice(0, 8);
  }, [catalog, query]);

  const pick = (songId: string) => {
    const song = catalog.find((s) => s.id === songId);
    if (!song) return;
    onChange({
      songId: song.id,
      title: song.title,
      artist: song.artist ?? ARTISTS.find((a) => a.id === song.artistId)?.name ?? 'Unknown',
      coverImage: song.coverImage ?? null,
      style: value?.style ?? 'pulse',
      caption: value?.caption ?? '',
    });
  };

  if (!value) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Music className="h-4 w-4 text-primary" /> Pick a song
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalogue"
          className="mb-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="max-h-52 overflow-y-auto">
          {results.length === 0 && (
            <p className="px-1 py-3 text-xs text-muted-foreground">Nothing by that name.</p>
          )}
          {results.map((song) => (
            <button
              key={song.id}
              type="button"
              onClick={() => pick(song.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left hover:bg-muted/50"
            >
              <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded bg-muted">
                {song.coverImage && (
                  <img src={song.coverImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{song.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {song.artist ?? ARTISTS.find((a) => a.id === song.artistId)?.name}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" /> Your card
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Change song
        </button>
      </div>

      <div className="mx-auto w-full max-w-[240px]">
        <SongCardMotion card={value} />
      </div>

      <input
        value={value.caption}
        onChange={(e) => onChange({ ...value, caption: e.target.value.slice(0, 80) })}
        placeholder="Say something on the card"
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
      />

      <div className="flex flex-wrap gap-1.5">
        {SONGCARD_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange({ ...value, style: style.id })}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              value.style === style.id
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {value.style === style.id && <Check className="h-3 w-3" />}
            {style.label}
          </button>
        ))}
      </div>
    </div>
  );
}
