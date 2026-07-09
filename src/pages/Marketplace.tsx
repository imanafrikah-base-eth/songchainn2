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
import { useSongPopularity, useTodayHotSongs } from '@/hooks/usePopularity';
import { useOwnedSongs } from '@/hooks/useOwnedSongs';
import { UnlockSongModal } from '@/components/UnlockSongModal';
import { SellSongModal } from '@/components/SellSongModal';
import { OwnershipBadge } from '@/components/OwnershipBadge';
import { usePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { requestWalletConnection } from '@/lib/walletGate';
import { AmbientBackground } from '@/components/AmbientBackground';
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
                  onClick={async () => {
                    if (!walletAddress) {
                      const address = await requestWalletConnection();
                      if (!address) return;
                      setWalletAddress(address);
                    }
                    setShowSellModal(true);
                  }}
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

type MarketTab = 'artists' | 'collection' | 'signal';

export default function Marketplace() {
  const [tab, setTab] = useState<MarketTab>('artists');
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const { data: songCoins } = useSongCoins();
  const { data: popularityData } = useSongPopularity();
  const { data: todayHotSongs = [] } = useTodayHotSongs(20);
  const { ownedSongs, hasWallet, isLoading: ownedLoading, refetch: refetchOwned } = useOwnedSongs();

  const mintedIds = useMemo(() => {
    if (!songCoins) return new Set<string>();
    return new Set(songCoins.filter((c) => c.mint_status === 'minted').map((c) => c.song_id));
  }, [songCoins]);

  // Songs with a real, live Zora Content Coin
  const tokenGatedSongs = useMemo(() => SONGS.filter((song) => mintedIds.has(song.id)), [mintedIds]);

  // Artists with at least one on-chain song, most tokenized first
  const marketArtists = useMemo(() => {
    return ARTISTS
      .map((artist) => ({ artist, onchainCount: artist.songs.filter((id) => mintedIds.has(id)).length }))
      .filter((entry) => entry.onchainCount > 0)
      .sort((a, b) => b.onchainCount - a.onchainCount);
  }, [mintedIds]);

  const selectedArtist = useMemo(
    () => (selectedArtistId ? ARTISTS.find((a) => a.id === selectedArtistId) ?? null : null),
    [selectedArtistId]
  );

  // Selected artist's on-chain songs grouped by catalog, newest release first
  const selectedCatalogs = useMemo(() => {
    if (!selectedArtist) return [];
    const songs = tokenGatedSongs.filter((s) => s.artistId === selectedArtist.id);
    const groups = new Map<string, typeof songs>();
    songs.forEach((song) => {
      const label = song.volume ? (song.volume === 'Single' ? 'Singles' : song.volume) : 'Vol1';
      const list = groups.get(label);
      if (list) list.push(song); else groups.set(label, [song]);
    });
    return Array.from(groups.entries())
      .map(([label, groupSongs]) => ({ label, songs: groupSongs }))
      .sort((a, b) => {
        const timeA = a.songs[0]?.addedAt ? new Date(a.songs[0].addedAt!).getTime() : 0;
        const timeB = b.songs[0]?.addedAt ? new Date(b.songs[0].addedAt!).getTime() : 0;
        return timeB - timeA;
      });
  }, [selectedArtist, tokenGatedSongs]);

  const ownedSongObjs = useMemo(
    () => ownedSongs.map((o) => SONGS.find((s) => s.id === o.songId)).filter(Boolean) as typeof SONGS,
    [ownedSongs]
  );

  // Signal: live listener data for on-chain songs, ranked by real activity
  const signalEntries = useMemo(() => {
    const playsTodayById = new Map(todayHotSongs.map(({ song, playsToday }) => [song.id, playsToday]));
    const statsById = new Map((popularityData || []).map((p) => [p.song_id, p]));
    return tokenGatedSongs
      .map((song) => {
        const stats = statsById.get(song.id);
        const playsToday = playsTodayById.get(song.id) || 0;
        const plays = stats?.play_count || 0;
        const likes = stats?.like_count || 0;
        const shares = stats?.share_count || 0;
        const comments = stats?.comment_count || 0;
        const score = playsToday * 5 + likes * 2 + shares * 3 + comments;
        return { song, playsToday, plays, likes, shares, comments, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [tokenGatedSongs, todayHotSongs, popularityData]);
  
  return (
    <div className="min-h-screen bg-background relative isolate">
      <AmbientBackground
        pool="onchainMarketplace"
        opacity={0.16}
        overlay="card"
        glow
        className="fixed -z-10"
      />
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
      
      {/* Tabs */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-2">
          <Button
            variant={tab === 'artists' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setTab('artists'); }}
          >
            <Music className="w-4 h-4 mr-1.5" />
            All Music
          </Button>
          <Button
            variant={tab === 'collection' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('collection')}
          >
            <Shield className="w-4 h-4 mr-1.5" />
            My Collection
          </Button>
          <Button
            variant={tab === 'signal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('signal')}
          >
            <TrendingUp className="w-4 h-4 mr-1.5" />
            Signal
          </Button>
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 py-4 pb-24">
        {tab === 'artists' && !selectedArtist && (
          marketArtists.length === 0 ? (
            <Card className="p-12 text-center glass-card">
              <Coins className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No On-Chain Songs Yet</h3>
              <p className="text-muted-foreground">Check back soon for new releases on the blockchain!</p>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Pick an artist to browse their on-chain catalogs.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {marketArtists.map(({ artist, onchainCount }, index) => (
                  <motion.button
                    key={artist.id}
                    type="button"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.04, 0.4) }}
                    onClick={() => setSelectedArtistId(artist.id)}
                    className="group glass-card rounded-2xl p-4 text-center hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                  >
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-secondary/40 border border-border/40 mx-auto mb-3 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                      {artist.profileImage ? (
                        <>
                          <img src={artist.profileImage} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-xl scale-110" />
                          <img src={artist.profileImage} alt={artist.name} className="relative w-full h-full object-contain" loading="lazy" />
                        </>
                      ) : (
                        <Music className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-foreground truncate">{artist.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{artist.location}</p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold">
                      <Coins className="w-3 h-3" />
                      {onchainCount} on-chain
                    </span>
                  </motion.button>
                ))}
              </div>
            </>
          )
        )}

        {tab === 'artists' && selectedArtist && (
          <div>
            <button
              type="button"
              onClick={() => setSelectedArtistId(null)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">All artists</span>
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-secondary/40 border border-border/40 flex items-center justify-center shrink-0">
                {selectedArtist.profileImage ? (
                  <img src={selectedArtist.profileImage} alt={selectedArtist.name} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-heading font-bold text-foreground">{selectedArtist.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedCatalogs.reduce((sum, c) => sum + c.songs.length, 0)} songs on-chain across {selectedCatalogs.length} release{selectedCatalogs.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {selectedCatalogs.map((catalog) => (
              <div key={catalog.label} className="mb-6 last:mb-0 glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    {catalog.label}
                    <span className="text-[11px] text-muted-foreground">{catalog.songs.length} tracks</span>
                  </h4>
                </div>
                <div className="max-h-[420px] overflow-y-auto pr-1 sm:pr-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {catalog.songs.map((song) => (
                      <MarketplaceSongCard key={song.id} song={song} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'collection' && (
          !hasWallet ? (
            <Card className="p-10 text-center glass-card max-w-lg mx-auto">
              <Wallet className="w-12 h-12 mx-auto text-primary mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Connect to see your collection</h3>
              <p className="text-sm text-muted-foreground mb-5">
                Your song coins live in your Base wallet. Connect it and your collection appears here.
              </p>
              <Button
                onClick={async () => {
                  const address = await requestWalletConnection();
                  if (address) refetchOwned();
                }}
                className="rounded-full gradient-primary text-primary-foreground"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Connect wallet
              </Button>
            </Card>
          ) : ownedLoading ? (
            <Card className="p-10 text-center glass-card max-w-lg mx-auto">
              <p className="text-sm text-muted-foreground">Checking your holdings on Base...</p>
            </Card>
          ) : ownedSongObjs.length === 0 ? (
            <Card className="p-10 text-center glass-card max-w-lg mx-auto">
              <Heart className="w-12 h-12 mx-auto text-primary mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nothing in your collection yet</h3>
              <p className="text-sm text-muted-foreground mb-5">
                Own a song and it lives here forever: unlimited streaming, 1,000 offline plays,
                and 95% of your support goes straight to the artist.
              </p>
              <Button onClick={() => setTab('artists')} className="rounded-full gradient-primary text-primary-foreground">
                <Music className="w-4 h-4 mr-2" />
                Find your first song
              </Button>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                You hold {ownedSongObjs.length} song coin{ownedSongObjs.length === 1 ? '' : 's'} on Base.
              </p>
              <div className="max-h-[560px] overflow-y-auto pr-1 sm:pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {ownedSongObjs.map((song) => (
                    <MarketplaceSongCard key={song.id} song={song} />
                  ))}
                </div>
              </div>
            </>
          )
        )}

        {tab === 'signal' && (
          signalEntries.length === 0 ? (
            <Card className="p-10 text-center glass-card max-w-lg mx-auto">
              <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Signals are warming up</h3>
              <p className="text-sm text-muted-foreground">
                Signals build as people play, like and share songs. Check back soon.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Live signals from real listener activity in the app. Facts, not predictions, and
                never financial advice.
              </p>
              <div className="max-h-[560px] overflow-y-auto pr-1 sm:pr-2 space-y-3">
                {signalEntries.map((entry, index) => (
                  <div key={entry.song.id} className="glass-card rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                    <span className="text-lg font-bold text-primary w-7 text-center shrink-0">#{index + 1}</span>
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-secondary/40 shrink-0">
                      {entry.song.coverImage && (
                        <img src={entry.song.coverImage} alt={entry.song.title} className="w-full h-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{entry.song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{entry.song.artist}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {entry.playsToday > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold">
                            <TrendingUp className="w-3 h-3" />
                            {entry.playsToday} plays today
                          </span>
                        )}
                        <span className="rounded-full bg-secondary/50 text-muted-foreground px-2 py-0.5 text-[10px]">
                          {entry.plays.toLocaleString()} total plays
                        </span>
                        {entry.likes > 0 && (
                          <span className="rounded-full bg-secondary/50 text-muted-foreground px-2 py-0.5 text-[10px]">
                            {entry.likes} likes
                          </span>
                        )}
                        {entry.shares > 0 && (
                          <span className="rounded-full bg-secondary/50 text-muted-foreground px-2 py-0.5 text-[10px]">
                            {entry.shares} shares
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
