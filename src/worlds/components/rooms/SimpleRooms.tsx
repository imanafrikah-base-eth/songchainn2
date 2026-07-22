// Phase A renderers for the rooms whose live pipelines land in Phase B
// (spec §09): the Screening Room and Studio open with seeded drops, the
// Request Desk, Council, Stage and Wall describe exactly what runs here and
// what is already true today. Copy rule everywhere: access and belonging,
// never price; holders currently enjoy, never will receive.

import { Clapperboard, Crown, Hammer, ListOrdered, Mic2, Radio, Trophy, Scale } from 'lucide-react';
import type { WorldConfig, WorldRings } from '../../types';

function RoomNote({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-2 flex items-center gap-2 text-white">
        {icon}
        <h3 className="font-heading text-lg font-bold">{title}</h3>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-white/60">{children}</div>
    </div>
  );
}

export function ScreeningRoom({ world }: { world: WorldConfig }) {
  return (
    <div className="space-y-4">
      <RoomNote icon={<Clapperboard className="h-5 w-5 text-sky-300" />} title="Next premiere">
        <p>
          The next music video from {world.artistName} premieres here before it goes anywhere else.
          Fans in this room see it first.
        </p>
      </RoomNote>
      <RoomNote icon={<Mic2 className="h-5 w-5 text-sky-300" />} title="The screening schedule">
        <p>
          Interviews, documentaries and visualizers are being loaded into this room. Fans who hold the
          key are in the front row when each one lands.
        </p>
      </RoomNote>
    </div>
  );
}

export function StudioRoom({ world }: { world: WorldConfig }) {
  return (
    <div className="space-y-4">
      <RoomNote icon={<Hammer className="h-5 w-5 text-rose-300" />} title="First Studio drop lands with the world opening">
        <p>
          Works in progress, demos, stems, voice notes and beat previews from {world.artistName} post
          here. Insiders hear it while it is still wet.
        </p>
      </RoomNote>
    </div>
  );
}

export function RequestDeskRoom({ world }: { world: WorldConfig }) {
  return (
    <div className="space-y-4">
      <RoomNote icon={<ListOrdered className="h-5 w-5 text-orange-300" />} title="The request queue">
        <p>
          Insiders submit song requests here and vote monthly on what {world.artistName} records next.
          The queue is public: everyone sees what is coming, insiders decide it.
        </p>
        <p>Request Season 1 opens with the world. Your seat at this desk is your key.</p>
      </RoomNote>
    </div>
  );
}

export function CouncilRoom({ world, rings }: { world: WorldConfig; rings: WorldRings }) {
  return (
    <div className="space-y-4">
      <RoomNote icon={<Crown className="h-5 w-5 text-yellow-300" />} title="The ten seats">
        <p>
          The Council is the top ten of the world leaderboard. Council members currently enjoy
          guaranteed monthly picks, their names in release credits, private chat with {world.artistName},
          and first listen before any drop.
        </p>
        {rings.council ? (
          <p className="font-semibold text-yellow-300">
            You hold a seat. {world.artistName} will open the private chat with the founding Council.
          </p>
        ) : (
          <p>
            The leaderboard is forming. Holding the key, collecting the catalog and showing up all move
            you toward a seat.
          </p>
        )}
      </RoomNote>
    </div>
  );
}

export function StageRoom({ world }: { world: WorldConfig }) {
  return (
    <div className="space-y-4">
      <RoomNote icon={<Radio className="h-5 w-5 text-red-300" />} title="No live moment right now">
        <p>
          Listening parties, premiere nights and Q&A sessions run on this stage. When one is live, this
          door lights up across the whole world and every holder can walk in. The Council gets front row.
        </p>
        <p>The first Stage event is being scheduled. Follow {world.artistName} to catch the announcement.</p>
      </RoomNote>
    </div>
  );
}

export function WallRoom({ world }: { world: WorldConfig }) {
  return (
    <div className="space-y-4">
      <RoomNote icon={<Trophy className="h-5 w-5 text-cyan-300" />} title="The supporters wall">
        <p>
          The world leaderboard lives here: every citizen, ranked by reputation. Holding {world.tokenSymbol},
          collecting the catalog and showing up all count. The leaderboard is forming and publishes with
          the world opening.
        </p>
      </RoomNote>
      <RoomNote icon={<Scale className="h-5 w-5 text-cyan-300" />} title="Transparency reports">
        <p>
          Every fee claim and the live split breakdown publish here, straight from the chain, from the
          day the key goes live. This wall is the trust layer of the world: what came in, where it went,
          in the open, always.
        </p>
      </RoomNote>
    </div>
  );
}
