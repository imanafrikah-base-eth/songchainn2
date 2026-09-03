import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Search, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { sendSongTo } from '@/hooks/useDirectMessages';
import { toast } from 'sonner';

/**
 * Hand a record to one person.
 *
 * Sharing outward to a timeline is a broadcast. This is the other thing, the one
 * people actually do with music: you heard something and you thought of somebody.
 * It arrives in their inbox playable, not as a link they have to chase.
 *
 * The list is the people you follow first, because that is almost always who you
 * mean, then anyone you search for.
 */

interface Person {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export function SendSongSheet({
  songId, songTitle, isOpen, onClose,
}: {
  songId: string;
  songTitle: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      // The people you follow, which is who you nearly always mean.
      const { data: follows } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .limit(50);
      const ids = (follows ?? []).map((f) => f.following_id).filter(Boolean);
      if (ids.length === 0) {
        if (!cancelled) { setPeople([]); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from('audience_profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', ids);
      if (cancelled) return;
      setPeople(
        (data ?? []).map((p) => ({
          user_id: p.user_id as string,
          display_name: (p.display_name || p.username || 'Listener') as string,
          avatar_url: (p.avatar_url as string) || null,
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setNote('');
      setSentTo([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const shown = query.trim()
    ? people.filter((p) => p.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    : people;

  const send = async (person: Person) => {
    setSendingTo(person.user_id);
    const res = await sendSongTo(person.user_id, songId, note.trim() || undefined);
    setSendingTo(null);
    if (res.ok) {
      setSentTo((prev) => [...prev, person.user_id]);
      toast.success(`Sent to ${person.display_name}`);
    } else {
      toast.error('Could not send that', { description: res.error });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md rounded-t-3xl border border-border bg-card p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">Send this song</h2>
            <p className="truncate text-xs text-muted-foreground">{songTitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Say something with it (optional)"
          maxLength={280}
          className="mb-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
        />

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the people you follow"
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>}

          {!loading && people.length === 0 && (
            <div className="px-2 py-6 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                You are not following anyone yet. Follow a few people and they will show up here.
              </p>
              <a
                href="/community"
                className="inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
              >
                Find people to follow
              </a>
            </div>
          )}

          {!loading && people.length > 0 && shown.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nobody by that name.</p>
          )}

          {shown.map((p) => {
            const sent = sentTo.includes(p.user_id);
            return (
              <button
                key={p.user_id}
                onClick={() => !sent && send(p)}
                disabled={sent || sendingTo === p.user_id}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-70"
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {p.display_name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 truncate text-sm text-foreground">{p.display_name}</span>
                {sendingTo === p.user_id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : sent ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> Sent
                  </span>
                ) : (
                  <Send className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
