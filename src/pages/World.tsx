// Artist Worlds by songchainn.
//
//   /world/:worldSlug              the skyline: the cities of this world
//   /world/:worldSlug/:citySlug    one city: the buildings standing in it
//   /world/:worldSlug/:roomSlug    one room, behind its gate
//
// The second segment resolves as a city first and a room second, which is why
// city slugs and room slugs must never collide. Doing it this way keeps the
// existing two routes in App.tsx untouched.
//
// The world is a full-screen immersive layer over the app (spec §01): the map
// reads the visitor's key balance and lights up what they can open. Whatever
// is playing dresses the whole layer, because music runs under every city.

import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Wallet, Disc3, Shirt } from 'lucide-react';
import { AudioPlayer } from '@/components/AudioPlayer';
import { ARTISTS } from '@/data/musicData';
import { getWorldBySlug, formatWorldNumber } from '@/worlds/registry';
import { fetchWorldBySlug } from '@/worlds/loader';
import { BuiltRoom } from '@/worlds/components/BuiltRoom';
import { useWorldAccess } from '@/worlds/useWorldAccess';
import { useAuth } from '@/context/AuthContext';
import { useCityTheme } from '@/worlds/useCityTheme';
import {
  getCityBySlug,
  cityForRoom,
  cityRooms,
  townSquareRooms,
  cityInventory,
} from '@/worlds/cities';
import {
  doorStateFor,
  roomIsEnterable,
  type WorldConfig,
  type WorldCityDef,
} from '@/worlds/types';
import { WorldDoor, DOOR_HUES } from '@/worlds/components/WorldDoor';
import { CityBlock } from '@/worlds/components/CityBlock';
import { WorldArt } from '@/worlds/components/WorldArt';
import { EnterVR } from '@/worlds/components/EnterVR';
import { ArrivalWalk } from '@/worlds/components/ArrivalWalk';
import { AvatarPicker } from '@/worlds/components/AvatarPicker';
import { CitizenAvatar } from '@/worlds/components/CitizenAvatar';
import { useCitizen } from '@/worlds/useCitizen';
import { GetKeyCta } from '@/worlds/components/GetKeyCta';
import { WorldDrops } from '@/worlds/components/WorldDrops';
import { LockedRoom } from '@/worlds/components/LockedRoom';
import { GateRoom } from '@/worlds/components/rooms/GateRoom';
import { StreetsRoom } from '@/worlds/components/rooms/StreetsRoom';
import { GalleryRoom } from '@/worlds/components/rooms/GalleryRoom';
import { MeetRoom } from '@/worlds/components/rooms/MeetRoom';
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
      <button type="button" onClick={onRefresh} aria-label="Check again" className="text-white/40 transition hover:text-white">
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}

const World = () => {
  const { worldSlug, slug, roomSlug } = useParams<{ worldSlug?: string; slug?: string; roomSlug?: string }>();
  const key = worldSlug ?? slug;
  // Code-defined worlds answer at once. A world built in the builder is
  // fetched, and gets the exact same viewer: the same map, doors, cities,
  // art and gate as World #001, with its streets' blocks inside the rooms.
  const coded = getWorldBySlug(key);
  const [loaded, setLoaded] = useState<WorldConfig | null | undefined>(undefined);
  useEffect(() => {
    if (coded) return;
    let live = true;
    setLoaded(undefined);
    void fetchWorldBySlug(key).then((w) => {
      if (live) setLoaded(w ?? null);
    });
    return () => {
      live = false;
    };
  }, [key, coded]);

  const world = coded ?? loaded;
  if (world === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070b]">
        <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
      </div>
    );
  }
  if (!world) return <Navigate to="/not-found" replace />;
  return <WorldInner world={world} segment={roomSlug} fromDb={!coded} />;
};

