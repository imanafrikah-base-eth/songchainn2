// A door on the world map. States (spec §02): open, locked, no-wallet,
// event-live, council. Locked doors say exactly what it takes to enter,
// framed as access, never as price.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Crown, Radio, DoorOpen } from 'lucide-react';
import type { WorldConfig, WorldRoomDef, WorldRings } from '../types';
import { doorStateFor, roomIsEnterable } from '../types';

// Literal class maps so Tailwind's scanner generates every hue.
export const DOOR_HUES: Record<string, { border: string; glow: string; text: string; bg: string }> = {
  amber: { border: 'border-amber-400/40', glow: 'hover:shadow-amber-400/20', text: 'text-amber-300', bg: 'from-amber-500/15' },
  emerald: { border: 'border-emerald-400/40', glow: 'hover:shadow-emerald-400/20', text: 'text-emerald-300', bg: 'from-emerald-500/15' },
  sky: { border: 'border-sky-400/40', glow: 'hover:shadow-sky-400/20', text: 'text-sky-300', bg: 'from-sky-500/15' },
  violet: { border: 'border-violet-400/40', glow: 'hover:shadow-violet-400/20', text: 'text-violet-300', bg: 'from-violet-500/15' },
  rose: { border: 'border-rose-400/40', glow: 'hover:shadow-rose-400/20', text: 'text-rose-300', bg: 'from-rose-500/15' },
  orange: { border: 'border-orange-400/40', glow: 'hover:shadow-orange-400/20', text: 'text-orange-300', bg: 'from-orange-500/15' },
  yellow: { border: 'border-yellow-400/40', glow: 'hover:shadow-yellow-400/20', text: 'text-yellow-300', bg: 'from-yellow-500/15' },
  red: { border: 'border-red-400/40', glow: 'hover:shadow-red-400/20', text: 'text-red-300', bg: 'from-red-500/15' },
  cyan: { border: 'border-cyan-400/40', glow: 'hover:shadow-cyan-400/20', text: 'text-cyan-300', bg: 'from-cyan-500/15' },
};

export function WorldDoor({
  world,
  room,
  rings,
  connected,
  index,
}: {
  world: WorldConfig;
  room: WorldRoomDef;
  rings: WorldRings | null;
  connected: boolean;
  index: number;
}) {
  const hue = DOOR_HUES[room.hue] ?? DOOR_HUES.amber;
  const state = doorStateFor(room, rings, connected);
  const enterable = roomIsEnterable(state);

  const requirement =
    room.access === 'fan'
      ? rings?.thresholds.FAN
      : room.access === 'insider'
        ? rings?.thresholds.INSIDER
        : null;

  return (
    <Link to={`/world/${world.slug}/${room.slug}`} className="block h-full">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06, duration: 0.5, ease: 'easeOut' }}
        whileHover={{ y: -4 }}
        className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-gradient-to-b ${hue.bg} to-black/60 p-5 shadow-lg transition ${
          enterable ? `${hue.border} ${hue.glow} hover:shadow-xl` : 'border-white/10 opacity-80'
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${enterable ? hue.text : 'text-white/40'}`}>
            {room.access === 'public' && 'Open to everyone'}
            {room.access === 'fan' && 'Fan door'}
            {room.access === 'insider' && 'Insider door'}
            {room.access === 'council' && 'The top ten'}
            {room.access === 'event' && 'Event door'}
          </p>
          {state === 'open' && <DoorOpen className={`h-4 w-4 ${hue.text}`} />}
          {(state === 'locked' || state === 'no-wallet') && <Lock className="h-4 w-4 text-white/40" />}
          {state === 'council' && <Crown className="h-4 w-4 text-yellow-300" />}
          {state === 'event' && <Radio className="h-4 w-4 text-red-300" />}
        </div>

        <h3 className="font-heading text-xl font-bold text-white">{room.name}</h3>
        <p className={`mt-0.5 text-xs font-medium ${enterable ? hue.text : 'text-white/50'}`}>{room.tagline}</p>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-white/60">{room.teaser}</p>

        <div className="mt-4 text-xs">
          {enterable && <span className={`font-semibold ${hue.text}`}>Step inside</span>}
          {state === 'locked' && room.access !== 'council' && requirement != null && (
            <span className="text-white/50">
              Hold {requirement.toLocaleString()} {world.tokenSymbol} or more to enter. You are holding{' '}
              {(rings?.balance ?? 0).toLocaleString()}.
            </span>
          )}
          {state === 'locked' && room.access === 'council' && (
            <span className="text-white/50">
              The ten most reputable citizens hold these seats. The leaderboard is forming.
            </span>
          )}
          {state === 'no-wallet' && <span className="text-white/50">Connect to see your doors.</span>}
          {state === 'event' && (
            <span className="text-white/50">No live moment right now. The next one lights this door up.</span>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
