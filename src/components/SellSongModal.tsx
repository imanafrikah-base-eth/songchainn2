import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Music, AlertCircle, Check, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Song } from '@/data/musicData';
import { getSellQuote, type TradeResult } from '@/lib/zoraTrading';
import { formatEther } from 'viem';
import { toast } from 'sonner';

interface SellSongModalProps {
  song: Song;
  isOpen: boolean;
  onClose: () => void;
  balance: bigint;
  coinAddress: string;
  walletAddress: string;
  onSell: (amount: bigint, walletAddressOverride?: string, onStatusUpdate?: (status: string) => void) => Promise<TradeResult>;
}

type Step = 'select' | 'confirm' | 'processing' | 'success' | 'error';

const PERCENT_OPTIONS = [25, 50, 75, 100] as const;

export function SellSongModal({ song, isOpen, onClose, balance, coinAddress, walletAddress, onSell }: SellSongModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [percent, setPercent] = useState<number>(100);
  const [estimatedEth, setEstimatedEth] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState('Processing...');
  const submittingRef = useRef(false);

  const amountToSell = useMemo(() => (balance * BigInt(percent)) / BigInt(100), [balance, percent]);
  const balanceDisplay = (Number(balance) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sellAmountDisplay = (Number(amountToSell) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });

  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setPercent(100);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || amountToSell <= BigInt(0)) {
      setEstimatedEth(null);
      return;
    }
    let cancelled = false;
    setIsQuoting(true);
    getSellQuote({
      coinAddress: coinAddress as `0x${string}`,
      tokenAmount: amountToSell,
      userAddress: walletAddress as `0x${string}`,
    }).then((wei) => {
      if (cancelled) return;
      setEstimatedEth(wei !== null ? formatEther(wei) : null);
      setIsQuoting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, amountToSell, coinAddress, walletAddress]);

  const handleConfirmSell = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStep('processing');
    setError(null);
    setProcessingStatus('Preparing transaction...');

    try {
      const result = await onSell(amountToSell, walletAddress, (status) => setProcessingStatus(status));
      if (result.success) {
        setStep('success');
        toast.success('Sold! ETH sent to your wallet.');
        setTimeout(() => {
          onClose();
          setStep('select');
        }, 2500);
      } else {
        setError(result.error || 'Sale failed');
        setStep('error');
      }
    } catch (err: any) {
      setError(err?.message || 'An error occurred');
      setStep('error');
    } finally {
      submittingRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
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
        <div className="relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full bg-background/50 hover:bg-background/80 transition-colors z-10"
          >
            <X size={18} />
          </button>

          <div className="p-4 sm:p-6 pt-6 sm:pt-8 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 rounded-xl overflow-hidden shadow-glow">
              {song.coverImage ? (
                <img src={song.coverImage} alt={song.title} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Music size={28} className="text-muted-foreground" />
                </div>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold mb-0.5 sm:mb-1 truncate px-4">{song.title}</h2>
            <p className="text-sm text-muted-foreground">{song.artist}</p>
          </div>
        </div>

        <div className="p-4 sm:p-6 pt-0">
          {step === 'success' && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6 sm:py-8">
              <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check size={40} className="text-green-500" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-green-500 mb-2">Sold!</h3>
              <p className="text-muted-foreground text-sm">ETH has been sent to your wallet</p>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-500">
                <Check size={14} />
                <span>Transaction confirmed on Base</span>
              </div>
            </motion.div>
          )}

          {step === 'processing' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-4 sm:py-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                <Loader2 size={28} className="text-primary animate-spin" />
              </div>
              <h3 className="text-lg font-semibold">Processing Sale</h3>
              <p className="text-muted-foreground text-sm mt-2">{processingStatus}</p>
              <p className="text-xs text-muted-foreground/60 mt-3">Do not close this window</p>
            </motion.div>
          )}

          {step === 'error' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-4 sm:py-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-destructive/20 flex items-center justify-center">
                <AlertCircle size={28} className="text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-destructive">Sale Failed</h3>
              <p className="text-muted-foreground text-sm mt-2 px-4">{error || 'Something went wrong. Please try again.'}</p>
              <Button onClick={() => setStep('select')} className="mt-4" variant="outline">
                Try Again
              </Button>
            </motion.div>
          )}

          {step === 'select' && (
            <>
              <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3 mb-4">
                <span className="text-sm text-muted-foreground">Your balance</span>
                <span className="text-sm font-semibold">{balanceDisplay} tokens</span>
              </div>

              <h3 className="text-base font-semibold mb-3">How much do you want to sell?</h3>

              <div className="grid grid-cols-4 gap-2 mb-4">
                {PERCENT_OPTIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPercent(p)}
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      percent === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/20 border-border hover:bg-muted/40'
                    }`}
                  >
                    {p === 100 ? 'Max' : `${p}%`}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min={1}
                max={100}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                className="w-full mb-4 accent-primary"
              />

              <div className="bg-muted/30 rounded-xl p-3 sm:p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Selling</span>
                  <span className="font-medium">{sellAmountDisplay} tokens ({percent}%)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated ETH</span>
                  <span className="font-medium text-primary">
                    {isQuoting ? '...' : estimatedEth ? `~${Number(estimatedEth).toFixed(6)} ETH` : 'Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-medium">Base</span>
                </div>
              </div>

              <Button
                onClick={() => setStep('confirm')}
                disabled={amountToSell <= BigInt(0)}
                className="w-full gap-2 h-11 sm:h-12"
                variant="outline"
              >
                <TrendingDown size={18} />
                Continue
              </Button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button
                onClick={() => setStep('select')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
              >
                Back
              </button>

              <div className="bg-muted/30 rounded-xl p-3 sm:p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Selling</span>
                  <span className="font-medium">{sellAmountDisplay} tokens ({percent}%)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">You'll receive</span>
                  <span className="font-semibold text-primary">
                    {estimatedEth ? `~${Number(estimatedEth).toFixed(6)} ETH` : 'Unavailable'}
                  </span>
                </div>
              </div>

              <Button onClick={handleConfirmSell} className="w-full gap-2 h-11 sm:h-12">
                <TrendingDown size={18} />
                Confirm Sale
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-3">Gas fees apply • Powered by Base</p>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
