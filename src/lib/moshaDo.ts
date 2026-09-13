import { supabase } from '@/integrations/supabase/client';

/**
 * Things Mo$ha does for a person on one tap.
 *
 * Mo$ha ends a reply with [[action:do:<op>]]; the chat pops up one question
 * ("Delete 4 duplicates now?") and nothing happens until the person taps. The
 * job itself runs in src/lib/moshaJobs.ts, outside the chat, so its report
 * lands even if they keep talking. Every op runs with the person's own
 * session, so it can only ever touch what is theirs, and `check` counts first
 * so the question says exactly what will happen.
 */

export const MOSHA_DO_OPS = ['delete_duplicate_media', 'mark_notifications_read'] as const;
export type MoshaDoOp = (typeof MOSHA_DO_OPS)[number];

export function isMoshaDoOp(v: unknown): v is MoshaDoOp {
  return typeof v === 'string' && (MOSHA_DO_OPS as readonly string[]).includes(v);
}

export interface DoCheck {
  /** Nothing to do: said instead of a question. */
  nothing?: string;
  /** The question in the pop-up. */
  question?: string;
  /** The button that does it. */
  confirm?: string;
  /** Under the question, when the question alone does not say it all. */
  note?: string;
}

interface DoOp {
  check: () => Promise<DoCheck>;
  run: () => Promise<string>;
  /** What the pop-up says while it runs. */
  working: string;
  /** Query keys to refresh afterwards. */
  refresh: string[][];
}

type Tidy = { groups: number; deleted: number; hidden: number };

async function tidy(apply: boolean): Promise<Tidy> {
  const { data, error } = await supabase.rpc('tidy_my_duplicate_media' as never, { p_apply: apply } as never);
  if (error) throw error;
  return data as unknown as Tidy;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const OPS: Record<MoshaDoOp, DoOp> = {
  delete_duplicate_media: {
    check: async () => {
      const t = await tidy(false);
      if (!t.deleted && !t.hidden) return { nothing: 'No duplicates in your gallery or your world. All clean.' };
      if (!t.deleted) {
        return {
          question: `Hide ${plural(t.hidden, 'duplicate')} from your gallery now?`,
          confirm: 'Hide them',
          note: 'Your world still uses them, so they come off the gallery instead of being deleted.',
        };
      }
      return {
        question: `Delete ${plural(t.deleted, 'duplicate')} now?`,
        confirm: 'Delete now',
        note: t.hidden
          ? `${plural(t.hidden, 'more copy', 'more copies')} ${t.hidden === 1 ? 'is' : 'are'} used in your world, so ${t.hidden === 1 ? 'it comes' : 'they come'} off the gallery instead.`
          : 'One of each stays. Nothing your world uses is touched.',
      };
    },
    run: async () => {
      const t = await tidy(true);
      const parts = [t.deleted ? `${plural(t.deleted, 'duplicate')} deleted` : '', t.hidden ? `${plural(t.hidden, 'copy', 'copies')} taken off your gallery` : ''].filter(Boolean);
      return parts.length ? `Done. ${parts.join(', ')}.` : 'Nothing left to tidy.';
    },
    working: 'Deleting duplicates',
    refresh: [['my_media'], ['artist_gallery']],
  },
  mark_notifications_read: {
    check: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return { nothing: 'Sign in first.' };
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', auth.user.id)
        .eq('is_read', false);
      if (!count) return { nothing: 'No unread notifications.' };
      return { question: `Mark ${plural(count, 'notification')} read?`, confirm: 'Mark read' };
    },
    run: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sign in first.');
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, seen_at: new Date().toISOString() } as never)
        .eq('user_id', auth.user.id)
        .eq('is_read', false);
      if (error) throw error;
      return 'Done. Every notification is read.';
    },
    working: 'Marking them read',
    refresh: [['notifications'], ['unread-notifications']],
  },
};

export function moshaDo(op: MoshaDoOp): DoOp {
  return OPS[op];
}
