import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
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
 */

export type ChatAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
};

export type ChatItem = {
  id: string;
  mine: boolean;
  senderKey: string;
  createdAt: string;
  deleted?: boolean;
  /** Plain text of the message, linkified when shown. */
  text?: string | null;
  /** A card riding along: a song, a playlist. */
  attachment?: ReactNode;
  /** Anything that follows the bubble, e.g. Mo$ha's buttons. */
  after?: ReactNode;
  actions?: ChatAction[];
};

const GROUP_GAP_MS = 5 * 60_000;
const NEAR_BOTTOM_PX = 120;

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
  const { bind, menu } = useMessageMenu(item, item.mine ? 'end' : 'start');
  const hasText = !item.deleted && !!item.text;

  return (
    <div className={cn('flex w-full', item.mine ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-0.5')}>
      {!item.mine && (
        <div className="mr-2 flex w-7 shrink-0 items-end">{last ? otherAvatar : null}</div>
      )}
      <div className={cn('group flex max-w-[82%] items-center gap-1 sm:max-w-[70%]', item.mine && 'flex-row-reverse')}>
        <div className={cn('flex min-w-0 flex-col gap-1', item.mine ? 'items-end' : 'items-start')} {...bind}>
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
          {last && (
            <span className="px-1 text-[11px] leading-none text-muted-foreground">
              <time dateTime={item.createdAt}>{clockTime(item.createdAt)}</time>
            </span>
          )}
        </div>
        {menu}
      </div>
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
