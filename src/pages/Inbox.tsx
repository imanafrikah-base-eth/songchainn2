import { useEffect, useMemo, useState } from 'react';
import { Bot, Send } from 'lucide-react';
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

function isRelevantToMoshaReply(text: string) {
  const query = text.toLowerCase();
  return /(songchainn|wavewarz|battle|room|dj|shuffle|playlist|catalog|artist|how|help|feature|signup|login|about)/i.test(query);
}

function buildMoshaReply(text: string) {
  const query = text.toLowerCase();
  if (query.includes('wavewarz') || query.includes('battle')) {
    return 'WaveWarz Africa is $ongChainn BattleZone mode: live battles, fan voting, room energy, and results. Open /wavewarz-africa to start.';
  }
  if (query.includes('dj') || query.includes('shuffle')) {
    return 'DJ Shuffle can run Artist, All Songs, or Catalog shuffle. I can guide you to the best mode for your vibe.';
  }
  if (query.includes('room')) {
    return 'The Room is live community listening plus chat. Join it for shared discovery and real-time reactions.';
  }
  if (query.includes('phase') || query.includes('audience first')) {
    return '$ongChainn is in Phase One: Audience First. Your preferences and listening behavior shape discovery early.';
  }
  return 'Great question. Based on $ongChainn info, I can guide you through features, WaveWarz, DJ Shuffle, playlists, and next best actions.';
}

const SEED_TEXT =
  'Hey fam, Mo$ha here. Welcome to your $ongChainn message center. Ask me about WaveWarz, DJ Shuffle, rooms, catalogs, and what to do next.';

export default function Inbox() {
  const { user } = useAuth();
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

    if (!isRelevantToMoshaReply(userMessage.text)) {
      setIsSending(false);
      toast.message('Message sent. Mo$ha replies when context is relevant.');
      return;
    }

    window.setTimeout(() => {
      const reply: DirectMessage = {
        id: `${Date.now()}-mosha`,
        user_id: userId,
        sender: 'mosha',
        text: buildMoshaReply(userMessage.text),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      void persistMessage(reply);
      setIsSending(false);
    }, 700);
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
                <p>{message.text}</p>
              </div>
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
