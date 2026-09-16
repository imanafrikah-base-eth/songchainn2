import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

/**
 * The music an artist keeps inside their own world, and what the rest of
 * SONGCHAINN is allowed to see of it.
 *
 * Two decisions per project, both the artist's: whether the drop stands on the
 * front page for its fortnight, and the line people read on the card. The line
 * has a limit because a card is a card: past this it stops being a hook and
 * starts being a paragraph nobody reads.
 */

/** What fits on a card in two lines without crowding it. */
export const BLURB_MAX = 140;

interface TrackRow {
  id: string;
  title: string;
  part_label: string | null;
  release_slug: string | null;
  release_title: string | null;
  blurb: string | null;
  show_on_home: boolean;
  unlock_usd: number;
  published_at: string | null;
}

interface Project {
  key: string;
  title: string;
  ids: string[];
  songs: number;
  blurb: string;
  showOnHome: boolean;
  unlockUsd: number;
}

export function WorldMusicPanel({ worldSlug }: { worldSlug: string }) {
  const [rows, setRows] = useState<TrackRow[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { blurb: string; unlockUsd: string }>>({});

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('world_tracks')
      .select('id, title, part_label, release_slug, release_title, blurb, show_on_home, unlock_usd, published_at')
      .eq('world_slug', worldSlug)
      .order('sort_order', { ascending: true });
    setRows(((data as TrackRow[]) ?? []));
  }, [worldSlug]);

  useEffect(() => { void load(); }, [load]);

  const projects = useMemo<Project[]>(() => {
    const byRelease = new Map<string, Project>();
    for (const row of rows ?? []) {
      const key = row.release_slug ?? row.id;
      const existing = byRelease.get(key);
      if (!existing) {
        byRelease.set(key, {
          key,
          title: row.release_title ?? [row.title, row.part_label].filter(Boolean).join(', '),
          ids: [row.id],
          songs: 1,
          blurb: row.blurb ?? '',
          showOnHome: row.show_on_home !== false,
          unlockUsd: Number(row.unlock_usd ?? 1),
        });
        continue;
      }
      existing.ids.push(row.id);
      existing.songs += 1;
      if (!existing.blurb && row.blurb) existing.blurb = row.blurb;
    }
    return [...byRelease.values()];
  }, [rows]);

  const write = useCallback(async (project: Project, patch: Record<string, unknown>) => {
    setSaving(project.key);
    const { error } = await (supabase as any)
      .from('world_tracks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .in('id', project.ids);
    setSaving(null);
    if (error) {
      toast.error('That did not save', { description: error.message });
      return;
    }
    await load();
    toast.success('Saved');
  }, [load]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading your world's music
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No music in this world yet.</p>
        <p className="mt-1">
          Music you keep in here plays for the people holding enough of your coin, and everybody
          else sees the preview you cut for it. Send us the record and the preview and it lands here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((project) => {
        const draft = drafts[project.key] ?? { blurb: project.blurb, unlockUsd: String(project.unlockUsd) };
        const left = BLURB_MAX - draft.blurb.length;
        const busy = saving === project.key;
        return (
          <div key={project.key} className="space-y-3 rounded-2xl border border-border bg-card/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-medium text-foreground">{project.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {project.songs === 1 ? '1 song' : `${project.songs} songs`} · locked to holders
                </p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={project.showOnHome}
                  onChange={(e) => void write(project, { show_on_home: e.target.checked })}
                />
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  Show on Home
                </span>
              </label>
            </div>

            {/* The line only matters when the drop is on the front page, so it
                appears when the toggle does something. */}
            {project.showOnHome && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`blurb-${project.key}`} className="text-xs font-medium text-foreground">
                    What this project is, in your words
                  </label>
                  <span className={`text-[11px] ${left < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {left} left
                  </span>
                </div>
                <Textarea
                  id={`blurb-${project.key}`}
                  value={draft.blurb}
                  maxLength={BLURB_MAX}
                  rows={2}
                  placeholder="Two young boys, two timelines, both village kids."
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [project.key]: { ...draft, blurb: e.target.value } }))
                  }
                  className="resize-none text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  A line, not a paragraph. It sits under the name on the card people see on Home.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32">
                <label htmlFor={`price-${project.key}`} className="mb-1 block text-xs font-medium text-foreground">
                  Holders pay
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id={`price-${project.key}`}
                    inputMode="decimal"
                    value={draft.unlockUsd}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [project.key]: { ...draft, unlockUsd: e.target.value } }))
                    }
                    className="pl-6"
                  />
                </div>
              </div>
              <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                <Lock className="mr-1 inline h-3 w-3" />
                What somebody must hold of your coin to play it, priced when they tap play.
              </p>
              <Button
                type="button"
                disabled={busy || draft.blurb.length > BLURB_MAX}
                onClick={() => {
                  const price = Number(draft.unlockUsd);
                  if (!Number.isFinite(price) || price < 0) {
                    toast.error('Give a price in dollars, such as 1 or 2.50');
                    return;
                  }
                  void write(project, { blurb: draft.blurb.trim() || null, unlock_usd: price });
                }}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default WorldMusicPanel;
