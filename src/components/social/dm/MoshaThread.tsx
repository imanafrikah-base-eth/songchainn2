import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import moshaAvatar from '@/assets/Mo$ha chat pop up.webp';
import { ChatMessageList, TypingBubble, type ChatItem } from './ChatMessageList';
import { Composer } from './Composer';
import { DmAvatar } from './DmAvatar';
import { ThreadHeader } from './ThreadHeader';
import { parseMessageWithCtas, type useMoshaThread } from './useMoshaThread';
import { useAuth } from '@/context/AuthContext';
import { AttachButton, AttachmentTray, useAttachDrop, useMoshaTray } from '@/components/mosha/MoshaAttachmentTray';
import { MoshaAttachmentList } from '@/components/mosha/MoshaAttachmentView';
import { MoshaDoPopup, MoshaDoStatus } from '@/components/mosha/MoshaDoCard';
import { doJobKey } from '@/lib/moshaJobs';
import { MoshaFlow } from '@/components/mosha/MoshaFlows';
import { clearTray, settleTray } from '@/lib/moshaTray';

/** The line to Mo$ha, drawn as the same chat as everybody else. */
export function MoshaThread({
  mosha,
  onBack,
}: {
  mosha: ReturnType<typeof useMoshaThread>;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // The same waiting files as the pop-up chat: add them there, send them here.
  const tray = useMoshaTray(userId);
  const drop = useAttachDrop(userId);
  const [waiting, setWaiting] = useState(false);

  const submit = async () => {
    const text = draft;
    if (userId && tray.count > 0) {
      // Send waits for anything still going up, then takes every file with it.
      setWaiting(true);
      const settled = await settleTray(userId);
      setWaiting(false);
      if (!settled.ok) return;
      if (!text.trim() && !settled.attachments.length) return;
      clearTray(userId);
      setDraft((d) => (d === text ? '' : d));
      void mosha.send(text, settled.attachments);
      return;
    }
    setDraft('');
    void mosha.send(text);
  };

  const openCtaRoute = (route: string) => {
    if (/^https?:\/\//i.test(route)) {
      window.open(route, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(route);
  };

  const items: ChatItem[] = useMemo(
    () =>
      mosha.messages.map((m, i) => {
        const parsed = parseMessageWithCtas(m.text);
        const mine = m.sender === 'user';
        return {
          id: m.id,
          mine,
          senderKey: mine ? 'user' : 'mosha',
          createdAt: m.created_at,
          text: parsed.content,
          attachment: m.attachments?.length ? <MoshaAttachmentList attachments={m.attachments} mine={mine} /> : undefined,
          after:
            // A flow opens under Mo$ha's newest reply only, so old ones do not
            // stack up down the thread.
            !mine && m.flow && i === mosha.messages.length - 1 ? (
              <MoshaFlow flow={m.flow} attachments={m.files} />
            ) : !mine && m.doOp ? (
              <MoshaDoStatus jobId={doJobKey(m.doOp, m.id)} />
            ) : !mine && parsed.ctas.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {parsed.ctas.map((cta) => (
                  <button
                    key={`${m.id}-${cta.label}-${cta.route}`}
                    type="button"
                    onClick={() => openCtaRoute(cta.route)}
                    className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {cta.label}
                  </button>
                ))}
              </div>
            ) : null,
          actions: parsed.content
            ? [{
                label: 'Copy text',
                icon: <Copy size={15} />,
                onSelect: () => {
                  void navigator.clipboard?.writeText(parsed.content).then(
                    () => toast.success('Copied'),
                    () => toast.error('Could not copy'),
                  );
                },
              }]
            : [],
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mosha.messages],
  );

  const busy = mosha.isSending || mosha.awaitingReply;

  /** The newest job Mo$ha offered in this sitting, as a pop-up over the composer. */
  const pendingDo = (() => {
    for (let i = mosha.messages.length - 1; i >= 0; i--) {
      const m = mosha.messages[i];
      if (m.sender === 'mosha' && m.doOp && m.id.startsWith('local-')) return { op: m.doOp, jobId: doJobKey(m.doOp, m.id) };
    }
    return null;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" {...drop.bind}>
      <ThreadHeader
        onBack={onBack}
        avatar={<DmAvatar src={moshaAvatar} name="Mo$ha" size={40} />}
        title="Mo$ha"
        subtitle="Ask anything about $ongChainn"
      />

      <ChatMessageList
        items={items}
        loading={mosha.isLoading}
        otherName="Mo$ha"
        otherAvatar={<DmAvatar src={moshaAvatar} name="Mo$ha" size={28} />}
        footer={
          mosha.awaitingReply ? (
            <TypingBubble avatar={<DmAvatar src={moshaAvatar} name="Mo$ha" size={28} />} label="Mo$ha is typing" />
          ) : null
        }
        empty={<p className="text-sm text-muted-foreground">Ask Mo$ha anything.</p>}
      />

      <div className="shrink-0">
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void submit()}
          sending={busy || waiting}
          placeholder="Ask Mo$ha anything"
          leading={<AttachButton userId={userId} />}
          above={
            <>
              {pendingDo && (
                <div className="px-3 pb-2">
                  <MoshaDoPopup jobId={pendingDo.jobId} op={pendingDo.op} />
                </div>
              )}
              <AttachmentTray userId={userId} waiting={waiting} dragging={drop.dragging} />
            </>
          }
          canSendEmpty={tray.count > 0}
          submitDisabled={tray.blocked > 0}
          onPaste={drop.onPaste}
        />
      </div>
    </div>
  );
}
