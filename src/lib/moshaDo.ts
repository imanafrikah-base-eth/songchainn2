import { supabase } from '@/integrations/supabase/client';
import { ARTISTS, SONGS, type Artist, type Song } from '@/data/musicData';
import { broadcastCountDelta } from '@/hooks/usePopularity';
import { songPath } from '@/lib/slugRoutes';

/**
 * Things Mo$ha does for a person on one tap.
 *
 * Mo$ha ends a reply with [[action:do:<op>]] or [[action:do:<op>:<arg>]]; the
 * chat pops up one question ("Play Wagwan by N3M3SIS?") and nothing happens
 * until the person taps. The job runs in src/lib/moshaJobs.ts, outside the
 * chat, so its report lands even if they keep talking. Every write goes to
 * the same tables the app's own buttons write to, under the person's own
 * session and row level security, so it can only ever touch what is theirs.
 * `check` looks first, so the question says exactly what will happen.
 */

export const MOSHA_DO_OPS = [
  'delete_duplicate_media',
  'mark_notifications_read',
  'play_song',
  'like_song',
  'follow_artist',
  'unfollow_artist',
  'create_playlist',
  'add_to_playlist',
  'save_offline',
  'share_song',
  'invite_friends',
  'remove_failed_uploads',
] as const;
export type MoshaDoOp = (typeof MOSHA_DO_OPS)[number];

export function isMoshaDoOp(v: unknown): v is MoshaDoOp {
  return typeof v === 'string' && (MOSHA_DO_OPS as readonly string[]).includes(v);
}

/** What the app hands a job: the catalogue, and the player and offline hooks that only live in components. */
export interface DoCtx {
  userId: string | null;
  songs: Song[];
  artists: Artist[];
  playSong?: (song: Song) => void;
  isLiked?: (songId: string) => boolean;
  toggleLike?: (songId: string) => unknown;
  cacheSong?: (songId: string, audioUrl: string, meta?: { title?: string; artist?: string; duration?: number }) => Promise<boolean>;
  isSongCached?: (songId: string) => boolean;
  songShareUrl?: (song: Song) => string;
}

/** The founding catalogue only: used when a job runs with nothing else to go on. */
export function baseDoCtx(): DoCtx {
  return { userId: null, songs: SONGS, artists: ARTISTS };
}

export interface DoChoice {
  value: string;
  label: string;
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
  /** More than one match: each is its own button, and tapping one does it. */
  choices?: DoChoice[];
}

interface DoOp {
  check: (ctx: DoCtx, arg?: string) => Promise<DoCheck>;
  run: (ctx: DoCtx, arg?: string, choice?: string) => Promise<string>;
  /** What the pop-up says while it runs. */
  working: string;
  /** Query keys to refresh afterwards. */
  refresh: string[][];
}

/* ------------------------------------------------------------ helpers --- */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (s?: string, max = 60) => (s ?? '').trim().slice(0, max);
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9$]+/g, ' ')
    .trim();

/** The signed-in person, from the session itself. Null for guests. */
async function sessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const SIGN_IN: DoCheck = { nothing: 'Sign in first and I can do that for you.' };

/** "wagwan by N3M3SIS" into its title and artist; a plain title stays whole. */
function splitSongArg(arg?: string): { title: string; artist: string } {
  const a = (arg ?? '').trim();
  const m = a.match(/^(.*\S)\s+by\s+(\S.*)$/i);
  return m ? { title: m[1], artist: m[2] } : { title: a, artist: '' };
}

/** The best song for what was asked: one clear winner, or up to three close ones. */
function matchSongs(pool: Song[], arg?: string): Song[] {
  const { title, artist } = splitSongArg(arg);
  const t = norm(title);
  if (!t) return [];
  const a = norm(artist);
  const seen = new Set<string>();
  const scored: Array<{ s: Song; score: number }> = [];
  for (const s of pool) {
    if (!s.audioUrl || seen.has(s.id)) continue;
    seen.add(s.id);
    const st = norm(s.title);
    const sa = norm(s.artist);
    let score = st === t ? 3 : st.startsWith(t) ? 2 : st.includes(t) ? 1 : 0;
    // "N3M3SIS wagwan" with no "by": both words somewhere in title and artist.
    if (!score && !a && t.split(' ').length > 1) {
      const words = t.split(' ');
      if (words.every((w) => `${st} ${sa}`.includes(w))) score = 1;
    }
    if (score && a) {
      if (sa === a) score += 2;
      else if (sa.includes(a) || a.includes(sa)) score += 1;
      else score = 0;
    }
    if (score) scored.push({ s, score });
  }
  scored.sort((x, y) => y.score - x.score);
  if (!scored.length) return [];
  if (scored.length === 1 || scored[0].score > scored[1].score) return [scored[0].s];
  return scored.filter((x) => x.score === scored[0].score).slice(0, 3).map((x) => x.s);
}

