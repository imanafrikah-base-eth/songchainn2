import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Share2, 
  Link2, 
  Twitter, 
  MessageCircle, 
  Copy, 
  Check,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShare } from '@/hooks/useShare';
import { toast } from 'sonner';

interface ShareSongButtonProps {
  songId: string;
  songTitle: string;
  artistName: string;
  coverImage?: string;
  variant?: 'icon' | 'button' | 'dropdown';
  dropdownSide?: 'top' | 'bottom';
  className?: string;
}

export function ShareSongButton({ 
  songId, 
  songTitle, 
  artistName, 
  coverImage,
  variant = 'icon',
  dropdownSide = 'bottom',
  className = ''
}: ShareSongButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const { getSongShareUrl, shareToX } = useShare();

  const shareUrl = getSongShareUrl({ id: songId, title: songTitle, artist: artistName, coverImage });
  const shareText = `Check out "${songTitle}" by ${artistName} on $ongChainn!`;

  const copyText = useCallback(async (text: string) => {
    const tryClipboardApi = async () => {
      if (!navigator?.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      return true;
    };

    const tryLegacyCopy = () => {
      if (typeof document === 'undefined') return false;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    };

    let ok = false;
    try {
      ok = await tryClipboardApi();
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        ok = tryLegacyCopy();
      } catch {
        ok = false;
      }
    }
    return ok;
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      const ok = await copyText(shareUrl);
      if (!ok) {
        toast.error('Failed to copy link');
        return;
      }
      setCopied(true);
      toast.success('Link copied!');

      setTimeout(() => {
        setCopied(false);
        setShowDropdown(false);
      }, 1500);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [copyText, shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${songTitle} - ${artistName}`,
          text: shareText,
          url: shareUrl
        });

        setShowDropdown(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setShowDropdown(true);
      }
    } else {
      await handleCopyLink();
    }
  }, [songTitle, artistName, shareText, shareUrl, handleCopyLink]);

  const handleShareToX = useCallback(async () => {
    shareToX(shareText, shareUrl);
    setShowDropdown(false);
  }, [shareToX, shareText, shareUrl]);

  const handleShareToWhatsApp = useCallback(async () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
    window.open(whatsappUrl, '_blank');
    setShowDropdown(false);
  }, [shareText, shareUrl]);

  const handleShareToTelegram = useCallback(async () => {
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
    window.open(telegramUrl, '_blank');
    setShowDropdown(false);
  }, [shareUrl, shareText]);

  const shareOptions = [
    { icon: <Link2 className="w-4 h-4" />, label: 'Copy Link', action: handleCopyLink, highlight: copied },
    { icon: <Twitter className="w-4 h-4" />, label: 'Share on X', action: handleShareToX },
    { icon: <MessageCircle className="w-4 h-4" />, label: 'WhatsApp', action: handleShareToWhatsApp },
    { icon: <Share2 className="w-4 h-4" />, label: 'Telegram', action: handleShareToTelegram },
  ];

  // Add native share option on mobile
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    shareOptions.unshift({
      icon: <Share2 className="w-4 h-4" />,
      label: 'Share',
      action: handleNativeShare,
      highlight: false
    });
  }

  if (variant === 'button') {
    return (
      <div className={className}>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
          className="gap-2"
        >
          <Share2 className="w-4 h-4" />
          Share
        </Button>

        <AnimatePresence>
          {showDropdown && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setShowDropdown(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className={`fixed z-50 min-w-[180px] glass-card rounded-xl border border-border p-2 shadow-lg right-4 ${
                  dropdownSide === 'top' ? 'top-24' : 'bottom-24'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {shareOptions.map((option, index) => (
                  <button
                    key={index}
                    onClick={option.action}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      option.highlight 
                        ? 'bg-green-500/20 text-green-500' 
                        : 'hover:bg-secondary/50 text-foreground'
                    }`}
                  >
                    {option.highlight ? <Check className="w-4 h-4" /> : option.icon}
                    {option.highlight ? 'Copied!' : option.label}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Icon variant (default)
  return (
    <div className={className}>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown((v) => !v);
        }}
        className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
      >
        <Share2 className="w-4 h-4" />
      </motion.button>

      <AnimatePresence>
        {showDropdown && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`fixed z-50 min-w-[160px] glass-card rounded-xl border border-border p-1.5 shadow-lg right-4 ${
                dropdownSide === 'top' ? 'top-24' : 'bottom-24'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-border/50">
                <span className="text-xs font-medium text-muted-foreground">Share Song</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDropdown(false);
                  }}
                  className="p-0.5 rounded hover:bg-secondary/50"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
              {shareOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={option.action}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    option.highlight 
                      ? 'bg-green-500/20 text-green-500' 
                      : 'hover:bg-secondary/50 text-foreground'
                  }`}
                >
                  {option.highlight ? <Check className="w-3.5 h-3.5" /> : option.icon}
                  <span className="text-xs">{option.highlight ? 'Copied!' : option.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
