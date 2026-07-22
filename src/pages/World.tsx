// Artist Worlds by songchainn. /world/:worldSlug renders the world map (the
// doors); /world/:worldSlug/:roomSlug renders a single room behind its gate.
// The world is a full-screen immersive layer over the app (spec §01): the
// map reads the visitor's key balance and lights up the doors they can open.

import { Link, Navigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Wallet } from 'lucide-react';
import { AudioPlayer } from '@/components/AudioPlayer';
import { ARTISTS } from '@/data/musicData';
import { getWorldBySlug, formatWorldNumber } from '@/worlds/registry';
import { useWorldAccess } from '@/worlds/useWorldAccess';
import { doorStateFor, roomIsEnterable, type WorldConfig } from '@/worlds/types';
import { WorldDoor, DOOR_HUES } from '@/worlds/components/WorldDoor';
import { GetKeyCta } from '@/worlds/components/GetKeyCta';
import { LockedRoom } from '@/worlds/components/LockedRoom';
import { GateRoom } from '@/worlds/components/rooms/GateRoom';
import { StreetsRoom } from '@/worlds/components/rooms/StreetsRoom';
import { GalleryRoom } from '@/worlds/components/rooms/GalleryRoom';
import {
  ScreeningRoom,
  StudioRoom,
  RequestDeskRoom,
  CouncilRoom,
  StageRoom,
  WallRoom,
} from '@/worlds/components/rooms/SimpleRooms';

function WalletChip({
  world,
  wallet,
  balance,
  onConnect,
  onRefresh,
}: {
  world: WorldConfig;
  wallet: string | null;
  balance: number;
  onConnect: () => void;
  onRefresh: () => void;
}) {
  if (!wallet) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-white/90"
      >
        <Wallet className="h-3.5 w-3.5" /> Connect to see your doors
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/80">
      <span className="font-mono">{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
      <span className="text-white/40">|</span>
      <span>
        {balance.toLocaleString()} {world.tokenSymbol}
      </span>
      <button type="button" onClick={onRefresh} aria-label="Refresh access" className="text-white/40 transition hover:text-white">
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}

const World = () => {
  const { worldSlug, roomSlug } = useParams<{ worldSlug: string; roomSlug?: string }>();
  const world = getWorldBySlug(worldSlug);

  if (!world) return <Navigate to="/not-found" replace />;
  return <WorldInner world={world} roomSlug={roomSlug} />;
};

function WorldInner({ world, roomSlug }: { world: WorldConfig; roomSlug?: string }) {
  const { wallet, rings, connect, refresh } = useWorldAccess(world);
  const artist = ARTISTS.find((a) => a.id === world.artistId);
  const room = roomSlug ? world.rooms.find((r) => r.slug === roomSlug) : undefined;

  if (roomSlug && !room) return <Navigate to={`/world/${world.slug}`} replace />;

  const connected = Boolean(wallet);
  const brand = `Artist Worlds by songchainn · ${formatWorldNumber(world)}`;

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(60% 40% at 50% 0%, rgba(217, 158, 43, 0.14) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6">
        {!room ? (
          <>
            {/* World map */}
            <header className="mb-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <Link
                  to={artist ? `/artist/${artist.id}` : '/'}
                  className="inline-flex items-center gap-1.5 text-xs text-white/50 transition hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Leave the world
                </Link>
                <WalletChip world={world} wallet={wallet} balance={rings.balance} onConnect={() => void connect()} onRefresh={refresh} />
              </div>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">{brand}</p>
                <div className="mt-3 flex items-center gap-4">
                  {artist?.profileImage && (
                    <img
                      src={artist.profileImage}
                      alt={world.artistName}
                      className="h-16 w-16 rounded-2xl border border-white/15 object-cover sm:h-20 sm:w-20"
                    />
                  )}
                  <div>
                    <h1 className="font-heading text-3xl font-bold sm:text-4xl">{world.artistName} World</h1>
                    <p className="mt-1 max-w-xl text-sm text-white/60">{world.positioning}</p>
                  </div>
                </div>
              </motion.div>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...world.rooms]
                .sort((a, b) => a.order - b.order)
                .map((r, i) => (
                  <WorldDoor key={r.slug} world={world} room={r} rings={rings} connected={connected} index={i} />
                ))}
            </div>

            <div className="mt-8">
              <GetKeyCta world={world} rings={rings} />
            </div>
          </>
        ) : (
          <>
            {/* A single room */}
            <header className="mb-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <Link
                  to={`/world/${world.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs text-white/50 transition hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to the world map
                </Link>
                <WalletChip world={world} wallet={wallet} balance={rings.balance} onConnect={() => void connect()} onRefresh={refresh} />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">
                {world.artistName} World
              </p>
              <h1 className={`mt-2 font-heading text-3xl font-bold sm:text-4xl ${(DOOR_HUES[room.hue] ?? DOOR_HUES.amber).text}`}>
                {room.name}
              </h1>
              <p className="mt-1 text-sm text-white/60">{room.tagline}</p>
            </header>

            {roomIsEnterable(doorStateFor(room, rings, connected)) || room.access === 'public' ? (
              <RoomContent world={world} roomSlug={room.slug} rings={rings} />
            ) : room.access === 'event' ? (
              <StageRoom world={world} />
            ) : (
              <LockedRoom
                world={world}
                room={room}
                rings={rings}
                connected={connected}
                onConnect={() => void connect()}
                onRefresh={refresh}
              />
            )}
          </>
        )}
      </div>
      <AudioPlayer />
    </div>
  );
}

function RoomContent({
  world,
  roomSlug,
  rings,
}: {
  world: WorldConfig;
  roomSlug: string;
  rings: ReturnType<typeof useWorldAccess>['rings'];
}) {
  switch (roomSlug) {
    case 'gate':
      return <GateRoom world={world} rings={rings} />;
    case 'streets':
      return <StreetsRoom world={world} />;
    case 'screening-room':
      return <ScreeningRoom world={world} />;
    case 'gallery':
      return <GalleryRoom world={world} />;
    case 'studio':
      return <StudioRoom world={world} />;
    case 'request-desk':
      return <RequestDeskRoom world={world} />;
    case 'council':
      return <CouncilRoom world={world} rings={rings} />;
    case 'stage':
      return <StageRoom world={world} />;
    case 'wall':
      return <WallRoom world={world} />;
    default:
      return null;
  }
}

export default World;
