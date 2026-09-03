// One nav map, four entries wide.
//
// There are eleven places to go in this app. Listing all eleven at once, in a
// rail, a tab bar and a hamburger sheet, made every surface a wall of icons
// and made none of them fast. So the destinations are grouped, and every
// navigation surface renders the same groups: Home on its own, then Music,
// Community and You, each opening on tap.
//
// Adding a destination means adding one line here. The rail, the bottom tab
// bar and the mobile menu all pick it up.

import {
  Home,
  Compass,
  ListMusic,
  Disc3,
  Headphones,
  Flame,
  Users,
  MessageCircle,
  Inbox,
  User,
  Mic2,
  Download,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface NavLeaf {
  path: string;
  label: string;
  icon: LucideIcon;
  /** One line, shown under the label inside a group. Keep it plain. */
  description: string;
  /** Only render for a signed-in artist. */
  artistOnly?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

/** Always visible, never inside a group. */
export const NAV_HOME: NavLeaf = {
  path: '/',
  label: 'Home',
  icon: Home,
  description: 'Hot today, new releases and what is live',
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'music',
    label: 'Music',
    icon: Compass,
    items: [
      { path: '/discover', label: 'Discover', icon: Compass, description: 'Browse the catalog by genre and heat' },
      { path: '/playlists', label: 'Playlists', icon: ListMusic, description: 'Your playlists and the ones you follow' },
      { path: '/dj-shuffle', label: 'DJ Shuffle', icon: Disc3, description: 'Press play and let it run' },
      { path: '/room', label: 'The Room', icon: Headphones, description: 'Listen together, live, with everyone' },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    icon: Users,
    items: [
      { path: '/social', label: 'Feed', icon: MessageCircle, description: 'Posts, clips and what people are playing' },
      { path: '/community', label: 'People', icon: Users, description: 'Artists and listeners on $ongChainn' },
      { path: '/wavewarz-africa', label: 'WaveWarz', icon: Flame, description: 'Battles, voting and the AI judges' },
      { path: '/inbox', label: 'Inbox', icon: Inbox, description: 'Your messages' },
    ],
  },
  {
    id: 'you',
    label: 'You',
    icon: User,
    items: [
      { path: '/profile', label: 'Profile', icon: User, description: 'Your page, your music, your points' },
      // Not artist-only. Studio already works for any signed-in user and the server
      // mints them an artist id on first publish, so gating the door on `isArtist`
      // only hid Studio from the exact people who had just used it.
      { path: '/studio', label: 'Studio', icon: Mic2, description: 'Upload a track and release it' },
      { path: '/install', label: 'Install App', icon: Download, description: 'Put $ongChainn on your home screen' },
      { path: '/about', label: 'About $ongChainn', icon: Sparkles, description: 'What this is and where it is going' },
    ],
  },
];

/**
 * The groups with `/profile` pointed at the artist's own page where that
 * applies, and artist-only destinations dropped for everyone else.
 */
export function resolveNavGroups(profilePath: string, isArtist: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !item.artistOnly || isArtist)
      .map((item) => (item.path === '/profile' ? { ...item, path: profilePath } : item)),
  }));
}

/** True when this group holds the page the user is looking at. */
export function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => item.path === pathname);
}

/** Every destination, flat. */
export const navItems: NavLeaf[] = [NAV_HOME, ...NAV_GROUPS.flatMap((group) => group.items)];
