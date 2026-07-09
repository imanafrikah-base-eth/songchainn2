import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Coins, 
  Lock, 
  Unlock, 
  Play, 
  Pause,
  ExternalLink,
  Wallet,
  TrendingUp,
  Music,
  Shield,
  Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SONGS, ARTISTS } from '@/data/musicData';
import { useSongOwnership } from '@/hooks/useSongOwnership';
import { useSongCoins } from '@/hooks/useSongCoins';
import { useSongPopularity } from '@/hooks/usePopularity';
import { UnlockSongModal } from '@/components/UnlockSongModal';
import { SellSongModal } from '@/components/SellSongModal';
import { OwnershipBadge } from '@/components/OwnershipBadge';
import { usePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

// Component for individual marketplace song card
function MarketplaceSongCard({ song }: { song: typeof SONGS[0] }) {
  const { currentSong, isPlaying } = usePlayerState();
  const { playSong, togglePlay } = usePlayerActions();
  const { user } = useAuth();
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | undefined>(user?.user_metadata?.wallet_address);
  
  // Get real-time popularity data
  const { data: popularityData } = useSongPopularity();
  
  const {
    status: ownershipStatus,
    offlinePlaysRemaining,
    previewSecondsRemaining,
    unlockSong,
    sellSong,
    isLoading,
    balance,
    coinAddress
  } = useSongOwnership(song.id);
  const [showSellModal, setShowSellModal] = useState(false);

  const isCurrentSong = currentSong?.id === song.id;

  // Get real stats from database
  const realStats = useMemo(() => {
    const songData = popularityData?.find(p => p.song_id === song.id);
    return {
      plays: songData?.play_count || 0,
      likes: songData?.like_count || 0,
      comments: songData?.comment_count || 0,
      shares: songData?.share_count || 0
    };
  }, [popularityData, song.id]);
  
  const handlePlay = () => {
    if (isCurrentSong) {
      togglePlay();
    } else {
      playSong(song);
    }
  };
  
  const statusConfig = {
    free: { label: 'Free', color: 'bg-green-500/20 text-green-400', icon: Unlock },
    preview: { label: `${previewSecondsRemaining}s Preview`, color: 'bg-amber-500/20 text-amber-400', icon: Play },
    preview_used: { label: 'Locked', color: 'bg-destructive/20 text-destructive', icon: Lock },
    owned: { label: 'Owned', color: 'bg-primary/20 text-primary', icon: Unlock },
    offline_ready: { label: 'Offline Ready', color: 'bg-cyan-500/20 text-cyan-400', icon: Shield }
  };
  
  const config = statusConfig[ownershipStatus];
  const StatusIcon = config.icon;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        className="group glass-card rounded-2xl overflow-hidden"
      >
        {/* Cover Image */}
        <div className="relative aspect-square overflow-hidden">
          {song.coverImage ? (
            <img 
              src={song.coverImage} 
              alt={song.title}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full gradient-primary opacity-40" />
          )}
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80" />
          
          {/* Status Badge */}
          <div className="absolute top-3 left-3">
            <Badge className={cn('gap-1', config.color)}>
              <StatusIcon size={12} />
              {config.label}
            </Badge>
          </div>
          
          {/* On-Chain Badge */}
          <div className="absolute top-3 right-3">
            <Badge variant="outline" className="bg-background/80 backdrop-blur-sm gap-1 border-primary/30">
              <Coins size={12} className="text-primary" />
              On-Chain
            </Badge>
          </div>
          
          {/* Play Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlay}
            className={cn(
              "absolute bottom-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-glow transition-all gradient-primary"
            )}
          >
            {isCurrentSong && isPlaying ? (
              <Pause className="w-6 h-6 text-primary-foreground" />
            ) : (
              <Play className="w-6 h-6 text-primary-foreground ml-1" />
            )}
          </motion.button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <h3 className="font-heading font-semibold text-lg text-foreground truncate">
              {song.title}
            </h3>
            <Link 
              to={`/artist/${song.artistId}`}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {song.artist}
            </Link>
          </div>
          
          {/* Real Stats from Database */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Play size={12} />
              {realStats.plays.toLocaleString()} plays
            </span>
            <span className="flex items-center gap-1">
              <Heart size={12} />
              {realStats.likes.toLocaleString()} likes
            </span>
          </div>
          
          {/* Token Info */}
          {coinAddress && (
            <div className="pt-2 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Coin</span>
                <a
                  href={`https://basescan.org/address/${coinAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-mono text-foreground hover:text-primary transition-colors"
                >
                  {coinAddress.slice(0, 6)}...{coinAddress.slice(-4)}
                </a>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Your Balance</span>
                <span className="font-mono text-foreground">
                  {isLoading ? '...' : (Number(balance) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              {ownershipStatus === 'offline_ready' && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Offline Plays</span>
                  <span className="font-mono text-cyan-400">{offlinePlaysRemaining}</span>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            {ownershipStatus === 'owned' || ownershipStatus === 'offline_ready' ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handlePlay}
                >
                  <Play size={16} />
                  Play Now
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 text-destructive hover:text-destructive"
                  disabled={!walletAddress}
                  onClick={() => setShowSellModal(true)}
                >
                  Sell
                </Button>
              </div>
            ) : ownershipStatus === 'preview' ? (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2"
                  onClick={handlePlay}
                >
                  <Play size={16} />
                  Preview
                </Button>
                <Button 
                  className="flex-1 gap-2 gradient-primary"
                  onClick={() => setShowUnlockModal(true)}
                >
                  <Unlock size={16} />
                  Unlock
                </Button>
              </div>
            ) : (
              <Button 
                className="w-full gap-2 gradient-primary"
                onClick={() => setShowUnlockModal(true)}
              >
                <Unlock size={16} />
                Unlock Song
              </Button>
            )}
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
          onWalletConnected={setWalletAddress}
        />
      )}

      {showSellModal && coinAddress && walletAddress && (
        <SellSongModal
          song={song}
          isOpen={showSellModal}
          onClose={() => setShowSellModal(false)}
          balance={balance}
          coinAddress={coinAddress}
          walletAddress={walletAddress}
          onSell={sellSong}
        />
      )}
    </>
  );
}

export default function Marketplace() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'owned' | 'available'>('all');
  const { data: songCoins } = useSongCoins();

  // Songs with a real, live Zora Content Coin
  const tokenGatedSongs = useMemo(() => {
    if (!songCoins) return [];
    const mintedIds = new Set(songCoins.map((c) => c.song_id));
    return SONGS.filter(song => mintedIds.has(song.id));
  }, [songCoins]);
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 glass-card border-b border-border/50">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
                  <Coins className="w-5 h-5 text-primary" />
                  Music Marketplace
                </h1>
                <p className="text-xs text-muted-foreground">
                  Own music on-chain • Stream forever
                </p>
              </div>
            </div>
            
            <a
              href="https://zora.co/@songchainn"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink size={14} />
                View on Zora
              </Button>
            </a>
          </div>
        </div>
      </div>
      
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-glow opacity-20" />
        <div className="px-4 py-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-2xl mx-auto space-y-4"
          >
            <Badge className="bg-primary/20 text-primary border-primary/30">
              Powered by Base
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold text-foreground">
              Own Your Music
            </h2>
            <p className="text-muted-foreground">
              Purchase song tokens on Base blockchain. Unlock unlimited streaming, 
              offline plays, and support artists directly with 95% going to creators.
            </p>
          </motion.div>
          
          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-8"
          >
            <Card className="p-4 text-center glass-card">
              <div className="text-2xl font-bold text-primary">{tokenGatedSongs.length}</div>
              <div className="text-xs text-muted-foreground">Songs On-Chain</div>
            </Card>
            <Card className="p-4 text-center glass-card">
              <div className="text-2xl font-bold text-primary">95%</div>
              <div className="text-xs text-muted-foreground">To Artists</div>
            </Card>
            <Card className="p-4 text-center glass-card">
              <div className="text-2xl font-bold text-primary">1000</div>
              <div className="text-xs text-muted-foreground">Offline Plays</div>
            </Card>
          </motion.div>
        </div>
      </div>
      
      {/* How It Works */}
      <div className="px-4 py-6">
        <h3 className="text-lg font-heading font-semibold text-foreground mb-4">
          How It Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 glass-card">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center mb-3">
              <Play size={20} className="text-primary-foreground" />
            </div>
            <h4 className="font-semibold text-foreground mb-1">1. Preview</h4>
            <p className="text-sm text-muted-foreground">
              Listen to any song once for free. Get a taste before you commit.
            </p>
          </Card>
          <Card className="p-4 glass-card">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center mb-3">
              <Wallet size={20} className="text-primary-foreground" />
            </div>
            <h4 className="font-semibold text-foreground mb-1">2. Purchase</h4>
            <p className="text-sm text-muted-foreground">
              Buy with ETH on Base. 95% goes directly to the artist's wallet.
            </p>
          </Card>
          <Card className="p-4 glass-card">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center mb-3">
              <Music size={20} className="text-primary-foreground" />
            </div>
            <h4 className="font-semibold text-foreground mb-1">3. Stream Forever</h4>
            <p className="text-sm text-muted-foreground">
              Unlimited streaming plus 1,000 offline plays when you own $1+ worth.
            </p>
          </Card>
        </div>
      </div>
      
      {/* Filters */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Songs
          </Button>
          <Button
            variant={filter === 'owned' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('owned')}
          >
            My Collection
          </Button>
          <Button
            variant={filter === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('available')}
          >
            Available
          </Button>
        </div>
      </div>
      
      {/* Songs Grid */}
      <div className="px-4 py-4">
        {tokenGatedSongs.length === 0 ? (
          <Card className="p-12 text-center glass-card">
            <Coins className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No On-Chain Songs Yet
            </h3>
            <p className="text-muted-foreground">
              Check back soon for new releases on the blockchain!
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {tokenGatedSongs.map((song, index) => (
              <motion.div
                key={song.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <MarketplaceSongCard song={song} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
