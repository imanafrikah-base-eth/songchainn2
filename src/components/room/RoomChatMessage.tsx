import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Reply, SmilePlus } from 'lucide-react';
import { toast } from 'sonner';
import { ArtistName } from '@/components/ArtistName';
import { HdEmoji } from '@/components/room/HdEmoji';

/**
 * One line of Room chat, with reactions the way Telegram does them.
 *
 * Hold a message (or right-click it on a computer) and a row of emoji rises
 * above it, with Reply and Copy under it; tap one and it lands as a small
 * chip under the bubble with its count. Your own reactions are tinted, and
 * tapping a chip takes yours back. Double-tap a message to send a heart.
 * Sliding a message to the right still replies, and on a computer the React
 * and Reply buttons show when the pointer is over the line.
 */

export const ROOM_REACTIONS = ['❤️', '🔥', '😂', '😮', '😢', '🙏', '👍', '💯'] as const;

const HOLD_MS = 380;
const MOVE_SLOP = 8;
const DOUBLE_TAP_MS = 280;
const BAR_HEIGHT = 52;
const ACTIONS_HEIGHT = 104;

interface MenuPlace {
  barTop: number;
  actionsTop: number;
  left: number;
}

function roomTime(date: Date) {
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

export function RoomChatMessage({
  name,
  userId,
  body,
  copyText,
  parent,
  sentAt,
  isMine = false,
  bigEmoji = false,
  reactions,
  myReactions,
  onReact,
  onReply,
}: {
  name: string;
  userId?: string | null;
  body: ReactNode;
  copyText: string;
  parent?: { name: string; text: string } | null;
  /** When it was sent, as the database keeps it. */
  sentAt?: string | null;
  /** Your own words, tinted so the column is readable at a glance. */
  isMine?: boolean;
  /** Only emoji: shown big and without a bubble. */
  bigEmoji?: boolean;
  reactions?: Record<string, number>;
  myReactions?: Record<string, boolean>;
  onReact: (emoji: string) => void;
  onReply: () => void;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modeRef = useRef<'undecided' | 'swipe' | 'scroll' | 'hold'>('undecided');
  const holdTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);
  const capturedRef = useRef(false);
  const [offsetX, setOffsetX] = useState(0);
  const [menu, setMenu] = useState<MenuPlace | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearHold, [clearHold]);

  const openMenu = useCallback(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const barWidth = Math.min(340, window.innerWidth - 32);
    const left = Math.min(Math.max(16, r.left), window.innerWidth - 16 - barWidth);
    const below = r.top < BAR_HEIGHT + 72;
    const barTop = below ? r.bottom + 8 : r.top - BAR_HEIGHT - 8;
    let actionsTop = below ? barTop + BAR_HEIGHT + 8 : r.bottom + 8;
    if (actionsTop + ACTIONS_HEIGHT > window.innerHeight - 8) {
      actionsTop = Math.max(8, Math.min(barTop, r.top) - ACTIONS_HEIGHT - 8);
    }
    setMenu({ barTop, actionsTop, left });
    try {
      navigator.vibrate?.(10);
    } catch {
      void 0;
    }
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  // The menu belongs to where the message was: it goes when the chat moves.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, closeMenu]);

  const reset = () => {
    clearHold();
    startRef.current = null;
    modeRef.current = 'undecided';
    capturedRef.current = false;
    setOffsetX(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest('button, a')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    modeRef.current = 'undecided';
    capturedRef.current = false;
    setOffsetX(0);
    clearHold();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (modeRef.current !== 'undecided') return;
      modeRef.current = 'hold';
      openMenu();
    }, HOLD_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (modeRef.current === 'undecided') {
      if (Math.abs(dx) < MOVE_SLOP && Math.abs(dy) < MOVE_SLOP) return;
      clearHold();
      modeRef.current = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll';
    }
    if (modeRef.current !== 'swipe') return;
    if (!capturedRef.current) {
      e.currentTarget.setPointerCapture(e.pointerId);
      capturedRef.current = true;
    }
    if (dx <= 0) {
      setOffsetX(0);
      return;
    }
    setOffsetX(Math.min(80, dx));
  };

  const handlePointerUp = () => {
    const mode = modeRef.current;
    if (mode === 'swipe' && offsetX >= 60) {
      onReply();
    } else if (mode === 'undecided' && startRef.current) {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        if (!myReactions?.['❤️']) onReact('❤️');
      } else {
        lastTapRef.current = now;
      }
    }
    reset();
  };

  const react = (emoji: string) => {
    onReact(emoji);
    closeMenu();
  };

  // The clock the reader keeps, in their own time zone. The Room holds a day
  // of chat, so anything not from today says which day it was.
  const sent = sentAt ? new Date(sentAt) : null;
  const sentOk = sent && !Number.isNaN(sent.getTime()) ? sent : null;
  const clock = sentOk ? roomTime(sentOk) : '';
  const fullTime = sentOk ? sentOk.toLocaleString() : undefined;

  const chips = Object.entries(reactions ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="group relative">
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-opacity',
          offsetX > 12 ? 'opacity-100 border-white/15 bg-white/10 text-zinc-100' : 'opacity-0 border-white/10 bg-white/5 text-zinc-400',
        ].join(' ')}
      >
        <Reply className="h-3 w-3" /> Reply
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={reset}
        onContextMenu={(e) => {
          e.preventDefault();
          clearHold();
          modeRef.current = 'hold';
          openMenu();
        }}
        className="flex items-start gap-2 text-sm leading-relaxed text-zinc-200 select-none"
        style={{
          transform: offsetX ? `translateX(${offsetX}px)` : undefined,
          transition: offsetX ? undefined : 'transform 120ms ease-out',
          touchAction: 'pan-y',
          WebkitTouchCallout: 'none',
        }}
      >
        <div
          aria-hidden
          className={[
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase',
            isMine ? 'bg-primary/25 text-primary' : 'bg-white/10 text-zinc-300',
          ].join(' ')}
        >
          {(name || '?').trim().charAt(0) || '?'}
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={bubbleRef}
            className={[
              'inline-block max-w-full rounded-2xl px-3 py-2 transition-transform',
              menu ? 'scale-[0.98]' : '',
              bigEmoji ? 'border border-transparent' : isMine ? 'border border-primary/25 bg-primary/10' : 'border border-white/10 bg-white/[0.04]',
            ].join(' ')}
          >
            {parent && (
              <div className="mb-1 truncate border-l-2 border-white/20 pl-2 text-xs text-zinc-400">
                {parent.name}: {parent.text}
              </div>
            )}
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-semibold text-zinc-100">
              <ArtistName name={name} userId={userId} size={14} />
              {clock && (
                <time dateTime={sentAt ?? undefined} title={fullTime} className="text-[11px] font-normal tabular-nums text-zinc-500">
                  {clock}
                </time>
              )}
            </span>
            <div className={bigEmoji ? 'mt-0.5 leading-none' : 'text-zinc-200 break-words'}>{body}</div>
          </div>

          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {chips.map(([emoji, count]) => {
                const mine = Boolean(myReactions?.[emoji]);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(emoji)}
                    aria-pressed={mine}
                    aria-label={`${emoji} ${count}${mine ? ', yours. Tap to take it back' : '. Tap to add yours'}`}
                    className={[
                      'relative inline-flex h-8 items-center gap-1 rounded-full border pl-1.5 pr-2.5 text-xs font-semibold tabular-nums transition-colors',
                      'after:absolute after:-inset-1.5 after:content-[""]',
                      mine ? 'border-primary/40 bg-primary/15 text-zinc-50' : 'border-white/10 bg-white/[0.06] text-zinc-300 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <HdEmoji emoji={emoji} size={18} />
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:flex">
          <button
            type="button"
            onClick={openMenu}
            aria-label="React to this message"
            title="React"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onReply}
            aria-label="Reply to this message"
            title="Reply"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          >
            <Reply className="h-4 w-4" />
          </button>
        </div>
      </div>

      {menu &&
        createPortal(
          <div className="fixed inset-0 z-[70]">
            <button type="button" aria-label="Close" className="absolute inset-0 h-full w-full cursor-default bg-black/40" onClick={closeMenu} />
            <div
              role="menu"
              aria-label="React"
              className="absolute flex items-center gap-0.5 rounded-full border border-white/10 bg-zinc-900 p-1 shadow-xl animate-in fade-in zoom-in-95 duration-150"
              style={{ top: menu.barTop, left: menu.left }}
            >
              {ROOM_REACTIONS.map((emoji) => {
                const mine = Boolean(myReactions?.[emoji]);
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    aria-label={`React ${emoji}`}
                    onClick={() => react(emoji)}
                    className={[
                      'flex h-11 w-10 items-center justify-center rounded-full transition-transform hover:scale-125 active:scale-110',
                      mine ? 'bg-white/15' : '',
                    ].join(' ')}
                  >
                    <HdEmoji emoji={emoji} size={28} />
                  </button>
                );
              })}
            </div>
            <div
              role="menu"
              aria-label="Message actions"
              className="absolute w-48 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 py-1 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
              style={{ top: menu.actionsTop, left: menu.left }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onReply();
                }}
                className="flex min-h-11 w-full items-center gap-3 px-4 text-sm text-zinc-100 hover:bg-white/10"
              >
                <Reply className="h-4 w-4 text-zinc-400" /> Reply
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  void navigator.clipboard?.writeText(copyText).then(
                    () => toast.success('Copied'),
                    () => toast.error('Could not copy'),
                  );
                }}
                className="flex min-h-11 w-full items-center gap-3 px-4 text-sm text-zinc-100 hover:bg-white/10"
              >
                <Copy className="h-4 w-4 text-zinc-400" /> Copy text
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
