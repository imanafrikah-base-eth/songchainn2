import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SongDetailsFields } from '@/components/studio/SongDetailsFields';
import { GENRES } from '@/data/musicData';
import { EMPTY_DETAILS, detailProblems, saveSongCore, saveSongDetails, useSongDetails, type SongDetails } from '@/lib/songDetails';

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60';
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

/** Edit a released record: its name, its genre, and every detail. Any time. */
export function SongDetailsDialog({
  songId,
  title,
  genre = null,
  artistId = null,
  open,
  onOpenChange,
}: {
  songId: string;
  title: string;
  genre?: string | null;
  artistId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useSongDetails(open ? songId : undefined);
  const [draft, setDraft] = useState<SongDetails>(EMPTY_DETAILS);
  const [titleDraft, setTitleDraft] = useState(title);
  const [genreDraft, setGenreDraft] = useState(genre ?? '');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  useEffect(() => {
    if (open) {
      setTitleDraft(title);
      setGenreDraft(genre ?? '');
    }
  }, [open, title, genre]);

  const problems = detailProblems(draft);
  if (!titleDraft.trim()) problems.unshift('A record needs a title.');

  const save = async () => {
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setSaving(true);
    try {
      if (titleDraft.trim() !== title || (genreDraft || null) !== (genre || null)) {
        await saveSongCore(songId, { title: titleDraft, genre: genreDraft || null });
      }
      await saveSongDetails(songId, draft);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['song-details', songId] }),
        queryClient.invalidateQueries({ queryKey: ['artist_releases'] }),
        queryClient.invalidateQueries({ queryKey: ['published-catalog'] }),
      ]);
      toast('Saved', { description: `${titleDraft.trim()} is up to date.` });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Name, genre, lyrics, credits and the record's paperwork. Change anything, any time.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Title</span>
                <input value={titleDraft} disabled={saving} maxLength={120} onChange={(e) => setTitleDraft(e.target.value)} className={input} />
              </label>
              <label className="block">
                <span className={label}>Genre</span>
                <select value={genreDraft} disabled={saving} onChange={(e) => setGenreDraft(e.target.value)} className={input}>
                  <option value="">Not set</option>
                  {[...new Set([genreDraft, ...GENRES].filter(Boolean))].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>
            <SongDetailsFields value={draft} onChange={setDraft} disabled={saving} artistId={artistId} />
          </div>
        )}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-destructive">{problems[0] ?? ''}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={saving || isLoading || problems.length > 0} onClick={save}>
              {saving ? 'Saving' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
