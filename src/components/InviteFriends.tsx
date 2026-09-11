import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Copy,
  Gift,
  Mail,
  MessageCircle,
  QrCode,
  Send,
  Share2,
  Users,
  X,
} from 'lucide-react';
import { useReferrals } from '@/hooks/useReferrals';
import { useReferralFriends } from '@/hooks/useReferralFriends';
import { useOverlayFlag } from '@/lib/overlayFlag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface InviteFriendsProps {
  isOpen: boolean;
  onClose: () => void;
}

/** What a friend sees when the invite arrives. One line, no sales pitch. */
const PITCH = 'Music straight from the artists who made it. Use my invite and we both start with points.';

function joinedLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function InviteFriends({ isOpen, onClose }: InviteFriendsProps) {
  const {
    referralCode,
    pointsEarned,
    completedReferrals,
    copyInviteLink,
    shareInviteLink,
    getInviteLink,
    redeemCode,
    refresh,
  } = useReferrals();
  const { friends } = useReferralFriends(isOpen);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  // Mo$ha's tab used to sit right across this panel.
  useOverlayFlag(isOpen);

  const link = getInviteLink();
  const ready = Boolean(referralCode && link);

  // This used to close itself after ten seconds, mid-read, while somebody was
  // still copying the code. It now stays open until it is closed.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setShowQr(false);
      setCopied(null);
    }
  }, [isOpen]);

  const flash = useCallback((what: 'code' | 'link') => {
    setCopied(what);
    window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (await copyInviteLink()) flash('link');
  }, [copyInviteLink, flash]);

  const handleCopyCode = useCallback(async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      toast({ title: 'Invite code copied' });
      flash('code');
    } catch {
      toast({ title: 'Could not copy the code', variant: 'destructive' });
    }
  }, [referralCode, flash]);

  const handleRedeem = useCallback(async () => {
    const code = enteredCode.trim().toUpperCase();
    if (!code) return;
    setRedeeming(true);
    const ok = await redeemCode(code);
    setRedeeming(false);
    if (ok) {
      setEnteredCode('');
      void refresh();
    }
  }, [enteredCode, redeemCode, refresh]);

  // The apps people were going to send it in anyway, plus email.
  const channels = useMemo(() => {
    const text = encodeURIComponent(PITCH + '\n' + link);
    const url = encodeURIComponent(link);
    return [
      { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, href: 'https://wa.me/?text=' + text },
      {
        key: 'telegram',
        label: 'Telegram',
        icon: Send,
        href: 'https://t.me/share/url?url=' + url + '&text=' + encodeURIComponent(PITCH),
      },
      {
        key: 'x',
        label: 'X',
        icon: Share2,
        href: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(PITCH) + '&url=' + url,
      },
      {
        key: 'email',
        label: 'Email',
        icon: Mail,
        href: 'mailto:?subject=' + encodeURIComponent('Come listen on $ongChainn') + '&body=' + text,
      },
    ];
  }, [link]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 24 }}
            role="dialog"
            aria-modal="true"
            aria-label="Invite friends"
            className="fixed inset-x-3 top-1/2 z-50 mx-auto max-h-[88vh] max-w-md -translate-y-1/2 overflow-y-auto overscroll-contain rounded-3xl border border-border bg-background shadow-glow sm:inset-x-4"
          >
            <div className="p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="gradient-primary rounded-2xl p-3">
                    <Gift className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="font-heading text-xl font-bold text-foreground">Invite friends</h2>
                    <p className="text-sm text-muted-foreground">You get 100 points, they start with 50.</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* The code, big, because this is the part people read out loud. */}
              <button
                onClick={handleCopyCode}
                disabled={!ready}
                className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">Your invite code</span>
                  <span className="block truncate font-mono text-2xl font-bold tracking-widest text-primary">
                    {referralCode || '. . . .'}
                  </span>
                </span>
                <span className="inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground">
                  {copied === 'code' ? <Check className="h-5 w-5 text-primary" /> : <Copy className="h-5 w-5" />}
                </span>
              </button>

              <div className="mb-4 flex gap-2">
                <Button onClick={handleCopyLink} variant="outline" disabled={!ready} className="h-11 flex-1 gap-2">
                  {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === 'link' ? 'Copied' : 'Copy link'}
                </Button>
                <Button onClick={shareInviteLink} disabled={!ready} className="gradient-primary h-11 flex-1 gap-2">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
                <Button
                  onClick={() => setShowQr((v) => !v)}
                  variant="outline"
                  disabled={!ready}
                  aria-label={showQr ? 'Hide the scan code' : 'Show a scan code'}
                  aria-pressed={showQr}
                  className="h-11 w-11 min-h-11 min-w-11 shrink-0 p-0"
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>

              {/* For handing the invite to somebody standing next to you. */}
              <AnimatePresence initial={false}>
                {showQr && ready && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mb-4 flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4">
                      <div className="rounded-xl bg-white p-3">
                        <QRCodeSVG value={link} size={148} level="M" />
                      </div>
                      <p className="text-center text-xs text-muted-foreground">
                        Point a camera at this. It opens $ongChainn with your invite already applied.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mb-5 grid grid-cols-4 gap-2">
                {channels.map((c) => {
                  const Icon = c.icon;
                  return (
                    <a
                      key={c.key}
                      href={ready ? c.href : undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-disabled={!ready}
                      className={cn(
                        'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-1 py-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground',
                        !ready && 'pointer-events-none opacity-50',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {c.label}
                    </a>
                  );
                })}
              </div>

              {/* What it has actually earned, and who turned up. */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-3 text-center">
                  <p className="font-heading text-2xl font-bold text-foreground">{completedReferrals}</p>
                  <p className="text-xs text-muted-foreground">Friends joined</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3 text-center">
                  <p className="font-heading text-2xl font-bold text-foreground">{pointsEarned}</p>
                  <p className="text-xs text-muted-foreground">Points from invites</p>
                </div>
              </div>

              {friends.length > 0 && (
                <div className="mb-5 rounded-2xl border border-border bg-card p-3">
                  <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    Who came in on your invite
                  </p>
                  <ul className="space-y-2">
                    {friends.slice(0, 6).map((f) => (
                      <li key={f.user_id} className="flex items-center gap-2.5">
                        {f.avatar_url ? (
                          <img src={f.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                            {f.display_name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{f.display_name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{joinedLabel(f.joined_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Somebody who was given a code by mouth, not by link. */}
              {completedReferrals === 0 && (
                <div className="rounded-2xl border border-border bg-card p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Somebody gave you a code? Put it in here.</p>
                  <div className="flex gap-2">
                    <Input
                      value={enteredCode}
                      onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                      placeholder="INVITE CODE"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      className="h-11 font-mono tracking-widest"
                    />
                    <Button
                      onClick={handleRedeem}
                      disabled={!enteredCode.trim() || redeeming}
                      variant="outline"
                      className="h-11 shrink-0"
                    >
                      {redeeming ? 'Checking' : 'Apply'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
