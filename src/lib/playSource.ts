/**
 * Where a play came from, named the way a manager would name it.
 *
 * Read from the page the listener is on when the play counts, so no call
 * site has to remember to say. A share link is recognised by its query
 * string (?ref=share or utm_source), which is how shared song cards arrive.
 */

export type PlaySource =
  | 'home'
  | 'feed'
  | 'song page'
  | 'artist page'
  | 'catalog'
  | 'playlist'
  | 'search'
  | 'world'
  | 'battle'
  | 'room'
  | 'marketplace'
  | 'message'
  | 'shuffle'
  | 'share'
  | 'landing'
  | 'player';

export function playSourceNow(): PlaySource {
  if (typeof window === 'undefined') return 'player';
  const { pathname, search } = window.location;
  const q = new URLSearchParams(search);
  if (q.get('ref') === 'share' || q.has('utm_source')) return 'share';
  if (pathname === '/' ) return document.body.dataset.signedOut === 'true' ? 'landing' : 'home';
  if (pathname.startsWith('/social') || pathname.startsWith('/feed')) return 'feed';
  if (pathname.startsWith('/song/')) return 'song page';
  if (pathname.startsWith('/artist/')) return 'artist page';
  if (pathname.startsWith('/catalog/')) return 'catalog';
  if (pathname.startsWith('/playlist')) return 'playlist';
  if (pathname.startsWith('/search') || pathname.startsWith('/discover')) return 'search';
  if (pathname.startsWith('/world/') || pathname.startsWith('/w/')) return 'world';
  if (pathname.startsWith('/wavewarz')) return 'battle';
  if (pathname.startsWith('/room') || pathname.startsWith('/community')) return 'room';
  if (pathname.startsWith('/marketplace')) return 'marketplace';
  if (pathname.startsWith('/inbox')) return 'message';
  if (pathname.startsWith('/dj-shuffle')) return 'shuffle';
  return 'player';
}
