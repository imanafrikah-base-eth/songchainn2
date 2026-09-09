// A door on the world map, rendered as a doorway into the room: real artist
// imagery behind glass, 3D perspective tilt on hover, light spilling from
// under enterable doors. States (spec §02): open, locked, no-wallet,
// event-live, council. Locked doors say exactly what it takes to enter,
// framed as access, never as price.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Crown, Radio, DoorOpen } from 'lucide-react';
import type { WorldConfig, WorldRoomDef, WorldRings } from '../types';
import { doorStateFor, roomIsEnterable } from '../types';
import { WorldArt } from './WorldArt';

// Literal class maps so Tailwind's scanner generates every hue.
export const DOOR_HUES: Record<
  string,
  { border: string; glow: string; text: string; bg: string; light: string }
> = {
  amber: { border: 'border-amber-400/50', glow: 'hover:shadow-amber-400/25', text: 'text-amber-300', bg: 'from-amber-500/25', light: 'bg-amber-400/70' },
  emerald: { border: 'border-emerald-400/50', glow: 'hover:shadow-emerald-400/25', text: 'text-emerald-300', bg: 'from-emerald-500/25', light: 'bg-emerald-400/70' },
  sky: { border: 'border-sky-400/50', glow: 'hover:shadow-sky-400/25', text: 'text-sky-300', bg: 'from-sky-500/25', light: 'bg-sky-400/70' },
  violet: { border: 'border-violet-400/50', glow: 'hover:shadow-violet-400/25', text: 'text-violet-300', bg: 'from-violet-500/25', light: 'bg-violet-400/70' },
  rose: { border: 'border-rose-400/50', glow: 'hover:shadow-rose-400/25', text: 'text-rose-300', bg: 'from-rose-500/25', light: 'bg-rose-400/70' },
  orange: { border: 'border-orange-400/50', glow: 'hover:shadow-orange-400/25', text: 'text-orange-300', bg: 'from-orange-500/25', light: 'bg-orange-400/70' },
  yellow: { border: 'border-yellow-400/50', glow: 'hover:shadow-yellow-400/25', text: 'text-yellow-300', bg: 'from-yellow-500/25', light: 'bg-yellow-400/70' },
  red: { border: 'border-red-400/50', glow: 'hover:shadow-red-400/25', text: 'text-red-300', bg: 'from-red-500/25', light: 'bg-red-400/70' },
  cyan: { border: 'border-cyan-400/50', glow: 'hover:shadow-cyan-400/25', text: 'text-cyan-300', bg: 'from-cyan-500/25', light: 'bg-cyan-400/70' },
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
  const art = world.roomArt?.[room.slug];
  const loop = world.roomVideo?.[room.slug];

  const requirement =
    room.access === 'fan'
      ? rings?.thresholds.FAN
      : room.access === 'insider'
        ? rings?.thresholds.INSIDER
        : null;

  return (
    <Link to={`/world/${world.slug}/${room.slug}`} className="group block h-full [perspective:1100px]">
      <motion.div
        initial={{ opacity: 0, y: 32, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: index * 0.07, duration: 0.55, ease: 'easeOut' }}
        whileHover={{ rotateY: 5, rotateX: -4, y: -8, scale: 1.03 }}
        style={{ transformStyle: 'preserve-3d', transformPerspective: 1100 }}
        className={`relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border shadow-xl shadow-black/60 transition-shadow ${
          enterable ? `${hue.border} ${hue.glow} hover:shadow-2xl` : 'border-white/10'
        }`}
      >
        {/* The room, seen through the doorway. A locked one is still shown, drained
            of its colour and its light: you can see what is in there, you just
            cannot walk in. */}
        <WorldArt
          poster={art}
          video={loop}
          className={`h-full w-full object-cover transition duration-700 group-hover:scale-110 ${
            enterable ? 'brightness-[0.85]' : 'brightness-[0.45] grayscale-[0.6]'
          }`}
        />
        {/* Readability only. A door the artist pictured shows that picture as
            they made it: no colour wash, and just enough dark at the foot for
            the words. The wash stays for a door with no picture yet. */}
        <div className={`absolute inset-0 bg-gradient-to-t ${art ? 'from-black/90 via-black/25 to-transparent' : 'from-black/95 via-black/45 to-black/15'}`} />
        {!art && (
          <div className={`absolute inset-0 bg-gradient-to-b ${hue.bg} to-transparent ${enterable ? 'opacity-50' : 'opacity-25'}`} />
        )}
        {/* Light under an enterable door */}
        {enterable && (
          <div className={`absolute inset-x-6 bottom-0 h-1 rounded-t-full ${hue.light} blur-[6px]`} />
        )}

        <div className="relative flex h-full flex-col p-5" style={{ transform: 'translateZ(30px)' }}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] drop-shadow ${enterable ? hue.text : 'text-white/50'}`}>
              {room.access === 'public' && 'Open to everyone'}
              {room.access === 'fan' && 'Fan door'}
              {room.access === 'insider' && 'Insider door'}
              {room.access === 'council' && 'The top ten'}
              {room.access === 'event' && 'Event door'}
            </p>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              {state === 'open' && <DoorOpen className={`h-4 w-4 ${hue.text}`} />}
              {(state === 'locked' || state === 'no-wallet') && <Lock className="h-4 w-4 text-white/60" />}
              {state === 'council' && <Crown className="h-4 w-4 text-yellow-300" />}
              {state === 'event' && <Radio className="h-4 w-4 text-red-300" />}
            </span>
          </div>

          <div className="mt-auto">
            <h3 className="font-heading text-xl font-bold text-white drop-shadow-lg">{room.name}</h3>
            <p className={`mt-0.5 text-xs font-medium drop-shadow ${enterable ? hue.text : 'text-white/60'}`}>
              {room.tagline}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70 drop-shadow">{room.teaser}</p>

            <div className="mt-3 text-xs">
              {enterable && <span className={`font-semibold ${hue.text}`}>Step inside</span>}
              {state === 'locked' && room.access !== 'council' && requirement != null && (
                <span className="text-white/60">
                  Hold {requirement.toLocaleString()} {world.tokenSymbol} or more to enter. You are holding{' '}
                  {(rings?.balance ?? 0).toLocaleString()}.
                </span>
              )}
              {state === 'locked' && room.access === 'council' && (
                <span className="text-white/60">
                  The ten most reputable citizens hold these seats. The leaderboard is forming.
                </span>
              )}
              {state === 'no-wallet' && <span className="text-white/60">Connect to see your doors.</span>}
              {state === 'event' && (
                <span className="text-white/60">No live moment right now. The first one is being scheduled.</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