function matchArtists(pool: Artist[], arg?: string): Artist[] {
  const t = norm(arg ?? '');
  if (!t) return [];
  const seen = new Set<string>();
  const scored: Array<{ a: Artist; score: number }> = [];
  for (const a of pool) {
    if (!a.name || seen.has(a.id)) continue;
    seen.add(a.id);
    const n = norm(a.name);
    const score = n === t ? 3 : n.startsWith(t) ? 2 : n.includes(t) || t.includes(n) ? 1 : 0;
    if (score) scored.push({ a, score });
  }
  scored.sort((x, y) => y.score - x.score);
  if (!scored.length) return [];
  if (scored.length === 1 || scored[0].score > scored[1].score) return [scored[0].a];
  return scored.filter((x) => x.score === scored[0].score).slice(0, 3).map((x) => x.a);
}

const songLabel = (s: Song) => `${s.title} by ${s.artist}`;

/** A check for any job about one song: not found, which one, or the question. */
function songQuestion(ctx: DoCtx, arg: string | undefined, ask: (s: Song) => DoCheck): DoCheck {
  const found = matchSongs(ctx.songs, arg);
  if (!found.length) return { nothing: `I could not find "${clip(splitSongArg(arg).title)}" on $ongChainn.` };
  if (found.length > 1) return { question: 'Which one?', choices: found.map((s) => ({ value: s.id, label: songLabel(s) })) };
  return ask(found[0]);
}

function songFor(ctx: DoCtx, arg?: string, choice?: string): Song {
  const s = choice ? ctx.songs.find((x) => x.id === choice) : matchSongs(ctx.songs, arg)[0];
  if (!s) throw new Error('I could not find that song any more.');
  return s;
}

function artistQuestion(ctx: DoCtx, arg: string | undefined, ask: (a: Artist) => Promise<DoCheck>): Promise<DoCheck> {
  const found = matchArtists(ctx.artists, arg);
  if (!found.length) return Promise.resolve({ nothing: `I could not find an artist called "${clip(arg)}".` });
  if (found.length > 1) return Promise.resolve({ question: 'Which artist?', choices: found.map((a) => ({ value: a.id, label: a.name })) });
  return ask(found[0]);
}

function artistFor(ctx: DoCtx, arg?: string, choice?: string): Artist {
  const a = choice ? ctx.artists.find((x) => x.id === choice) : matchArtists(ctx.artists, arg)[0];
  if (!a) throw new Error('I could not find that artist any more.');
  return a;
}

async function follows(uid: string, artistId: string): Promise<boolean> {
  const { data } = await supabase.from('liked_artists').select('id').eq('user_id', uid).eq('artist_id', artistId).maybeSingle();
  return !!data;
}

type PlaylistRow = { id: string; name: string };

async function myPlaylists(uid: string): Promise<PlaylistRow[]> {
  const { data } = await supabase.from('playlists').select('id, name').eq('user_id', uid);
  return (data ?? []) as PlaylistRow[];
}

function findPlaylist(list: PlaylistRow[], name: string): PlaylistRow | undefined {
  const n = norm(name);
  return list.find((p) => norm(p.name) === n) ?? list.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
}

/** "wagwan|Late nights" into the song and the playlist. */
function splitPlaylistArg(arg?: string): { song: string; playlist: string } {
  const a = (arg ?? '').trim();
  const i = a.lastIndexOf('|');
  return i < 0 ? { song: a, playlist: '' } : { song: a.slice(0, i).trim(), playlist: a.slice(i + 1).trim().slice(0, 80) };
}

async function createPlaylistRow(uid: string, name: string): Promise<PlaylistRow> {
  const { data, error } = await supabase
    .from('playlists')
    .insert({ user_id: uid, name, is_public: false, description: null } as never)
    .select('id, name')
    .maybeSingle();
  if (error || !data) throw new Error('That playlist could not be made. Try again in a moment.');
  return data as PlaylistRow;
}

