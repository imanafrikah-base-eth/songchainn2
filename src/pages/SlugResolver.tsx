import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
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
    setNotFound(true);
  }, [artistSlug, songSlug, navigate]);

  if (notFound) {
    return <Navigate to="/not-found" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
