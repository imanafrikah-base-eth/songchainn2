import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { blockUser } from '@/hooks/useDirectMessages';

interface BlockedRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/**
 * The people you have blocked, and the way back.
 *
 * A block with no list behind it is a block you cannot undo without finding
 * the person again, which is the one thing a blocked person should not have
 * to do. So the list lives in Settings.
 */
export function BlockedPeople() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BlockedRow[] | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setRows([]);
      return;
    }
    const { data: blocks } = await supabase
      .from('user_blocks' as never)
      .select('blocked_id')
      .eq('blocker_id', user.id);
    const ids = ((blocks as Array<{ blocked_id: string }> | null) ?? []).map((b) => b.blocked_id);
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    const { data: profiles } = await supabase
      .from('audience_profiles')
      .select('user_id, display_name, username, avatar_url')
      .in('user_id', ids);
    const byId = new Map(((profiles as BlockedRow[] | null) ?? []).map((p) => [p.user_id, p]));
    setRows(ids.map((id) => byId.get(id) ?? { user_id: id, display_name: null, username: null, avatar_url: null }));
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = useCallback(
    async (row: BlockedRow) => {
      try {
        await blockUser(row.user_id, false);
        setRows((prev) => (prev ?? []).filter((r) => r.user_id !== row.user_id));
        toast(`${row.display_name || row.username || 'They'} unblocked`);
      } catch {
        toast.error('That did not go through. Try again.');
      }
    },
    [],
  );

  if (!user?.id) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-sm font-medium text-foreground flex items-center gap-2">
        <Ban className="w-4 h-4 text-primary" />
        <span>Blocked people</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        They cannot message you, and neither of you sees the other's posts or comments.
      </p>
      {rows === null ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nobody. Block someone from their profile or from a chat.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((row) => {
            const name = row.display_name || row.username || 'Someone';
            return (
              <li key={row.user_id} className="flex items-center gap-3 py-2">
                <Avatar className="h-8 w-8">
                  {row.avatar_url ? <AvatarImage src={row.avatar_url} alt="" /> : null}
                  <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <Link to={`/audience/${row.user_id}`} className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                  {name}
                </Link>
                <Button type="button" size="sm" variant="secondary" onClick={() => unblock(row)}>
                  Unblock
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
