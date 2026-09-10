import { useState } from 'react';
import { Globe, Mail, Link2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Where else an artist lives, bundled so it never crowds the page.
 *
 * The known places (stores, socials, Base, Farcaster, Zora) come first as
 * short chips; anything the artist added on top comes after. Only the first
 * few show on the page. The rest sit behind one "+N" chip that opens a clean
 * list, so an artist with fourteen links and one with two look equally tidy.
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

/** How many chips show before the rest fold behind "+N". */
const SHOWN = 4;

export interface SocialLink {
  label: string;
  url: string;
}

export function safeHref(raw: unknown): string | null {
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

/** A two-letter mark for a link the artist named themselves. */
function shortFor(label: string, href: string): string {
  const host = (() => { try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const known: Record<string, string> = {
    'facebook.com': 'FB', 'threads.net': 'TH', 'snapchat.com': 'SN', 'linkedin.com': 'IN', 'twitch.tv': 'TW', 'discord.gg': 'DC', 'discord.com': 'DC',
    'audiomack.com': 'AM', 'boomplay.com': 'BP', 'deezer.com': 'DZ', 'bandcamp.com': 'BC', 'tidal.com': 'TD', 'music.amazon.com': 'AZ', 'linktr.ee': 'LT',
    'patreon.com': 'PT', 'whatsapp.com': 'WA', 'wa.me': 'WA', 't.me': 'TG', 'telegram.me': 'TG', 'pinterest.com': 'PI', 'medium.com': 'MD', 'substack.com': 'SS',
  };
  const hit = Object.keys(known).find((k) => host === k || host.endsWith('.' + k));
  if (hit) return known[hit];
  const clean = label.trim().replace(/[^A-Za-z0-9 ]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || 'LN';
}

interface Item { key: string; label: string; short: string; href: string; icon?: 'site' | 'mail' }

export function collectLinks(profile: Record<string, unknown>): Item[] {
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const { key, label, short } of LINKS) {
    const href = safeHref(profile[key]);
    if (!href || seen.has(label)) continue;
    seen.add(label);
    items.push({ key, label, short, href });
  }
  const fc = typeof profile.farcaster_username === 'string' ? profile.farcaster_username.trim().replace(/^@/, '') : '';
  if (fc) items.push({ key: 'farcaster', label: `Farcaster @${fc}`, short: 'FC', href: `https://warpcast.com/${encodeURIComponent(fc)}` });
  const zora = typeof profile.zora_handle === 'string' ? profile.zora_handle.trim().replace(/^@/, '') : '';
  if (zora) items.push({ key: 'zora', label: `Zora @${zora}`, short: 'ZO', href: `https://zora.co/@${encodeURIComponent(zora)}` });
  const website = safeHref(profile.website_url);
  if (website) items.push({ key: 'website', label: 'Website', short: 'WWW', href: website, icon: 'site' });
  const extra = Array.isArray(profile.social_links) ? (profile.social_links as unknown[]) : [];
  extra.forEach((raw, i) => {
    const l = raw as Partial<SocialLink> | null;
    const href = safeHref(l?.url);
    if (!href) return;
    const label = (typeof l?.label === 'string' && l.label.trim()) || (() => { try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return 'Link'; } })();
    if (seen.has(label)) return;
    seen.add(label);
    items.push({ key: `extra-${i}`, label, short: shortFor(label, href), href });
  });
  const booking = typeof profile.booking_email === 'string' && profile.booking_email.includes('@') ? profile.booking_email.trim() : null;
  if (booking) items.push({ key: 'booking', label: 'Bookings', short: 'BK', href: `mailto:${booking}`, icon: 'mail' });
  return items;
}

function Chip({ item }: { item: Item }) {
  const external = !item.href.startsWith('mailto:');
  return (
    <a
      href={item.href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={`${item.label}${external ? ' (opens in a new tab)' : ''}`}
      title={item.label}
      className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-[11px] font-bold tracking-wide text-foreground hover:border-primary/50 hover:text-primary"
    >
      {item.icon === 'site' ? <Globe className="h-3.5 w-3.5" /> : item.icon === 'mail' ? <Mail className="h-3.5 w-3.5" /> : null}
      {item.icon === 'site' ? 'Site' : item.icon === 'mail' ? 'Bookings' : item.short}
    </a>
  );
}

export function ArtistLinks({ profile, className = '' }: { profile: Record<string, unknown> | null | undefined; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  const items = collectLinks(profile);
  if (!items.length) return null;
  const shown = items.slice(0, SHOWN);
  const rest = items.length - shown.length;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {shown.map((item) => <Chip key={item.key} item={item} />)}
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${rest} more links`}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 text-[11px] font-bold text-primary hover:bg-primary/20"
        >
          <Link2 className="h-3.5 w-3.5" /> +{rest}
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Everywhere else</DialogTitle>
            <DialogDescription>Every place this artist put a door.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {items.map((item) => (
              <li key={item.key}>
                <a
                  href={item.href}
                  target={item.href.startsWith('mailto:') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="flex h-12 items-center gap-3 rounded-xl border border-border px-3 text-sm text-foreground hover:border-primary/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">
                    {item.icon === 'site' ? <Globe className="h-4 w-4" /> : item.icon === 'mail' ? <Mail className="h-4 w-4" /> : item.short}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
