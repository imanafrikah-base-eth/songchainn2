import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * The faces behind a list of user ids.
 *
 * A letter in a circle is what an app shows when it does not know who is
 * talking. We do know: the picture is on the person's profile. This reads them
 * in one go for a whole screen of messages and keeps them cached, so a busy
 * Room does not ask for the same face forty times.
 */

export interface ProfileFace {
  name: string | null;
  avatar: string | null;
}

export function useProfilePictures(userIds: Array<string | null | undefined>) {
  // A stable key: the same people in any order are the same request.
  const ids = useMemo(() => {
    const clean = userIds
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.startsWith('mosha'))
      .map((id) => id.trim());
    return Array.from(new Set(clean)).sort();
  }, [userIds]);

  const { data } = useQuery({
    queryKey: ['profile-faces', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, ProfileFace>> => {
      const { data: rows } = await (supabase as any)
        .from('audience_profiles')
        .select('user_id, display_name, profile_name, profile_picture_url, avatar_url')
        .in('user_id', ids);
      const faces: Record<string, ProfileFace> = {};
      ((rows as Record<string, unknown>[]) ?? []).forEach((row) => {
        faces[String(row.user_id)] = {
          name: (row.display_name as string) || (row.profile_name as string) || null,
          avatar: (row.profile_picture_url as string) || (row.avatar_url as string) || null,
        };
      });
      // Anybody without a row still gets an entry, so nothing asks again.
      ids.forEach((id) => { if (!faces[id]) faces[id] = { name: null, avatar: null }; });
      return faces;
    },
  });

  return data ?? {};
}
