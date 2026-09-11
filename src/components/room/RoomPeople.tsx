import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Who is actually in The Room.
 *
 * The count said "7 listening" and one truncated line said "Online now: a •
 * few • names", which told nobody who they were listening with. This is the
 * roster: names, faces, how long they have been in, and a tap through to
 * anyone's page. It reads the same presence rows the count already reads, so
 * it costs no extra channel.
 */

export interface RoomPerson {
  user_id: string;
  room_name: string;
  joined_at?: string | null;
}

interface Profile {
  display_name: string | null;
  avatar: string | null;
}

function inFor(iso?: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return 'just walked in';
  if (mins < 60) return `${mins} min in`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? '1 hour in' : `${hours} hours in`;
}

export function RoomPeople({
  people,
  count,
  selfUserId,
  selfName,
  moshaName,
}: {
  people: RoomPerson[];
  count: number;
  selfUserId?: string | null;
  selfName?: string;
  /** Mo$ha is in every room; shown first and never linked. */
  moshaName?: string;
}) {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [open, setOpen] = useState(false);

  const ids = useMemo(
    () => Array.from(new Set(people.map((p) => p.user_id).filter((id) => id && !id.startsWith('mosha')))),
    [people],
  );

  // Faces only once the roster is actually opened; nobody needs them behind a
  // closed sheet, and this page already holds a realtime channel.
  useEffect(() => {
    if (!open || ids.length === 0) return;
    const missing = ids.filter((id) => !(id in profiles));
    if (missing.length === 0) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from('audience_profiles')
        .select('user_id, display_name, profile_name, profile_picture_url, avatar_url')
        .in('user_id', missing);
      if (!alive) return;
      const next: Record<string, Profile> = {};
      ((data as any[]) || []).forEach((row) => {
        next[String(row.user_id)] = {
          display_name: row.display_name || row.profile_name || null,
          avatar: row.profile_picture_url || row.avatar_url || null,
        };
      });
      // Anybody with no row still gets an entry, so we stop asking for them.
      missing.forEach((id) => { if (!next[id]) next[id] = { display_name: null, avatar: null }; });
      setProfiles((prev) => ({ ...prev, ...next }));
    })();
    return () => { alive = false; };
  }, [open, ids, profiles]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<RoomPerson & { label: string; isSelf: boolean }> = [];
    people.forEach((p) => {
      if (seen.has(p.user_id)) return;
      seen.add(p.user_id);
      const profile = profiles[p.user_id];
      const label = p.room_name?.trim() || profile?.display_name || `user-${p.user_id.slice(0, 6)}`;
      out.push({ ...p, label, isSelf: !!selfUserId && p.user_id === selfUserId });
    });
    out.sort((a, b) => {
      if (a.isSelf) return -1;
      if (b.isSelf) return 1;
      return a.label.localeCompare(b.label);
    });
    return out;
  }, [people, profiles, selfUserId]);

  const shown = count > 0 ? count : rows.length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-zinc-200 transition-colors hover:bg-white/10"
          aria-label="See who is in the room"
        >
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{shown}</span>
          <span className="hidden sm:inline">in the room</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>In the room</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-2 max-h-[52vh] pr-2">
          <ul className="space-y-1 pb-4">
            {moshaName && (
              <li className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/20 text-xs text-primary">M</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{moshaName}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">always here</span>
              </li>
            )}
            {rows.map((p) => {
              const profile = profiles[p.user_id];
              return (
                <li key={p.user_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!p.isSelf) navigate(`/audience/${p.user_id}`);
                    }}
                    className="flex w-full min-h-12 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary/50"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={profile?.avatar || ''} alt="" />
                      <AvatarFallback className="bg-secondary text-xs text-muted-foreground">
                        {p.label.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.label}
                        {p.isSelf ? ' (you)' : ''}
                      </span>
                      {p.joined_at && (
                        <span className="block truncate text-[11px] text-muted-foreground">{inFor(p.joined_at)}</span>
                      )}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  </button>
                </li>
              );
            })}
            {rows.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                {selfName ? `Just you and Mo$ha in here, ${selfName}.` : 'Nobody else in here yet.'}
              </li>
            )}
          </ul>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default RoomPeople;
