import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ShieldAlert, Flag, Gavel, Scale, Lightbulb, Loader2, Check, X, ChevronDown, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { RULES } from '@/legal/policies';

/**
 * The console. Admin, built for a phone, never linked from anywhere public.
 *
 * The existing Admin page is a desktop table layout, which is no use standing
 * in a room somewhere with a phone. This is the same authority in a shape that
 * works one-handed: the queue on top, one tap to act, no horizontal scrolling
 * and no tiny targets.
 *
 * It is not secret, because a hidden URL is not security. It is unlinked, and
 * the actual protection is the admin row in user_roles plus row level security
 * on every table it touches. Somebody who finds the address and is not an admin
 * sees nothing and can do nothing.
 */

type Tab = 'reports' | 'actions' | 'appeals' | 'asks';

interface Counts {
  open_reports: number;
  urgent_reports: number;
  open_appeals: number;
  active_actions: number;
  feature_requests: number;
}

interface ReportRow {
  id: string;
  target_type: string;
  target_id: string | null;
  target_user: string | null;
  reason: string;
  detail: string | null;
  status: string;
  severity: string;
  created_at: string;
}

interface ActionRow {
  id: string;
  user_id: string;
  kind: string;
  reason: string;
  rule_key: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface AppealRow {
  id: string;
  action_id: string;
  user_id: string;
  statement: string;
  status: string;
  created_at: string;
}

const ACTION_KINDS = [
  { id: 'warning', label: 'Warn' },
  { id: 'mute', label: 'Mute' },
  { id: 'no_upload', label: 'No uploads' },
  { id: 'no_messaging', label: 'No messages' },
  { id: 'suspension', label: 'Suspend' },
  { id: 'ban', label: 'End account' },
];

export default function Console() {
  const { isAdmin, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('reports');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r, a, ap] = await Promise.all([
      supabase.rpc('moderation_queue_counts' as never),
      supabase
        .from('content_reports' as never)
        .select('id, target_type, target_id, target_user, reason, detail, status, severity, created_at')
        .in('status', ['open', 'reviewing'])
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('account_actions' as never)
        .select('id, user_id, kind, reason, rule_key, status, expires_at, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('account_appeals' as never)
        .select('id, action_id, user_id, statement, status, created_at')
        .in('status', ['open', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(60),
    ]);
    const cRow = ((c.data ?? []) as unknown as Counts[])[0];
    setCounts(cRow ?? null);
    setReports((r.data ?? []) as unknown as ReportRow[]);
    setActions((a.data ?? []) as unknown as ActionRow[]);
    setAppeals((ap.data ?? []) as unknown as AppealRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // A report that arrives while the phone is open should appear on the phone.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel('console-reports')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'content_reports' },
        (payload) => {
          const row = payload.new as { severity?: string; reason?: string };
          toast(row.severity === 'urgent' ? 'Urgent report' : 'New report', {
            description: row.reason ? `Reason: ${row.reason}` : undefined,
          });
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, load]);

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const act = async (report: ReportRow, kind: string) => {
    if (!report.target_user) {
      toast.error('No account attached to that report');
      return;
    }
    const rule = window.prompt('Which rule? (leave blank for none)\n' + RULES.map((r) => r.key).join(', '));
    const reason = window.prompt('What do they need to be told? They see this.');
    if (!reason) return;
    setBusy(report.id);
    const { error: aErr } = await supabase.from('account_actions' as never).insert({
      user_id: report.target_user,
      kind,
      reason,
      rule_key: rule || null,
      report_id: report.id,
    } as never);
    if (!aErr) {
      await supabase
        .from('content_reports' as never)
        .update({ status: 'actioned', handled_at: new Date().toISOString(), outcome_note: `${kind}: ${reason}` } as never)
        .eq('id', report.id);
      // They have to be told, or the appeal button is on a notice nobody saw.
      await supabase.from('notifications').insert({
        user_id: report.target_user,
        type: 'account_action',
        title: 'About your account',
        message: reason,
      });
    }
    setBusy(null);
    if (aErr) toast.error('Could not save that', { description: aErr.message });
    else toast.success('Done, and they have been told');
    void load();
  };

  const dismiss = async (report: ReportRow) => {
    setBusy(report.id);
    await supabase
      .from('content_reports' as never)
      .update({ status: 'dismissed', handled_at: new Date().toISOString() } as never)
      .eq('id', report.id);
    setBusy(null);
    void load();
  };

  const decideAppeal = async (appeal: AppealRow, uphold: boolean) => {
    const note = window.prompt(uphold ? 'Why it stands. They see this.' : 'Why you are lifting it. They see this.');
    if (!note) return;
    setBusy(appeal.id);
    await supabase
      .from('account_appeals' as never)
      .update({
        status: uphold ? 'upheld' : 'overturned',
        decided_at: new Date().toISOString(),
        decision_note: note,
      } as never)
      .eq('id', appeal.id);
    if (!uphold) {
      await supabase
        .from('account_actions' as never)
        .update({ status: 'lifted', lifted_at: new Date().toISOString(), lifted_reason: note } as never)
        .eq('id', appeal.action_id);
    }
    await supabase.from('notifications').insert({
      user_id: appeal.user_id,
      type: 'appeal_decided',
      title: uphold ? 'Your appeal was not upheld' : 'Your appeal was upheld',
      message: note,
    });
    setBusy(null);
    toast.success('Decided, and they have been told');
    void load();
  };

  const lift = async (action: ActionRow) => {
    const note = window.prompt('Why you are lifting it. They see this.');
    if (!note) return;
    setBusy(action.id);
    await supabase
      .from('account_actions' as never)
      .update({ status: 'lifted', lifted_at: new Date().toISOString(), lifted_reason: note } as never)
      .eq('id', action.id);
    await supabase.from('notifications').insert({
      user_id: action.user_id,
      type: 'account_action_lifted',
      title: 'That restriction is lifted',
      message: note,
    });
    setBusy(null);
    void load();
  };

  const TABS: { id: Tab; label: string; icon: typeof Flag; count?: number }[] = [
    { id: 'reports', label: 'Reports', icon: Flag, count: counts?.open_reports },
    { id: 'actions', label: 'In force', icon: Gavel, count: counts?.active_actions },
    { id: 'appeals', label: 'Appeals', icon: Scale, count: counts?.open_appeals },
    { id: 'asks', label: 'Asks', icon: Lightbulb, count: counts?.feature_requests },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <span className="flex-1 font-heading font-bold text-foreground">Console</span>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {counts && counts.urgent_reports > 0 && (
          <div className="bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">
            {counts.urgent_reports} urgent {counts.urgent_reports === 1 ? 'report' : 'reports'} waiting
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold ${
                    tab === t.id ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-3 py-3">
        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>}

        {!loading && tab === 'reports' && (
          <Section empty="Nothing waiting. That is the good outcome." rows={reports.length}>
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {r.severity === 'urgent' && (
                    <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                      URGENT
                    </span>
                  )}
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {r.reason}
                  </span>
                  <span className="text-[11px] text-muted-foreground">on a {r.target_type}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                {r.detail && <p className="text-sm text-foreground">{r.detail}</p>}

                <button
                  type="button"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  Act on it <ChevronDown className="h-3 w-3" />
                </button>

                {expanded === r.id && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ACTION_KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => void act(r, k.id)}
                        className="h-9 rounded-full border border-border px-3 text-xs text-foreground disabled:opacity-40"
                      >
                        {k.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => void dismiss(r)}
                      className="flex h-9 items-center gap-1 rounded-full border border-border px-3 text-xs text-muted-foreground"
                    >
                      {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      Nothing wrong
                    </button>
                  </div>
                )}
              </li>
            ))}
          </Section>
        )}

        {!loading && tab === 'actions' && (
          <Section empty="Nothing in force." rows={actions.length}>
            {actions.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-card p-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-500">
                    {a.kind}
                  </span>
                  {a.rule_key && (
                    <span className="text-[11px] text-muted-foreground">{a.rule_key}</span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {a.expires_at ? `until ${new Date(a.expires_at).toLocaleDateString()}` : 'no end date'}
                  </span>
                </div>
                <p className="text-sm text-foreground">{a.reason}</p>
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => void lift(a)}
                  className="mt-2 flex h-9 items-center gap-1 rounded-full border border-border px-3 text-xs text-foreground"
                >
                  {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Lift it
                </button>
              </li>
            ))}
          </Section>
        )}

        {!loading && tab === 'appeals' && (
          <Section empty="No appeals waiting." rows={appeals.length}>
            {appeals.map((ap) => (
              <li key={ap.id} className="rounded-xl border border-border bg-card p-3">
                <p className="mb-2 text-sm text-foreground">{ap.statement}</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy === ap.id}
                    onClick={() => void decideAppeal(ap, false)}
                    className="h-9 flex-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    They were right, lift it
                  </button>
                  <button
                    type="button"
                    disabled={busy === ap.id}
                    onClick={() => void decideAppeal(ap, true)}
                    className="h-9 flex-1 rounded-full border border-border px-3 text-xs text-foreground"
                  >
                    It stands
                  </button>
                </div>
              </li>
            ))}
          </Section>
        )}

        {!loading && tab === 'asks' && (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {counts?.feature_requests ?? 0} feature request
            {(counts?.feature_requests ?? 0) === 1 ? '' : 's'} waiting. They have longer answers than
            a phone screen wants, so they live in Admin &rarr; Asked for.
          </p>
        )}
      </main>
    </div>
  );
}

function Section({
  rows,
  empty,
  children,
}: {
  rows: number;
  empty: string;
  children: React.ReactNode;
}) {
  if (rows === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return <ul className="space-y-2">{children}</ul>;
}
