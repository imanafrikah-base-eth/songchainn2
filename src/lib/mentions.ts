import { supabase } from '@/integrations/supabase/client';

/**
 * @mentions on the feed.
 *
 * The words keep "@Their Name" exactly as it was typed. Which person that name
 * meant is written beside the words in content_mentions, so the name links to
 * the right page even when two people share it, and the person is notified by
 * the database (migration 20260914000300), once, never for mentioning yourself
 * and never across a block.
 */

export interface MentionPerson {
  user_id: string;
  display_name: string;
  username?: string | null;
  avatar_url?: string | null;
  is_artist?: boolean;
  is_verified?: boolean;
  artist_id?: string | null;
}

/** A name in some words that goes somewhere. */
export interface MentionLink {
  userId: string;
  name: string;
  href: string;
}

/** The people picked while typing whose "@name" is still in the words when they are sent. */
export function mentionsInText(text: string, picked: MentionPerson[]): MentionPerson[] {
  const seen = new Set<string>();
  return picked.filter((p) => {
    if (!p.user_id || seen.has(p.user_id)) return false;
    if (!text.includes(`@${p.display_name}`)) return false;
    seen.add(p.user_id);
    return true;
  });
}

/** Write who a post or a comment mentions. Never throws: the words themselves already went up. */
export async function saveMentions(o: {
  sourceType: 'post' | 'comment';
  sourceId: string;
  postId: string;
  authorId: string;
  people: MentionPerson[];
}): Promise<void> {
  const rows = o.people
    .filter((p) => p.user_id && p.user_id !== o.authorId)
    .map((p) => ({
      source_type: o.sourceType,
      source_id: o.sourceId,
      post_id: o.postId,
      mentioned_user_id: p.user_id,
      mentioned_name: p.display_name.slice(0, 80),
      created_by: o.authorId,
    }));
  if (!rows.length) return;
  try {
    const { error } = await supabase
      .from('content_mentions' as never)
      .upsert(rows as never, { onConflict: 'source_type,source_id,mentioned_user_id', ignoreDuplicates: true });
    if (error) console.error('mentions did not save', error);
  } catch (err) {
    console.error('mentions did not save', err);
  }
}
