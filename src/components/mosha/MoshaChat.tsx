import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { rememberEditWhere } from '@/lib/moshaWatch';
import { Loader2, Mic2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { AttachButton, AttachmentTray, useAttachDrop, useMoshaTray } from '@/components/mosha/MoshaAttachmentTray';
import { MoshaAttachmentList } from '@/components/mosha/MoshaAttachmentView';
import { MoshaText } from '@/components/mosha/MoshaText';
import { MoshaDoPopup, MoshaDoStatus } from '@/components/mosha/MoshaDoCard';
import { doJobKey, onMoshaJobDone } from '@/lib/moshaJobs';
import { useHasLiveSong } from '@/hooks/useHasLiveSong';
import type { MoshaDoOp } from '@/lib/moshaDo';
import { filesOnlyLine, type MoshaAttachment } from '@/lib/moshaAttachments';
import { clearTray, getTray, settleTray } from '@/lib/moshaTray';
import { askMoshaFull, MOSHA_INTRO, type MoshaAction, type MoshaTurn } from '@/lib/mosha';
import {
  getCache,
  loadEarlier,
  loadGuest,
  loadRecent,
  markMoshaRead,
  mergeTurns,
  RECENT_HOURS,
  saveGuest,
  setCache,
  toModelTurns,
  type MoshaSource,
  type StoredTurn,
} from '@/lib/moshaHistory';
import { useQueryClient } from '@tanstack/react-query';
import { INBOX_UNREAD_KEY } from '@/hooks/useInboxUnread';
import { useAuth } from '@/context/AuthContext';
import { MoshaFlow, FLOW_LABEL, type MoshaFlowName } from '@/components/mosha/MoshaFlows';
import { useDuplicateAccounts } from '@/hooks/useAccountLinks';
import { useMyWorlds } from '@/worlds/builder/useMyWorlds';
import { getWorldByArtistId } from '@/worlds/registry';

/**
 * The questions offered before the first word, by who is asking.
 *
 * One list served everybody, and two of its five were musician questions, so
 * the landing page, where nearly everyone is a listener, leaned toward artists
 * (founder, 13 Sep 2026). A listener is offered listening; the door for someone
 * who makes music stays, once, at the end. An artist account gets its own set.
 */
const LISTENER_STARTERS = [
  'What is this place?',
  'What should I listen to first?',
  'Is it really free to stream?',
  'How do I get closer to an artist?',
  'I make music. Where do I start?',
];

const ARTIST_STARTERS = [
  'How do I put my music out?',
  'How do I get paid for my music?',
  'Who is listening to my songs?',
  'How do I build my world?',
  'What can my fans do here?',
];

/**
 * Some questions deserve a door, not just an answer. When the person asks how
 * to become an artist, claim their page, switch accounts or why they cannot
 * upload, Mo's reply carries the button that does it. Decided here, on the
 * words, so the button is never left to a model's mood.
 */
const ARTIST_ACCOUNT_ASK = /\b(artist account|artist profile|claim|switch\s+(?:to\s+)?(?:my\s+)?artist|become an artist|upload|put\s+(?:my|our)\s+(?:music|songs?|records?)\s+out|release\s+(?:my|a)\s+(?:song|record|track)|studio)\b/i;

interface ChatTurn extends MoshaTurn {
  id?: string;
  at?: string;
  /** A notice (a welcome, a counter) is shown in the thread but never sent to the model. */
  source?: MoshaSource;
  action?: { label: string; to: string };
  /** A flow Mo$ha opened under this reply. */
  flow?: MoshaFlowName;
  /** Opened from a chip, not said: shown now, never written down. */
  local?: boolean;
  /** Mo$ha asked where to change their world: here, or on this builder page. */
  choice?: { path: string };
  /** Files sent with this line. */
  attachments?: MoshaAttachment[];
  /** A one-tap job Mo$ha offered: a button that does it. */
  doOp?: MoshaDoOp;
  /** What that job is about: a song, an artist, a playlist name. */
  doArg?: string;
  /** The chat's files, handed to the release flow. */
  flowFiles?: MoshaAttachment[];
}

function toChat(t: StoredTurn): ChatTurn {
  return {
    id: t.id,
    at: t.at,
    role: t.role,
    content: t.content,
    source: t.source,
    action: t.action?.type === 'go' ? { label: 'Take me there', to: t.action.path } : undefined,
    doOp: t.action?.type === 'do' ? t.action.op : undefined,
    doArg: t.action?.type === 'do' ? t.action.arg : undefined,
    attachments: t.attachments,
  };
}

function toStored(t: ChatTurn): StoredTurn {
  return {
    id: t.id,
    at: t.at ?? new Date().toISOString(),
    role: t.role,
    content: t.content,
    source: t.source,
    action: t.action ? { type: 'go', path: t.action.to } : t.doOp ? { type: 'do', op: t.doOp, ...(t.doArg ? { arg: t.doArg } : {}) } : undefined,
    attachments: t.attachments,
  };
}

/** One-tap flows for someone who would rather do than ask. */
const DO_CHIPS: Array<{ flow: MoshaFlowName; artistOnly: boolean }> = [
  { flow: 'upload_song', artistOnly: true },
  { flow: 'build_world', artistOnly: true },
  { flow: 'edit_world', artistOnly: true },
  { flow: 'edit_gallery', artistOnly: true },
  { flow: 'merge_accounts', artistOnly: false },
  { flow: 'become_artist', artistOnly: false },
  { flow: 'connect_wallet', artistOnly: false },
];

/**
 * The chat with Mo$ha, wherever it opens: the tab, the landing page, a room.
 *
 * It is a conversation, not a menu. The first line is Mo$ha's, the starters
 * are there for someone who does not know what to ask, and everything after
 * that is typed. Hide it and bring it back and the thread is still there:
 * the last 48 hours come back from the server (or the phone, for a guest),
 * and everything older is one tap away under "Earlier chats".
 */
export function MoshaChat({
  onClose,
  extraChips,
  initial,
  ask,
  onAsked,
  compact = false,
  greeting,
  suggestions,
}: {
  onClose?: () => void;
  /** Extra one-tap actions shown beside the starters, e.g. "Set my vibe". */
  extraChips?: Array<{ label: string; onClick: () => void }>;
  initial?: MoshaTurn[];
  /** A question handed in from elsewhere, asked once the moment it opens. */
  ask?: string | null;
  onAsked?: () => void;
  compact?: boolean;
  /**
   * Mo$ha's opening line, when he has something of his own to say: a record
   * went live, an account was verified. Replaces the standing introduction,
   * because congratulating someone and then introducing yourself reads like
   * two different people talking.
   */
  greeting?: string | null;
  /** The questions offered under a greeting, in place of the usual starters. */
  suggestions?: string[] | null;
}) {
  const { isArtist, user, artistId } = useAuth();
  const navigate = useNavigate();
  // Sorting out logins is only offered to somebody who actually has more than one.
  const { data: twins = [] } = useDuplicateAccounts();
  // What they already have decides what is worth offering. Mo$ha reading
  // their own account back to them is the whole difference between a guide
  // and a pop-up.
  const { data: myWorlds = [] } = useMyWorlds();
  /**
   * A world is theirs if the builder table says so OR it is one of the worlds
   * built into the app for their artist id. IMan Afrikah's World #001 lives in
   * src/worlds/registry.ts, not the worlds table, so reading only the table
   * had Mo$ha offering to build him a world he already has.
   */
  const hasWorld = myWorlds.length > 0 || Boolean(getWorldByArtistId(artistId ?? undefined));
  // A world only opens for a musician with a song out (founder, 14 Sep 2026).
  const { hasLiveSong } = useHasLiveSong();
  const [turns, setTurns] = useState<ChatTurn[]>(initial ?? []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasArchive, setHasArchive] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [restored, setRestored] = useState(Boolean(initial));
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const holdScroll = useRef(false);
  const seeded = Boolean(initial);
  const userId = user?.id ?? null;
  const historyKey = userId ?? 'guest';
  const queryClient = useQueryClient();
  const turnsRef = useRef<ChatTurn[]>(turns);
  turnsRef.current = turns;
  // Files waiting to go with the next message. The tray outlives this window.
  const tray = useMoshaTray(userId);
  const drop = useAttachDrop(userId);
  const [waiting, setWaiting] = useState(false);
  const waitingRef = useRef(false);

  // The thread comes back when Mo$ha is shown again: from the page cache
  // first, then the server (or the phone, for a guest). The server is asked
  // even when the cache has it, because the same conversation also goes on in
  // the Inbox, and notices arrive there too.
  useEffect(() => {
    if (seeded) return;
    const cached = getCache(historyKey);
    if (cached) {
      setTurns(cached.turns.map(toChat));
      setHasArchive(cached.hasArchive);
      setRestored(true);
    }
    if (!userId) {
      if (!cached) {
        const g = loadGuest();
        setTurns(g.map(toChat));
        setCache(historyKey, g, false);
        setRestored(true);
      }
      return;
    }
    let alive = true;
    void loadRecent(userId).then(({ turns: t, hasArchive: more }) => {
      if (!alive) return;
      const onPage = getCache(historyKey)?.turns ?? turnsRef.current.filter((x) => !x.local).map(toStored);
      const since = Date.now() - RECENT_HOURS * 3_600_000;
      // Archive pages already pulled up stay, and so does their "Earlier chats" state.
      const pulledOlder = onPage.some((x) => x.id && Date.parse(x.at) < since);
      const merged = mergeTurns(t, onPage);
      const archive = pulledOlder ? Boolean(getCache(historyKey)?.hasArchive) : more;
      setTurns(merged.map(toChat));
      setHasArchive(archive);
      setCache(historyKey, merged, archive);
      setRestored(true);
      void markMoshaRead().then(() => queryClient.invalidateQueries({ queryKey: [INBOX_UNREAD_KEY] }));
    });
    return () => {
      alive = false;
    };
  }, [seeded, historyKey, userId, queryClient]);

  // Whatever is on screen is what comes back next time.
  useEffect(() => {
    if (!restored || seeded) return;
    const stored = turns.filter((t) => !t.local).map(toStored);
    setCache(historyKey, stored, hasArchive);
    if (!userId) saveGuest(stored);
  }, [turns, hasArchive, restored, seeded, historyKey, userId]);

  useEffect(() => {
    if (holdScroll.current) {
      holdScroll.current = false;
      return;
    }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  /** One more page of the archive, above what is already showing. */
  const pullEarlier = useCallback(async () => {
    if (!userId || pulling) return;
    setPulling(true);
    try {
      const before = turns.find((t) => t.at)?.at ?? new Date().toISOString();
      const { turns: older, more } = await loadEarlier(userId, before);
      holdScroll.current = true;
      setTurns((prev) => [...older.map(toChat), ...prev]);
      setHasArchive(more);
    } finally {
      setPulling(false);
    }
  }, [userId, pulling, turns]);

  const send = useCallback(
    async (text: string, withFiles = true) => {
      const clean = text.trim();
      const useFiles = withFiles && Boolean(userId) && getTray(userId).items.length > 0;
      if ((!clean && !useFiles) || busy || waitingRef.current) return;
      let attachments: MoshaAttachment[] = [];
      if (useFiles && userId) {
        // Send waits for anything still going up, then takes every file with it.
        waitingRef.current = true;
        setWaiting(true);
        const settled = await settleTray(userId);
        waitingRef.current = false;
        setWaiting(false);
        if (!settled.ok) return;
        attachments = settled.attachments;
        if (!clean && !attachments.length) return;
        clearTray(userId);
      }
      const content = clean || filesOnlyLine(attachments.length);
      const next: ChatTurn[] = [
        ...turnsRef.current,
        { role: 'user', content, at: new Date().toISOString(), attachments: attachments.length ? attachments : undefined },
      ];
      setTurns(next);
      // Anything typed while the files finished stays in the box.
      setDraft((d) => (d === text ? '' : d));
      setBusy(true);
      const { reply, action: moshaAction } = await askMoshaFull(toModelTurns(next), 'bubble', { attachments });
      const flow = moshaAction?.type === 'flow' ? moshaAction.flow : undefined;
      const go = moshaAction?.type === 'go' ? moshaAction : undefined;
      const choose = moshaAction?.type === 'choose' ? moshaAction : undefined;
      // A page Mo$ha points at gets a button; the old keyword door stays as a
      // fallback for the account questions when the model gave no action.
      const action = go
        ? { label: 'Take me there', to: go.path }
        : !flow && !choose && ARTIST_ACCOUNT_ASK.test(clean)
          ? isArtist
            ? { label: 'Open the Studio', to: '/studio' }
            : { label: 'Switch to artist account', to: '/claim' }
          : undefined;
      const doOp = moshaAction?.type === 'do' ? moshaAction.op : undefined;
      const doArg = moshaAction?.type === 'do' ? moshaAction.arg : undefined;
      const flowFiles = moshaAction?.type === 'flow' && 'attachments' in moshaAction ? moshaAction.attachments : undefined;
      setTurns((prev) => [...prev, { role: 'assistant', content: reply, action, flow, doOp, doArg, flowFiles, choice: choose ? { path: choose.path } : undefined, at: new Date().toISOString() }]);
      setBusy(false);
      input.current?.focus();
    },
    [busy, isArtist, userId],
  );

  /* A question handed in with the call, asked once, so nobody has to type
     out a problem the app already knows about. */
  const askedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ask || busy || askedRef.current === ask) return;
    askedRef.current = ask;
    void send(ask).then(() => onAsked?.());
  }, [ask, busy, send, onAsked]);
  /* Only notices so far (a welcome, a counter): the starters still belong under them. */
  const talked = turns.some((t) => t.source !== 'notice');
  const openFlow = useCallback((flow: MoshaFlowName) => {
    setTurns((prev) => [...prev, { role: 'assistant', content: FLOW_LABEL[flow] + '. Right here.', flow, local: true, at: new Date().toISOString() }]);
  }, []);

  // A job finishes while they keep talking: the report lands in the thread as Mo$ha's line.
  useEffect(
    () =>
      onMoshaJobDone(({ message }) => {
        setTurns((prev) => [...prev, { role: 'assistant', content: message, local: true, source: 'notice', at: new Date().toISOString() }]);
      }),
    [],
  );

  /** The newest job Mo$ha offered in this sitting: shown as a pop-up over the composer until it is tapped, done or put away. */
  const pendingDo = (() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.role === 'assistant' && t.doOp && !t.id) return { op: t.doOp, arg: t.doArg, jobId: doJobKey(t.doOp, t.at) };
    }
    return null;
  })();

  return (
    <div className={`flex flex-col ${compact ? 'h-[60vh] max-h-[28rem]' : 'h-[68vh] max-h-[34rem]'}`} {...drop.bind}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Mo$ha
          <span className="rounded border border-current/40 px-1 text-[9px] font-semibold uppercase tracking-wide opacity-80" title="An AI guide. Replies are generated.">AI</span>
        </span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Hide Mo$ha" title="Hide. Your chat stays." className="rounded-full p-1 text-muted-foreground hover:text-foreground min-h-11 min-w-11 inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {hasArchive && userId && (
          <button
            type="button"
            disabled={pulling}
            onClick={() => void pullEarlier()}
            className="mx-auto block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 min-h-10"
          >
            {pulling ? 'Pulling up' : 'Earlier chats'}
          </button>
        )}
        {turns.length === 0 && <Bubble role="assistant">{greeting || MOSHA_INTRO}</Bubble>}
        {/* Only to an artist who has not built one. Offering to build a world
            to somebody who already has one is the app telling them it never
            looked, and that is the fastest way to lose their trust. */}
        {isArtist && hasLiveSong && !hasWorld && turns.length === 0 && !greeting && (
          <Bubble role="assistant">Want me to build your world for you? Say the word and it is done in a few taps. I can replace or change anything on it after, whenever you like.</Bubble>
        )}
        {isArtist && hasWorld && turns.length === 0 && (
          <Bubble role="assistant">
            Your world is standing. Say the word and I will change anything on it: the streets, what
            is on them, who gets through each door, the advert on Home.
          </Bubble>
        )}
        {/* More than one login under one name. Said once, without alarm, and
            only to the person it belongs to. */}
        {twins.length > 0 && turns.length === 0 && (
          <Bubble role="assistant">
            One thing: you are here {twins.length + 1} times under the same name. That happens when
            you sign in one way and then another. Tell me which login you want to keep and I will
            bring everything into it, records, worlds, pictures and all. Nothing gets deleted.
            <button
              type="button"
              onClick={() => openFlow('merge_accounts')}
              className="mt-2 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              Sort it out for me
            </button>
          </Bubble>
        )}
        {turns.map((t, i) => (
          <Bubble key={i} role={t.role} wide={Boolean(t.flow)}>
            {t.role === 'assistant' ? <MoshaText text={t.content} /> : t.content}
            {t.attachments?.length ? <MoshaAttachmentList attachments={t.attachments} mine={t.role === 'user'} /> : null}
            {t.flow && (
              <MoshaFlow
                flow={t.flow}
                attachments={t.flowFiles}
                onClose={() => setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, flow: undefined } : x)))}
              />
            )}
            {/* Where to change it. Here opens the editor under this message;
                the page takes them to that step of the builder, with Mo$ha
                riding along and watching what they do there. */}
            {t.choice && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    rememberEditWhere('chat');
                    setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, choice: undefined, flow: 'edit_world' } : x)));
                  }}
                  className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
                >
                  Here in chat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const path = t.choice!.path;
                    rememberEditWhere('page');
                    setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, choice: undefined } : x)));
                    navigate(`${path}${path.includes('?') ? '&' : '?'}guide=1`);
                    onClose?.();
                  }}
                  className="inline-flex min-h-10 items-center rounded-full border border-primary/40 bg-primary/10 px-4 text-xs font-semibold text-primary"
                >
                  Take me to the page
                </button>
              </div>
            )}
            {t.doOp && t.role === 'assistant' && <MoshaDoStatus jobId={doJobKey(t.doOp, t.id ?? t.at)} />}
            {t.action && (
              <Link
                to={t.action.to}
                onClick={onClose}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
              >
                <Mic2 className="h-3.5 w-3.5" /> {t.action.label}
              </Link>
            )}
          </Bubble>
        ))}
        {busy && (
          <Bubble role="assistant">
            <span className="inline-flex gap-1" aria-label="Mo$ha is typing">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          </Bubble>
        )}
        {!talked && !busy && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(suggestions?.length ? suggestions : isArtist ? ARTIST_STARTERS : LISTENER_STARTERS).map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted min-h-10">
                {s}
              </button>
            ))}
            {extraChips?.map((c) => (
              <button key={c.label} type="button" onClick={c.onClick} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 min-h-10">
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The things Mo$ha can do, always one tap away, not only before the first word. */}
      {user && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 py-1.5 scrollbar-hide">
          {DO_CHIPS.filter((c) => (isArtist ? c.flow !== 'become_artist' : !c.artistOnly)).filter((c) => c.flow !== 'merge_accounts' || twins.length > 0).filter((c) => (hasWorld ? c.flow !== 'build_world' : c.flow !== 'edit_world' && (c.flow !== 'build_world' || hasLiveSong))).map((c) => (
            <button key={c.flow} type="button" disabled={busy} onClick={() => openFlow(c.flow)} className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50 min-h-10">
              {FLOW_LABEL[c.flow]}
            </button>
          ))}
        </div>
      )}

      {pendingDo && (
        <div className="px-3 pb-2">
          <MoshaDoPopup jobId={pendingDo.jobId} op={pendingDo.op} arg={pendingDo.arg} />
        </div>
      )}

      {/* Files waiting to go with the next message: songs, cover art, screenshots. */}
      <AttachmentTray userId={userId} waiting={waiting} dragging={drop.dragging} />

      <form
        className="flex items-end gap-2 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <AttachButton userId={userId} disabled={busy} />
        <textarea
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          onPaste={drop.onPaste}
          rows={1}
          maxLength={1500}
          placeholder={userId ? 'Message Mo$ha, or add files' : 'Ask me anything about $ongChainn'}
          aria-label="Message Mo$ha"
          className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || waiting || tray.blocked > 0 || (!draft.trim() && tray.count === 0)}
          aria-label="Send"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

function Bubble({ role, children, wide = false }: { role: 'user' | 'assistant'; children: React.ReactNode; wide?: boolean }) {
  const mine = role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`${wide ? 'w-full' : 'max-w-[85%]'} whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
