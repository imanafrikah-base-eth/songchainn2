import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

/**
 * What happened to your account, and how to argue with it.
 *
 * An enforcement nobody can see is indistinguishable from the app being broken:
 * a muted person just finds their posts vanish and concludes it is a bug. So
 * every active action shows here, in plain words, with the rule named and an
 * appeal attached.
 *
 * "You violated our policies" is not an explanation. The reason written in the
 * console is the reason shown here, which is also what keeps whoever is holding
 * the console honest about writing a real one.
 */

interface ActiveAction {
  id: string;
  kind: string;
  reason: string;
  rule_key: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Appeal {
  id: string;
  action_id: string;
  status: string;
  decision_note: string | null;
}

const KIND_LABEL: Record<string, string> = {
  warning: 'A warning',
  mute: 'You cannot post right now',
  no_upload: 'You cannot upload right now',
  no_messaging: 'You cannot send messages right now',
  suspension: 'Your account is suspended',
  ban: 'Your account has been closed',
};

export function AccountNotice() {
  const { user } = useAuth();
  const [actions, setActions] = useState<ActiveAction[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [writing, setWriting] = useState<string | null>(null);
  const [statement, setStatement] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const [{ data: a }, { data: ap }] = await Promise.all([
        supabase
          .from('account_actions' as never)
          .select('id, kind, reason, rule_key, expires_at, created_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('account_appeals' as never)
          .select('id, action_id, status, decision_note')
          .eq('user_id', user.id),
      ]);
      if (cancelled) return;
      setActions((a ?? []) as unknown as ActiveAction[]);
      setAppeals((ap ?? []) as unknown as Appeal[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!actions.length) return null;

  const appealFor = (actionId: string) => appeals.find((x) => x.action_id === actionId);

  const submitAppeal = async (actionId: string) => {
    if (!user || statement.trim().length < 10) {
      toast.error('Tell us what you think happened');
      return;
    }
    setSending(true);
    const { error } = await supabase.from('account_appeals' as never).insert({
      action_id: actionId,
      user_id: user.id,
      statement: statement.trim(),
    } as never);
    setSending(false);
    if (error) {
      toast.error('Could not send that', { description: error.message });
      return;
    }
    setAppeals((a) => [...a, { id: 'new', action_id: actionId, status: 'open', decision_note: null }]);
    setWriting(null);
    setStatement('');
    toast.success('Appeal sent', { description: 'A person reads it.' });
  };

  return (
    <div className="space-y-3">
      {actions.map((a) => {
        const appeal = appealFor(a.id);
        return (
          <div key={a.id} className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {KIND_LABEL[a.kind] ?? 'Something changed on your account'}
                </p>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">{a.reason}</p>

                {a.rule_key && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Rule:{' '}
                    <Link to="/guidelines" className="text-primary underline-offset-2 hover:underline">
                      {a.rule_key.replace(/_/g, ' ')}
                    </Link>
                  </p>
                )}
                {a.expires_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Until {new Date(a.expires_at).toLocaleDateString()}
                  </p>
                )}

                {appeal ? (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Scale className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {appeal.status === 'open' || appeal.status === 'reviewing'
                        ? 'You appealed this. Somebody is reading it.'
                        : appeal.status === 'overturned'
                          ? `Appeal upheld. ${appeal.decision_note ?? ''}`
                          : `Appeal not upheld. ${appeal.decision_note ?? ''}`}
                    </span>
                  </p>
                ) : writing === a.id ? (
                  <div className="mt-3">
                    <textarea
                      value={statement}
                      onChange={(e) => setStatement(e.target.value.slice(0, 2000))}
                      placeholder="What do you think happened?"
                      className="min-h-[90px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={sending} onClick={() => void submitAppeal(a.id)}>
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send appeal'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setWriting(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setWriting(a.id)}
                    className="mt-3 text-sm font-semibold text-primary"
                  >
                    I think this is wrong
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
