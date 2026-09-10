import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useVerifiedArtists } from '@/hooks/useVerifiedArtists';

/**
 * An artist's name with the mark that belongs to it.
 *
 * Wherever a name is printed (a card, the player, a post, a comment, a
 * notification, a thread, a world) it goes through here, so a verified
 * artist is verified everywhere and not only on their own page. Give it
 * whichever handle the place has: the catalog artist id, or the account's
 * user id. No handle, or not verified, and it is just the name.
 *
 * It fits inside a `truncate` parent: the name is the part that shortens,
 * the mark never wraps or drops.
 */
export function ArtistName({
  name,
  artistId,
  userId,
  verified,
  size = 14,
  tone,
  className = '',
  nameClassName = '',
  prefix,
}: {
  name: React.ReactNode;
  artistId?: string | number | null;
  userId?: string | null;
  /** Already known by the caller; skips the lookup. */
  verified?: boolean | null;
  /** Badge size in pixels. Match the text: 12 for captions, 14 for body, 17 to 20 for a heading. */
  size?: number;
  tone?: 'gold' | 'blue';
  className?: string;
  nameClassName?: string;
  /** Printed before the name, outside the truncation, e.g. "@". */
  prefix?: string;
}) {
  const { isVerifiedArtist, isVerifiedUser } = useVerifiedArtists();
  const mark = verified ?? (isVerifiedArtist(artistId) || isVerifiedUser(userId));
  return (
    <span className={`inline-flex max-w-full items-center gap-1 align-bottom ${className}`}>
      <span className={`min-w-0 truncate ${nameClassName}`}>{prefix}{name}</span>
      {mark && <VerifiedBadge size={size} tone={tone} className="shrink-0" />}
    </span>
  );
}

export default ArtistName;

/**
 * Just the mark, for places that print the name themselves. Shows when the
 * caller already knows, or when either handle is on the verified list.
 */
export function VerifiedMark({
  verified,
  artistId,
  userId,
  size = 14,
  tone,
  className = '',
}: {
  verified?: boolean | null;
  artistId?: string | number | null;
  userId?: string | null;
  size?: number;
  tone?: 'gold' | 'blue';
  className?: string;
}) {
  const { isVerifiedArtist, isVerifiedUser } = useVerifiedArtists();
  const mark = Boolean(verified) || isVerifiedArtist(artistId) || isVerifiedUser(userId);
  return mark ? <VerifiedBadge size={size} tone={tone} className={`shrink-0 ${className}`} /> : null;
}
