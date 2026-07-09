import { memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Sparkles, Music, Zap } from 'lucide-react';
import { Song } from '@/data/musicData';
import { SongCard } from '@/components/SongCard';

interface FeaturedTracksSectionProps {
  songs: Song[];
}

// Simplified music wave visualizer - less animations
const MusicWaveVisualizer = memo(function MusicWaveVisualizer() {
  return (
    <div className="flex items-end gap-1 h-8">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-primary to-cyan-400"
          animate={{
            height: ['20%', '100%', '40%', '80%', '20%'],
          }}
          transition={{
            duration: 1.2,
            delay: i * 0.1,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
});

export const FeaturedTracksSection = memo(function FeaturedTracksSection({ songs }: FeaturedTracksSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative"
    >
      {/* Simplified background glow - reduced animations */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute -top-20 -left-20 w-[400px] h-[400px]">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 via-cyan-500/10 to-transparent blur-[80px]" />
        </div>
        <div className="absolute -bottom-10 -right-10 w-[300px] h-[300px]">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tl from-cyan-400/15 via-primary/10 to-transparent blur-[60px]" />
        </div>
      </div>

      {/* Header with enhanced styling */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Simplified icon container */}
          <div className="relative">
            <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary to-cyan-400 blur-lg opacity-50" />
            <div className="relative p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary to-cyan-400 shadow-glow">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground">
                Featured Tracks
              </h2>
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">Trending on $ongChainn</p>
          </div>
        </div>

        {/* Live indicator - hidden on small mobile */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden sm:flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full glass"
        >
          <motion.div
            className="w-2 h-2 rounded-full bg-green-400"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-xs text-muted-foreground font-medium">Live</span>
          <MusicWaveVisualizer />
        </motion.div>
      </div>

      {/* Featured cards container */}
      <div className="relative">
        {/* Decorative elements - hidden on mobile */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full glass border border-primary/20">
          <Zap className="w-3 h-3 text-primary" />
          <span className="text-xs text-primary font-medium">Hot This Week</span>
          <Zap className="w-3 h-3 text-primary" />
        </div>

        {/* Cards grid - single column on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 pt-0 sm:pt-4">
          {songs.map((song, index) => (
            <motion.div
              key={song.id}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: index * 0.1,
                duration: 0.4,
                type: 'spring',
                stiffness: 100,
              }}
              className="relative group"
            >
              {/* Card glow on hover */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
              
              {/* Rank badge */}
              <div className="absolute -top-2 -left-2 sm:-top-3 sm:-left-3 z-20">
                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center shadow-glow-intense">
                  <span className="text-[10px] sm:text-xs font-bold text-primary-foreground">#{index + 1}</span>
                </div>
              </div>

              <SongCard song={song} index={index} variant="featured" />
            </motion.div>
          ))}
        </div>

        {/* Bottom decorative line */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-primary/30 to-transparent hidden sm:block" />
      </div>

      {/* Simplified floating music notes */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute opacity-30"
            style={{ right: i * 20, top: i * -30 }}
          >
            <Music className="w-4 h-4 text-primary/40" />
          </div>
        ))}
      </div>
    </motion.section>
  );
});
