import { useEffect, useMemo, useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

function isRelevantToMoshaReply(text: string) {
  const query = text.toLowerCase();
  return /(songchainn|wavewarz|battle|room|dj|shuffle|playlist|catalog|artist|how|help|feature|signup|login|about|marketplace|coin|token|zora|buy|sell|trade|phase)/i.test(query);
}

function isFollowUpMessage(text: string) {
  const query = text.toLowerCase().trim();
  return /^(and|also|what about|why|how|then|ok|so|that|it|this|they)\b/.test(query) || query.length <= 14;
}

function buildMoshaReply(text: string, history: DirectMessage[]) {
  const query = text.toLowerCase();
  const recentUserText = history
    .filter((m) => m.sender === 'user')
    .slice(-4)
    .map((m) => m.text.toLowerCase())
    .join(' ');
  const contextualQuery = `${recentUserText} ${query}`;

  if ((query.includes('share') || query.includes('post')) && contextualQuery.includes('song')) {
    return 'To share a song to feed: open a song card, tap share to feed, then post. If it fails, refresh feed once and try again while signed in.';
  }
  if (query.includes('wavewarz') || query.includes('battle')) {
    return 'WaveWarz Africa battles run right here in $ongChainn now: watch live, vote each round, and request to speak in the room. You can also host your own battle or register your music and country for rollout.\nCTA::Watch Live Battles::/wavewarz-africa/battles/live';
  }
  if (contextualQuery.includes('dj') || contextualQuery.includes('shuffle')) {
    return 'DJ Shuffle can run Artist, All Songs, or Catalog shuffle. I can guide you to the best mode for your vibe.';
  }
  if (contextualQuery.includes('room')) {
    return 'The Room is live community listening plus chat. Join it for shared discovery and real-time reactions.';
  }
  if (
    contextualQuery.includes('marketplace') ||
    contextualQuery.includes('coin') ||
    contextualQuery.includes('token') ||
    contextualQuery.includes('zora') ||
    ((contextualQuery.includes('buy') || contextualQuery.includes('sell') || contextualQuery.includes('trade') || contextualQuery.includes('own')) && contextualQuery.includes('song'))
  ) {
    return 'That is Phase Two: The Music Marketplace. Real songs are now tradeable coins on Base -- buy in to support an artist, or sell back for ETH anytime. Open the Marketplace to try it.\nCTA::Explore Marketplace::/marketplace';
  }
  if (query.includes('phase') || query.includes('audience first') || query.includes('phase two') || query.includes('phase 2')) {
    return '$ongChainn started with Phase One: Audience First -- your preferences and listening behavior shaped discovery. We are now live in Phase Two: The Music Marketplace, where songs are real tradeable coins on Base.\nCTA::Explore Marketplace::/marketplace';
  }
  if (contextualQuery.includes('playlist') || contextualQuery.includes('catalog')) {
    return 'For follow-up discovery, start from your favorite catalog, then branch by artist and room reactions to find the next best songs.';
  }
  return 'I got your follow-up. Based on this conversation, I can help with feed sharing, rooms, WaveWarz, DJ Shuffle, playlists, or profile growth next.';
}

const SEED_TEXT =
  'Hey fam, Mo$ha here. Welcome to your $ongChainn message center. WaveWarz Africa battles now run right here in $ongChainn -- watch live, vote, and speak in the room. Also -- Phase Two just launched: the Music Marketplace, where songs are real tradeable coins on Base. Ask me about either anytime.';

export default function Inbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

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

    const conversation = [...sortedMessages, userMessage];
    const shouldReply = isRelevantToMoshaReply(userMessage.text) || isFollowUpMessage(userMessage.text) || conversation.length <= 3;

    if (!shouldReply) {
      setIsSending(false);
      toast.message('Message sent.');
      return;
    }

    const replyDelay = 650 + Math.floor(Math.random() * 700);
    window.setTimeout(async () => {
      const replyText = buildMoshaReply(userMessage.text, conversation);
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
    }, replyDelay);
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
        <section className="rounded-2xl border border-border/50 bg-background/85 backdrop-blur p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-primary" />
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">$ongChainn Direct Message Center</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mb-4">
            Mo$ha inbox only. Ask $ongChainn-related questions for smart replies.
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
      </main>

      <AudioPlayer />
    </div>
  );
}
