import { artistPath } from '@/lib/slugRoutes';
import { Link } from 'react-router-dom';
import { ArtistName } from '@/components/ArtistName';
import { formatDistanceToNow } from 'date-fns';
import { Heart, Music } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLikedActivity } from '@/hooks/useMusicActivity';

/**
 * The Likes tab: songs and artists this person actually likes.
 *
 * Public since the public_likes migration, so it fills in on anybody's profile
 * rather than only your own. Liking and unliking stay owner-only.
 */

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

export function LikedActivity({
  userId,
  isOwnProfile,
}: {
  userId: string | undefined;
  isOwnProfile: boolean;
}) {
  const { isLoading, songs, artists, hasAny } = useLikedActivity(userId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="py-12 text-center">
        <Heart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">
          {isOwnProfile ? 'Nothing liked yet. Tap the heart on anything you rate.' : 'Nothing liked yet.'}
        </p>
        {isOwnProfile && (
          <Link to="/discover" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            Go find something
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {artists.length > 0 && (
        <section>
          <h3 className="mb-3 font-heading text-base font-bold text-foreground">
            Artists {isOwnProfile ? 'you follow' : 'they follow'}
          </h3>
          <div className="flex flex-wrap gap-2">
            {artists.map((a) => (
              <Link
                key={a.artistId}
                to={artistPath(a.artistId)}
                className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5 transition-colors hover:bg-muted/50"
              >
                <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
                  {a.image
                    ? <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">{a.name.charAt(0)}</div>}
                </div>
                <span className="text-sm font-semibold text-foreground"><ArtistName name={a.name} artistId={a.artistId} size={14} /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {songs.length > 0 && (
        <section>
          <h3 className="mb-3 font-heading text-base font-bold text-foreground">
            Liked songs
            <span className="ml-2 text-xs font-normal text-muted-foreground">{songs.length}</span>
          </h3>
          <div className="space-y-2">
            {songs.map(({ song, at }) => (
              <Link
                key={`${song.id}-${at}`}
                to={`/song/${song.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:bg-muted/50"
              >
                <Cover src={song.coverImage} alt={song.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{song.title}</p>
                  <p className="truncate text-xs text-muted-foreground"><ArtistName name={song.artist} artistId={song.artistId} size={12} /></p>
                </div>
                <Heart className="h-4 w-4 shrink-0 fill-primary text-primary" />
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

export default LikedActivity;
