import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { RELEASE_KIND_LABEL, useArtistReleaseGroups, useReleaseGroupActions, type ReleaseKind } from '@/hooks/useReleases';

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60';
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

/**
 * Which EP or album a track sits on, and where. A new release is made right
 * here, so an artist never has to leave the form to build one.
 */
export function ReleasePicker({
  artistId,
  releaseId,
  trackNumber,
  onChange,
  disabled = false,
  hideTrackNumber = false,
}: {
  artistId: string | null | undefined;
  releaseId: string | null;
  trackNumber: number | null;
  onChange: (next: { release_id: string | null; track_number: number | null }) => void;
  disabled?: boolean;
  /** A batch numbers its tracks on each row instead. */
  hideTrackNumber?: boolean;
}) {
  const { data: releases = [] } = useArtistReleaseGroups(artistId);
  const { createRelease } = useReleaseGroupActions(artistId);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ReleaseKind>('ep');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  if (!artistId) return null;

  const create = async () => {
    setSaving(true);
    try {
      const made = await createRelease({ title, kind, release_date: date || null });
      onChange({ release_id: made.id, track_number: trackNumber ?? 1 });
      setCreating(false);
      setTitle('');
      setDate('');
      toast('Release made', { description: `${made.title} is ready. Add tracks to it any time.` });
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not make that release.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`${label} mb-0`}>Part of an EP or album</span>
        {!creating && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> New release
          </button>
        )}
      </div>

      {creating ? (
        <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_10rem_auto]">
          <input value={title} disabled={saving} maxLength={120} placeholder="Release title" onChange={(e) => setTitle(e.target.value)} className={input} />
          <select value={kind} disabled={saving} onChange={(e) => setKind(e.target.value as ReleaseKind)} className={input}>
            {(Object.keys(RELEASE_KIND_LABEL) as ReleaseKind[]).map((k) => (
              <option key={k} value={k}>{RELEASE_KIND_LABEL[k]}</option>
            ))}
          </select>
          <input type="date" value={date} disabled={saving} onChange={(e) => setDate(e.target.value)} className={input} aria-label="Release date" />
          <div className="flex gap-2">
            <button type="button" disabled={saving || !title.trim()} onClick={create} className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? 'Saving' : 'Make it'}
            </button>
            <button type="button" disabled={saving} onClick={() => setCreating(false)} className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={hideTrackNumber ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-[minmax(0,1fr)_6rem] gap-2'}>
          <select
            value={releaseId ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ release_id: e.target.value || null, track_number: e.target.value ? (trackNumber ?? 1) : null })}
            className={input}
          >
            <option value="">Single, on its own</option>
            {releases.map((r) => (
              <option key={r.id} value={r.id}>{r.title} ({RELEASE_KIND_LABEL[r.kind] ?? r.kind})</option>
            ))}
          </select>
          {!hideTrackNumber && <input
            type="number"
            min={1}
            max={99}
            value={releaseId ? (trackNumber ?? '') : ''}
            disabled={disabled || !releaseId}
            placeholder="Track"
            aria-label="Track number"
            onChange={(e) => onChange({ release_id: releaseId, track_number: e.target.value ? Number(e.target.value) : null })}
            className={`${input} tabular-nums`}
          />}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        {hideTrackNumber ? 'Tracks on the same release show together on your page, in the order numbered above.' : 'Tracks on the same release show together on your page, in track order.'}
      </p>
    </div>
  );
}