function WorldInner({ world, segment, fromDb = false }: { world: WorldConfig; segment?: string; fromDb?: boolean }) {
  const { wallet, rings, connect, refresh } = useWorldAccess(world);
  const { artistId } = useAuth();
  const theme = useCityTheme(world);
  const citizen = useCitizen(world, rings);
  const [dressing, setDressing] = useState(false);
  const artist = ARTISTS.find((a) => a.id === world.artistId);

  // Cities win the name race, then rooms. Nothing else is a valid address.
  const city = segment ? getCityBySlug(world, segment) : undefined;
  const room = !city && segment ? world.rooms.find((r) => r.slug === segment) : undefined;

  if (segment && !city && !room) return <Navigate to={`/world/${world.slug}`} replace />;

  const connected = Boolean(wallet);
  const brand = `Artist Worlds by songchainn · ${formatWorldNumber(world)}`;
  const roomArt = room ? world.roomArt?.[room.slug] : undefined;
  const roomLoop = room ? world.roomVideo?.[room.slug] : undefined;
  // A room inside a city walks back out into that city. A town square
  // landmark walks back out into the square itself.
  const homeCity = room ? cityForRoom(world, room.slug) : undefined;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07070b] text-white">
      {/* You do not appear here, you walk in. Once per visit. */}
      <ArrivalWalk
        worldSlug={world.slug}
        worldName={`${world.artistName} World`}
        avatar={citizen.avatar}
        accent={theme.accent}
        entrance={world.entrance}
      />
      {/* The sky, wearing whatever record is playing */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40 transition-[background] duration-[1200ms] ease-out"
        style={{
          background: `radial-gradient(60% 40% at 50% 0%, rgba(${theme.rgb}, 0.16) 0%, transparent 70%)`,
        }}
      />
      {/* Perspective floor: the ground plane of the world */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[42vh] opacity-[0.18] transition-[background] duration-[1200ms] ease-out"
        style={{
          background: `repeating-linear-gradient(transparent, transparent 39px, rgba(${theme.rgb},0.5) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(${theme.rgb},0.5) 40px)`,
          transform: 'perspective(600px) rotateX(62deg) scale(1.7)',
          transformOrigin: 'center bottom',
          maskImage: 'linear-gradient(to top, black 25%, transparent 95%)',
          WebkitMaskImage: 'linear-gradient(to top, black 25%, transparent 95%)',
        }}
      />
      {/* Map hero: the artist watching over the world entrance */}
      {!room && !city && world.heroImage && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden">
          <WorldArt
            poster={world.heroImage}
            video={world.heroVideo}
            eager
            className="h-full w-full object-cover object-top opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#07070b]/20 via-[#07070b]/70 to-[#07070b]" />
        </div>
      )}
      <div className="relative mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6">
        {city ? (
          <CityView
            world={world}
            city={city}
            rings={rings}
            connected={connected}
            wallet={wallet}
            onConnect={() => void connect()}
            onRefresh={refresh}
            theme={theme}
          />
        ) : !room ? (
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
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <NowWearing theme={theme} />
                  <EnterVR world={world} theme={theme} />
                  <button
                    type="button"
                    onClick={() => setDressing((d) => !d)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:border-white/40 hover:bg-white/10"
                  >
                    <CitizenAvatar config={citizen.avatar} size={20} />
                    {citizen.displayName ?? 'Your citizen'}
                    <Shirt className="h-3.5 w-3.5 text-white/50" />
                  </button>
                </div>
              </motion.div>

              {dressing && (
                <div className="mt-5">
                  <AvatarPicker
                    world={world}
                    rings={rings}
                    citizen={citizen}
                    onClose={() => setDressing(false)}
                  />
                </div>
              )}
            </header>

            {/* The skyline: the cities of this world */}
            <SectionLabel
              title="The cities"
              note="Every city is a kind of content. The music plays in all of them."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...world.cities]
                .sort((a, b) => a.order - b.order)
                .map((c, i) => (
                  <CityBlock key={c.slug} world={world} city={c} index={i} />
                ))}
            </div>

            {/* The town square: the landmarks that belong to no single city */}
            <div className="mt-12">
              <SectionLabel
                title="The town square"
                note="The centre of the world. Where you arrive, and where everyone gathers."
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {townSquareRooms(world).map((r, i) => (
                  <WorldDoor key={r.slug} world={world} room={r} rings={rings} connected={connected} index={i} />
                ))}
              </div>
            </div>

            {/* Drops the artist minted from inside this world. Renders nothing
                when there are none, so a world without drops is unchanged. */}
            <div className="mt-8">
              <WorldDrops
                worldSlug={world.slug}
                dark
                ownerLink={artistId && artistId === world.artistId ? `/drops/${world.slug}` : null}
              />
            </div>

            <div className="mt-8">
              <GetKeyCta world={world} rings={rings} onBought={refresh} />
            </div>
          </>
        ) : (
          <>
            {/* A single room: hero banner is the room's art, seen from inside */}
            <header className="relative -mx-4 mb-8 overflow-hidden rounded-b-3xl sm:-mx-6">
              {roomArt && (
                <>
                  {/* Eager: this banner is the first thing on screen when you
                      walk into a room, so it does not wait to be scrolled to. */}
                  <WorldArt
                    poster={roomArt}
                    video={roomLoop}
                    eager
                    className="h-full w-full scale-105 object-cover opacity-45"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#07070b]/60 to-[#07070b]" />
                </>
              )}
              <div className="relative px-4 pb-10 pt-6 sm:px-6">
                <div className="mb-8 flex items-center justify-between gap-3">
                  <Link
                    to={
                      homeCity
                        ? `/world/${world.slug}/${homeCity.slug}`
                        : `/world/${world.slug}`
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/70 backdrop-blur-sm transition hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />{' '}
                    {homeCity ? `Back to ${homeCity.name}` : 'Back to the town square'}
                  </Link>
                  <WalletChip world={world} wallet={wallet} balance={rings.balance} onConnect={() => void connect()} onRefresh={refresh} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/80 drop-shadow">
                  {world.artistName} World
                </p>
                <h1 className={`mt-2 font-heading text-3xl font-bold drop-shadow-lg sm:text-4xl ${(DOOR_HUES[room.hue] ?? DOOR_HUES.amber).text}`}>
                  {room.name}
                </h1>
                <p className="mt-1 text-sm text-white/70 drop-shadow">{room.tagline}</p>
              </div>
            </header>

            {roomIsEnterable(doorStateFor(room, rings, connected)) || room.access === 'public' ? (
              <RoomContent world={world} roomSlug={room.slug} rings={rings} fromDb={fromDb} />
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

function SectionLabel({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="font-heading text-lg font-bold text-white/90">{title}</h2>
      <p className="text-xs text-white/45">{note}</p>
    </div>
  );
}

/**
 * What the city is currently wearing. Only shows while one of this artist's
 * records is playing, because that is the only time the world repaints.
 */
function NowWearing({ theme }: { theme: ReturnType<typeof useCityTheme> }) {
  if (!theme.wearing) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs backdrop-blur-sm"
      style={{
        borderColor: `rgba(${theme.rgb}, 0.35)`,
        backgroundColor: `rgba(${theme.rgb}, 0.08)`,
        color: theme.accent,
      }}
    >
      <Disc3 className="h-3.5 w-3.5 animate-[spin_4s_linear_infinite] motion-reduce:animate-none" />
      <span className="font-medium">The city is wearing {theme.wearing}</span>
    </motion.div>
  );
}

/**
 * One city: the buildings standing in it. A building is a room, so access is
 * resolved exactly as it is anywhere else; the city is an address, never a
 * second gate.
 */
function CityView({
  world,
  city,
  rings,
  connected,
  wallet,
  onConnect,
  onRefresh,
  theme,
}: {
  world: WorldConfig;
  city: WorldCityDef;
  rings: ReturnType<typeof useWorldAccess>['rings'];
  connected: boolean;
  wallet: string | null;
  onConnect: () => void;
  onRefresh: () => void;
  theme: ReturnType<typeof useCityTheme>;
}) {
  const hue = DOOR_HUES[city.hue] ?? DOOR_HUES.amber;
  const { count, unit } = cityInventory(world, city);
  const buildings = cityRooms(world, city);
  const art = world.cityArt?.[city.slug];
  const loop = world.cityVideo?.[city.slug];

  return (
    <>
      <header className="relative -mx-4 mb-8 overflow-hidden rounded-b-3xl sm:-mx-6">
        {art && (
          <>
            <WorldArt
              poster={art}
              video={loop}
              eager
              className="h-full w-full scale-105 object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-[#07070b]/70 to-[#07070b]" />
          </>
        )}
        <div className="relative px-4 pb-10 pt-6 sm:px-6">
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link
              to={`/world/${world.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/70 backdrop-blur-sm transition hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to the skyline
            </Link>
            <WalletChip world={world} wallet={wallet} balance={rings.balance} onConnect={onConnect} onRefresh={onRefresh} />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/80 drop-shadow">
            {world.artistName} World
          </p>
          <h1 className={`mt-2 font-heading text-3xl font-bold drop-shadow-lg sm:text-4xl ${hue.text}`}>
            {city.name}
          </h1>
          <p className="mt-1 text-sm text-white/70 drop-shadow">{city.tagline}</p>
          <p className="mt-3 font-mono text-xs tabular-nums text-white/50">
            {count.toLocaleString()} {unit} standing
          </p>
          <div className="mt-4">
            <NowWearing theme={theme} />
          </div>
        </div>
      </header>

      {buildings.length > 0 ? (
        <>
          <SectionLabel title="On this street" note="Every building here holds a different part of it." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {buildings.map((r, i) => (
              <WorldDoor key={r.slug} world={world} room={r} rings={rings} connected={connected} index={i} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-white/60">{city.emptyLine}</p>
          <p className="mt-1 text-xs text-white/35">
            Nothing is standing on this street yet. It gets built the same way every other one did.
          </p>
        </div>
      )}

      <div className="mt-8">
        <GetKeyCta world={world} rings={rings} onBought={onRefresh} />
      </div>
    </>
  );
}

function RoomContent({
  world,
  roomSlug,
  rings,
  fromDb,
}: {
  world: WorldConfig;
  roomSlug: string;
  rings: ReturnType<typeof useWorldAccess>['rings'];
  fromDb?: boolean;
}) {
  // A built world's rooms are streets with blocks on them.
  if (fromDb) return <BuiltRoom world={world} roomSlug={roomSlug} rings={rings} />;
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
    case 'parlour':
      return <MeetRoom world={world} rings={rings} />;
    default:
      return null;
  }
}

export default World;
