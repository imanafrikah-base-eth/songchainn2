import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import moshaAvatar from '@/assets/Mo$ha chat pop up.webp';
import { claimInterruption, releaseInterruption } from '@/lib/interruptions';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * How Mo$ha introduces himself.
 *
 * He used to open his whole chat panel by himself, which on a phone covers most
 * of the screen before a stranger has heard a single record. The founder's call:
 * he says hello ONCE, small, beside his own tab, after the person has scrolled
 * enough to show they are looking around. A tap on the note opens the chat; the
 * little close puts it away for good on this device.
 */

const SEEN_KEY = 'songchainn_mosha_intro_seen_v1';
/** Scrolled past this share of the first screen before he says hello. */
const SCROLL_SHARE = 0.4;
/** Wait for the page to settle, so the note never lands on moving text. */
const SETTLE_MS = 700;
const SURFACE_ID = 'mosha-intro';

let seenInMemory = false;

export function hasSeenMoshaIntro(): boolean {
  if (seenInMemory) return true;
  try {
    if (window.localStorage.getItem(SEEN_KEY) === '1') return true;
  } catch {
    void 0;
  }
  try {
    if (window.sessionStorage.getItem(SEEN_KEY) === '1') return true;
  } catch {
    void 0;
  }
  return false;
}

export function markMoshaIntroSeen() {
  seenInMemory = true;
  let saved = false;
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
    saved = true;
  } catch {
    void 0;
  }
  if (!saved) {
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      void 0;
    }
  }
}

/** True while a drawer, sheet, dialog or the full player owns the screen. */
export function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Only the body's own attributes, and only the ones that matter. An
    // earlier version watched every node in the document, which fired on
    // each animation frame of a playing app and pegged the main thread hard
    // enough to leave the page blank.
    const read = () => {
      const body = document.body;
      setOpen(
        body.hasAttribute('data-scroll-locked')
        || body.style.pointerEvents === 'none'
        || body.dataset.menuOpen === 'true'
        // Any hand-built panel that raised its hand through useOverlayFlag.
        || body.hasAttribute('data-overlay-open'),
      );
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'data-scroll-locked', 'data-menu-open', 'data-overlay-open'],
    });
    return () => mo.disconnect();
  }, []);
  return open;
}

/**
 * Decides when the hello appears. `blocked` is the caller's own reasons to hold
 * off (a sign-in form, the chat already open, a page Mo$ha stays out of). The
 * overlay check and the once-per-device rule live here so both callers agree.
 */
export function useMoshaIntroTrigger(blocked: boolean) {
  const overlayOpen = useOverlayOpen();
  const [visible, setVisible] = useState(false);
  const [scrolledEnough, setScrolledEnough] = useState(false);
  const [settleTick, setSettleTick] = useState(0);
  const visibleRef = useRef(false);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  useEffect(() => {
    if (hasSeenMoshaIntro()) return;
    let settle: number | null = null;
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * SCROLL_SHARE) setScrolledEnough(true);
      if (settle) window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = null;
        // A fresh chance to show, once the page has stopped moving.
        setSettleTick((n) => n + 1);
      }, SETTLE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (settle) window.clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    if (visible || !scrolledEnough || blocked || overlayOpen) return;
    if (hasSeenMoshaIntro()) return;
    if (document.body.dataset.feedOpen === 'true') return;
    // One surface on screen at a time, and never in the first seconds. If the
    // floor is taken, the next settled scroll asks again.
    if (!claimInterruption(SURFACE_ID, { priority: 'useful' })) return;
    setVisible(true);
  }, [blocked, overlayOpen, scrolledEnough, settleTick, visible]);

  const finish = useCallback(() => {
    markMoshaIntroSeen();
    setVisible(false);
    releaseInterruption(SURFACE_ID);
  }, []);

  // Shown and then left behind (the person signed in, say) still counts as met.
  useEffect(() => () => {
    if (visibleRef.current) markMoshaIntroSeen();
    releaseInterruption(SURFACE_ID);
  }, []);

  return {
    /** On screen right now: shown, and nothing is covering its spot. */
    show: visible && !blocked && !overlayOpen,
    /** The person tapped the close. */
    dismiss: finish,
    /** The person tapped the note; the caller opens the chat. */
    accept: finish,
  };
}

interface MoshaIntroPopupProps {
  show: boolean;
  title: string;
  line: string;
  onOpen: () => void;
  onDismiss: () => void;
  /**
   * `tab`: fixed beside Mo$ha's edge tab, vertically centred, so it clears the
   * tab bar, the now-playing bar and the back-to-top button.
   * `inline`: the caller places it (the landing stacks it above its button).
   */
  placement?: 'tab' | 'inline';
}

export function MoshaIntroPopup({ show, title, line, onOpen, onDismiss, placement = 'tab' }: MoshaIntroPopupProps) {
  const reduced = usePrefersReducedMotion();
  const positionClass =
    placement === 'tab'
      ? 'fixed z-[58] top-1/2 -translate-y-1/2 right-[calc(clamp(2.5rem,7vw,2.9rem)+0.5rem)] w-[min(16rem,calc(100vw-4.5rem))]'
      : 'relative w-[min(17rem,calc(100vw-2rem))]';

  return (
    <AnimatePresence>
      {show && (
        <div className={positionClass}>
          <motion.div
            role="status"
            aria-live="polite"
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: placement === 'tab' ? 8 : 0, y: placement === 'tab' ? 0 : 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: placement === 'tab' ? 8 : 0, y: placement === 'tab' ? 0 : 8 }}
            transition={{ duration: reduced ? 0.01 : 0.2, ease: 'easeOut' }}
            className="relative rounded-2xl border border-border bg-card text-card-foreground shadow-lg"
          >
            <button
              type="button"
              onClick={onOpen}
              aria-label={`${title}. Open the chat with Mo$ha.`}
              className="flex w-full min-h-[3.5rem] items-center gap-2.5 rounded-2xl py-2.5 pl-2.5 pr-12 text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={moshaAvatar}
                alt=""
                aria-hidden="true"
                className="h-10 w-10 shrink-0 rounded-full border border-border bg-muted object-cover object-top"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{title}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{line}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
