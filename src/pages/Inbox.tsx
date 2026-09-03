import { useEffect, useMemo, useState } from 'react';
import { Bot, Send, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Conversations } from '@/components/social/Conversations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { askMosha } from '@/lib/mosha';

type DirectMessage = {
  id: string;
  sender: 'mosha' | 'user' | 'system';
  text: string;
  created_at: string;
};

type MessageCta = {
  label: string;
  route: string;
};

function parseMessageWithCtas(text: string): { content: string; ctas: MessageCta[] } {
  const lines = text.split('\n');
  const ctas: MessageCta[] = [];
  const contentLines: string[] = [];

  lines.forEach((line) => {
    const match = line.match(/^CTA::(.+?)::(.+)$/);
    if (match) {
      const label = match[1]?.trim();
      const route = match[2]?.trim();
      if (label && route) ctas.push({ label, route });
      return;
    }
    contentLines.push(line);
  });

  return {
    content: contentLines.join('\n').trim(),
    ctas,
  };
}

const SEED_TEXT =
  "Mo$ha here. This is your line to me. I know this place inside out: the records, the artists, the worlds, the battles, the coins, the keys. Ask me anything, however you want to ask it, and I will give it to you straight.";

export default function Inbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [tab, setTab] = useState<'people' | 'mosha'>('people');


  const userId = user?.id || null;

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!userId) {
        setMessages([]);
        return;
      }

      const { data: newThreadId, error: threadError } = await (supabase as any)
        .rpc('ensure_dm_thread', { _user_id: userId });
      if (!active) return;
      if (threadError || !newThreadId) {
        setMessages([{ id: 'seed-mosha', sender: 'mosha', text: SEED_TEXT, created_at: new Date().toISOString() }]);
        return;
      }
      setThreadId(newThreadId);

      const { data, error } = await (supabase as any)
        .from('direct_messages')
        .select('id,sender_type,message_text,created_at')
        .eq('thread_id', newThreadId)
        .order('created_at', { ascending: true })
        .limit(120);
      if (!active) return;

      if (error) {
        setMessages([{ id: 'seed-mosha', sender: 'mosha', text: SEED_TEXT, created_at: new Date().toISOString() }]);
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        // First-ever visit to this thread -- persist the welcome message for real.
        const { data: seedId } = await (supabase as any)
          .rpc('send_mosha_message', { _user_id: userId, _message_text: SEED_TEXT });
        if (!active) return;
        setMessages([{ id: seedId || 'seed-mosha', sender: 'mosha', text: SEED_TEXT, created_at: new Date().toISOString() }]);
        return;
      }

      setMessages(
        data.map((row: any) => ({
          id: row.id,
          sender: row.sender_type,
          text: row.message_text,
          created_at: row.created_at,
        })),
      );
    };
    void load();
    return () => {
      active = false;
    };
  }, [userId]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages],
  );

  const persistUserMessage = async (text: string) => {
    if (!threadId || !userId) return null;
    const { data, error } = await (supabase as any)
      .from('direct_messages')
      .insert({ thread_id: threadId, sender_type: 'user', sender_user_id: userId, message_text: text })
      .select('id,created_at')
      .single();
    if (error) return null;
    return data as { id: string; created_at: string };
  };

  const persistMoshaReply = async (text: string) => {
    if (!userId) return null;
    const { data, error } = await (supabase as any)
      .rpc('send_mosha_message', { _user_id: userId, _message_text: text });
    if (error) return null;
    return data as string;
  };

  const handleSend = async () => {
    if (!draft.trim() || isSending) return;
    setIsSending(true);
    const text = draft.trim();
    const optimisticId = `${Date.now()}-user`;
    const userMessage: DirectMessage = {
      id: optimisticId,
      sender: 'user',
      text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');

    const persisted = await persistUserMessage(text);
    if (persisted) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, id: persisted.id, created_at: persisted.created_at } : m)),
      );
    }

    // Mo$ha answers everything now, from the real account of the app and
    // what it knows about this person, in the founder's own way of talking.
    // The thread's last turns go with the question so it can follow along.
    const conversation = [...sortedMessages, userMessage];
    const turns = conversation
      .filter((m) => m.id !== 'seed-mosha')
      .slice(-12)
      .map((m) => ({ role: m.sender === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }));
    const replyText = await askMosha(turns, 'inbox');
    const replyId = await persistMoshaReply(replyText);
    setMessages((prev) => [
      ...prev,
      {
        id: replyId || `${Date.now()}-mosha`,
        sender: 'mosha',
        text: replyText,
        created_at: new Date().toISOString(),
      },
    ]);
    setIsSending(false);
  };

  const openCtaRoute = (route: string) => {
    if (/^https?:\/\//i.test(route)) {
      window.open(route, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 lg:pl-28 pt-4 sm:pt-6 relative z-10">
        {/* Two inboxes, one place: the people you know, and Mo$ha. */}
        <div className="mb-3 flex items-center gap-1.5">
          <button
            onClick={() => setTab('people')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'people'
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {/*
              No unread count on this pill. Reading it here meant calling
              useConversations() a second time, and because Conversations already
              calls it for the same user, both landed on one shared realtime
              channel: doubled queries per message, and whichever unmounted first
              took the channel down for the other.
            */}
            <MessageSquare className="h-3.5 w-3.5" /> People
          </button>
          <button
            onClick={() => setTab('mosha')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'mosha'
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bot className="h-3.5 w-3.5" /> Mo$ha
          </button>
        </div>

        {tab === 'people' && (
          <section className="rounded-2xl border border-border/50 bg-background/85 backdrop-blur p-3 sm:p-4">
            <h1 className="mb-1 text-lg font-semibold text-foreground sm:text-xl">Messages</h1>
            <p className="mb-4 text-xs text-muted-foreground sm:text-sm">
              Talk to anyone here. Send them a song and it arrives ready to play.
            </p>
            <Conversations />
          </section>
        )}

        {tab === 'mosha' && (
        <section className="rounded-2xl border border-border/50 bg-background/85 backdrop-blur p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-primary" />
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">Mo$ha</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mb-4">
            Ask $ongChainn-related questions for smart replies.
          </p>

          <div className="max-h-[58vh] overflow-y-auto rounded-xl border border-border/40 bg-black/20 p-2 sm:p-3 space-y-2">
            {sortedMessages.map((message) => (
              (() => {
                const parsed = parseMessageWithCtas(message.text);
                return (
              <div
                key={message.id}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                  message.sender === 'mosha'
                    ? 'bg-primary/15 border border-primary/30 text-foreground'
                    : 'ml-auto bg-secondary/35 border border-border/40 text-foreground'
                }`}
              >
                <p className="text-[11px] text-muted-foreground mb-1">
                  {message.sender === 'mosha' ? 'Mo$ha' : 'You'}
                </p>
                <p className="whitespace-pre-line">{parsed.content}</p>
                {message.sender === 'mosha' && parsed.ctas.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {parsed.ctas.map((cta) => (
                      <Button
                        key={`${message.id}-${cta.label}-${cta.route}`}
                        type="button"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => openCtaRoute(cta.route)}
                      >
                        {cta.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
                );
              })()
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Mo$ha anything about $ongChainn..."
              className="h-10"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button type="button" className="h-10 px-4" onClick={() => void handleSend()} disabled={isSending || !draft.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </section>
        )}
      </main>

      <AudioPlayer />
    </div>
  );
}
