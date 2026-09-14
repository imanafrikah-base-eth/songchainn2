import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { profileHasRealName } from '@/lib/realName';
import { VerifiedMark } from '@/components/ArtistName';
import type { MentionPerson } from '@/lib/mentions';
import { cn } from '@/lib/utils';

/**
 * A text box where "@" brings up people.
 *
 * Type @ and the people you follow come up; keep typing and it searches
 * everybody by name, artists first. Arrow keys and Enter, or a tap, put the
 * name in the words. Every name picked is handed to onPick, so whoever sends
 * the words can say exactly which person each one meant.
 */

const COLUMNS = 'id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url';
const TRIGGER = /(^|\s)@([^\s@]{0,30})$/;

function toPerson(p: Record<string, unknown>): MentionPerson {
  const name = (p.display_name as string) || (p.profile_name as string) || (p.username as string) || 'Someone';
  return {
    user_id: String(p.user_id ?? p.id),
    display_name: name.trim().slice(0, 80),
    username: (p.username as string) ?? null,
    avatar_url: (p.profile_picture_url as string) || (p.avatar_url as string) || null,
  };
}

const hasName = (row: Record<string, unknown>) =>
  profileHasRealName(row as { display_name?: string | null; profile_name?: string | null });

async function artistsFirst(people: MentionPerson[]): Promise<MentionPerson[]> {
  const unique = [...new Map(people.map((p) => [p.user_id, p])).values()];
  if (!unique.length) return unique;
  const { data } = await supabase
    .from('artist_accounts')
    .select('user_id, artist_id, is_verified')
    .in('user_id', unique.map((p) => p.user_id));
  const byUser = new Map(
    ((data ?? []) as Array<{ user_id: string; artist_id: string | null; is_verified: boolean | null }>).map((a) => [a.user_id, a]),
  );
  return unique
    .map((p) => {
      const a = byUser.get(p.user_id);
      return a?.artist_id ? { ...p, is_artist: true, artist_id: a.artist_id, is_verified: Boolean(a.is_verified) } : p;
    })
    .sort((a, b) => Number(Boolean(b.is_artist)) - Number(Boolean(a.is_artist)) || Number(Boolean(b.is_verified)) - Number(Boolean(a.is_verified)));
}

async function peopleYouFollow(userId: string | undefined): Promise<MentionPerson[]> {
  if (!userId) return [];
  const { data: follows } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId)
    .limit(40);
  const ids = ((follows ?? []) as Array<{ following_id: string }>).map((f) => f.following_id).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase
    .from('audience_profiles')
    .select(COLUMNS)
    .or(`id.in.(${ids.join(',')}),user_id.in.(${ids.join(',')})`)
    .limit(40);
  return ((data ?? []) as Record<string, unknown>[]).filter(hasName).map(toPerson);
}

async function searchPeople(query: string): Promise<MentionPerson[]> {
  const safe = query.replace(/[%,()*\\]/g, '');
  if (!safe) return [];
  const { data } = await supabase
    .from('audience_profiles')
    .select(COLUMNS)
    .or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%,profile_name.ilike.%${safe}%`)
    .limit(15);
  return ((data ?? []) as Record<string, unknown>[]).filter(hasName).map(toPerson);
}

export interface MentionInputHandle {
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPick?: (person: MentionPerson) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
  /** Enter on a one line box, Ctrl or Cmd with Enter on a big one. */
  onEnter?: () => void;
  onEscape?: () => void;
  onBlur?: () => void;
  /** Where the list opens: above for boxes at the foot of the screen. */
  placement?: 'above' | 'below';
}

export const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  {
    value,
    onChange,
    onPick,
    multiline = false,
    rows = 3,
    placeholder,
    maxLength,
    className,
    autoFocus,
    'aria-label': ariaLabel,
    onEnter,
    onEscape,
    onBlur,
    placement = 'below',
  },
  ref,
) {
  const { user } = useAuth();
  const el = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => el.current?.focus() }), []);

  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<MentionPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const followsRef = useRef<MentionPerson[] | null>(null);

  const detect = (text: string, caret: number | null | undefined) => {
    const before = text.slice(0, caret ?? text.length);
    const m = before.match(TRIGGER);
    setQuery(m ? m[2] : null);
  };

  useEffect(() => {
    if (query === null) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(
      () => {
        void (async () => {
          try {
            let people: MentionPerson[];
            if (!query) {
              if (!followsRef.current) followsRef.current = await peopleYouFollow(user?.id);
              people = followsRef.current;
            } else {
              people = await searchPeople(query);
            }
            const ranked = await artistsFirst(people.filter((p) => p.user_id !== user?.id));
            if (!cancelled) {
              setResults(ranked.slice(0, 8));
              setIndex(0);
            }
          } catch {
            if (!cancelled) setResults([]);
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();
      },
      query ? 180 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, user?.id]);

  const pick = (person: MentionPerson) => {
    const node = el.current;
    const caret = node?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = before.match(TRIGGER);
    if (!m) return;
    const start = caret - m[2].length - 1;
    const insert = `@${person.display_name} `;
    let next = value.slice(0, start) + insert + value.slice(caret).replace(/^\s/, '');
    if (maxLength) next = next.slice(0, maxLength);
    onChange(next);
    onPick?.(person);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = Math.min(next.length, start + insert.length);
      node?.focus();
      node?.setSelectionRange(pos, pos);
    });
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
    onChange(next);
    detect(next, e.target.selectionStart);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const open = query !== null && results.length > 0;
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (i + 1) % results.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (i - 1 + results.length) % results.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(results[index]);
        return;
      }
    }
    if (e.key === 'Escape') {
      if (query !== null) {
        e.preventDefault();
        setQuery(null);
        return;
      }
      onEscape?.();
      return;
    }
    if (e.key === 'Enter' && onEnter) {
      if (!multiline && !e.shiftKey) {
        e.preventDefault();
        onEnter();
      } else if (multiline && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onEnter();
      }
    }
  };

  const shared = {
    value,
    placeholder,
    maxLength,
    autoFocus,
    'aria-label': ariaLabel,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': query !== null && results.length > 0,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      detect(e.currentTarget.value, e.currentTarget.selectionStart),
    onBlur: () => {
      setQuery(null);
      onBlur?.();
    },
    className,
  };

  const showList = query !== null && (results.length > 0 || (loading && !results.length));

  return (
    <div className="relative w-full min-w-0">
      {multiline ? (
        <textarea
          {...shared}
          rows={rows}
          ref={(node) => {
            el.current = node;
          }}
        />
      ) : (
        <input
          {...shared}
          type="text"
          ref={(node) => {
            el.current = node;
          }}
        />
      )}
      {showList && (
        <div
          role="listbox"
          aria-label="People"
          className={cn(
            'absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg',
            placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {loading && !results.length ? (
            <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Finding people
            </p>
          ) : (
            results.map((p, i) => (
              <button
                key={p.user_id}
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left',
                  i === index ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-foreground">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    p.display_name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground">
                    <span className="truncate">{p.display_name}</span>
                    <VerifiedMark verified={Boolean(p.is_verified)} userId={p.user_id} artistId={p.artist_id ?? null} size={14} />
                  </span>
                  {p.username && <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>}
                </span>
                {p.is_artist && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Artist</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
