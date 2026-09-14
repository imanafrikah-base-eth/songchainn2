import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HdEmoji } from '@/components/room/HdEmoji';
import { ROOM_REACTIONS } from '@/components/room/RoomChatMessage';
import { cn } from '@/lib/utils';

/**
 * Reactions on the feed, the way the Room does them: hold something (or
 * right-click it on a computer) and a row of HD emoji rises over it; tap one
 * and it lands as a chip with its count. Your own chips are tinted and tapping
 * one takes yours back. Double-tap is handed to the caller (the feed likes).
 */

export const FEED_REACTIONS = ROOM_REACTIONS;

const HOLD_MS = 380;
const MOVE_SLOP = 10;
const DOUBLE_TAP_MS = 280;
const BAR_HEIGHT = 52;

/** Anything that can be held to react. Buttons and links inside keep working as they were. */
export function Reactable({
  children,
  onOpen,
  onDoubleTap,
  className,
}: {
  children: ReactNode;
  onOpen: (rect: DOMRect) => void;
  onDoubleTap?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const lastTap = useRef(0);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clear, []);

  const open = () => {
    const node = ref.current;
    if (!node) return;
    onOpen(node.getBoundingClientRect());
    try {
      navigator.vibrate?.(10);
    } catch {
      void 0;
    }
  };

  return (
    <div
      ref={ref}
      className={cn('select-none', className)}
      style={{ WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement | null)?.closest('button, a, input, textarea, select')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        held.current = false;
        clear();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          held.current = true;
          open();
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        if (Math.abs(e.clientX - s.x) > MOVE_SLOP || Math.abs(e.clientY - s.y) > MOVE_SLOP) {
          clear();
          start.current = null;
        }
      }}
      onPointerUp={() => {
        const was = start.current;
        clear();
        start.current = null;
        if (!was || held.current || !onDoubleTap) return;
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0;
          onDoubleTap();
        } else {
          lastTap.current = now;
        }
      }}
      onPointerCancel={() => {
        clear();
        start.current = null;
      }}
      onClickCapture={(e) => {
        // The tap that ends a hold is not also a tap on what was held.
        if (held.current) {
          held.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        clear();
        open();
      }}
    >
      {children}
    </div>
  );
}

/** The floating row of emoji, placed over (or under) whatever it was opened from. */
export function ReactionPicker({
  anchor,
  mine,
  onPick,
  onClose,
}: {
  anchor: DOMRect | null;
  mine?: Record<string, boolean>;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  if (!anchor || typeof document === 'undefined') return null;

  const width = Math.min(360, window.innerWidth - 24);
  const left = Math.min(Math.max(12, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - 12 - width);
  const above = anchor.top > BAR_HEIGHT + 72;
  const top = above
    ? Math.max(8, Math.min(anchor.top, window.innerHeight - BAR_HEIGHT - 8) - BAR_HEIGHT - 8)
    : Math.min(anchor.bottom + 8, window.innerHeight - BAR_HEIGHT - 8);

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" className="absolute inset-0 h-full w-full cursor-default bg-black/30" onClick={onClose} />
      <div
        role="menu"
        aria-label="React"
        className="absolute flex items-center justify-between gap-0.5 rounded-full border border-border bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        style={{ top, left, width }}
      >
        {FEED_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitem"
            aria-label={`React ${emoji}`}
            onClick={() => onPick(emoji)}
            className={cn(
              'flex h-11 min-w-0 flex-1 items-center justify-center rounded-full transition-transform hover:scale-125 active:scale-110',
              mine?.[emoji] ? 'bg-muted' : '',
            )}
          >
            <HdEmoji emoji={emoji} size={28} />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Chips with counts under a post or a comment. Nothing is drawn when nobody has reacted. */
export function ReactionChips({
  counts,
  mine,
  onToggle,
  className,
}: {
  counts?: Record<string, number>;
  mine?: Record<string, boolean>;
  onToggle: (emoji: string) => void;
  className?: string;
}) {
  const chips = Object.entries(counts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!chips.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map(([emoji, count]) => {
        const own = Boolean(mine?.[emoji]);
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(emoji);
            }}
            aria-pressed={own}
            aria-label={`${emoji} ${count}${own ? ', yours. Tap to take it back' : '. Tap to add yours'}`}
            className={cn(
              'relative inline-flex h-8 items-center gap-1 rounded-full border pl-1.5 pr-2.5 text-xs font-semibold tabular-nums transition-colors',
              'after:absolute after:-inset-1.5 after:content-[""]',
              own ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted',
            )}
          >
            <HdEmoji emoji={emoji} size={18} />
            <span>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
