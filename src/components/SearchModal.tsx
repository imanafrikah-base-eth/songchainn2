import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Music, User, Disc3, X, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SONGS, ARTISTS, CATALOGS } from '@/data/musicData';
import { usePlayerActions } from '@/context/PlayerContext';

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResultKind = 'song' | 'artist' | 'catalog';

interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  image?: string;
  score: number;
}

function scoreMatch(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => t.includes(w))) return 50;
  return 0;
}

function buildResults(query: string): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const results: SearchResult[] = [];

  SONGS.forEach((song) => {
    const titleScore = scoreMatch(song.title, q);
    const artistScore = scoreMatch(song.artist, q) * 0.6;
    const score = Math.max(titleScore, artistScore);
    if (score > 0) {
      results.push({
        kind: 'song',
        id: song.id,
        title: song.title,
        subtitle: song.artist,
        image: song.coverImage,
        score,
      });
    }
  });

  ARTISTS.forEach((artist) => {
    const score = scoreMatch(artist.name, q);
    if (score > 0) {
      results.push({
        kind: 'artist',
        id: artist.id,
        title: artist.name,
        subtitle: artist.location || artist.townSquare,
        image: artist.profileImage,
        score: score * 1.1,
      });
    }
  });

  CATALOGS.forEach((catalog) => {
    const titleScore = scoreMatch(catalog.title, q);
    const artistScore = scoreMatch(catalog.artist, q) * 0.5;
    const score = Math.max(titleScore, artistScore);
    if (score > 0) {
      results.push({
        kind: 'catalog',
        id: catalog.id,
        title: catalog.title,
        subtitle: catalog.artist,
        image: catalog.coverImage,
        score,
      });
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

const KIND_LABEL: Record<ResultKind, string> = {
  song: 'Song',
  artist: 'Artist',
  catalog: 'Catalog',
};

const KIND_ICON: Record<ResultKind, typeof Music> = {
  song: Music,
  artist: User,
  catalog: Disc3,
};

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const navigate = useNavigate();
  const { playSong } = usePlayerActions();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => buildResults(query), [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      if (result.kind === 'song') {
        const song = SONGS.find((s) => s.id === result.id);
        if (song) playSong(song);
      } else if (result.kind === 'artist') {
        navigate(`/artist/${result.id}`);
      } else {
        navigate(`/catalog/${result.id}`);
      }
    },
    [navigate, onOpenChange, playSong],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      }
    },
    [activeIndex, handleSelect, results],
  );

  const trending = useMemo(
    () =>
      [...SONGS]
        .sort((a, b) => (b.plays || 0) - (a.plays || 0))
        .slice(0, 5)
        .map((s) => ({ kind: 'song' as const, id: s.id, title: s.title, subtitle: s.artist, image: s.coverImage, score: s.plays })),
    [],
  );

  const displayList = query.trim() ? results : trending;
  const emptySearch = query.trim().length > 0 && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg w-[95vw] overflow-hidden rounded-2xl border-border/60 bg-background shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search songs, artists, catalogs…"
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Label */}
        {!query.trim() && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trending</span>
          </div>
        )}

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto pb-2">
          {emptySearch ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No results for &quot;{query}&quot;
            </div>
          ) : (
            <ul className="py-1">
              {displayList.map((result, i) => {
                const Icon = KIND_ICON[result.kind];
                const isActive = i === activeIndex && query.trim().length > 0;
                return (
                  <li key={`${result.kind}-${result.id}`}>
                    <button
                      type="button"
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-primary/5 ${isActive ? 'bg-primary/8' : ''}`}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => handleSelect(result)}
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                        {result.image ? (
                          <img src={result.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <Icon className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase shrink-0">
                        {KIND_LABEL[result.kind]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
