import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, ExternalLink, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * What artists asked Mo$ha for and the app could not do.
 *
 * Mo$ha tells an artist "I will pass it on", so somebody has to actually read
 * these. That is this screen. Without it the promise is a shrug with extra
 * steps, which is exactly the kind of quiet dead end the review kept finding.
 *
 * Each row carries the world and the build step they were on, so a request
 * reads as a situation rather than a wish.
 */

interface Row {
  id: string;
  user_id: string;
  world_slug: string | null;
  build_step: string | null;
  request: string;
  asked_as: string | null;
  status: string;
  reply: string | null;
  pr_url: string | null;
  created_at: string;
}

const STATUSES = ['new', 'reading', 'planned', 'building', 'shipped', 'declined'] as const;

const STATUS_STYLE: Record<string, string> = {
  new: 'border-primary/40 bg-primary/10 text-primary',
  reading: 'border-border text-muted-foreground',
  planned: 'border-sky-500/30 bg-sky-500/10 text-sky-500',
  building: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  shipped: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  declined: 'border-border text-muted-foreground',
};

export function FeatureRequestsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { reply: string; pr_url: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('world_feature_requests' as never)
      .select('id, user_id, world_slug, build_step, request, asked_as, status, reply, pr_url, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      toast.error('Could not load the requests', { description: error.message });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as Row[];
    setRows(list);
    setDrafts(
      Object.fromEntries(list.map((r) => [r.id, { reply: r.reply ?? '', pr_url: r.pr_url ?? '' }])),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (row: Row, patch: Partial<Row>) => {
    setSaving(row.id);
    const { data, error } = await supabase
      .from('world_feature_requests' as never)
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq('id', row.id)
      .select('id');
    setSaving(null);
    if (error) {
      toast.error('Could not save', { description: error.message });
      return;
    }
    // A refused row level security update returns no error, it matches nothing.
    if (!data || (data as unknown[]).length === 0) {
      toast.error('That did not save', { description: 'Your account cannot answer requests.' });
      return;
    }
    toast.success('Saved');
    void load();
  };

  const open = rows.filter((r) => r.status === 'new').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
          <Lightbulb className="h-5 w-5 text-primary" />
          Asked for, not built
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Things artists wanted while building a world that the app could not do. Mo$ha told them it
          would be passed on, so these need answering. A link to the pull request is the answer that
          means the most.
        </p>
      </div>

      {open > 0 && (
        <span className="inline-block rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm text-primary">
          <b>{open}</b> unread
        </span>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing asked for yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    STATUS_STYLE[r.status] ?? 'border-border text-muted-foreground'
                  }`}
                >
                  {r.status}
                </span>
                {r.world_slug && (
                  <span className="font-mono text-xs text-muted-foreground">/{r.world_slug}</span>
                )}
                {r.build_step && (
                  <span className="text-xs text-muted-foreground">on the {r.build_step} step</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>

              <p className="max-w-prose text-sm text-foreground">{r.request}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void save(r, { status: s })}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      r.status === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-3 space-y-2">
                <input
                  value={drafts[r.id]?.pr_url ?? ''}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [r.id]: { ...d[r.id], pr_url: e.target.value } }))
                  }
                  placeholder="Pull request link"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus:border-primary"
                />
                <textarea
                  value={drafts[r.id]?.reply ?? ''}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [r.id]: { ...d[r.id], reply: e.target.value } }))
                  }
                  placeholder="What you want them to know. They see this."
                  className="min-h-[64px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={saving === r.id}
                    onClick={() =>
                      void save(r, {
                        reply: drafts[r.id]?.reply?.trim() || null,
                        pr_url: drafts[r.id]?.pr_url?.trim() || null,
                      })
                    }
                    className="h-9 gap-1"
                  >
                    {saving === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                  {r.pr_url && (
                    <a
                      href={r.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Open PR <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
