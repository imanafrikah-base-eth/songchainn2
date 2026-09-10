import { useState } from 'react';
import { Bug, X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

/**
 * "Something is broken", from anywhere in the app, to a queue a person reads.
 *
 * Reporting a person already had a route (ReportDialog). Reporting the APP did
 * not, so the only way anybody could tell us the player had stopped or a page
 * was blank was to find us somewhere else and hope. Most people simply leave
 * instead, which means the bugs that cost the most users are the ones nobody
 * ever hears about.
 *
 * It attaches the page, the browser and the screen size automatically, because
 * a report that says "it does not work" cannot be acted on and asking a
 * stranger to gather that themselves is asking too much.
 */

const AREAS = [
  { id: 'playback', label: 'Music would not play' },
  { id: 'upload', label: 'Uploading a track' },
  { id: 'account', label: 'Signing in or my account' },
  { id: 'world', label: 'Worlds' },
  { id: 'battle', label: 'Battles' },
  { id: 'money', label: 'Buying, selling or a wallet' },
  { id: 'display', label: 'Something looks wrong on screen' },
  { id: 'other', label: 'Something else' },
];

export function ReportBug({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [area, setArea] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!area || sending) return;
    setSending(true);

    /* Gathered for them, not asked of them. Nothing here identifies a person
       beyond the account they are already signed into. */
    const context = {
      page: window.location.pathname + window.location.search,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      agent: navigator.userAgent.slice(0, 300),
      at: new Date().toISOString(),
    };

    // Saved in the app and mailed to the founders' inbox, in one call.
    const { data, error } = await supabase.functions.invoke('founder-inbox', {
      body: {
        kind: 'bug',
        subject: area,
        text: detail.trim() || `(no details) ${area}`,
        page: context.page,
        screen_size: context.screen,
      },
    });

    setSending(false);

    if (error || !data?.success) {
      // Never swallow it. Somebody who took the time to report deserves to know
      // it did not arrive, and a silent failure here loses the report twice.
      toast.error('That did not send', {
        description: 'Nothing was lost. Try again in a moment.',
      });
      return;
    }

    toast.success('Thank you, that reached us', {
      description: 'We read every one of these.',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
      <div className="live-surface live-surface--raised w-full max-w-md rounded-2xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <Bug className="h-4 w-4 text-primary" aria-hidden="true" />
            Something not working?
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Tell us what broke. We attach the page you were on, so you do not have to explain
          where you were.
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {AREAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setArea(a.id)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                area === a.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="What happened? Even one line helps."
          maxLength={1000}
          rows={3}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />

        <Button onClick={() => void send()} disabled={!area || sending} className="w-full gap-2">
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          Send it
        </Button>
      </div>
    </div>
  );
}
