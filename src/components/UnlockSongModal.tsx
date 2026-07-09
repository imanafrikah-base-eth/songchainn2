import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Unlock, Loader2, Music, Wallet, AlertCircle, Check, ArrowRight, Crown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Song } from '@/data/musicData';
import { hasWalletProvider } from '@/lib/baseWallet';
import { requestWalletConnection } from '@/lib/walletGate';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

interface UnlockSongModalProps {
  song: Song;
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (ethAmount: string, walletAddress?: string, onStatusUpdate?: (status: string) => void) => Promise<{ success: boolean; error?: string }>;
  walletAddress?: string;
  onWalletConnected?: (address: string) => void;
}

// Pricing options (ETH equivalents at ~$3,500/ETH)
const UNLOCK_PRICE_ETH = "0.00009";  // ~$0.30 USD - streaming access only
const BUY_PRICE_ETH = "0.00029";     // ~$1.00 USD - full ownership

type Step = 'connect' | 'select' | 'confirm' | 'signing' | 'processing' | 'success' | 'error';
type PurchaseType = 'unlock' | 'buy';

export function UnlockSongModal({
  song,
  isOpen,
  onClose,
  onUnlock,
  walletAddress,
  onWalletConnected
}: UnlockSongModalProps) {
  const [step, setStep] = useState<Step>('connect');
  const [purchaseType, setPurchaseType] = useState<PurchaseType>('unlock');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState(walletAddress);
  const [processingStatus, setProcessingStatus] = useState<string>('Processing...');
  const submittingRef = useRef(false);
  const { balance, isLoading: isBalanceLoading } = useWalletBalance(connectedAddress || null);

  const hasWallet = hasWalletProvider();
  const isConnected = !!connectedAddress;
  
  const selectedPrice = purchaseType === 'buy' ? BUY_PRICE_ETH : UNLOCK_PRICE_ETH;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(isConnected ? 'select' : 'connect');
      setError(null);
      setPurchaseType('unlock');
      setProcessingStatus('Processing...');
    }
  }, [isOpen, isConnected]);

  // Update connected address when wallet prop changes
  useEffect(() => {
    if (walletAddress) {
      setConnectedAddress(walletAddress);
      setStep('select');
    }
  }, [walletAddress]);

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Smart gate: frame wallet in miniapps, direct connect with one wallet,
      // picker or install links otherwise.
      const address = await requestWalletConnection();
      if (address) {
        setConnectedAddress(address);
        onWalletConnected?.(address);
        setStep('select');
        toast.success('Wallet connected!');
      } else {
        setError('Connect a wallet to continue');
      }
    } catch (err: any) {
      setError(err?.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSelectPurchase = (type: PurchaseType) => {
    setPurchaseType(type);
    setStep('confirm');
  };

  const handleUnlock = async () => {
    if (!isConnected || !connectedAddress) {
      await handleConnectWallet();
      return;
    }

    // Prevent double submits (wallet popups + fast clicks)
    if (submittingRef.current) return;
    submittingRef.current = true;

    setStep('signing');
    setError(null);
    setProcessingStatus('Preparing transaction...');

    try {
      // Show signing step briefly
      await new Promise(resolve => setTimeout(resolve, 500));
      setStep('processing');

      // Pass the wallet address and status callback to the unlock function
      const result = await onUnlock(selectedPrice, connectedAddress, (status) => {
        setProcessingStatus(status);
      });

      if (result.success) {
        setStep('success');

        // Fire confetti celebration
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6']
        });

        toast.success(purchaseType === 'buy'
          ? '🎉 Congratulations! You now own this track!'
          : '🎉 Congratulations! Song unlocked!');

        setTimeout(() => {
          onClose();
          setStep('select');
        }, 3500);
      } else {
        setError(result.error || 'Failed to unlock song');
        setStep('error');
      }
    } catch (err: any) {
      setError(err?.message || 'An error occurred');
      setStep('error');
    } finally {
      submittingRef.current = false;
    }
  };

  const handleRetry = () => {
    setStep('confirm');
    setError(null);
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('select');
    } else if (step === 'select' && !walletAddress) {
      setStep('connect');
    }
  };

  if (!isOpen) return null;

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Check if user has enough balance
  const hasEnoughBalance = balance && parseFloat(balance) >= parseFloat(selectedPrice);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md mx-auto bg-card border border-border rounded-2xl overflow-hidden max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag Handle (Mobile) */}
          <div className="sm:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="relative">
            <div className="absolute inset-0 gradient-primary opacity-20" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full bg-background/50 hover:bg-background/80 transition-colors z-10"
            >
              <X size={18} />
            </button>
            
            <div className="p-4 sm:p-6 pt-2 sm:pt-8 text-center">
              <motion.div 
                className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 rounded-xl overflow-hidden shadow-glow"
                animate={{ 
                  boxShadow: step === 'success' 
                    ? '0 0 40px rgba(34, 197, 94, 0.4)' 
                    : '0 0 20px rgba(var(--primary), 0.3)'
                }}
              >
                {song.coverImage ? (
                  <img
                    src={song.coverImage}
                    alt={song.title}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <Music size={28} className="text-muted-foreground" />
                  </div>
                )}
              </motion.div>
              
              <h2 className="text-lg sm:text-xl font-bold mb-0.5 sm:mb-1 truncate px-4">{song.title}</h2>
              <p className="text-sm text-muted-foreground">{song.artist}</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 pt-0">
            {/* Success State */}
            {step === 'success' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center py-6 sm:py-8"
              >
                <motion.div 
                  className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 rounded-full bg-green-500/20 flex items-center justify-center relative"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1 }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full bg-green-500/20"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  {purchaseType === 'buy' ? (
                    <Crown size={40} className="text-green-500" />
                  ) : (
                    <Unlock size={40} className="text-green-500" />
                  )}
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <h3 className="text-xl sm:text-2xl font-bold text-green-500">Congratulations!</h3>
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                  
                  <p className="text-lg font-semibold text-foreground mb-2">
                    {purchaseType === 'buy' ? 'You now own this track!' : 'Song Unlocked!'}
                  </p>
                  
                  <p className="text-muted-foreground text-sm">
                    {purchaseType === 'buy' 
                      ? 'Enjoy unlimited streaming + 1,000 offline plays' 
                      : 'Enjoy unlimited streaming access'}
                  </p>
                  
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-500">
                    <Check size={14} />
                    <span>Transaction confirmed on Base</span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* Signing State */}
            {step === 'signing' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-4 sm:py-6"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                  <Wallet size={28} className="text-primary animate-pulse" />
                </div>
                <h3 className="text-lg font-semibold">Check Your Wallet</h3>
                <p className="text-muted-foreground text-sm mt-2">
                  Please confirm the transaction in your wallet
                </p>
                <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Waiting for confirmation...
                </div>
              </motion.div>
            )}

            {/* Processing State */}
            {step === 'processing' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-4 sm:py-6"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-primary/20 flex items-center justify-center relative">
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/30"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                  <Loader2 size={28} className="text-primary animate-spin" />
                </div>
                <h3 className="text-lg font-semibold">Processing Transaction</h3>
                <motion.p 
                  key={processingStatus}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-muted-foreground text-sm mt-2"
                >
                  {processingStatus}
                </motion.p>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>Do not close this window</span>
                  </div>
                  <p className="text-xs text-muted-foreground/60">
                    Song will unlock once confirmed on blockchain
                  </p>
                </div>
              </motion.div>
            )}

            {/* Error State */}
            {step === 'error' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-4 sm:py-6"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-destructive/20 flex items-center justify-center">
                  <AlertCircle size={28} className="text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-destructive">Transaction Failed</h3>
                <p className="text-muted-foreground text-sm mt-2 px-4">
                  {error || 'Something went wrong. Please try again.'}
                </p>
                <Button onClick={handleRetry} className="mt-4" variant="outline">
                  Try Again
                </Button>
              </motion.div>
            )}

            {/* Connect Wallet Step */}
            {step === 'connect' && (
              <>
                <div className="text-center mb-4 sm:mb-6">
                  <h3 className="text-lg font-semibold mb-2">Connect Wallet</h3>
                  <p className="text-sm text-muted-foreground">
                    Connect your wallet to unlock this song
                  </p>
                </div>

                {/* No wallet warning */}
                {!hasWallet && (
                  <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">No wallet detected</p>
                      <p className="text-xs mt-1 text-amber-500/80">
                        Install MetaMask, Coinbase Wallet, or any wallet that supports Base network.
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleConnectWallet}
                  disabled={isConnecting || !hasWallet}
                  className="w-full gradient-primary text-primary-foreground h-11 sm:h-12"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Wallet size={18} className="mr-2" />
                      Connect Wallet
                    </>
                  )}
                </Button>
              </>
            )}

            {/* Select Purchase Type Step */}
            {step === 'select' && (
              <>
                {/* Wallet Info (Compact) */}
                {isConnected && (
                  <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                        <Wallet size={14} className="text-primary" />
                      </div>
                      <span className="text-sm font-medium">{truncateAddress(connectedAddress!)}</span>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {isBalanceLoading ? '...' : balance ? `${balance} ETH` : '0 ETH'}
                    </span>
                  </div>
                )}

                <h3 className="text-base font-semibold mb-3">Choose an option</h3>

                {/* Unlock Option */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelectPurchase('unlock')}
                  className="w-full p-3 sm:p-4 mb-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <Unlock size={20} className="text-amber-500" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Unlock</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Unlimited streaming access
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-primary">~$0.30</div>
                      <div className="text-xs text-muted-foreground">{UNLOCK_PRICE_ETH} ETH</div>
                    </div>
                  </div>
                </motion.button>

                {/* Buy Option */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelectPurchase('buy')}
                  className="w-full p-3 sm:p-4 rounded-xl border-2 border-primary/50 bg-primary/10 hover:bg-primary/20 transition-colors text-left relative overflow-hidden"
                >
                  <div className="absolute top-2 right-2">
                    <span className="text-[10px] font-bold uppercase bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                      Best Value
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Crown size={20} className="text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Buy & Own</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Full ownership + 1,000 offline plays
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 mt-4">
                      <div className="text-lg font-bold text-primary">~$1.00</div>
                      <div className="text-xs text-muted-foreground">{BUY_PRICE_ETH} ETH</div>
                    </div>
                  </div>
                </motion.button>

                <p className="text-xs text-center text-muted-foreground mt-4">
                  95% goes directly to the artist • Base blockchain
                </p>
              </>
            )}

            {/* Confirm Step */}
            {step === 'confirm' && (
              <>
                {/* Back button */}
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
                >
                  <ArrowRight size={14} className="rotate-180" />
                  Back
                </button>

                {/* Wallet Info */}
                {isConnected && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-muted/30 rounded-xl p-3 mb-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                          <Wallet size={14} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{truncateAddress(connectedAddress!)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-primary">
                          {isBalanceLoading ? '...' : balance ? `${balance} ETH` : '0 ETH'}
                        </p>
                      </div>
                    </div>

                    {/* Insufficient balance warning */}
                    {!isBalanceLoading && balance && !hasEnoughBalance && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 text-amber-500 text-xs mt-2">
                        <AlertCircle size={14} />
                        <span>Insufficient balance. Need {selectedPrice} ETH.</span>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Selected Option Summary */}
                <div className="bg-muted/30 rounded-xl p-3 sm:p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {purchaseType === 'buy' ? (
                        <Crown size={18} className="text-primary" />
                      ) : (
                        <Unlock size={18} className="text-amber-500" />
                      )}
                      <span className="font-semibold">
                        {purchaseType === 'buy' ? 'Buy & Own' : 'Unlock'}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-primary">{selectedPrice} ETH</span>
                  </div>
                  
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Network</span>
                      <span className="font-medium">Base</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Artist Share</span>
                      <span className="font-medium text-green-500">95%</span>
                    </div>
                  </div>
                </div>

                {/* What you get */}
                <div className="space-y-2 mb-4 sm:mb-6">
                  <h4 className="text-sm font-medium">What you get:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {purchaseType === 'buy' ? (
                      <>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Unlimited streaming access
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          1,000 offline plays
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Own the song token on Base
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Support the artist directly
                        </li>
                      </>
                    ) : (
                      <>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Unlimited streaming access
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Support the artist directly
                        </li>
                      </>
                    )}
                  </ul>
                </div>

                {/* Action Button */}
                <Button
                  onClick={handleUnlock}
                  disabled={isBalanceLoading || !hasEnoughBalance}
                  className="w-full gradient-primary text-primary-foreground h-11 sm:h-12"
                >
                  {purchaseType === 'buy' ? (
                    <>
                      <Crown size={18} className="mr-2" />
                      Buy for {selectedPrice} ETH
                    </>
                  ) : (
                    <>
                      <Unlock size={18} className="mr-2" />
                      Unlock for {selectedPrice} ETH
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-3">
                  Gas fees apply • Powered by Base
                </p>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
