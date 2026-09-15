import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Headphones, Music2, Swords, Trophy, Quote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SONGS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { useCoverArt } from '@/components/ArtMosaic';
import { thumb } from '@/lib/img';

/**
 * Pictures for the feed posts that used to be a grey circle and a music note
 * (founder, 15 Sep 2026: "nothing fun, nothing to look at"). A battle post is
 * the battle: both records facing off, live or with its result. Somebody
 * walking into The Room is a wall of the covers playing there. A post with only
 * words is set big, over real artwork, so it reads like a poster.
 */

export const MOSHA_POST_USER_ID = '0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d';

/** The battle a post is about: from its metadata, or the room id written in it. */
export function battleIdFromPost(post: { content?: string | null; metadata?: object | null }): string | null {
  const meta = (post.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.battle_id === 'string' && meta.battle_id) return meta.battle_id;
  const text = post.content ?? '';
  const m =
    text.match(/BATTLE_LIVE::([0-9a-f-]{36})/i) ||
    text.match(/battle room ([0-9a-f-]{36})/i) ||
    text.match(/wavewarz-africa\/(?:room|battle)\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

interface BattleRow {
  id: string;
  title: string;
  status: string;
  winner: string | null;
  artist_a_name: string;
  artist_b_name: string;
  artist_a_image: string | null;
  artist_b_image: string | null;
  songs_a: Array<{ id: string; title: string }> | null;
  songs_b: Array<{ id: string; title: string }> | null;
  room_closed_at: string | null;
}

export function useFeedBattle(battleId: string | null) {
  return useQuery({
    queryKey: ['feed-battle', battleId],
    enabled: !!battleId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('battles')
        .select('id, title, status, winner, artist_a_name, artist_b_name, artist_a_image, artist_b_image, songs_a, songs_b, room_closed_at')
        .eq('id', battleId!)
        .maybeSingle();
      return (data as unknown as BattleRow | null) ?? null;
    },
  });
}

/** What a battle post says under the picture, instead of a raw room id. */
export function battleLine(b: BattleRow | null | undefined, fallback: string | null | undefined): { text: string; cta: string; path: string | null } {
  if (!b) return { text: (fallback ?? '').replace(/\s*Join battle room [0-9a-f-]{36}\s*and vote\.?/i, '').trim(), cta: 'Open the battle', path: null };
  const live = b.status === 'live';
  const winner = b.winner === 'A' ? b.artist_a_name : b.winner === 'B' ? b.artist_b_name : null;
  return live
    ? { text: `${b.artist_a_name} vs ${b.artist_b_name}, live on WaveWarz Africa. Come vote.`, cta: 'Join the battle', path: `/wavewarz-africa/room/${b.id}` }
    : { text: winner ? `${winner} took ${b.title.trim()}. The judges have spoken.` : `${b.title.trim()} is over. The verdicts are in.`, cta: 'See the verdicts', path: `/wavewarz-africa/battle/${b.id}` };
}

function useCoverFor() {
  const { songs } = usePublishedCatalog();
  return useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of [...SONGS, ...songs]) if (s.coverImage) byId.set(String(s.id), s.coverImage);
    return (id: string | undefined) => (id ? byId.get(String(id)) : undefined);
  }, [songs]);
}

