import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export type FollowListMode = 'followers' | 'following';

interface FollowRow {
  user_id: string;
  name: string;
  avatar: string | null;
  username: string | null;
}

const PAGE = 50;

/**
 * Who follows this person, and who they follow.
 *
 * The two numbers on the profile were text you could not tap, so a count of
 * forty told you nothing about who the forty were. Fifty a page, more on
 * request, because a big account's list is not something to load whole.
 */
export function FollowListSheet({
  userId,
  mode,
  onClose,
}: {
  userId: string;
  mode: FollowListMode | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FollowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const loadPage = useCallback(async (which: FollowListMode, from: number) => {
    setLoading(true);
    try {
      const idColumn = which === 'followers' ? 'follower_id' : 'following_id';
      const matchColumn = which === 'followers' ? 'following_id' : 'follower_id';

      const { data: links } = await supabase
        .from('user_follows')
        .select(`${idColumn}, created_at`)
        .eq(matchColumn, userId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);

      const ids = Array.from(new Set(((links || []) as any[]).map((l) => String(l[idColumn])).filter(Boolean)));
      setHasMore((links || []).length === PAGE);

      if (ids.length === 0) {
        if (from === 0) setRows([]);
        return;
      }

      const { data: profiles } = await supabase
        .from('audience_profiles')
        .select('id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url')
        .or(`id.in.(${ids.join(',')}),user_id.in.(${ids.join(',')})`);

      const byId = new Map<string, any>();
      ((profiles || []) as any[]).forEach((p) => {
        byId.set(String(p.id), p);
        if (p?.user_id) byId.set(String(p.user_id), p);
      });

      // Keep the follow order, not the profile query's order.
      const page: FollowRow[] = ids.map((id) => {
        const p = byId.get(id);
        return {
          user_id: String(p?.user_id ?? id),
          name: p?.display_name || p?.profile_name || p?.username || 'Someone',
          avatar: p?.profile_picture_url || p?.avatar_url || null,
          username: p?.username ?? null,
        };
      });

      setRows((prev) => (from === 0 ? page : [...prev, ...page]));
      setOffset(from + PAGE);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!mode) return;
    setRows([]);
    setOffset(0);
    setHasMore(false);
    void loadPage(mode, 0);
  }, [mode, loadPage]);

  const open = (targetId: string) => {
    onClose();
    navigate(`/audience/${targetId}`);
  };

  return (
    <Sheet open={!!mode} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl p-0 flex flex-col">
        <SheetHeader className="px-4 pt-5 pb-3 border-b border-border">
          <SheetTitle>{mode === 'followers' ? 'Followers' : 'Following'}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="px-2 py-2">
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {rows.map((row) => (
                  <li key={row.user_id}>
                    <button
                      type="button"
                      onClick={() => open(row.user_id)}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted transition-colors text-left"
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={row.avatar || ''} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {row.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{row.name}</p>
                        {row.username && (
                          <p className="text-xs text-muted-foreground truncate">@{row.username}</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore && mode && (
              <div className="py-3 flex justify-center">
                <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadPage(mode, offset)}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Show more'}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
