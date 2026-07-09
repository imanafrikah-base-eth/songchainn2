import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Link2, Copy, Check, X, Music, ChevronRight } from 'lucide-react';
import { useShare } from '@/hooks/useShare';
import { useSocial } from '@/hooks/useSocial';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fcComposeCast, fcOpenUrl, isInMiniApp } from '@/lib/farcasterActions';

interface ShareSongButtonProps {
  songId: string;
  songTitle: string;
  artistName: string;
  coverImage?: string;
  variant?: 'icon' | 'button';
  dropdownSide?: 'top' | 'bottom'; // kept for API compat, ignored
  className?: string;
}

// --- Platform icon SVGs ---

const FarcasterIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M18.24 0H5.76A5.76 5.76 0 0 0 0 5.76v12.48A5.76 5.76 0 0 0 5.76 24h12.48A5.76 5.76 0 0 0 24 18.24V5.76A5.76 5.76 0 0 0 18.24 0ZM7.92 18l-3.12-9h2.4l1.8 5.64L10.8 9h2.4l1.8 5.64L16.8 9h2.4L16.08 18h-2.4l-1.68-5.28L10.32 18H7.92Z" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

export function ShareSongButton({
  songId,
  songTitle,
  artistName,
  coverImage,
  variant = 'icon',
  className = '',
}: ShareSongButtonProps) {
  const [showSheet, setShowSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inMiniApp, setInMiniApp] = useState(false);
  const [postingToFeed, setPostingToFeed] = useState(false);
  const postingToFeedRef = useRef(false);
  const { getSongShareUrl } = useShare();
  const { createPost } = useSocial();

  const shareUrl = getSongShareUrl({ id: songId });
  const shareText = `"${songTitle}" by ${artistName} 🎵`;
  const shortUrl = shareUrl.replace(/^https?:\/\//, '');

  useEffect(() => {
    let cancelled = false;
    void isInMiniApp().then((v) => { if (!cancelled) setInMiniApp(v); });
    return () => { cancelled = true; };
  }, []);

  const copyText = useCallback(async (text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through */ }
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyText(shareUrl);
    if (ok) {
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => { setCopied(false); setShowSheet(false); }, 1800);
    } else {
      toast.error('Failed to copy link');
    }
  }, [copyText, shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${songTitle} - ${artistName}`, text: shareText, url: shareUrl });
        setShowSheet(false);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await handleCopyLink();
  }, [songTitle, artistName, shareText, shareUrl, handleCopyLink]);

  const handleShareToFarcaster = useCallback(async () => {
    const ok = await fcComposeCast({ text: shareText, embeds: [shareUrl] });
    if (!ok) {
      // not in miniapp — open Warpcast compose in browser
      const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`;
      await fcOpenUrl(url);
    }
    setShowSheet(false);
  }, [shareText, shareUrl]);

  const handleShareToX = useCallback(async () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
    await fcOpenUrl(url);
    setShowSheet(false);
  }, [shareText, shareUrl]);

  const handleShareToWhatsApp = useCallback(async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
    await fcOpenUrl(url);
    setShowSheet(false);
  }, [shareText, shareUrl]);

  const handleShareToTelegram = useCallback(async () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
    await fcOpenUrl(url);
    setShowSheet(false);
  }, [shareUrl, shareText]);

  const handleShareToFeed = useCallback(async () => {
    // Synchronous ref guard: a double tap must never create two posts
    if (postingToFeedRef.current) return;
    postingToFeedRef.current = true;
    setPostingToFeed(true);
    try {
      const ok = await createPost('', 'song_share', songId);
      if (ok) {
        toast.success('Shared to your feed');
        setShowSheet(false);
      }
    } finally {
      postingToFeedRef.current = false;
      setPostingToFeed(false);
    }
  }, [createPost, songId]);

  const platforms = useMemo(() => [
    {
      id: 'farcaster',
      label: 'Farcaster',
      color: 'bg-[#7c3aed]',
      icon: <FarcasterIcon />,
      action: handleShareToFarcaster,
    },
    {
      id: 'x',
      label: 'X',
      color: 'bg-black border border-white/10',
      icon: <XIcon />,
      action: handleShareToX,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      color: 'bg-[#25d366]',
      icon: <WhatsAppIcon />,
      action: handleShareToWhatsApp,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      color: 'bg-[#2aabee]',
      icon: <TelegramIcon />,
      action: handleShareToTelegram,
    },
    ...(typeof navigator !== 'undefined' && 'share' in navigator ? [{
      id: 'more',
      label: 'More',
      color: 'bg-white/10',
      icon: <Share2 className="w-5 h-5" />,
      action: handleNativeShare,
    }] : []),
  ], [handleShareToFarcaster, handleShareToX, handleShareToWhatsApp, handleShareToTelegram, handleNativeShare]);

  const trigger =
    variant === 'button' ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShowSheet(true); }}
        className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors', className)}
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>
    ) : (
      <motion.button
        type="button"
        aria-label="Share song"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={(e) => { e.stopPropagation(); setShowSheet(true); }}
        className={cn('p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all', className)}
      >
        <Share2 className="w-4 h-4" />
      </motion.button>
    );

  // The sheet is portaled to <body> so ancestors with CSS transforms or
  // overflow clipping (animated section shells, carousels) can never trap it.
  const sheet = (
      <AnimatePresence>
        {showSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
              onClick={() => setShowSheet(false)}
            />

            {/* Bottom sheet */}
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed bottom-0 inset-x-0 z-[201] bg-[#111] rounded-t-[28px] overflow-hidden select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-2 pb-4">
                <span className="text-base font-semibold text-white">Share</span>
                <button
                  type="button"
                  onClick={() => setShowSheet(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors"
                >
                  <X className="w-4 h-4 text-white/70" />
                </button>
              </div>

              {/* Song card preview */}
              <div className="mx-4 mb-5 p-3 bg-white/5 rounded-2xl flex items-center gap-3 border border-white/5">
                {coverImage ? (
                  <img
                    src={coverImage}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0 shadow-lg"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Music className="w-6 h-6 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-white truncate leading-snug">{songTitle}</p>
                  <p className="text-xs text-white/50 truncate mt-0.5">{artistName}</p>
                </div>
              </div>

              {/* Platform icons */}
              <div className="flex justify-around px-4 mb-5">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={p.action}
                    className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
                  >
                    <div
                      className={`w-[58px] h-[58px] rounded-2xl flex items-center justify-center text-white ${p.color}`}
                    >
                      {p.icon}
                    </div>
                    <span className="text-[11px] text-white/50">{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Action rows */}
              <div className="px-4 pb-4 space-y-2">
                {/* Copy Link */}
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 active:bg-white/[12%] rounded-2xl px-4 py-3.5 transition-colors border border-white/5"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Link2 className="w-4 h-4 text-white/70" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-white">{copied ? 'Link Copied!' : 'Copy Link'}</p>
                    <p className="text-[11px] text-white/35 truncate">{shortUrl}</p>
                  </div>
                  {!copied && <Copy className="w-4 h-4 text-white/25 flex-shrink-0" />}
                </button>

                {/* Share to Feed */}
                <button
                  type="button"
                  onClick={handleShareToFeed}
                  disabled={postingToFeed}
                  className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 active:bg-white/[12%] rounded-2xl px-4 py-3.5 transition-colors border border-white/5 disabled:opacity-60"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Share2 className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-white flex-1 text-left">
                    {postingToFeed ? 'Sharing...' : 'Share to $ongChainn Feed'}
                  </p>
                  <ChevronRight className="w-4 h-4 text-white/25 flex-shrink-0" />
                </button>
              </div>

              {/* Safe area spacer */}
              <div className="pb-safe" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
  );

  return (
    <>
      {trigger}
      {typeof document !== 'undefined' && createPortal(sheet, document.body)}
    </>
  );
}
