import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Ban, Copy, Flag, Lock, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { AdultOnly } from '@/components/AdultOnly';
import { ArtistName } from '@/components/ArtistName';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
  useConversation, blockUser, reportMessage, type Conversation,
} from '@/hooks/useDirectMessages';
import { useArtistDmGate, isCoinRequiredError } from '@/hooks/useArtistDmAccess';
import { ArtistDmGateDialog } from '@/components/social/ArtistDmGateDialog';
import { HOLDER_PERK_USD } from '@/hooks/useArtistCoinHolding';
import { supabase } from '@/integrations/supabase/client';
import { ChatMessageList, type ChatItem } from './ChatMessageList';
import { Composer } from './Composer';
import { DmAvatar } from './DmAvatar';
import { PlaylistInMessage, SongInMessage } from './SharedItems';
import { ThreadHeader } from './ThreadHeader';

/**
 * One conversation between two people.
 *
 * A message can carry a song, and when it does it arrives playable. That is the
 * whole point of messaging inside a music app rather than sending a link to one.
 *
 * A fan messages a musician only while holding the musician's coin. When a send
 * is refused for that, the holding is checked again and the send retried once;
 * if it is still refused, the fan is told why and how to fix it.
 */

/** Whether somebody is a musician on the app. */
function useIsArtistUser(userId: string | null | undefined) {
  const { data = false } = useQuery({
    queryKey: ['is-artist-user', userId ?? null],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('artist_accounts')
        .select('artist_id')
        .eq('user_id', userId as string)
        .limit(1);
      return (rows ?? []).length > 0;
    },
  });
  return data;
}

const MENU_ITEM = 'min-h-11 gap-2 rounded-lg text-sm';

