import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, MoreHorizontal, SmilePlus } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { HdEmoji } from '@/components/room/HdEmoji';
import { ROOM_REACTIONS } from '@/components/room/RoomChatMessage';
import { cn } from '@/lib/utils';
import { LinkifiedText } from './LinkifiedText';
import { clockTime, dayLabel, fullTime, sameDay } from './time';

/**
 * The scrolling body of a thread, shared by people conversations and Mo$ha.
 *
 * Bubbles group when the same person writes again within five minutes, so a
 * burst reads as one thought: tighter spacing, the tail corner squared, one
 * avatar and one time for the group. Days get a separator.
 *
 * It follows the conversation down only when you are already at the bottom.
 * Scrolled up reading something older, a new message shows a pill instead of
 * yanking you away from it.
 *
 * A message that takes reactions reacts the way Telegram does: hold it (or
 * right-click it) and a row of emoji rises above it with the message actions
 * under it; tap one and it lands as a chip under the bubble. Double-tap sends
 * a heart. Tapping a chip adds yours, or takes yours back.
 */

export type ChatAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
};

export type ChatReaction = { emoji: string; count: number; mine: boolean };

export type ChatItem = {
  id: string;
  mine: boolean;
  senderKey: string;
  createdAt: string;
  deleted?: boolean;
  /** Plain text of the message, linkified when shown. */
  text?: string | null;
  /** A card riding along: a song, a playlist, photos. */
  attachment?: ReactNode;
  /** Anything that follows the bubble, e.g. Mo$ha's buttons. */
  after?: ReactNode;
  actions?: ChatAction[];
  /** Reactions on this message, as chips. */
  reactions?: ChatReaction[];
  /** Given when the message takes reactions. */
  onReact?: (emoji: string) => void;
};

const GROUP_GAP_MS = 5 * 60_000;
const NEAR_BOTTOM_PX = 120;
const HOLD_MS = 380;
const MOVE_SLOP = 8;
const DOUBLE_TAP_MS = 280;
const BAR_HEIGHT = 52;

function bubbleCorners(mine: boolean, first: boolean, last: boolean) {
  if (first && last) return '';
  if (mine) return first ? 'rounded-br-md' : last ? 'rounded-tr-md' : 'rounded-r-md';
  return first ? 'rounded-bl-md' : last ? 'rounded-tl-md' : 'rounded-l-md';
}

