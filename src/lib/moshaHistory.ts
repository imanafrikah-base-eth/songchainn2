import { supabase } from '@/integrations/supabase/client';
import type { MoshaAction, MoshaTurn } from '@/lib/mosha';

/**
 * Where a conversation with Mo$ha lives. There is ONE history per person.
 *
 * Signed in: every exchange is written by the mosha-chat function into
 * mosha_messages, whether it was said in the chat window or in the Inbox, and
 * system notices (welcome notes, counters) land there too through
 * send_mosha_message. The chat window shows the last 48 hours with "Earlier
 * chats" for the archive; the Inbox thread shows the newest page. A guest keeps
 * the same 48 hours on the phone itself.
 *
 * On top of that a small cache holds the open thread for the life of the
 * page, so hiding Mo$ha and bringing it back never loses a line, even in
 * the second before the server has written the last exchange down.
 */

/** Where a line came from: the chat window, the Inbox, or a notice nobody typed. */
export type MoshaSource = 'chat' | 'inbox' | 'notice';

export interface StoredTurn extends MoshaTurn {
  id?: string;
  /** When it was said, ISO. */
  at: string;
  action?: MoshaAction;
  source?: MoshaSource;
}

export const RECENT_HOURS = 48;
const GUEST_KEY = 'songchainn_mosha_chat';
const PAGE = 60;
const COLUMNS = 'id, role, content, action, source, created_at';

type Row = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action: MoshaAction | null;
  source: MoshaSource | null;
  created_at: string;
};

function fromRow(r: Row): StoredTurn {
  return { id: r.id, role: r.role, content: r.content, at: r.created_at, action: r.action ?? undefined, source: r.source ?? 'chat' };
}

/**
 * Oldest first. A question and its answer are written in one insert and share
 * a timestamp, so on a tie the person's line comes before Mo$ha's.
 */
export function byTime(a: StoredTurn, b: StoredTurn): number {
  const d = Date.parse(a.at) - Date.parse(b.at);
  if (d !== 0) return d;
  return a.role === b.role ? 0 : a.role === 'user' ? -1 : 1;
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
      .select(COLUMNS)
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
  return { turns: ((recent ?? []) as unknown as Row[]).map(fromRow).sort(byTime), hasArchive: (count ?? 0) > 0 };
}

/** The newest `limit` lines, oldest first, however old they are. */
export async function loadLatest(userId: string, limit = 120): Promise<{ turns: StoredTurn[]; more: boolean }> {
  const { data } = await supabase
    .from('mosha_messages' as never)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  const rows = (data ?? []) as unknown as Row[];
  return { turns: rows.slice(0, limit).map(fromRow).sort(byTime), more: rows.length > limit };
}

/** One page of the archive, everything said before `before`, oldest first. */
export async function loadEarlier(userId: string, before: string): Promise<{ turns: StoredTurn[]; more: boolean }> {
  const { data } = await supabase
    .from('mosha_messages' as never)
    .select(COLUMNS)
    .eq('user_id', userId)
    .lt('created_at', before)
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  const rows = (data ?? []) as unknown as Row[];
  return { turns: rows.slice(0, PAGE).map(fromRow).sort(byTime), more: rows.length > PAGE };
}

/** How many notices from Mo$ha this person has not seen yet. */
export async function loadMoshaUnread(userId: string): Promise<number> {
  const { data } = await supabase.from('dm_threads').select('unread_count').eq('user_id', userId).maybeSingle();
  return Number(data?.unread_count ?? 0);
}

/** The line to Mo$ha has been seen, in the chat window or the Inbox. */
export async function markMoshaRead(): Promise<void> {
  try {
    await supabase.rpc('mark_mosha_read' as never);
  } catch {
    /* the badge clears on the next visit */
  }
}

/**
 * What goes to the model: what was said. Notices (a welcome, a counter) are
 * part of the history on screen, not part of the conversation.
 */
export function toModelTurns(turns: Array<MoshaTurn & { source?: MoshaSource }>): MoshaTurn[] {
  return turns.filter((t) => t.source !== 'notice').map(({ role, content }) => ({ role, content }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAME_LINE_MS = 10 * 60_000;

/**
 * The server's lines, plus what is only on this page so far: lines said a
 * moment ago that the function has not written down yet, and archive pages
 * already pulled up above the window. A line on the page that the server now
 * has (same speaker, same words, within minutes) is taken from the server.
 */
export function mergeTurns(server: StoredTurn[], local: StoredTurn[]): StoredTurn[] {
  if (!local.length) return server;
  const ids = new Set(server.map((t) => t.id).filter((id): id is string => Boolean(id)));
  const first = server.length ? Date.parse(server[0].at) : null;
  const used = new Set<number>();
  const kept: StoredTurn[] = [];
  for (const t of local) {
    if (t.id && ids.has(t.id)) continue;
    const at = Date.parse(t.at);
    if (t.id && UUID.test(t.id)) {
      // A saved line from further back than this window: keep it above.
      if (first !== null && at < first) kept.push(t);
      continue;
    }
    const match = server.findIndex(
      (s, j) =>
        !used.has(j) &&
        s.role === t.role &&
        s.content.trim() === t.content.trim() &&
        Math.abs(Date.parse(s.at) - at) < SAME_LINE_MS,
    );
    if (match >= 0) {
      used.add(match);
      continue;
    }
    kept.push(t);
  }
  return [...server, ...kept].sort(byTime);
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

/** Lines said somewhere else on the page (the Inbox), added to an open thread. */
export function appendCache(key: string, turns: StoredTurn[]): void {
  if (cache && cache.key === key) cache = { ...cache, turns: [...cache.turns, ...turns] };
}
