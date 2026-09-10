import { supabase } from '@/integrations/supabase/client';
import type { MoshaAction, MoshaTurn } from '@/lib/mosha';

/**
 * Where a conversation with Mo$ha lives when the chat is hidden.
 *
 * Signed in: every exchange is written by the mosha-chat function into
 * mosha_messages. The last 48 hours come back when the chat opens; anything
 * older is the archive, pulled up a page at a time with "Earlier chats".
 * A guest keeps the same 48 hours on the phone itself.
 *
 * On top of that a small cache holds the open thread for the life of the
 * page, so hiding Mo$ha and bringing it back never loses a line, even in
 * the second before the server has written the last exchange down.
 */

export interface StoredTurn extends MoshaTurn {
  id?: string;
  /** When it was said, ISO. */
  at: string;
  action?: MoshaAction;
}

export const RECENT_HOURS = 48;
const GUEST_KEY = 'songchainn_mosha_chat';
const PAGE = 60;

type Row = { id: string; role: 'user' | 'assistant'; content: string; action: MoshaAction | null; created_at: string };

function fromRow(r: Row): StoredTurn {
  return { id: r.id, role: r.role, content: r.content, at: r.created_at, action: r.action ?? undefined };
}

function cutoff(): string {
  return new Date(Date.now() - RECENT_HOURS * 3_600_000).toISOString();
}

/** The last 48 hours, oldest first, and whether there is an archive behind them. */
export async function loadRecent(userId: string): Promise<{ turns: StoredTurn[]; hasArchive: boolean }> {
  const since = cutoff();
  const [{ data: recent }, { count }] = await Promise.all([
    supabase
      .from('mosha_messages' as never)
      .select('id, role, content, action, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(300),
    supabase
      .from('mosha_messages' as never)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('created_at', since),
  ]);
  return { turns: ((recent ?? []) as unknown as Row[]).map(fromRow), hasArchive: (count ?? 0) > 0 };
}

/** One page of the archive, everything said before `before`, oldest first. */
export async function loadEarlier(userId: string, before: string): Promise<{ turns: StoredTurn[]; more: boolean }> {
  const { data } = await supabase
    .from('mosha_messages' as never)
    .select('id, role, content, action, created_at')
    .eq('user_id', userId)
    .lt('created_at', before)
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  const rows = (data ?? []) as unknown as Row[];
  return { turns: rows.slice(0, PAGE).reverse().map(fromRow), more: rows.length > PAGE };
}

/** A guest's last 48 hours, kept on the phone. */
export function loadGuest(): StoredTurn[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const since = cutoff();
    const list = JSON.parse(raw) as StoredTurn[];
    return Array.isArray(list) ? list.filter((t) => t && typeof t.content === 'string' && t.at >= since) : [];
  } catch {
    return [];
  }
}

export function saveGuest(turns: StoredTurn[]): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(turns.slice(-80)));
  } catch {
    /* private mode or a full disk; the thread still lives in the cache */
  }
}

/* The open thread, for the life of the page, keyed by who is signed in. */
let cache: { key: string; turns: StoredTurn[]; hasArchive: boolean } | null = null;

export function getCache(key: string): { turns: StoredTurn[]; hasArchive: boolean } | null {
  return cache && cache.key === key ? { turns: cache.turns, hasArchive: cache.hasArchive } : null;
}

export function setCache(key: string, turns: StoredTurn[], hasArchive: boolean): void {
  cache = { key, turns, hasArchive };
}