function useMessageMenu(item: ChatItem, align: 'start' | 'end') {
  const [open, setOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const clearPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // A long press on a phone opens the same menu the hover button opens on a desktop.
  useEffect(() => clearPress, []);

  const bind = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      clearPress();
      pressTimer.current = window.setTimeout(() => setOpen(true), 450);
    },
    onPointerUp: clearPress,
    onPointerLeave: clearPress,
    onPointerCancel: clearPress,
    onPointerMove: clearPress,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setOpen(true);
    },
  };

  const actions = item.actions ?? [];

  return {
    bind,
    menu: (
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger
          aria-label="Message options"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open ? 'opacity-100' : 'opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
            '[@media(hover:none)]:pointer-events-none',
          )}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="z-[80] w-48 rounded-xl p-1">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{fullTime(item.createdAt)}</DropdownMenuLabel>
          {actions.length > 0 && <DropdownMenuSeparator />}
          {actions.map((a) => (
            <DropdownMenuItem
              key={a.label}
              onSelect={a.onSelect}
              className={cn('min-h-11 gap-2 rounded-lg text-sm', a.destructive && 'text-destructive focus:text-destructive')}
            >
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  };
}

type MenuPlace = { barTop: number; actionsTop: number; left: number };

/** Hold, right-click or double-tap a message to react to it. */
function useReactionMenu(item: ChatItem) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const lastTap = useRef(0);

  const clearHold = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearHold, []);

  const actionCount = item.actions?.length ?? 0;
  const open = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const barWidth = Math.min(340, window.innerWidth - 32);
    const wanted = item.mine ? r.right - barWidth : r.left;
    const left = Math.min(Math.max(16, wanted), window.innerWidth - 16 - barWidth);
    const actionsHeight = actionCount ? actionCount * 44 + 8 : 0;
    const below = r.top < BAR_HEIGHT + 72;
    const barTop = below ? r.bottom + 8 : r.top - BAR_HEIGHT - 8;
    let actionsTop = below ? barTop + BAR_HEIGHT + 8 : r.bottom + 8;
    if (actionsTop + actionsHeight > window.innerHeight - 8) {
      actionsTop = Math.max(8, Math.min(barTop, r.top) - actionsHeight - 8);
    }
    setPlace({ barTop: Math.max(8, Math.min(barTop, window.innerHeight - BAR_HEIGHT - 8)), actionsTop, left });
    try {
      navigator.vibrate?.(10);
    } catch {
      void 0;
    }
  }, [item.mine, actionCount]);

  const close = useCallback(() => setPlace(null), []);

  // The menu belongs to where the message was: it goes when the chat moves.
  useEffect(() => {
    if (!place) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [place, close]);

  const bind = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button, a, video, audio, input, textarea')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      held.current = false;
      clearHold();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        held.current = true;
        open();
      }, HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || timer.current === null) return;
      if (Math.abs(e.clientX - s.x) > MOVE_SLOP || Math.abs(e.clientY - s.y) > MOVE_SLOP) {
        clearHold();
        start.current = null;
      }
    },
    onPointerUp: () => {
      const wasHold = held.current;
      clearHold();
      if (start.current && !wasHold) {
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0;
          if (!item.reactions?.some((r) => r.emoji === '❤️' && r.mine)) item.onReact?.('❤️');
        } else {
          lastTap.current = now;
        }
      }
      start.current = null;
      held.current = false;
    },
    onPointerCancel: () => {
      clearHold();
      start.current = null;
    },
    onPointerLeave: () => clearHold(),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clearHold();
      open();
    },
  };

  const portal =
    place && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[90]">
            <button type="button" aria-label="Close" className="absolute inset-0 h-full w-full cursor-default bg-black/40" onClick={close} />
            <div
              role="menu"
              aria-label="React"
              className="absolute flex items-center gap-0.5 rounded-full border border-border bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 duration-150"
              style={{ top: place.barTop, left: place.left }}
            >
              {ROOM_REACTIONS.map((emoji) => {
                const mine = Boolean(item.reactions?.some((r) => r.emoji === emoji && r.mine));
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    aria-label={`React ${emoji}`}
                    onClick={() => {
                      item.onReact?.(emoji);
                      close();
                    }}
                    className={cn(
                      'flex h-11 w-10 items-center justify-center rounded-full transition-transform hover:scale-125 active:scale-110',
                      mine && 'bg-muted',
                    )}
                  >
                    <HdEmoji emoji={emoji} size={28} />
                  </button>
                );
              })}
            </div>
            {actionCount > 0 && (
              <div
                role="menu"
                aria-label="Message actions"
                className="absolute w-48 overflow-hidden rounded-2xl border border-border bg-popover py-1 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
                style={{ top: place.actionsTop, left: place.left }}
              >
                {item.actions?.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      a.onSelect();
                    }}
                    className={cn('flex min-h-11 w-full items-center gap-3 px-4 text-sm hover:bg-muted', a.destructive && 'text-destructive')}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return { anchorRef, bind, open, portal };
}

