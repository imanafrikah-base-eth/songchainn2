// The locked overlay for a gated room (spec §02): what is inside, what it
// takes to enter, and the way in. Access and belonging, never price.

import { Lock, RefreshCw, Wallet } from 'lucide-react';
import type { WorldConfig, WorldRoomDef, WorldRings } from '../types';
import { GetKeyCta } from './GetKeyCta';

export function LockedRoom({
  world,
  room,
  rings,
  connected,
  onConnect,
  onRefresh,
}: {
  world: WorldConfig;
  room: WorldRoomDef;
  rings: WorldRings;
  connected: boolean;
  onConnect: () => void;
  onRefresh: () => void;
}) {
  const requirement =
    room.access === 'fan'
      ? rings.thresholds.FAN
      : room.access === 'insider'
        ? rings.thresholds.INSIDER
        : null;

  return (
    <div className="mx-auto max-w-xl space-y-6 py-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/5">
        <Lock className="h-7 w-7 text-white/60" />
      </div>
      <div>
        <h2 className="font-heading text-2xl font-bold text-white">This door is closed to you, for now</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{room.teaser}</p>
      </div>

      {!connected ? (
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:bg-white/90"
        >
          <Wallet className="h-4 w-4" /> Connect to see your doors
        </button>
      ) : room.access === 'council' ? (
        <p className="text-sm text-white/60">
          The Council seats the ten most reputable citizens. The leaderboard is forming; holding the key,
          collecting the catalog and showing up all move you toward a seat.
        </p>
      ) : (
        requirement != null && (
          <p className="text-sm text-white/60">
            Hold {requirement.toLocaleString()} {world.tokenSymbol} or more and this door opens. You are
            holding {rings.balance.toLocaleString()}.
          </p>
        )
      )}

      <GetKeyCta world={world} rings={rings} />

      {connected && (
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-xs text-white/40 transition hover:text-white/70"
        >
          <RefreshCw className="h-3 w-3" /> Refresh my access
        </button>
      )}
    </div>
  );
}
