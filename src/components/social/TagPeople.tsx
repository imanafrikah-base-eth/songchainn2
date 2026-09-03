import { useEffect, useMemo, useState } from 'react';
import { Search, X, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Put people in a post.
 *
 * Anyone can be tagged, not only people you follow, which is what makes tagging
 * useful: the person you were in the studio with is often not somebody you have
 * followed yet. The people you follow are offered first because that is who you
 * usually mean, and the search reaches everybody else.
 *
 * Nobody is tagged silently. The names appear on the post and the person tagged
 * is notified, and they can take their own name off without asking the author.
 */

export interface TaggablePerson {
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
}

interface Props {
  selected: TaggablePerson[];
  onChange: (people: TaggablePerson[]) => void;
  onClose: () => void;
}

const rowToPerson = (p: Record<string, unknown>): TaggablePerson => ({
  user_id: String(p.user_id ?? p.id),
  display_name:
    (p.display_name as string) || (p.profile_name as string) || (p.username as string) || 'Someone',
  username: (p.username as string) ?? null,
  avatar_url: (p.profile_picture_url as string) || (p.avatar_url as string) || null,
});

const COLUMNS = 'id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url';

export function TagPeople({ selected, onChange, onClose }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [suggested, setSuggested] = useState<TaggablePerson[]>([]);
  const [results, setResults] = useState<TaggablePerson[]>([]);
  const [searching, setSearching] = useState(false);

  const chosen = useMemo(() => new Set(selected.map((p) => p.user_id)), [selected]);

  // Who you follow, offered before you type anything.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data: follows } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .limit(50);
      const ids = (follows ?? []).map((f: { following_id: string }) => f.following_id).filter(Boolean);
      if (!ids.length || cancelled) return;
      const { data } = await supabase
        .from('audience_profiles')
        .select(COLUMNS)
        .or(`id.in.(${ids.join(',')}),user_id.in.(${ids.join(',')})`)
        .limit(50);
      if (!cancelled) setSuggested(((data ?? []) as Record<string, unknown>[]).map(rowToPerson));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Search everybody else. Debounced, because a query per keystroke is a query
  // per keystroke for every person using the app.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        const safe = q.replace(/[%,()]/g, '');
        const { data } = await supabase
          .from('audience_profiles')
          .select(COLUMNS)
          .or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%,profile_name.ilike.%${safe}%`)
          .limit(20);
        setResults(((data ?? []) as Record<string, unknown>[]).map(rowToPerson));
        setSearching(false);
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (person: TaggablePerson) => {
    if (person.user_id === user?.id) return;
    onChange(
      chosen.has(person.user_id)
        ? selected.filter((p) => p.user_id !== person.user_id)
        : [...selected, person],
    );
  };

  const list = query.trim().length >= 2 ? results : suggested;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <UserPlus className="h-4 w-4 text-primary" /> Tag people
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the tag picker"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <button
              key={p.user_id}
              type="button"
              onClick={() => toggle(p)}
              className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {p.display_name}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      <div className="max-h-56 overflow-y-auto">
        {searching && (
          <p className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Searching
          </p>
        )}
        {!searching && list.length === 0 && (
          <p className="px-1 py-3 text-xs text-muted-foreground">
            {query.trim().length >= 2
              ? 'Nobody by that name.'
              : 'Follow someone, or search for them by name.'}
          </p>
        )}
        {list
          .filter((p) => p.user_id !== user?.id)
          .map((p) => (
            <button
              key={p.user_id}
              type="button"
              onClick={() => toggle(p)}
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left hover:bg-muted/50"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-xs font-bold text-primary">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  p.display_name.charAt(0)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{p.display_name}</span>
                {p.username && (
                  <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
                )}
              </span>
              {chosen.has(p.user_id) && (
                <span className="text-[11px] font-semibold text-primary">Tagged</span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
