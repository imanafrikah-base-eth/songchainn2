import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Pin, Search, X } from 'lucide-react';
import moshaAvatar from '@/assets/Mo$ha chat pop up.webp';
import { ArtistName } from '@/components/ArtistName';
import { Skeleton } from '@/components/ui/skeleton';
import type { Conversation } from '@/hooks/useDirectMessages';
import { cn } from '@/lib/utils';
import { DmAvatar } from './DmAvatar';
import { listTime } from './time';
import { parseMessageWithCtas, type MoshaMessage } from './useMoshaThread';

export const MOSHA_CONVERSATION_ID = 'mosha';

const ROW =
  'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors min-h-[68px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" aria-hidden="true">
      <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function ConversationList({
  conversations,
  isLoading,
  selectedId,
  onSelect,
  myId,
  moshaLast,
  fill,
}: {
  conversations: Conversation[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  myId: string | null;
  moshaLast: MoshaMessage | null;
  /** Fill a fixed-height pane and scroll inside it (desktop). */
  fill?: boolean;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      q
        ? conversations.filter(
            (c) =>
              c.other_name.toLowerCase().includes(q) ||
              (c.last_message_preview ?? '').toLowerCase().includes(q),
          )
        : conversations,
    [conversations, q],
  );
  const showMosha = !q || 'mo$ha mosha'.includes(q);

  const moshaPreview = moshaLast
    ? `${moshaLast.sender === 'user' ? 'You: ' : ''}${parseMessageWithCtas(moshaLast.text).content.replace(/\s+/g, ' ')}`
    : 'Ask me anything about the app';

  return (
    <div className={cn('flex flex-col', fill && 'h-full min-h-0')}>
      <div className="shrink-0 px-1 pb-2 pt-1 lg:px-3 lg:pt-4">
        <h1 className="mb-3 px-2 text-xl font-bold tracking-tight text-foreground">Messages</h1>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="dm-search" className="sr-only">Search messages</label>
          <input
            id="dm-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            autoComplete="off"
            className="h-11 w-full rounded-full border border-transparent bg-muted pl-10 pr-10 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className={cn('px-0 pb-3 lg:px-2', fill && 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]')}>
        <ul className="space-y-0.5" aria-label="Conversations">
          {showMosha && (
            <li>
              <button
                type="button"
                onClick={() => onSelect(MOSHA_CONVERSATION_ID)}
                aria-current={selectedId === MOSHA_CONVERSATION_ID ? 'true' : undefined}
                className={cn(ROW, selectedId === MOSHA_CONVERSATION_ID ? 'bg-muted' : 'hover:bg-muted/60')}
              >
                <DmAvatar src={moshaAvatar} name="Mo$ha" size={48} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold text-foreground">Mo$ha</span>
                      <Pin size={12} className="shrink-0 rotate-45 text-muted-foreground" aria-label="Pinned" />
                    </span>
                    {moshaLast && (
                      <span className="shrink-0 text-xs text-muted-foreground">{listTime(moshaLast.created_at)}</span>
                    )}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{moshaPreview}</span>
                </span>
              </button>
            </li>
          )}

          {isLoading && conversations.length === 0 && (
            <>
              <li><RowSkeleton /></li>
              <li><RowSkeleton /></li>
              <li><RowSkeleton /></li>
            </>
          )}

          {filtered.map((c) => {
            const selected = selectedId === c.conversation_id;
            const unread = selected ? 0 : c.unread || 0;
            const fromMe = !!myId && c.last_sender_id === myId;
            const preview = c.last_message_preview
              ? `${fromMe ? 'You: ' : ''}${c.last_message_preview}`
              : 'Say something';
            return (
              <li key={c.conversation_id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.conversation_id)}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={unread > 0 ? `${c.other_name}, ${unread} unread` : undefined}
                  className={cn(ROW, selected ? 'bg-muted' : 'hover:bg-muted/60')}
                >
                  <DmAvatar src={c.other_avatar} name={c.other_name} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('min-w-0 truncate text-[15px] text-foreground', unread > 0 ? 'font-bold' : 'font-semibold')}>
                        <ArtistName name={c.other_name} userId={c.other_user_id} size={14} />
                      </span>
                      <span className={cn('shrink-0 text-xs', unread > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                        {listTime(c.last_message_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn('min-w-0 flex-1 truncate text-sm', unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {preview}
                      </span>
                      {unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {!isLoading && conversations.length === 0 && !q && (
          <div className="mx-2 mt-4 rounded-2xl border border-border px-5 py-8 text-center">
            <MessageSquare size={22} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
            <p className="mb-1 text-sm font-semibold text-foreground">No conversations yet</p>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              Open somebody's profile and tap Message. You can send them a song, and it arrives ready to
              play. To message a musician, hold their artist coin.
            </p>
            <Link
              to="/community"
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Find people
            </Link>
          </div>
        )}

        {q && filtered.length === 0 && !showMosha && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody here matches "{query.trim()}".</p>
        )}
      </div>
    </div>
  );
}
