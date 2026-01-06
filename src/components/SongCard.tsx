import { memo, useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Heart } from 'lucide-react';
import { Song } from '@/data/musicData';
import { usePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { useEngagement } from '@/context/EngagementContext';
import { useSongPopularity } from '@/hooks/usePopularity';
import { useSongOwnership } from '@/hooks/useSongOwnership';
import { cn } from '@/lib/utils';
import { SpinningSongArt } from './SpinningSongArt';
import { AIArtwork } from './AIArtwork';
import { ShareSongButton } from './ShareSongButton';
import { OwnershipBadge } from './OwnershipBadge';
import { UnlockSongModal } from './UnlockSongModal';
import { useAuth } from '@/context/AuthContext';

interface SongCardProps {
  song: Song;
  index?: number;
  variant?: 'default' | 'compact' | 'featured';
}

// Memoized component to prevent unnecessary re-renders
export const SongCard = memo(function SongCard({ song, index = 0, variant = 'default' }: SongCardProps) {
  const { currentSong, isPlaying } = usePlayerState();
  const { playSong, togglePlay } = usePlayerActions();
  const { toggleLike, isLiked } = useEngagement();
  const { data: popularityData } = useSongPopularity();
  const { user } = useAuth();
  
  // Song ownership for token-gated songs
  const { 
    status: ownershipStatus, 
    offlinePlaysRemaining,
    previewSecondsRemaining,
    unlockSong,
  } = useSongOwnership(song.id);
  
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | undefined>(user?.user_metadata?.wallet_address);

  const isCurrentSong = currentSong?.id === song.id;
  const liked = isLiked(song.id);
  const isTokenGated = song.isTokenGated;
  
  // Get real play count from database (total across all users)
  const totalPlays = useMemo(() => {
    const songData = popularityData?.find(p => p.song_id === song.id);
    return songData?.play_count || 0;
  }, [popularityData, song.id]);
  
  const totalLikes = useMemo(() => {
    const songData = popularityData?.find(p => p.song_id === song.id);
    return songData?.like_count || 0;
  }, [popularityData, song.id]);

  const handleWalletConnected = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  const handlePlay = useCallback(() => {
    if (isCurrentSong) {
      togglePlay();
    } else {
      playSong(song);
    }
  }, [isCurrentSong, togglePlay, playSong, song]);

  const handleLike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(song.id);
  }, [toggleLike, song.id]);

  if (variant === 'compact') {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
          whileHover={{ scale: 1.01, x: 4 }}
          className={cn(
            "group flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all cursor-pointer",
            isCurrentSong
              ? "glass-card border-primary/30"
              : "hover:bg-secondary/30"
          )}
          onClick={handlePlay}
        >
          <div className="relative w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden shadow-soft shine-overlay">
            {isCurrentSong ? (
              <SpinningSongArt isPlaying={isPlaying} size="lg" />
            ) : (
              <>
                {song.coverImage ? (
                  <img 
                    src={song.coverImage} 
                    alt={song.title} 
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full gradient-primary opacity-60" />
                )}
                <motion.div
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm"
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 text-foreground ml-0.5" />
                </motion.div>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={cn(
                "font-medium truncate text-sm sm:text-base",
                isCurrentSong ? "text-primary" : "text-foreground"
              )}>
                {song.title}
              </p>
              {isTokenGated && (
                <OwnershipBadge 
                  status={ownershipStatus} 
                  offlinePlays={offlinePlaysRemaining}
                  previewSecondsRemaining={previewSecondsRemaining}
                />
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{song.artist}</p>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-[10px] sm:text-xs text-muted-foreground tabular-nums hidden xs:block">
              {totalPlays.toLocaleString()} plays
            </span>
            <ShareSongButton 
              songId={song.id} 
              songTitle={song.title} 
              artistName={song.artist}
              coverImage={song.coverImage}
            />
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleLike}
              className={cn(
                "p-1.5 sm:p-2 rounded-full transition-all",
                liked ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Heart className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", liked && "fill-current")} />
            </motion.button>
          </div>
        </motion.div>
        
        {showUnlockModal && (
          <UnlockSongModal
            song={song}
            isOpen={showUnlockModal}
            onClose={() => setShowUnlockModal(false)}
            onUnlock={unlockSong}
            walletAddress={walletAddress}
            onWalletConnected={handleWalletConnected}
          />
        )}
      </>
    );
  }

  if (variant === 'featured') {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, ease: [0.4, 0, 0.2, 1] }}
          whileHover={{ y: -4, scale: 1.02 }}
          className="group relative overflow-hidden rounded-2xl glass-card cursor-pointer shine-overlay"
          onClick={handlePlay}
        >
          {/* Token badge */}
          {isTokenGated && (
            <div className="absolute top-3 left-3 z-20">
              <OwnershipBadge 
                status={ownershipStatus} 
                offlinePlays={offlinePlaysRemaining}
                previewSecondsRemaining={previewSecondsRemaining}
                size="md"
              />
            </div>
          )}
          
          {/* Ambient glow on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <div className="absolute inset-0 gradient-glow" />
          </div>

          {/* AI Artwork section */}
          <div className="relative aspect-[4/3] overflow-hidden">
            {isCurrentSong ? (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-cyan-400/10">
                <SpinningSongArt isPlaying={isPlaying} size="xl" />
              </div>
            ) : (
              <AIArtwork
                songTitle={song.title}
                artistName={song.artist}
                fallbackImage={song.coverImage}
                className="w-full h-full rounded-none"
                showGenerateButton={true}
              />
            )}
            
            {/* Play button overlay */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center bg-background/30 opacity-0 group-hover:opacity-100 transition-opacity"
              initial={false}
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-glow-intense"
              >
                {isCurrentSong && isPlaying ? (
                  <Pause className="w-6 h-6 text-primary-foreground" />
                ) : (
                  <Play className="w-6 h-6 text-primary-foreground ml-0.5" />
                )}
              </motion.div>
            </motion.div>
          </div>

        <div className="relative z-10 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-heading font-semibold text-foreground truncate">
                {song.title}
              </h3>
              <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
            </div>
            <ShareSongButton 
              songId={song.id} 
              songTitle={song.title} 
              artistName={song.artist}
              coverImage={song.coverImage}
            />
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleLike}
              className={cn(
                "p-2 rounded-xl transition-all flex-shrink-0",
                liked ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"
              )}
            >
              <Heart className={cn("w-4 h-4", liked && "fill-current")} />
            </motion.button>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">{totalPlays.toLocaleString()} plays</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span className="tabular-nums">{totalLikes.toLocaleString()} likes</span>
          </div>
        </div>
        </motion.div>
        
        {showUnlockModal && (
          <UnlockSongModal
            song={song}
            isOpen={showUnlockModal}
            onClose={() => setShowUnlockModal(false)}
            onUnlock={unlockSong}
            walletAddress={walletAddress}
            onWalletConnected={handleWalletConnected}
          />
        )}
      </>
    );
  }

  // Default variant
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -6 }}
      className="group relative glass-card rounded-2xl overflow-hidden hover:shadow-float transition-all duration-300 cursor-pointer shine-overlay"
      onClick={handlePlay}
    >
      <div className="aspect-square bg-secondary relative overflow-hidden">
        {isCurrentSong ? (
          <SpinningSongArt isPlaying={isPlaying} size="xl" className="rounded-none" />
        ) : (
          <>
            {song.coverImage ? (
              <img 
                src={song.coverImage} 
                alt={song.title} 
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 gradient-primary opacity-40" />
            )}
          </>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileHover={{ scale: 1, opacity: 1 }}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-all",
              isCurrentSong && isPlaying
                ? "gradient-primary shadow-glow-intense scale-100 opacity-100"
                : "glass opacity-0 group-hover:opacity-100"
            )}
          >
            {isCurrentSong && isPlaying ? (
              <Pause className="w-7 h-7 text-primary-foreground" />
            ) : (
              <Play className="w-7 h-7 text-foreground ml-1" />
            )}
          </motion.div>
        </div>
      </div>

      <div className="p-4">
        <h3 className={cn(
          "font-heading font-semibold truncate mb-1 text-base",
          isCurrentSong ? "text-primary" : "text-foreground"
        )}>
          {song.title}
        </h3>
        <p className="text-sm text-muted-foreground truncate mb-3">{song.artist}</p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalPlays.toLocaleString()} plays
          </span>
          <div className="flex items-center gap-1">
            <ShareSongButton 
              songId={song.id} 
              songTitle={song.title} 
              artistName={song.artist}
              coverImage={song.coverImage}
            />
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleLike}
              className={cn(
                "p-2 rounded-full transition-all",
                liked ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Heart className={cn("w-4 h-4", liked && "fill-current")} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
