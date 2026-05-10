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
  user_id: string | null;
  sender: 'mosha' | 'user';
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
  return /(songchainn|wavewarz|battle|room|dj|shuffle|playlist|catalog|artist|how|help|feature|signup|login|about)/i.test(query);
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
    return 'WaveWarz Africa battles run on WaveWarz.com. In $ongChainn you can register your music and/or country. Open /wavewarz-africa in SongChainn for the registration side.';
  }
  if (contextualQuery.includes('dj') || contextualQuery.includes('shuffle')) {
    return 'DJ Shuffle can run Artist, All Songs, or Catalog shuffle. I can guide you to the best mode for your vibe.';
  }
  if (contextualQuery.includes('room')) {
    return 'The Room is live community listening plus chat. Join it for shared discovery and real-time reactions.';
  }
  if (query.includes('phase') || query.includes('audience first')) {
    return '$ongChainn is in Phase One: Audience First. Your preferences and listening behavior shape discovery early.';
  }
  if (contextualQuery.includes('playlist') || contextualQuery.includes('catalog')) {
    return 'For follow-up discovery, start from your favorite catalog, then branch by artist and room reactions to find the next best songs.';
  }
  return 'I got your follow-up. Based on this conversation, I can help with feed sharing, rooms, WaveWarz, DJ Shuffle, playlists, or profile growth next.';
}

const SEED_TEXT =
  'Hey fam, Mo$ha here. Welcome to your $ongChainn message center. WaveWarz Africa battles run on WaveWarz.com. In $ongChainn you can register your music and/or country.';

export default function Inbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  const userId = user?.id || null;

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from('direct_messages')
        .select('id,user_id,sender,text,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(120);
      if (!active) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setMessages([
          {
            id: 'seed-mosha',
            user_id: userId,
            sender: 'mosha',
            text: SEED_TEXT,
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }
      setMessages(data as DirectMessage[]);
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

  const persistMessage = async (message: DirectMessage) => {
    const { error } = await (supabase as any).from('direct_messages').insert(message);
    if (error) {
      void 0;
    }
  };

  const handleSend = async () => {
    if (!draft.trim() || isSending) return;
    setIsSending(true);
    const userMessage: DirectMessage = {
      id: `${Date.now()}-user`,
      user_id: userId,
      sender: 'user',
      text: draft.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    void persistMessage(userMessage);
    setDraft('');

    const conversation = [...sortedMessages, userMessage];
    const shouldReply = isRelevantToMoshaReply(userMessage.text) || isFollowUpMessage(userMessage.text) || conversation.length <= 3;

    if (!shouldReply) {
      setIsSending(false);
      toast.message('Message sent.');
      return;
    }

    const replyDelay = 650 + Math.floor(Math.random() * 700);
    window.setTimeout(() => {
      const reply: DirectMessage = {
        id: `${Date.now()}-mosha`,
        user_id: userId,
        sender: 'mosha',
        text: buildMoshaReply(userMessage.text, conversation),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      void persistMessage(reply);
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

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 relative z-10">
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
