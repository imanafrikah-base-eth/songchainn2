import { artistPath } from '@/lib/slugRoutes';
import { memo, useMemo } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { motion } from 'framer-motion';
import { MapPin, Music, Users } from 'lucide-react';
import { Artist, SONGS, songInArtistCatalog } from '@/data/musicData';
import { Link } from 'react-router-dom';
import { useArtistFollowerCounts, useArtistStreamTotals, usePulseCounts } from '@/hooks/usePopularity';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { thumb } from '@/lib/img';

interface ArtistCardProps {
  artist: Artist;
  index?: number;
}

export const ArtistCard = memo(function ArtistCard({ artist, index = 0 }: ArtistCardProps) {
  const { data: pulseCounts } = usePulseCounts();
  const { data: followerCounts } = useArtistFollowerCounts();
  const { data: streamTotals } = useArtistStreamTotals();
  const { songs: publishedSongs } = usePublishedCatalog();

  // The song count used to read the build-time catalogue only, so an artist
  // who had uploaded since it was last regenerated showed fewer songs here
  // than on their own page (IMan 86 against 97, N3M3SIS 6 against 40, on
  // 18 Sep 2026). Same merge as the Artists page: static plus published,
  // collaborations included.
  const { artistSongs, totalPulses, totalStreams, totalFollowers } = useMemo(() => {
    const seen = new Set<string>();
    const songs = [...SONGS, ...publishedSongs].filter((s) => {
      if (!songInArtistCatalog(s, artist.id) || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    let pulses = 0;
    songs.forEach(song => {
      const pulseData = pulseCounts?.find(p => p.song_id === song.id);
      pulses += pulseData?.pulse_count || 0;
    });
    const streams = streamTotals?.find((row) => row.artist_id === artist.id)?.stream_count || 0;
    const followers = followerCounts?.find((row) => row.artist_id === artist.id)?.follower_count || 0;
    return { artistSongs: songs, totalPulses: pulses, totalStreams: streams, totalFollowers: followers };
  }, [artist.id, pulseCounts, streamTotals, followerCounts, publishedSongs]);

  return (
    <Link to={artistPath(artist.id)}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, ease: [0.4, 0, 0.2, 1] }}
        whileHover={{ y: -6, scale: 1.02 }}
        className="group glass-card rounded-2xl overflow-hidden hover:shadow-float transition-all duration-300 shine-overlay"
      >
        <div className="relative pt-6 pb-2 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 20%, hsl(217 91% 60% / 0.18) 0%, transparent 65%)',
            }}
          />
          <div className="relative flex justify-center">
            {artist.profileImage ? (
              <div className="relative w-24 h-24 rounded-full ring-2 ring-primary/30 shadow-glow transition-transform duration-300 group-hover:scale-105 overflow-hidden">
                <img
                  src={thumb(artist.profileImage, 96)}
                  alt=""
                  aria-hidden="true"
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover blur-xl scale-110"
                />
                <img
                  src={thumb(artist.profileImage, 96)}
                  alt={artist.name}
                  width={96}
                  height={96}
                  className="relative w-full h-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full glass flex items-center justify-center shadow-glow transition-transform duration-300 group-hover:scale-105">
                <span className="text-3xl font-heading font-bold text-foreground">
                  {artist.name.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 text-center">
          <h3 className="font-heading font-semibold text-foreground truncate mb-1 group-hover:text-primary transition-colors">
            <ArtistName name={artist.name} artistId={artist.id} size={16} />
          </h3>

          {artist.location && (
            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mb-3">
              <MapPin className="w-3.5 h-3.5" />
              <span>{artist.location}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" />
              <span>{artistSongs.length} songs</span>
            </span>
            <span>{totalStreams.toLocaleString()} streams</span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span>{totalFollowers.toLocaleString()}</span>
            </span>
            {totalPulses > 0 && (
              <span className="tabular-nums text-primary">❤️‍🔥 {totalPulses.toLocaleString()}</span>
            )}
          </div>

          {artist.location && (
            <div className="mt-3 px-3 py-1.5 rounded-xl bg-primary/10 border border-border text-primary text-xs text-center truncate font-medium">
              {artist.location}
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
});
