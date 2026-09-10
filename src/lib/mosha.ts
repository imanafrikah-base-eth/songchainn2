import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

/**
 * Talking to Mo$ha.
 *
 * One call, the last few turns, and the page the person is on. The function
 * knows who is asking from the session the client already has, so nothing
 * about the person travels in the body. A failure comes back as words, not
 * an error, because a guide that goes silent is worse than one that says
 * "ask me again".
 */

export interface MoshaTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Something Mo$ha wants the app to open for the person: a flow in the chat, or a page. */
export type MoshaAction =
  | { type: 'flow'; flow: 'upload_song' | 'build_world' | 'become_artist' | 'connect_wallet' | 'edit_world' | 'edit_gallery' }
  | { type: 'go'; path: string };

export interface MoshaReply {
  reply: string;
  action?: MoshaAction;
}

export const MOSHA_INTRO =
  "I'm Mo$ha. I know this place inside out: the music, the artists, the worlds, the battles, the coins, the keys, all of it. Ask me anything, however you want to ask it.";

const DROPPED =
  'My line dropped for a second. Ask me again, and if it keeps happening, songchaindao@gmail.com is a real person who will help.';

export async function askMosha(turns: MoshaTurn[], surface: 'bubble' | 'inbox' = 'bubble'): Promise<string> {
  return (await askMoshaFull(turns, surface)).reply;
}

/** The reply and, when Mo$ha wants to do something for the person, the action. */
export async function askMoshaFull(turns: MoshaTurn[], surface: 'bubble' | 'inbox' = 'bubble'): Promise<MoshaReply> {
  if (!isSupabaseConfigured) {
    return { reply: 'I am offline right now. Everything here still plays; come back to me in a bit.' };
  }
  const page = typeof window !== 'undefined' ? pageName(window.location.pathname) : null;
  try {
    const { data, error } = await supabase.functions.invoke('mosha-chat', {
      body: { messages: turns.slice(-12), surface, page },
    });
    if (error || !data?.reply) return { reply: DROPPED };
    const raw = data.action as MoshaAction | undefined;
    const action: MoshaAction | undefined =
      raw?.type === 'flow' && ['upload_song', 'build_world', 'become_artist', 'connect_wallet', 'edit_world', 'edit_gallery'].includes(raw.flow)
        ? raw
        : raw?.type === 'go' && typeof raw.path === 'string' && raw.path.startsWith('/')
          ? raw
          : undefined;
    return { reply: String(data.reply), action };
  } catch {
    return { reply: DROPPED };
  }
}

function pageName(pathname: string): string {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/world/')) return 'a world';
  if (pathname.startsWith('/wavewarz')) return 'WaveWarz Africa';
  if (pathname.startsWith('/studio')) return 'Studio';
  if (pathname.startsWith('/song/')) return 'a song';
  if (pathname.startsWith('/artist/')) return 'an artist';
  if (pathname.startsWith('/social')) return 'the feed';
  if (pathname.startsWith('/inbox')) return 'the inbox';
  if (pathname.startsWith('/profile')) return 'their profile';
  if (pathname.startsWith('/marketplace')) return 'the marketplace';
  if (pathname.startsWith('/leaderboard')) return 'the leaderboard';
  return pathname.replace(/^\//, '').split('/')[0] || 'home';
}