/** Hand a link to the phone's share sheet, or copy it where there is none. */
async function shareOrCopy(title: string, text: string, url: string): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'Shared.';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'Okay, not shared.';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return `Link copied: ${url}`;
  } catch {
    return `Here is the link: ${url}`;
  }
}

type Tidy = { groups: number; deleted: number; hidden: number };

async function tidy(apply: boolean): Promise<Tidy> {
  const { data, error } = await supabase.rpc('tidy_my_duplicate_media' as never, { p_apply: apply } as never);
  if (error) throw error;
  return data as unknown as Tidy;
}

/** Records that never got their file: stuck at uploading, no audio, over an hour old. Never anything with music in it. */
function failedUploads(uid: string) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return { hourAgo, uid };
}

/* ---------------------------------------------------------------- ops --- */

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
      const uid = await sessionUserId();
      if (!uid) return SIGN_IN;
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('is_read', false);
      if (!count) return { nothing: 'No unread notifications.' };
      return { question: `Mark ${plural(count, 'notification')} read?`, confirm: 'Mark read' };
    },
    run: async () => {
      const uid = await sessionUserId();
      if (!uid) throw new Error('Sign in first.');
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, seen_at: new Date().toISOString() } as never)
        .eq('user_id', uid)
        .eq('is_read', false);
      if (error) throw error;
      return 'Done. Every notification is read.';
    },
    working: 'Marking them read',
    refresh: [['notifications'], ['unread-notifications']],
  },

  play_song: {
    check: async (ctx, arg) => {
      if (!ctx.playSong) return { nothing: 'Sign in and open the app, then ask me again and I will put it on.' };
      return songQuestion(ctx, arg, (s) => ({ question: `Play "${s.title}" by ${s.artist}?`, confirm: 'Play' }));
    },
    run: async (ctx, arg, choice) => {
      if (!ctx.playSong) throw new Error('The player is not open here.');
      const s = songFor(ctx, arg, choice);
      ctx.playSong(s);
      return `Playing "${s.title}" by ${s.artist}.`;
    },
    working: 'Putting it on',
    refresh: [],
  },

  like_song: {
    check: async (ctx, arg) => {
      if (!(await sessionUserId())) return SIGN_IN;
      return songQuestion(ctx, arg, (s) =>
        ctx.isLiked?.(s.id)
          ? { nothing: `"${s.title}" is already in your likes.` }
          : { question: `Save "${s.title}" by ${s.artist} to your likes?`, confirm: 'Save it' },
      );
    },
    run: async (ctx, arg, choice) => {
      const s = songFor(ctx, arg, choice);
      if (ctx.isLiked?.(s.id)) return `"${s.title}" is already in your likes.`;
      if (ctx.toggleLike) {
        await ctx.toggleLike(s.id);
      } else {
        const uid = await sessionUserId();
        if (!uid) throw new Error('Sign in first.');
        const { error } = await supabase.from('liked_songs').insert({ user_id: uid, song_id: s.id } as never);
        if (error) throw new Error('That did not save. Try again in a moment.');
        broadcastCountDelta('like', { songId: s.id, delta: 1 });
      }
      return `Saved "${s.title}" to your likes.`;
    },
    working: 'Saving it',
    refresh: [['song-popularity']],
  },

  follow_artist: {
    check: async (ctx, arg) => {
      const uid = await sessionUserId();
      if (!uid) return SIGN_IN;
      return artistQuestion(ctx, arg, async (a) =>
        (await follows(uid, a.id)) ? { nothing: `You already follow ${a.name}.` } : { question: `Follow ${a.name}?`, confirm: 'Follow' },
      );
    },
    run: async (ctx, arg, choice) => {
      const uid = await sessionUserId();
      if (!uid) throw new Error('Sign in first.');
      const a = artistFor(ctx, arg, choice);
      if (await follows(uid, a.id)) return `You already follow ${a.name}.`;
      const { error } = await supabase.from('liked_artists').insert({ user_id: uid, artist_id: a.id } as never);
      if (error) throw new Error('That follow did not save. Try again in a moment.');
      // The same feed post the Follow button makes.
      await supabase.from('social_posts').insert({
        user_id: uid,
        post_type: 'artist_follow',
        artist_id: a.id,
        metadata: { artist_id: a.id, action: 'followed' },
        visibility: 'public',
      } as never);
      broadcastCountDelta('follow', { artistId: a.id, delta: 1 });
      return `You follow ${a.name} now. You hear first when they drop.`;
    },
    working: 'Following',
    refresh: [['artist-follower-counts']],
  },

  unfollow_artist: {
    check: async (ctx, arg) => {
      const uid = await sessionUserId();
      if (!uid) return SIGN_IN;
      return artistQuestion(ctx, arg, async (a) =>
        (await follows(uid, a.id)) ? { question: `Unfollow ${a.name}?`, confirm: 'Unfollow' } : { nothing: `You do not follow ${a.name}.` },
      );
    },
    run: async (ctx, arg, choice) => {
      const uid = await sessionUserId();
      if (!uid) throw new Error('Sign in first.');
      const a = artistFor(ctx, arg, choice);
      if (!(await follows(uid, a.id))) return `You do not follow ${a.name}.`;
      const { error } = await supabase.from('liked_artists').delete().eq('user_id', uid).eq('artist_id', a.id);
      if (error) throw new Error('That did not go through. Try again in a moment.');
      broadcastCountDelta('follow', { artistId: a.id, delta: -1 });
      return `You no longer follow ${a.name}.`;
    },
    working: 'Unfollowing',
    refresh: [['artist-follower-counts']],
  },

  create_playlist: {
    check: async (_ctx, arg) => {
      const uid = await sessionUserId();
      if (!uid) return SIGN_IN;
      const name = clip(arg, 80);
      if (!name) return { nothing: 'Tell me what to call the playlist and I will make it.' };
      const existing = (await myPlaylists(uid)).find((p) => norm(p.name) === norm(name));
      if (existing) return { nothing: `You already have a playlist called "${existing.name}".` };
      return { question: `Make a playlist called "${name}"?`, confirm: 'Make it', note: 'It starts private. You can share it any time.' };
    },
    run: async (_ctx, arg) => {
      const uid = await sessionUserId();
      if (!uid) throw new Error('Sign in first.');
      const name = clip(arg, 80);
      if (!name) throw new Error('A playlist needs a name.');
      const existing = (await myPlaylists(uid)).find((p) => norm(p.name) === norm(name));
      if (existing) return `You already have a playlist called "${existing.name}".`;
      const made = await createPlaylistRow(uid, name);
      return `Made your playlist "${made.name}". Ask me to add songs to it.`;
    },
    working: 'Making it',
    refresh: [],
  },

  add_to_playlist: {
    check: async (ctx, arg) => {
      const uid = await sessionUserId();
      if (!uid) return SIGN_IN;
      const { song, playlist } = splitPlaylistArg(arg);
      if (!song || !playlist) return { nothing: 'Tell me the song and which playlist it goes in.' };
      const found = matchSongs(ctx.songs, song);
      if (!found.length) return { nothing: `I could not find "${clip(splitSongArg(song).title)}" on $ongChainn.` };
      const pl = findPlaylist(await myPlaylists(uid), playlist);
      if (found.length > 1) {
        return {
          question: pl ? `Which one goes in "${pl.name}"?` : `Which one? I will make "${playlist}" for it.`,
          choices: found.map((s) => ({ value: s.id, label: songLabel(s) })),
        };
      }
      const s = found[0];
      if (!pl) return { question: `Make "${playlist}" and add "${s.title}" to it?`, confirm: 'Make and add' };
      const { data: already } = await supabase.from('playlist_songs').select('id').eq('playlist_id', pl.id).eq('song_id', s.id).maybeSingle();
      if (already) return { nothing: `"${s.title}" is already in "${pl.name}".` };
      return { question: `Add "${s.title}" to "${pl.name}"?`, confirm: 'Add it' };
    },
    run: async (ctx, arg, choice) => {
      const uid = await sessionUserId();
      if (!uid) throw new Error('Sign in first.');
      const { song, playlist } = splitPlaylistArg(arg);
      const s = songFor(ctx, song, choice);
      const pl = findPlaylist(await myPlaylists(uid), playlist) ?? (await createPlaylistRow(uid, playlist));
      const { data: existing } = await supabase.from('playlist_songs').select('song_id').eq('playlist_id', pl.id);
      const ids = ((existing ?? []) as Array<{ song_id: string }>).map((r) => r.song_id);
      if (ids.includes(s.id)) return `"${s.title}" is already in "${pl.name}".`;
      const { error } = await supabase.from('playlist_songs').insert({ playlist_id: pl.id, song_id: s.id, position: ids.length } as never);
      if (error) throw new Error('That song could not be added. Try again in a moment.');
      return `Added "${s.title}" to "${pl.name}".`;
    },
    working: 'Adding it',
    refresh: [],
  },

  save_offline: {
    check: async (ctx, arg) =>
      songQuestion(ctx, arg, (s) =>
        ctx.isSongCached?.(s.id)
          ? { nothing: `"${s.title}" is already saved. It plays without internet.` }
          : { question: `Save "${s.title}" to play without internet?`, confirm: 'Save offline' },
      ),
    run: async (ctx, arg, choice) => {
      const s = songFor(ctx, arg, choice);
      if (ctx.isSongCached?.(s.id)) return `"${s.title}" is already saved for offline.`;
      const ok = ctx.cacheSong ? await ctx.cacheSong(s.id, s.audioUrl, { title: s.title, artist: s.artist, duration: s.duration }) : false;
      if (!ok) throw new Error('Saving for offline works in the installed app. Install it from the menu, then ask me again.');
      return `Saving "${s.title}" now. Once it is in, it plays without internet.`;
    },
    working: 'Saving it for offline',
    refresh: [],
  },

  share_song: {
    check: async (ctx, arg) => songQuestion(ctx, arg, (s) => ({ question: `Share "${s.title}" by ${s.artist}?`, confirm: 'Share' })),
    run: async (ctx, arg, choice) => {
      const s = songFor(ctx, arg, choice);
      const url = ctx.songShareUrl ? ctx.songShareUrl(s) : `${window.location.origin}${songPath(s)}`;
      return shareOrCopy(`${s.title} by ${s.artist}`, `"${s.title}" by ${s.artist} on $ongChainn`, url);
    },
    working: 'Getting the link',
    refresh: [],
  },

  invite_friends: {
    check: async () => {
      if (!(await sessionUserId())) return SIGN_IN;
      return {
        question: 'Share your invite link?',
        confirm: 'Share it',
        note: 'You get 100 points for every friend who joins, and they start with 50.',
      };
    },
    run: async () => {
      if (!(await sessionUserId())) throw new Error('Sign in first.');
      const { data, error } = await supabase.rpc('get_or_create_my_referral_code');
      const code = typeof data === 'string' ? data : null;
      if (error || !code) throw new Error('Your invite link is not ready. Try again in a moment.');
      const url = `${window.location.origin}/?ref=${code}`;
      return shareOrCopy(
        'Join $ongChainn',
        'Music straight from the artists who made it. Use my invite and we both start with points.',
        url,
      );
    },
    working: 'Getting your link',
    refresh: [],
  },

  remove_failed_uploads: {
    check: async () => {
      const uid = await sessionUserId();
      if (!uid) return SIGN_IN;
      const { hourAgo } = failedUploads(uid);
      const { data } = await supabase
        .from('songs')
        .select('id, title')
        .eq('owner_id', uid)
        .eq('status', 'uploading')
        .is('audio_url', null)
        .lt('created_at', hourAgo);
      const rows = (data ?? []) as Array<{ id: string; title: string | null }>;
      if (!rows.length) return { nothing: 'No failed uploads. Everything you sent has its music in.' };
      const names = rows.slice(0, 3).map((r) => `"${r.title || 'Untitled'}"`).join(', ');
      return {
        question: `Remove ${plural(rows.length, 'upload')} that never got its music?`,
        confirm: 'Remove them',
        note: `${names}${rows.length > 3 ? ' and more' : ''}. Nothing with music in it is touched.`,
      };
    },
    run: async () => {
      const uid = await sessionUserId();
      if (!uid) throw new Error('Sign in first.');
      const { hourAgo } = failedUploads(uid);
      const { data, error } = await supabase
        .from('songs')
        .delete()
        .eq('owner_id', uid)
        .eq('status', 'uploading')
        .is('audio_url', null)
        .lt('created_at', hourAgo)
        .select('id');
      if (error) throw new Error('Those could not be removed. Try again in a moment.');
      const n = (data ?? []).length;
      return n ? `Done. ${plural(n, 'failed upload')} removed.` : 'Nothing left to remove.';
    },
    working: 'Removing them',
    refresh: [['artist_releases']],
  },
};

export function moshaDo(op: MoshaDoOp): DoOp {
  return OPS[op];
}