export function PeopleThread({
  conversation,
  onBack,
  onSent,
  onBlocked,
  onModalChange,
}: {
  conversation: Conversation;
  onBack?: () => void;
  onSent?: () => void;
  onBlocked?: () => void;
  /** Tells the shell a dialog is open, so a full-screen thread can step under it. */
  onModalChange?: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { messages, isLoading, send, unsend } = useConversation(conversation.conversation_id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  // The hook starts idle before its first fetch; do not flash the empty state then.
  const sawLoading = useRef(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (isLoading) sawLoading.current = true;
    else if (sawLoading.current) setLoaded(true);
  }, [isLoading]);

  useEffect(() => {
    onModalChange?.(gateOpen);
  }, [gateOpen, onModalChange]);
  useEffect(() => () => onModalChange?.(false), [onModalChange]);

  // A musician who has written in this thread has opened it for the fan.
  const otherIsArtist = useIsArtistUser(conversation.other_user_id);
  const theyWrote = messages.some((m) => m.sender_user_id === conversation.other_user_id);
  const gate = useArtistDmGate(otherIsArtist ? conversation.other_user_id : null, {
    autoCheck: otherIsArtist && !theyWrote,
  });
  const locked =
    otherIsArtist && !theyWrote && !!gate.access && !gate.access.allowed && gate.access.reason !== 'check_failed';

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    let res = await send(text);
    if (!res.ok && isCoinRequiredError(res.error) && otherIsArtist) {
      // The server's holdings check may simply have gone stale. Ask again once.
      const access = await gate.check(true);
      if (access.allowed) res = await send(text);
    }
    setSending(false);
    if (!res.ok) {
      setDraft(text);
      if (isCoinRequiredError(res.error)) {
        setGateOpen(true);
        return;
      }
      toast.error(res.error === 'You cannot message this person'
        ? 'You cannot message this person'
        : 'Message not sent', { description: res.error });
      return;
    }
    onSent?.();
  };

  const recheck = async () => {
    setRechecking(true);
    const access = await gate.check(true);
    setRechecking(false);
    if (access.allowed) {
      setGateOpen(false);
      toast.success(`You can message ${conversation.other_name} now`);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Could not copy'),
    );
  };

  const items: ChatItem[] = useMemo(
    () =>
      messages.map((m) => {
        const mine = m.sender_user_id === user?.id;
        const actions: ChatItem['actions'] = [];
        if (!m.is_deleted && m.body) actions.push({ label: 'Copy text', icon: <Copy size={15} />, onSelect: () => copy(m.body as string) });
        if (mine && !m.is_deleted) {
          actions.push({ label: 'Unsend', icon: <Trash2 size={15} />, destructive: true, onSelect: () => void unsend(m.id) });
        }
        if (!mine && !m.is_deleted) {
          actions.push({
            label: 'Report message',
            icon: <Flag size={15} />,
            onSelect: async () => {
              await reportMessage(m.id, conversation.other_user_id, 'Reported from the inbox');
              toast.success('Reported', { description: 'Blocking them stops their messages right now.' });
            },
          });
        }
        return {
          id: m.id,
          mine,
          senderKey: m.sender_user_id,
          createdAt: m.created_at,
          deleted: m.is_deleted,
          text: m.body,
          attachment: m.song_id ? (
            <SongInMessage songId={m.song_id} />
          ) : m.playlist_id ? (
            <PlaylistInMessage playlistId={m.playlist_id} />
          ) : null,
          actions,
        };
      }),
    [messages, user?.id, conversation.other_user_id, unsend],
  );

  const block = async () => {
    try {
      await blockUser(conversation.other_user_id, true);
    } catch {
      toast.error('Could not block this person. Try again.');
      return;
    }
    toast.success('Blocked', { description: 'They cannot message you now.' });
    onBlocked?.();
  };

  const reportLatest = async () => {
    const last = [...messages].reverse().find((m) => m.sender_user_id !== user?.id);
    if (!last) {
      toast('Nothing from them to report yet');
      return;
    }
    await reportMessage(last.id, conversation.other_user_id, 'Reported from the inbox');
    toast.success('Reported', { description: 'Blocking them stops their messages right now.' });
  };

  const profileHref = `/audience/${conversation.other_user_id}`;
  const name = <ArtistName name={conversation.other_name} userId={conversation.other_user_id} size={15} />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ThreadHeader
        onBack={onBack}
        avatar={<DmAvatar src={conversation.other_avatar} name={conversation.other_name} size={40} />}
        title={name}
        subtitle="View profile"
        profileHref={profileHref}
        menu={
          <>
            <DropdownMenuItem asChild className={MENU_ITEM}>
              <Link to={profileHref}>
                <UserRound size={15} aria-hidden="true" /> View profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className={MENU_ITEM} onSelect={() => void reportLatest()}>
              <Flag size={15} aria-hidden="true" /> Report
            </DropdownMenuItem>
            <DropdownMenuItem className={`${MENU_ITEM} text-destructive focus:text-destructive`} onSelect={() => void block()}>
              <Ban size={15} aria-hidden="true" /> Block this person
            </DropdownMenuItem>
          </>
        }
      />

      <ChatMessageList
        items={items}
        loading={!loaded}
        otherName={conversation.other_name}
        otherAvatar={<DmAvatar src={conversation.other_avatar} name={conversation.other_name} size={28} />}
        empty={
          <div className="flex max-w-xs flex-col items-center px-4 text-center">
            <DmAvatar src={conversation.other_avatar} name={conversation.other_name} size={72} />
            <p className="mt-3 text-base font-semibold text-foreground">{name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This is the start of your conversation. Say something, or send them a song.
            </p>
          </div>
        }
      />

      {/* Private messaging is the first of the four doors the Terms close to
          under-18s, and the one that matters most: it is the only surface on
          this app where an adult can reach a child unobserved. The thread stays
          readable so nothing already sent vanishes, but nothing new goes out. */}
      <div className="shrink-0 [&>div.rounded-xl]:m-3">
        {locked && (
          <div className="flex items-center gap-2 border-t border-border bg-background px-4 pt-1.5 text-xs text-muted-foreground">
            <Lock size={12} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {gate.access?.reason === 'no_coin'
                ? `${conversation.other_name} has not launched a coin yet, so messages are closed for now.`
                : `Hold $${HOLDER_PERK_USD.toFixed(2)} of ${conversation.other_name}'s coin to message them.`}
            </span>
            {gate.access?.reason !== 'no_coin' && (
              <button
                type="button"
                onClick={() => setGateOpen(true)}
                className="min-h-11 shrink-0 px-2 font-semibold text-foreground underline underline-offset-4"
              >
                Unlock
              </button>
            )}
          </div>
        )}
        <AdultOnly reason="messaging">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void submit()}
            sending={sending}
            placeholder={`Message ${conversation.other_name}`}
          />
        </AdultOnly>
      </div>

      {otherIsArtist && (
        <ArtistDmGateDialog
          open={gateOpen}
          onOpenChange={setGateOpen}
          artistName={conversation.other_name}
          access={gate.access}
          checking={rechecking || gate.isChecking}
          onRecheck={() => void recheck()}
        />
      )}
    </div>
  );
}
