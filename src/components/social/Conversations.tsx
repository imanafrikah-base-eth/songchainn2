import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConversations } from '@/hooks/useDirectMessages';
import { useSafePlayerState } from '@/context/PlayerContext';
import { cn } from '@/lib/utils';
import { ConversationList, MOSHA_CONVERSATION_ID } from './dm/ConversationList';
import { PeopleThread } from './dm/PeopleThread';
import { MoshaThread } from './dm/MoshaThread';
import { useMoshaThread } from './dm/useMoshaThread';
import { useIsDesktop } from './dm/useIsDesktop';

/**
 * The inbox: the people you talk to, with Mo$ha pinned at the top.
 *
 * Desktop is two panes, the list beside the open thread. A phone is two
 * screens: the list, and a thread that takes the whole screen above the tab bar
 * and the mini player, so the composer is never covered.
 *
 * /inbox?c=<conversation id> opens a thread (notifications and the Message
 * buttons on profiles link here). /inbox?c=mosha opens Mo$ha.
 *
 * Exactly one thread is ever mounted, and useConversations is called once:
 * a second call lands on the same realtime channel and doubles every query.
 */
export function Conversations() {
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversations, isLoading, reload } = useConversations();
  const mosha = useMoshaThread(user?.id ?? null);
  const player = useSafePlayerState();
  const [modalOpen, setModalOpen] = useState(false);

  const selectedId = searchParams.get('c');
  const isMosha = selectedId === MOSHA_CONVERSATION_ID;
  const open = !isMosha && selectedId
    ? conversations.find((c) => c.conversation_id === selectedId) ?? null
    : null;
  const hasThread = isMosha || !!open;

  /* Leaving a conversation refreshes the list, so its unread count clears. */
  const prevSelected = useRef<string | null>(selectedId);
  useEffect(() => {
    const prev = prevSelected.current;
    prevSelected.current = selectedId;
    if (prev && prev !== MOSHA_CONVERSATION_ID && prev !== selectedId) void reload();
  }, [selectedId, reload]);

  const select = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      // On a phone opening a thread is a new screen, so the system back button
      // should return to the list. On a desktop switching panes is not.
      setSearchParams({ c: id }, { replace: isDesktop, state: { dmPushed: !isDesktop } });
    },
    [selectedId, setSearchParams, isDesktop],
  );

  const back = useCallback(() => {
    if ((location.state as { dmPushed?: boolean } | null)?.dmPushed) {
      navigate(-1);
      return;
    }
    setSearchParams({}, { replace: true });
  }, [location.state, navigate, setSearchParams]);

  const closeAfterBlock = useCallback(() => {
    setSearchParams({}, { replace: true });
    void reload();
  }, [setSearchParams, reload]);

  const thread = isMosha ? (
    <MoshaThread key="mosha" mosha={mosha} onBack={isDesktop ? undefined : back} />
  ) : open ? (
    <PeopleThread
      key={open.conversation_id}
      conversation={open}
      onBack={isDesktop ? undefined : back}
      onSent={() => void reload()}
      onBlocked={closeAfterBlock}
      onModalChange={setModalOpen}
    />
  ) : null;

  const list = (
    <ConversationList
      conversations={conversations}
      isLoading={isLoading}
      selectedId={hasThread ? selectedId : null}
      onSelect={select}
      myId={user?.id ?? null}
      moshaLast={mosha.last}
      fill={isDesktop}
    />
  );

  if (isDesktop) {
    return (
      <div
        className={cn(
          'grid min-h-[480px] grid-cols-[340px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-background xl:grid-cols-[380px_minmax(0,1fr)]',
          // The desktop mini player floats bottom right; keep the composer clear of it.
          player?.currentSong ? 'h-[calc(100dvh-4rem-3rem-6.5rem)]' : 'h-[calc(100dvh-4rem-3rem)]',
        )}
      >
        <aside className="flex min-h-0 flex-col border-r border-border">{list}</aside>
        <section className="flex min-h-0 flex-col" aria-label="Conversation">
          {thread ?? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border">
                <MessageCircle size={28} className="text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-lg font-semibold text-foreground">Pick a conversation</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Choose someone on the left, or ask Mo$ha anything. Songs you send arrive ready to play.
              </p>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <>
      {list}
      {thread &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isMosha ? 'Conversation with Mo$ha' : `Conversation with ${open?.other_name ?? ''}`}
            // Above the tab bar, the mini player and the Mo$ha tab; steps under
            // while the coin dialog is open so that dialog is never hidden.
            className={cn('fixed inset-0 flex h-[100dvh] flex-col bg-background', modalOpen ? 'z-40' : 'z-[60]')}
          >
            {thread}
          </div>,
          document.body,
        )}
    </>
  );
}
