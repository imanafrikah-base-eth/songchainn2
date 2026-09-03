import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SongDetailsFields } from '@/components/studio/SongDetailsFields';
import { EMPTY_DETAILS, saveSongDetails, useSongDetails, type SongDetails } from '@/lib/songDetails';

/** Edit a released record's details, any time, from the catalog. */
export function SongDetailsDialog({
  songId,
  title,
  open,
  onOpenChange,
}: {
  songId: string;
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useSongDetails(open ? songId : undefined);
  const [draft, setDraft] = useState<SongDetails>(EMPTY_DETAILS);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await saveSongDetails(songId, draft);
      await queryClient.invalidateQueries({ queryKey: ['song-details', songId] });
      toast('Saved', { description: `${title} is up to date.` });
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
          <DialogDescription>Lyrics, credits and the record's paperwork. Change anything, any time.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
        ) : (
          <SongDetailsFields value={draft} onChange={setDraft} disabled={saving} />
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving || isLoading} onClick={save}>
            {saving ? 'Saving' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