export function BattleFeedVisual({ battleId }: { battleId: string }) {
  const { data: b } = useFeedBattle(battleId);
  const coverFor = useCoverFor();
  const live = b?.status === 'live';
  const sides = [
    { key: 'A', name: b?.artist_a_name ?? '', art: coverFor(b?.songs_a?.[0]?.id) || b?.artist_a_image || undefined, song: b?.songs_a?.[0]?.title, tone: 'from-emerald-400 to-emerald-600', glow: 'shadow-[0_0_40px_rgba(52,211,153,0.55)]', rot: -6 },
    { key: 'B', name: b?.artist_b_name ?? '', art: coverFor(b?.songs_b?.[0]?.id) || b?.artist_b_image || undefined, song: b?.songs_b?.[0]?.title, tone: 'from-sky-400 to-cyan-600', glow: 'shadow-[0_0_40px_rgba(56,189,248,0.55)]', rot: 6 },
  ];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-48 md:pb-16">
      {/* The arena lights behind the two records. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(45% 40% at 28% 45%, rgba(52,211,153,0.28), transparent 70%), radial-gradient(45% 40% at 72% 45%, rgba(56,189,248,0.28), transparent 70%)' }}
      />
      <motion.span
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
          live ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)]' : 'bg-amber-400 text-black'
        }`}
      >
        {live ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : <Trophy className="h-3.5 w-3.5" />}
        {live ? 'Live battle' : 'Results are in'}
      </motion.span>

      <div className="relative flex items-center justify-center">
        {sides.map((s, i) => {
          const won = !!b && !live && b.winner === s.key;
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, x: i === 0 ? -40 : 40, rotate: 0 }}
              animate={{ opacity: 1, x: 0, rotate: s.rot }}
              transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.05 * i }}
              className={`relative ${i === 0 ? '-mr-4' : '-ml-4'} w-36 sm:w-44`}
            >
              <div className={`overflow-hidden rounded-2xl border-2 border-white/80 bg-neutral-900 ${s.glow} ${won ? 'ring-4 ring-amber-400' : ''}`}>
                <div className="aspect-square w-full">
                  {s.art ? (
                    <img src={thumb(s.art, 180) ?? s.art} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${s.tone}`}>
                      <Music2 className="h-12 w-12 text-white/80" />
                    </div>
                  )}
                </div>
                <div className="bg-black/80 px-2.5 py-2">
                  <p className="truncate text-sm font-black text-white">{s.name || ' '}</p>
                  <p className="truncate text-[10px] text-white/60">{s.song ?? ' '}</p>
                </div>
              </div>
              {won && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-black">
                  <Trophy className="h-3 w-3" /> Winner
                </span>
              )}
            </motion.div>
          );
        })}
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.25 }}
          className="absolute left-1/2 top-[38%] z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-amber-400 bg-black text-lg font-black text-amber-400 shadow-[0_0_28px_rgba(251,191,36,0.6)]"
        >
          VS
        </motion.span>
      </div>

      <p className="relative mt-6 max-w-xs text-center text-xl font-black leading-tight text-white drop-shadow sm:text-2xl">
        <Swords className="mr-1.5 inline h-5 w-5 align-[-2px] text-amber-400" />
        {b?.title?.trim() || 'WaveWarz Africa'}
      </p>
    </div>
  );
}

export function RoomFeedVisual() {
  const covers = useCoverArt(12, 23);
  const { data: live } = useQuery({
    queryKey: ['feed-room-live'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('room_live_counts').select('listener_count');
      const n = ((data ?? []) as Array<{ listener_count: number | null }>).reduce((sum, r) => sum + Number(r.listener_count ?? 0), 0);
      return Number.isFinite(n) ? n : 0;
    },
  });

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* A wall of what plays in The Room, drifting. */}
      <motion.div
        aria-hidden="true"
        className="absolute -inset-10 grid grid-cols-4 gap-2 opacity-70"
        animate={{ y: [0, -40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      >
        {[...covers, ...covers].slice(0, 20).map((src, i) => (
          <img key={i} src={thumb(src, 120) ?? src} alt="" className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
        ))}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
      <div className="absolute inset-0 flex flex-col items-center justify-center pb-48 pl-8 pr-20 text-center md:pb-16 md:pr-8">
        <motion.div
          className="relative mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-primary shadow-[0_0_50px_hsl(var(--primary)/0.6)]"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" aria-hidden="true" />
          <Headphones className="relative h-11 w-11 text-primary-foreground" />
        </motion.div>
        <h2 className="text-3xl font-black tracking-tight text-white drop-shadow">The Room</h2>
        <p className="mt-1 text-sm font-semibold text-white/85">
          {live && live > 0 ? `${live} listening together right now` : 'Everyone hears the same song, at the same time'}
        </p>
      </div>
    </div>
  );
}

/** A post that is only words: set big over real artwork, like a poster. */
export function TextFeedVisual({ text, seed }: { text: string; seed: number }) {
  const covers = useCoverArt(1, seed);
  const bg = covers[0];
  const short = text.length <= 90;
  return (
    <div className="absolute inset-0 overflow-hidden">
      {bg && <img src={thumb(bg, 400) ?? bg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" />}
      <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-primary/40" />
      <div className="absolute inset-0 flex items-center justify-center pb-40 pl-8 pr-20 md:pb-16 md:pr-8">
        <div className="max-w-md">
          <Quote className="mb-3 h-9 w-9 text-primary" aria-hidden="true" />
          <p className={`font-black leading-tight text-white drop-shadow ${short ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'} line-clamp-6`}>
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
