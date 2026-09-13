import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { artistIdForSlug, artistPath, getSongBySlug, registerArtistNames, renamedArtistSlug, toSlug } from '@/lib/slugRoutes';
import ArtistDetail from './ArtistDetail';
import SongDetail from './SongDetail';

/**
 * The name addresses, shown where they are:
 *   /n3m3sis                -> N3M3SIS's page, and the address stays /n3m3sis
 *   /n3m3sis/trapped-soul   -> the song's page, same
 * Mounted at /:artistSlug and /:artistSlug/:songSlug in App.tsx, after every
 * real route, so a page the app owns always wins.
 *
 * It used to send people on to /artist/11 and /song/97. The number is the
 * backend's business; the address is the artist's name.
 */
export default function SlugResolver() {
  const { artistSlug = '', songSlug } = useParams<{ artistSlug: string; songSlug?: string }>();
  const slug = artistSlug.toLowerCase();

  // Loading the catalog also teaches the name map every artist who joined
  // through the app, so look the name up after this call, not before.
  const { songs, isLoading } = usePublishedCatalog();
  const artistId = artistIdForSlug(slug);
  // An artist who changed their name keeps their old address as a way in.
  const renamedTo = renamedArtistSlug(slug);

  // An artist account with nothing published yet is still somebody's page.
  const account = useQuery({
    queryKey: ['artist-by-name', slug],
    enabled: !renamedTo && !songSlug && !artistId && !isLoading && Boolean(slug),
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data: accounts } = await supabase.from('artist_accounts' as never).select('artist_id, user_id');
      const rows = (accounts ?? []) as unknown as Array<{ artist_id: string; user_id: string | null }>;
      const userIds = rows.map((r) => r.user_id).filter((u): u is string => Boolean(u));
      if (!userIds.length) return null;
      const { data: profiles } = await supabase.from('audience_profiles').select('user_id, display_name').in('user_id', userIds);
      const match = (profiles ?? []).find((p) => p.display_name && toSlug(p.display_name) === slug);
      const found = match ? rows.find((r) => r.user_id === match.user_id) : undefined;
      if (!found || !match?.display_name) return null;
      registerArtistNames([{ id: found.artist_id, name: match.display_name }]);
      return found.artist_id;
    },
  });

  if (renamedTo) {
    return <Navigate to={songSlug ? `/${renamedTo}/${songSlug}` : `/${renamedTo}`} replace />;
  }

  if (songSlug) {
    const known = getSongBySlug(slug, songSlug);
    if (known) return <SongDetail songIdOverride={known.id} />;
    if (isLoading) return <Waiting />;
    const want = songSlug.toLowerCase();
    // By the artist's learned address, or by the artist name on the record
    // itself: a share link is built from that name, and it has to open even
    // before the name map has learned this artist.
    const joined = songs.find(
      (s) => (artistPath(s.artistId) === `/${slug}` || toSlug(s.artist ?? '') === slug) && toSlug(s.title) === want,
    );
    if (joined) return <SongDetail songIdOverride={joined.id} />;
    return <Navigate to="/not-found" replace />;
  }

  if (artistId) return <ArtistDetail artistIdOverride={artistId} />;
  if (isLoading || account.isLoading || account.isFetching) return <Waiting />;
  if (account.data) return <ArtistDetail artistIdOverride={account.data} />;
  return <Navigate to="/not-found" replace />;
}

function Waiting() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
