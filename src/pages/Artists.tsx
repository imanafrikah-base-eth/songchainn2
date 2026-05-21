import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Music, TrendingUp, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ARTISTS, SONGS } from '@/data/musicData';
import { useSongPopularity, useArtistFollowerCounts, useArtistStreamTotals } from '@/hooks/usePopularity';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1 },
};

const NEW_ARTIST_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;
function isArtistNew(addedAt?: string) {
  if (!addedAt) return false;
  const ts = new Date(addedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < NEW_ARTIST_WINDOW_MS;
}

export default function Artists() {
  const { data: popularityData } = useSongPopularity();
  const { data: followerCounts } = useArtistFollowerCounts();
  const { data: streamTotals } = useArtistStreamTotals();

  // Calculate stats for each artist
  const artistsWithStats = useMemo(() => {
    return ARTISTS.map(artist => {
      const songs = SONGS.filter(s => s.artistId === artist.id);
      let totalPlays = 0;
      
      songs.forEach(song => {
        const songData = popularityData?.find(p => p.song_id === song.id);
        totalPlays += songData?.play_count || 0;
      });
      return {
        ...artist,
        songCount: songs.length,
        totalPlays,
        totalStreams: streamTotals?.find((entry) => entry.artist_id === artist.id)?.stream_count || totalPlays,
        followerCount: followerCounts?.find((entry) => entry.artist_id === artist.id)?.follower_count || 0,
      };
    }).sort((a, b) => b.totalStreams - a.totalStreams);
  }, [popularityData, streamTotals, followerCounts]);

  const totalStats = useMemo(() => {
    return artistsWithStats.reduce(
      (acc, artist) => ({
        artists: acc.artists + 1,
        songs: acc.songs + artist.songCount,
        streams: acc.streams + artist.totalStreams,
        followers: acc.followers + artist.followerCount,
      }),
      { artists: 0, songs: 0, streams: 0, followers: 0 }
    );
  }, [artistsWithStats]);

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="px-4 pt-4 sm:pt-6 relative z-10">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl gradient-primary">
              <Users className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Artists</h1>
          </div>
          <p className="text-muted-foreground">
            Meet the talented creators bringing music to $ongChainn
          </p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-4 text-center shine-overlay">
              <div className="text-2xl font-bold text-foreground">{totalStats.artists}</div>
              <div className="text-sm text-muted-foreground">Artists</div>
            </div>
            <div className="glass-card rounded-2xl p-4 text-center shine-overlay">
              <div className="text-2xl font-bold text-foreground">{totalStats.songs}</div>
              <div className="text-sm text-muted-foreground">Songs</div>
            </div>
            <div className="glass-card rounded-2xl p-4 text-center shine-overlay">
              <div className="text-2xl font-bold text-foreground">{totalStats.streams.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Streams</div>
            </div>
            <div className="glass-card rounded-2xl p-4 text-center shine-overlay">
              <div className="text-2xl font-bold text-foreground">{totalStats.followers.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Followers</div>
            </div>
          </div>
        </motion.section>

        {/* Artist Grid */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-xl font-semibold text-foreground">All Artists</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {artistsWithStats.map((artist, index) => (
              <motion.div key={artist.id} variants={itemVariants}>
                <Link to={`/artist/${artist.id}`}>
                  <motion.div
                    whileHover={{ y: -8, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group glass-card rounded-3xl overflow-hidden hover:shadow-float transition-all duration-300 shine-overlay"
                  >
                    {/* Artist Image */}
                    <div className="aspect-square relative overflow-hidden">
                      {artist.profileImage ? (
                        <div className="relative w-full h-full">
                          <img
                            src={artist.profileImage}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110"
                          />
                          <img
                            src={artist.profileImage}
                            alt={artist.name}
                            className="relative w-full h-full object-contain"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/30 to-secondary/50 flex items-center justify-center">
                          <span className="text-5xl font-heading font-bold text-foreground/80">
                            {artist.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      
                      {/* Overlay gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                      
                      {/* Rank badge */}
                      {index < 3 && (
                        <div className="absolute top-3 left-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            index === 0 ? 'bg-yellow-500 text-yellow-950' :
                            index === 1 ? 'bg-gray-300 text-gray-800' :
                            'bg-amber-600 text-amber-100'
                          }`}>
                            #{index + 1}
                          </div>
                        </div>
                      )}

                      {isArtistNew(artist.addedAt) && (
                        <div className="absolute top-3 right-3">
                          <div className="px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            NEW
                          </div>
                        </div>
                      )}
                      
                      {/* Artist name overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="font-heading text-xl font-bold text-foreground group-hover:text-primary transition-colors truncate">
                          {artist.name}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">{artist.location}</p>
                      </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="p-4 pt-2">
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="text-center p-2 rounded-xl bg-muted/30">
                          <div className="flex items-center justify-center gap-1 text-blue-500 mb-1">
                            <Music className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-sm font-semibold text-foreground tabular-nums">
                            {artist.songCount}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Songs</div>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-muted/30">
                          <div className="flex items-center justify-center gap-1 text-primary mb-1">
                            <PlayCircle className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-sm font-semibold text-foreground tabular-nums">
                            {artist.totalStreams.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Streams</div>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-muted/30">
                          <div className="flex items-center justify-center gap-1 text-primary mb-1">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-sm font-semibold text-foreground tabular-nums">
                            {artist.followerCount.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Followers</div>
                        </div>
                      </div>
                      
                      {/* Town Square Badge */}
                      <div className="px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs text-center font-medium truncate">
                        {artist.townSquare}
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Quality Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 p-6 rounded-2xl glass-card text-center shine-overlay"
        >
          <p className="text-sm text-muted-foreground">
            All music on $ongChainn is curated for quality, originality, and cultural value.
            Only artists who are part of Create On Base Town Squares can be featured.
          </p>
        </motion.div>
      </main>

      <AudioPlayer />
    </div>
  );
}
