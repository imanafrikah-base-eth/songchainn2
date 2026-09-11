import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SongDetailsFields } from '@/components/studio/SongDetailsFields';
import { GENRES } from '@/data/musicData';
import { EMPTY_DETAILS, detailProblems, saveSongCore, saveSongDetails, useSongDetails, type SongDetails } from '@/lib/songDetails';
import { checkCover, COVER_ACCEPT, landCover, type CoverCheck } from '@/lib/coverArt';
import { CoverCropDialog, prepareCover } from '@/components/studio/CoverCrop';

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60';
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

/** Edit a released record: its name, its genre, its artwork, and every detail. Any time. */
export function SongDetailsDialog({
  songId,
  title,
  genre = null,
  artistId = null,
  coverUrl = null,
  open,
  onOpenChange,
  onSaved,
}: {
  songId: string;
  title: string;
  genre?: string | null;
  artistId?: string | null;
  /** The artwork it has now. Replaced from here; never removed from a live record. */
  coverUrl?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called once a save lands, e.g. to send a record that was waiting on its cover to the judges. */
  onSaved?: () => void;
}) {
  const { data, isLoading } = useSongDetails(open ? songId : undefined);
  const [draft, setDraft] = useState<SongDetails>(EMPTY_DETAILS);
  const [titleDraft, setTitleDraft] = useState(title);
  const [genreDraft, setGenreDraft] = useState(genre ?? '');
  const [saving, setSaving] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverCheck, setCoverCheck] = useState<CoverCheck>({ block: null, warn: null });
  const [coverPct, setCoverPct] = useState<number | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const acceptCover = (f: File | null) => {
    setCoverFile(f);
    setCoverCheck({ block: null, warn: null });
    if (f) void checkCover(f).then(setCoverCheck);
    setCoverPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  // Any photo: one that is not square opens the square window first, and a
  // square one comes back already made small.
  const pickCover = async (f: File | null) => {
    if (!f) return acceptCover(null);
    const prepared = await prepareCover(f);
    if (prepared.needsCrop) setCropping(f);
    else acceptCover(prepared.file);
  };

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  useEffect(() => {
    if (open) {
      setTitleDraft(title);
      setGenreDraft(genre ?? '');
    } else {
      setCoverFile(null);
      setCoverCheck({ block: null, warn: null });
      setCoverPct(null);
      setCoverPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    }
  }, [open, title, genre]);

  const problems = detailProblems(draft);
  if (!titleDraft.trim()) problems.unshift('A record needs a title.');
  if (coverCheck.block) problems.unshift(coverCheck.block);

  const save = async () => {
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setSaving(true);
    try {
      let newCover: string | null = null;
      if (coverFile) {
        setCoverPct(0);
        newCover = await landCover(coverFile, setCoverPct);
      }
      if (newCover || titleDraft.trim() !== title || (genreDraft || null) !== (genre || null)) {
        await saveSongCore(songId, { title: titleDraft, genre: genreDraft || null, cover_art_url: newCover });
      }
      await saveSongDetails(songId, draft);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['song-details', songId] }),
        queryClient.invalidateQueries({ queryKey: ['artist_releases'] }),
        queryClient.invalidateQueries({ queryKey: ['published-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['release-groups'] }),
      ]);
      toast('Saved', { description: `${titleDraft.trim()} is up to date.` });
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
      setCoverPct(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <CoverCropDialog file={cropping} onCancel={() => setCropping(null)} onDone={(f) => { setCropping(null); acceptCover(f); }} />
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Artwork, name, genre, lyrics, credits and the record's paperwork. Change anything, any time.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                {coverPreview || coverUrl
                  ? <img src={coverPreview || coverUrl || ''} alt="" className="h-full w-full object-cover" />
                  : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
              </div>
              <label className="block min-w-0 flex-1">
                <span className={label}>Artwork</span>
                <input
                  type="file"
                  accept={COVER_ACCEPT}
                  disabled={saving}
                  onChange={(e) => { void pickCover(e.target.files?.[0] ?? null); e.target.value = ''; }}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-foreground"
                />
                <p className={`mt-1 text-xs ${coverCheck.block ? 'text-destructive' : coverCheck.warn ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {coverPct !== null
                    ? `Sending the artwork, ${coverPct}%`
                    : coverCheck.block ?? coverCheck.warn ?? (coverUrl ? 'Any JPG, PNG or WEBP photo, made square here. Replace it any time.' : 'Any JPG, PNG or WEBP photo, made square here. Nothing goes live without it.')}
                </p>
              </label>
            </div>
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
