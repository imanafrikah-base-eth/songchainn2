import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArtistBySlug, getSongBySlug } from '@/lib/slugRoutes';

/**
 * Resolves vanity URLs:
 *   /sammie         → /artist/10
 *   /sammie/nobody  → /song/97
 * Mounted at /:artistSlug and /:artistSlug/:songSlug in App.tsx.
 */
export default function SlugResolver() {
  const { artistSlug = '', songSlug } = useParams<{ artistSlug: string; songSlug?: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (songSlug) {
      const song = getSongBySlug(artistSlug, songSlug);
      if (song) { navigate(`/song/${song.id}`, { replace: true }); return; }
    } else {
      const artist = getArtistBySlug(artistSlug);
      if (artist) { navigate(`/artist/${artist.id}`, { replace: true }); return; }
    }
    // Slug not recognized — mark as not found (let NotFound component render)
    setNotFound(true);
  }, [artistSlug, songSlug, navigate]);

  if (notFound) {
    // Lazy-import NotFound inline so we don't need it at module load time
    // Just redirect to a known 404 path
    navigate('/404-not-found', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
