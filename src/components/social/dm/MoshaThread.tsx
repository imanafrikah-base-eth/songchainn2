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

  const openCtaRoute = (route: string) => {
    if (/^https?:\/\//i.test(route)) {
      window.open(route, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(route);
  };

  const items: ChatItem[] = useMemo(
    () =>
      mosha.messages.map((m) => {
        const parsed = parseMessageWithCtas(m.text);
        const mine = m.sender === 'user';
        return {
          id: m.id,
          mine,
          senderKey: mine ? 'user' : 'mosha',
          createdAt: m.created_at,
          text: parsed.content,
          after:
            !mine && parsed.ctas.length > 0 ? (
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
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
          onSubmit={() => {
            const text = draft;
            setDraft('');
            void mosha.send(text);
          }}
          sending={busy}
          placeholder="Ask Mo$ha anything"
        />
      </div>
    </div>
  );
}
