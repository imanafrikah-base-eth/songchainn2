import { artistPath, songPath } from '@/lib/slugRoutes';
import { Link } from 'react-router-dom';
import { ArtistName } from '@/components/ArtistName';
import { formatDistanceToNow } from 'date-fns';
import { Music, Play, Zap, Disc3, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMusicActivity } from '@/hooks/useMusicActivity';

/**
 * The Music tab on a profile: what this person actually listens to.
 *
 * Every number here comes from server-side play events, the same stream the
 * points engine counts, so none of it can be inflated from the client.
 */

function Stat({ icon: Icon, value, label }: { icon: typeof Play; value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <Icon className="mx-auto mb-1.5 h-4 w-4 text-primary" />
      <p className="font-heading text-lg font-bold leading-none text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Cover({ src, alt }: { src?: string; alt: string }) {
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Music className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export function MusicActivity({
  userId,
  isOwnProfile,
  displayName,
}: {
  userId: string | undefined;
  isOwnProfile: boolean;
  displayName?: string | null;
}) {
  const a = useMusicActivity(userId);
  const who = isOwnProfile ? 'You have' : `${displayName || 'They'} has`;

  if (a.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!a.hasActivity) {
    return (
      <div className="py-12 text-center">
        <Music className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">
          {isOwnProfile ? 'Play something and it shows up here.' : 'Nothing played yet.'}
        </p>
        {isOwnProfile && (
          <Link to="/discover" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            Find something to play
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={Play} value={a.totalPlays} label="Plays" />
        <Stat icon={Disc3} value={a.uniqueSongs} label="Songs" />
        <Stat icon={Users} value={a.uniqueArtists} label="Artists" />
        <Stat icon={Zap} value={a.totalPulses} label="Pulses" />
      </div>

      {a.since && (
        <p className="-mt-5 text-center text-xs text-muted-foreground">
          {a.capped
            ? `Across the last ${a.totalPlays.toLocaleString()} plays`
            : `Since ${new Date(a.since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}
        </p>
      )}

      {a.topSongs.length > 0 && (
        <section>
          <h3 className="mb-3 font-heading text-base font-bold text-foreground">On repeat</h3>
          <div className="space-y-2">
            {a.topSongs.map(({ song, plays }, i) => (
              <Link
                key={song.id}
                to={songPath(song)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="w-5 shrink-0 text-center font-heading text-sm font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <Cover src={song.coverImage} alt={song.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{song.title}</p>
                  <p className="truncate text-xs text-muted-foreground"><ArtistName name={song.artist} artistId={song.artistId} size={12} /></p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {plays.toLocaleString()} {plays === 1 ? 'play' : 'plays'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {a.topArtists.length > 0 && (
        <section>
          <h3 className="mb-3 font-heading text-base font-bold text-foreground">
            {who} played most
          </h3>
          <div className="flex flex-wrap gap-2">
            {a.topArtists.map((artist) => (
              <Link
                key={artist.artistId}
                to={artistPath(artist.artistId)}
                className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5 transition-colors hover:bg-muted/50"
              >
                <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
                  {artist.image
                    ? <img src={artist.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">{artist.name.charAt(0)}</div>}
                </div>
                <span className="text-sm font-semibold text-foreground"><ArtistName name={artist.name} artistId={artist.artistId} size={14} /></span>
                <span className="text-xs text-muted-foreground">{artist.plays}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {a.recent.length > 0 && (
        <section>
          <h3 className="mb-3 font-heading text-base font-bold text-foreground">Recently played</h3>
          <div className="space-y-2">
            {a.recent.map(({ song, at }) => (
              <Link
                key={`${song.id}-${at}`}
                to={songPath(song)}
                className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50"
              >
                <Cover src={song.coverImage} alt={song.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{song.title}</p>
                  <p className="truncate text-xs text-muted-foreground"><ArtistName name={song.artist} artistId={song.artistId} size={12} /></p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(at), { addSuffix: true })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default MusicActivity;
