import { useState } from 'react';
import { Flag, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

/**
 * Report something, to a queue a person actually reads.
 *
 * The old message report wrote to a table with a handled_at column nothing ever
 * set, so the app promised a review that could not happen. This writes to
 * content_reports, which the moderation screen reads, and the wording here does
 * not promise a timescale we cannot keep.
 *
 * The reasons are a fixed list on purpose. Free text alone means every report
 * has to be read from scratch before it can even be sorted, and the urgent ones
 * get lost behind the petty ones.
 */

export type ReportTarget = 'post' | 'comment' | 'message' | 'media' | 'profile' | 'world' | 'song' | 'other';

const REASONS: { id: string; label: string; urgent?: boolean }[] = [
  { id: 'child_safety', label: 'Involves a child', urgent: true },
  { id: 'violence', label: 'Threat or violence', urgent: true },
  { id: 'self_harm', label: 'Someone may be at risk', urgent: true },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'scam', label: 'Scam or misleading claims' },
  { id: 'copyright', label: 'Not theirs to post' },
  { id: 'impersonation', label: 'Pretending to be someone' },
  { id: 'spam', label: 'Spam' },
  { id: 'illegal', label: 'Illegal' },
  { id: 'other', label: 'Something else' },
];

interface Props {
  targetType: ReportTarget;
  targetId?: string | null;
  targetUser?: string | null;
  onClose: () => void;
}

export function ReportDialog({ targetType, targetId, targetUser, onClose }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!reason || !user) return;
    setSending(true);
    const urgent = REASONS.find((r) => r.id === reason)?.urgent;
    const { error } = await supabase.from('content_reports' as never).insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId ?? null,
      target_user: targetUser ?? null,
      reason,
      detail: detail.trim() || null,
      severity: urgent ? 'urgent' : 'normal',
    } as never);
    setSending(false);
    if (error) {
      toast.error('Could not send that report', { description: error.message });
      return;
    }
    toast.success('Reported', {
      description: 'A real person reads every report. You can see what you reported in your settings.',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Flag className="h-4 w-4 text-primary" />
          <span className="flex-1 text-sm font-semibold text-foreground">Report this</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto px-3 py-3">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReason(r.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                reason === r.id
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-foreground hover:border-primary/40'
              }`}
            >
              <span className="flex-1">{r.label}</span>
              {r.urgent && (
                <span className="rounded-full border border-destructive/40 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  urgent
                </span>
              )}
            </button>
          ))}

          {reason && (
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, 1000))}
              placeholder="Anything that would help us understand it (optional)"
              className="mt-2 min-h-[80px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <Button onClick={() => void send()} disabled={!reason || sending} className="h-11 w-full">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send report'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Reporting is not a vote. One report on something serious is enough, and reporting
            things falsely to get at somebody is itself a breach.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The small flag that opens it. Drop beside anything reportable. */
export function ReportButton(props: Omit<Props, 'onClose'> & { className?: string }) {
  const [open, setOpen] = useState(false);
  const { className, ...rest } = props;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report this"
        className={className ?? 'text-muted-foreground hover:text-foreground'}
      >
        <Flag className="h-4 w-4" />
      </button>
      {open && <ReportDialog {...rest} onClose={() => setOpen(false)} />}
    </>
  );
}