function Row({
  item,
  first,
  last,
  otherAvatar,
}: {
  item: ChatItem;
  first: boolean;
  last: boolean;
  otherAvatar: ReactNode;
}) {
  const { bind: menuBind, menu } = useMessageMenu(item, item.mine ? 'end' : 'start');
  const reaction = useReactionMenu(item);
  const reacts = Boolean(item.onReact) && !item.deleted;
  const bind = reacts ? reaction.bind : menuBind;
  const hasText = !item.deleted && !!item.text;
  const chips = !item.deleted ? (item.reactions ?? []).filter((r) => r.count > 0) : [];

  return (
    <div className={cn('flex w-full', item.mine ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-0.5')}>
      {!item.mine && (
        <div className="mr-2 flex w-7 shrink-0 items-end">{last ? otherAvatar : null}</div>
      )}
      <div className={cn('group flex max-w-[82%] items-center gap-1 sm:max-w-[70%]', item.mine && 'flex-row-reverse')}>
        <div
          ref={reaction.anchorRef}
          className={cn('flex min-w-0 flex-col gap-1', item.mine ? 'items-end' : 'items-start', reacts && '[@media(hover:none)]:select-none')}
          style={reacts ? { WebkitTouchCallout: 'none' } : undefined}
          {...bind}
        >
          {item.deleted ? (
            <div
              title={fullTime(item.createdAt)}
              className={cn(
                'rounded-3xl border border-border px-3.5 py-2 text-sm italic text-muted-foreground',
                bubbleCorners(item.mine, first, last),
              )}
            >
              Message removed
            </div>
          ) : (
            <>
              {hasText && (
                <div
                  title={fullTime(item.createdAt)}
                  className={cn(
                    'select-text whitespace-pre-wrap rounded-3xl px-3.5 py-2 text-[15px] leading-[1.35] [overflow-wrap:anywhere] sm:text-sm',
                    item.mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                    bubbleCorners(item.mine, first, last),
                  )}
                >
                  <LinkifiedText text={item.text as string} mine={item.mine} />
                </div>
              )}
              {item.attachment}
              {item.after}
            </>
          )}
          {chips.length > 0 && (
            <div className={cn('flex flex-wrap gap-1.5', item.mine ? 'justify-end' : 'justify-start')}>
              {chips.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => item.onReact?.(r.emoji)}
                  aria-pressed={r.mine}
                  aria-label={`${r.emoji} ${r.count}${r.mine ? ', yours. Tap to take it back' : '. Tap to add yours'}`}
                  className={cn(
                    'relative inline-flex h-8 items-center gap-1 rounded-full border pl-1.5 pr-2.5 text-xs font-semibold tabular-nums transition-colors',
                    'after:absolute after:-inset-1.5 after:content-[""]',
                    r.mine ? 'border-primary/40 bg-primary/15 text-foreground' : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted',
                  )}
                >
                  <HdEmoji emoji={r.emoji} size={16} />
                  <span>{r.count}</span>
                </button>
              ))}
            </div>
          )}
          {last && (
            <span className="px-1 text-[11px] leading-none text-muted-foreground">
              <time dateTime={item.createdAt}>{clockTime(item.createdAt)}</time>
            </span>
          )}
        </div>
        {reacts && (
          <button
            type="button"
            onClick={reaction.open}
            aria-label="React to this message"
            title="React"
            className="hidden h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:flex [@media(hover:hover)]:group-hover:opacity-100"
          >
            <SmilePlus size={16} aria-hidden="true" />
          </button>
        )}
        {menu}
      </div>
      {reaction.portal}
    </div>
  );
}

function LoadingBubbles() {
  const rows: { mine: boolean; w: string }[] = [
    { mine: false, w: 'w-44' },
    { mine: false, w: 'w-28' },
    { mine: true, w: 'w-40' },
    { mine: false, w: 'w-52' },
    { mine: true, w: 'w-24' },
    { mine: true, w: 'w-36' },
  ];
  return (
    <div className="space-y-2 px-3 py-4" aria-hidden="true">
      {rows.map((r, i) => (
        <div key={i} className={cn('flex', r.mine ? 'justify-end' : 'justify-start')}>
          <Skeleton className={cn('h-9 rounded-3xl', r.w)} />
        </div>
      ))}
    </div>
  );
}

