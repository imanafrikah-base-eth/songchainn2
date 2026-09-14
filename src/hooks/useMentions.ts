import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { artistPath } from '@/lib/slugRoutes';
import type { MentionLink } from '@/lib/mentions';

/**
 * Who each post or comment mentions, keyed by its id, with the page each name
 * opens: an artist's page by name, anybody else's profile.
 */
export function useMentions(sourceType: 'post' | 'comment', ids: string[]) {
  const idsKey = [...new Set(ids.filter((id) => id && !id.startsWith('pending-')))].sort().join(',');
  const real = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  return useQuery({
    queryKey: ['content_mentions', sourceType, real.join(',')],
    enabled: real.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, MentionLink[]>> => {
      const rows: Array<{ source_id: string; mentioned_user_id: string; mentioned_name: string }> = [];
      for (let i = 0; i < real.length; i += 150) {
        const { data, error } = await supabase
          .from('content_mentions' as never)
          .select('source_id, mentioned_user_id, mentioned_name')
          .eq('source_type', sourceType)
          .in('source_id', real.slice(i, i + 150));
        if (error) return {};
        rows.push(...((data ?? []) as unknown as typeof rows));
      }
      if (!rows.length) return {};

      const userIds = [...new Set(rows.map((r) => r.mentioned_user_id))];
      const artists = new Map<string, string>();
      const { data: accounts } = await supabase
        .from('artist_accounts')
        .select('user_id, artist_id')
        .in('user_id', userIds);
      for (const a of (accounts ?? []) as Array<{ user_id: string; artist_id: string | null }>) {
        if (a.artist_id) artists.set(a.user_id, a.artist_id);
      }

      const out: Record<string, MentionLink[]> = {};
      for (const r of rows) {
        const artistId = artists.get(r.mentioned_user_id);
        (out[r.source_id] ??= []).push({
          userId: r.mentioned_user_id,
          name: r.mentioned_name,
          href: artistId ? artistPath(artistId) : `/audience/${r.mentioned_user_id}`,
        });
      }
      return out;
    },
  });
}
