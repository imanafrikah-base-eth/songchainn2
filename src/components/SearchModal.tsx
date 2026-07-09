import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Music, User, Disc3, X, TrendingUp, Clock } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SONGS, ARTISTS, CATALOGS, buildCatalogs, type Song, type Artist, type Catalog } from '@/data/musicData';
import { usePlayerActions } from '@/context/PlayerContext';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';

const RECENT_SEARCHES_KEY = 'songchainn_recent_searches';
const MAX_RECENT_SEARCHES = 8;

// Graceful localStorage wrapper — falls back to in-memory in private browsing / restricted webviews
// (mirrors the pattern in src/integrations/supabase/client.ts)
function safeStorage(): Storage | undefined {
  try {
    window.localStorage.setItem('__ss_probe', '1');
    window.localStorage.removeItem('__ss_probe');
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function loadRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(items: string[]) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items));
  } catch {
    // ignore write failures (e.g. quota exceeded)
  }
}

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

function buildResults(query: string, songs: Song[], artists: Artist[], catalogs: Catalog[]): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const results: SearchResult[] = [];

  songs.forEach((song) => {
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

  artists.forEach((artist) => {
    const score = scoreMatch(artist.name, q);
    if (score > 0) {
      results.push({
        kind: 'artist',
        id: artist.id,
        title: artist.name,
        subtitle: artist.location,
        image: artist.profileImage,
        score: score * 1.1,
      });
    }
  });

  catalogs.forEach((catalog) => {
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

type FilterKind = ResultKind | 'all';

const FILTERS: { id: FilterKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'song', label: 'Songs' },
  { id: 'artist', label: 'Artists' },
  { id: 'catalog', label: 'Catalogs' },
];

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const navigate = useNavigate();
  const { playSong } = usePlayerActions();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterKind>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());
  const inputRef = useRef<HTMLInputElement>(null);
  const { songs: publishedSongs, artists: publishedArtists } = usePublishedCatalog();
  const allSongs = useMemo(() => [...SONGS, ...publishedSongs], [publishedSongs]);
  const allArtists = useMemo(() => [...ARTISTS, ...publishedArtists], [publishedArtists]);
  const allCatalogs = useMemo(
    () => (publishedSongs.length ? buildCatalogs(allSongs) : CATALOGS),
    [allSongs, publishedSongs.length],
  );

  const results = useMemo(
    () => buildResults(query, allSongs, allArtists, allCatalogs),
    [query, allSongs, allArtists, allCatalogs],
  );

  const filteredResults = useMemo(
    () => (activeFilter === 'all' ? results : results.filter((r) => r.kind === activeFilter)),
    [results, activeFilter],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setActiveFilter('all');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, activeFilter]);

  const recordSearch = useCallback((rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES,
      );
      saveRecentSearches(next);
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((term: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((s) => s !== term);
      saveRecentSearches(next);
      return next;
    });
  }, []);

  const runRecentSearch = useCallback((term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      recordSearch(query);
      onOpenChange(false);
      if (result.kind === 'song') {
        const song = allSongs.find((s) => s.id === result.id);
        if (song) playSong(song);
      } else if (result.kind === 'artist') {
        navigate(`/artist/${result.id}`);
      } else {
        navigate(`/catalog/${result.id}`);
      }
    },
    [navigate, onOpenChange, playSong, allSongs, query, recordSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filteredResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (filteredResults[activeIndex]) {
          handleSelect(filteredResults[activeIndex]);
        } else if (query.trim()) {
          recordSearch(query);
        }
      }
    },
    [activeIndex, handleSelect, filteredResults, query, recordSearch],
  );

  const trending = useMemo(
    () =>
      [...allSongs]
        .sort((a, b) => (b.plays || 0) - (a.plays || 0))
        .slice(0, 5)
        .map((s) => ({ kind: 'song' as const, id: s.id, title: s.title, subtitle: s.artist, image: s.coverImage, score: s.plays })),
    [allSongs],
  );

  const displayList = query.trim() ? filteredResults : trending;
  const emptySearch = query.trim().length > 0 && filteredResults.length === 0;

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

        {/* Filter chips */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 overflow-x-auto">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                activeFilter === filter.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:text-foreground hover:border-foreground/30'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Recent searches */}
        {!query.trim() && recentSearches.length > 0 && (
          <div className="px-4 pt-2 pb-1">
            <div className="flex items-center gap-2 pb-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent searches
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((term) => (
                <div
                  key={term}
                  className="flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-muted text-xs text-foreground"
                >
                  <button type="button" onClick={() => runRecentSearch(term)} className="hover:text-primary transition-colors">
                    {term}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRecentSearch(term)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    aria-label={`Remove "${term}" from recent searches`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Label */}
        {!query.trim() && (
          <div className="flex items-center gap-2 px-4 pt-2 pb-1">
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