export function TypingBubble({ avatar, label }: { avatar: ReactNode; label: string }) {
  return (
    <div className="mt-3 flex items-end">
      <div className="mr-2 flex w-7 shrink-0 items-end">{avatar}</div>
      <div className="flex items-center gap-1 rounded-3xl bg-muted px-4 py-3" role="status" aria-label={label}>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChatMessageList({
  items,
  loading,
  otherName,
  otherAvatar,
  empty,
  footer,
}: {
  items: ChatItem[];
  loading: boolean;
  otherName: string;
  /** Small (28px) avatar for the other side. */
  otherAvatar: ReactNode;
  empty: ReactNode;
  /** Rendered after the last message, e.g. a typing indicator. */
  footer?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const seenRef = useRef<{ count: number; lastId: string | null; ready: boolean }>({ count: 0, lastId: null, ready: false });
  const [unseen, setUnseen] = useState(0);
  const [announce, setAnnounce] = useState('');

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = near;
    if (near && unseen) setUnseen(0);
  };

  useLayoutEffect(() => {
    const seen = seenRef.current;
    const last = items[items.length - 1] ?? null;
    if (!seen.ready) {
      if (!loading && items.length > 0) {
        seen.ready = true;
        scrollToBottom(false);
      }
      seen.count = items.length;
      seen.lastId = last?.id ?? null;
      return;
    }
    if (last && last.id !== seen.lastId && items.length >= seen.count) {
      if (last.mine || atBottomRef.current) {
        scrollToBottom(true);
        setUnseen(0);
      } else {
        setUnseen((n) => n + Math.max(1, items.length - seen.count));
      }
      if (!last.mine && last.text && !last.deleted) {
        setAnnounce(`New message from ${otherName}: ${last.text.slice(0, 140)}`);
      }
    }
    seen.count = items.length;
    seen.lastId = last?.id ?? null;
  }, [items, loading, otherName, scrollToBottom]);

  // Keep the newest message in view while a typing indicator comes and goes.
  const hasFooter = Boolean(footer);
  useLayoutEffect(() => {
    if (hasFooter && atBottomRef.current) scrollToBottom(true);
  }, [hasFooter, scrollToBottom]);

  const showSkeleton = loading && items.length === 0;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain px-3 pb-3 pt-1 [scrollbar-width:thin] sm:px-4"
      >
        {showSkeleton ? (
          <LoadingBubbles />
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center py-10">{empty}</div>
        ) : (
          <div className="flex min-h-full flex-col justify-end">
            {items.map((item, i) => {
              const prev = items[i - 1];
              const next = items[i + 1];
              const newDay = !prev || !sameDay(prev.createdAt, item.createdAt);
              const joinsPrev =
                !!prev && !newDay && prev.senderKey === item.senderKey &&
                new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime() <= GROUP_GAP_MS;
              const joinsNext =
                !!next && next.senderKey === item.senderKey && sameDay(item.createdAt, next.createdAt) &&
                new Date(next.createdAt).getTime() - new Date(item.createdAt).getTime() <= GROUP_GAP_MS;
              return (
                <div key={item.id}>
                  {newDay && (
                    <div className="mb-1 mt-5 flex justify-center first:mt-2" role="separator" aria-label={dayLabel(item.createdAt)}>
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                        {dayLabel(item.createdAt)}
                      </span>
                    </div>
                  )}
                  <Row item={item} first={!joinsPrev} last={!joinsNext} otherAvatar={otherAvatar} />
                </div>
              );
            })}
            {footer}
          </div>
        )}
      </div>

      {unseen > 0 && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom(true);
            setUnseen(0);
          }}
          className="absolute bottom-3 left-1/2 flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown size={14} aria-hidden="true" />
          {unseen === 1 ? 'New message' : `${unseen} new messages`}
        </button>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
}
