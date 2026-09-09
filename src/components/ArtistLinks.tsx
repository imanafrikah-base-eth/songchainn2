import { Globe, Mail } from 'lucide-react';

/**
 * Where else an artist lives. Every store page has this row; ours did not,
 * so a fan who wanted the Instagram had to go and search for it.
 */

type LinkKey =
  | 'spotify_url'
  | 'apple_music_url'
  | 'youtube_url'
  | 'soundcloud_url'
  | 'instagram_url'
  | 'tiktok_url'
  | 'x_profile_link'
  | 'twitter_url'
  | 'website_url'
  | 'base_profile_link';

const LINKS: Array<{ key: LinkKey; label: string; short: string }> = [
  { key: 'spotify_url', label: 'Spotify', short: 'SP' },
  { key: 'apple_music_url', label: 'Apple Music', short: 'AM' },
  { key: 'youtube_url', label: 'YouTube', short: 'YT' },
  { key: 'soundcloud_url', label: 'SoundCloud', short: 'SC' },
  { key: 'instagram_url', label: 'Instagram', short: 'IG' },
  { key: 'tiktok_url', label: 'TikTok', short: 'TT' },
  { key: 'x_profile_link', label: 'X', short: 'X' },
  { key: 'twitter_url', label: 'X', short: 'X' },
  { key: 'base_profile_link', label: 'Base', short: 'B' },
];

function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function ArtistLinks({ profile, className = '' }: { profile: Record<string, unknown> | null | undefined; className?: string }) {
  if (!profile) return null;
  const seen = new Set<string>();
  const items = LINKS.flatMap(({ key, label, short }) => {
    const href = safeHref(profile[key]);
    if (!href || seen.has(label)) return [];
    seen.add(label);
    return [{ key, label, short, href }];
  });
  const website = safeHref(profile.website_url);
  const booking = typeof profile.booking_email === 'string' && profile.booking_email.includes('@') ? profile.booking_email.trim() : null;

  if (!items.length && !website && !booking) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${item.label} (opens in a new tab)`}
          title={item.label}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-border bg-card px-2.5 text-[11px] font-bold tracking-wide text-foreground hover:border-primary/50 hover:text-primary"
        >
          {item.short}
        </a>
      ))}
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Website (opens in a new tab)"
          title="Website"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground hover:border-primary/50 hover:text-primary"
        >
          <Globe className="h-3.5 w-3.5" /> Site
        </a>
      )}
      {booking && (
        <a
          href={`mailto:${booking}`}
          aria-label="Booking email"
          title={booking}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground hover:border-primary/50 hover:text-primary"
        >
          <Mail className="h-3.5 w-3.5" /> Bookings
        </a>
      )}
    </div>
  );
}
