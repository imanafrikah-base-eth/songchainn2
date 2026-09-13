// The files a person sent Mo$ha in the chat, made into a release right there.
//
// Mo$ha hands over the conversation's attachments (src/lib/moshaAttachments.ts).
// The songs go out through the same road as the Studio: useBatchUpload lands
// each file on its own songs row, one cover for the batch, one releases row for
// an EP, album, mixtape or compilation, then the judges.
//
// Audio sent to Mo$ha sits in R2 under mosha/<user>/ with no songs row.
// upload-url purpose 'adopt_mosha' makes that file a songs row where it sits,
// so it goes on the tracklist as already uploaded and is never sent twice. Only
// if that fails is the file read back into the browser and landed again, and
// when the browser cannot read it back either (the bucket sends no CORS
// headers), the row asks for that one file to be picked again.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mic2, Music4, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { titleFromFileName, useBatchUpload, type ExistingRecord, type QueuedTrack } from '@/hooks/useArtistStudio';
import { supabase } from '@/integrations/supabase/client';
import { UploadProgress } from '@/components/studio/UploadProgress';
import { ReleaseTypePicker, countAdvice, isCollection, releaseKindOf, type ReleaseType } from '@/components/studio/ReleaseType';
import { CoverCropDialog, prepareCover } from '@/components/studio/CoverCrop';
import { checkCover, COVER_ACCEPT } from '@/lib/coverArt';
import { EMPTY_DETAILS } from '@/lib/songDetails';
import { GENRES } from '@/data/musicData';
import { attachmentUrl, type MoshaAttachment } from '@/lib/moshaAttachments';

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none';

/** The Studio takes WAV and MP3; Mo$ha takes more. */
const SENDABLE = /\.(wav|mp3)$/i;
const SENDABLE_TYPE = /^audio\/(wav|x-wav|wave|vnd\.wave|mpeg|mp3)$/i;
const sendable = (a: MoshaAttachment) => SENDABLE.test(a.name) || SENDABLE_TYPE.test(a.mime);

function typeFor(name: string, mime: string): string {
  if (SENDABLE_TYPE.test(mime)) return mime.toLowerCase() === 'audio/mp3' ? 'audio/mpeg' : mime.toLowerCase();
  return /\.wav$/i.test(name) ? 'audio/wav' : 'audio/mpeg';
}

/** A file sent earlier, back in the browser as a File. Null when it cannot be read. */
async function readBack(att: MoshaAttachment, type: string): Promise<File | null> {
  try {
    const url = await attachmentUrl(att);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return new File([blob], att.name, { type });
  } catch {
    return null;
  }
}

/** A song sent to Mo$ha, made a songs row where it already sits in storage. Null when that cannot be done. */
async function adopt(att: MoshaAttachment, artistName: string): Promise<ExistingRecord | null> {
  if (att.storage !== 'r2' || !att.path) return null;
  const title = titleFromFileName(att.name, artistName) || att.name.replace(/\.[^.]+$/, '');
  try {
    const { data, error } = await supabase.functions.invoke('upload-url', {
      body: { purpose: 'adopt_mosha', storageKey: att.path, title, artistName: artistName || 'Artist', fileName: att.name },
    });
    if (error || !data?.songId) return null;
    return {
      id: String(data.songId),
      title,
      genre: null,
      cover_art_url: null,
      duration_seconds: att.durationSec ?? null,
      storage_key: String(data.storageKey ?? att.path),
      file_bytes: Number(data.fileBytes ?? att.size) || null,
    };
  } catch {
    return null;
  }
}

function defaultType(count: number): ReleaseType {
  if (count <= 1) return 'single';
  return count <= 6 ? 'ep' : 'album';
}

export function ReleaseFilesFlow({ attachments, onNeedArtist }: { attachments: MoshaAttachment[]; onNeedArtist: () => void }) {
  const { isArtist, audienceProfile } = useAuth();
  const { tracks, busy, landing, finished, add, attachExisting, remove, setTitle, start, reset, setDefaults } = useBatchUpload();

  const audio = attachments.filter((a) => a.kind === 'audio');
  const usable = audio.filter(sendable);
  const unusable = audio.filter((a) => !sendable(a));
  const image = attachments.find((a) => a.kind === 'image');

  const [releaseType, setReleaseType] = useState<ReleaseType>(() => defaultType(usable.length));
  const [releaseTitle, setReleaseTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [artistName, setArtistName] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  /** Files that could not be read back: picked again by hand. */
  const [missing, setMissing] = useState<MoshaAttachment[]>([]);
  const started = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!artistName && audienceProfile) setArtistName(audienceProfile.display_name || audienceProfile.username || '');
  }, [audienceProfile, artistName]);
  useEffect(() => { setDefaults({ artistName: artistName.trim() || audienceProfile?.display_name || '' }); }, [artistName, audienceProfile, setDefaults]);

  const acceptCover = useCallback(async (f: File) => {
    const check = await checkCover(f);
    if (check.block) { toast.error(check.block); return; }
    if (check.warn) toast(check.warn);
    setCover(f);
  }, []);
  // Any photo: one that is not square opens the square window first.
  const pickCover = useCallback(async (f: File | null) => {
    if (!f) return;
    const prepared = await prepareCover(f);
    if (prepared.needsCrop) { setCropping(f); return; }
    await acceptCover(prepared.file);
  }, [acceptCover]);

  // The sent files go onto the tracklist once, in the order they were sent.
  useEffect(() => {
    if (!isArtist || started.current) return;
    started.current = true;
    void (async () => {
      setReading(true);
      const files: File[] = [];
      const lost: MoshaAttachment[] = [];
      const name = artistName.trim() || audienceProfile?.display_name || '';
      for (const a of usable) {
        const row = await adopt(a, name);
        if (row) {
          attachExisting(row, { atEnd: true });
          continue;
        }
        const f = await readBack(a, typeFor(a.name, a.mime));
        if (f) files.push(f);
        else lost.push(a);
      }
      if (files.length) add(files);
      setMissing(lost);
      if (image) {
        const type = image.mime && image.mime.startsWith('image/') ? image.mime : 'image/jpeg';
        const f = await readBack(image, type);
        if (f) await pickCover(f);
      }
      setReading(false);
    })();
    // Once, with the files Mo$ha handed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArtist]);

  if (!isArtist) {
    return (
      <div className="space-y-2">
        <p className="text-sm">Releases come from artist accounts. Make yours one and your files stay right here.</p>
        <Button size="sm" className="h-10 rounded-full text-xs" onClick={onNeedArtist}><Mic2 className="mr-1 h-3.5 w-3.5" /> Make this an artist account</Button>
      </div>
    );
  }

  if (!audio.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm">No songs came with this chat yet. Send them with the paperclip, or open the Studio.</p>
        <Button asChild size="sm" variant="outline" className="h-10 rounded-full text-xs"><Link to="/studio">Open the Studio</Link></Button>
      </div>
    );
  }

  const collection = isCollection(releaseType);
  const queued = tracks.filter((t) => t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId));
  const advice = countAdvice(releaseType, queued.length);
  const ready =
    !reading && !busy && queued.length > 0 && queued.every((t) => t.title.trim()) &&
    !!artistName.trim() && !!genre && !!cover && (!collection || !!releaseTitle.trim());

  const send = () =>
    void start({
      artistName: artistName.trim(),
      genre,
      cover,
      release: collection ? { title: releaseTitle.trim(), kind: releaseKindOf(releaseType)! } : null,
      details: EMPTY_DETAILS,
    }).catch((err) => toast.error((err as Error)?.message || 'That did not go through. Try again.'));

  const pickAgain = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((f) => SENDABLE.test(f.name) || SENDABLE_TYPE.test(f.type));
    if (!picked.length) return;
    add(picked);
    const names = new Set(picked.map((f) => f.name));
    setMissing((m) => m.filter((a) => !names.has(a.name)));
  };

  const missingLabel = !cover ? 'Cover art (needed)' : !genre ? 'Pick a genre' : collection && !releaseTitle.trim() ? 'Name the release' : null;

  return (
    <div className="space-y-2.5">
      <CoverCropDialog file={cropping} onCancel={() => setCropping(null)} onDone={(f) => { setCropping(null); void acceptCover(f); }} />
      <input ref={coverRef} type="file" accept={COVER_ACCEPT} className="hidden" onChange={(e) => { void pickCover(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      <input ref={fileRef} type="file" multiple accept=".wav,.mp3,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mpeg,audio/mp3" className="hidden" onChange={(e) => { pickAgain(e.target.files); e.target.value = ''; }} />

      {!finished && (
        <>
          <ReleaseTypePicker value={releaseType} onChange={setReleaseType} disabled={busy} />
          {collection && (
            <input value={releaseTitle} onChange={(e) => setReleaseTitle(e.target.value)} disabled={busy} placeholder="Release title" maxLength={120} className={input} />
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <input value={artistName} onChange={(e) => setArtistName(e.target.value)} disabled={busy} placeholder="Artist name" className={input} />
            <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={busy} aria-label="Genre" className={input}>
              <option value="">Genre</option>
              {(GENRES as string[]).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <Button size="sm" variant="outline" className="h-10 rounded-full text-xs" disabled={busy} onClick={() => coverRef.current?.click()}>
            {cover ? `Cover: ${cover.name.slice(0, 18)}` : 'Cover art (needed)'}
          </Button>
        </>
      )}

      {reading && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Bringing in the files you sent</p>
      )}

      {tracks.length > 0 && (
        <ul className="space-y-2">
          {tracks.map((t) => <Track key={t.key} track={t} busy={busy} onTitle={(v) => setTitle(t.key, v)} onRemove={() => remove(t.key)} />)}
        </ul>
      )}

      {missing.length > 0 && !finished && (
        <div className="rounded-xl border border-border p-2.5">
          <p className="text-xs font-semibold">Pick these again from your phone</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{missing.map((a) => a.name).join(', ')}</p>
          <Button size="sm" variant="outline" className="mt-2 h-10 rounded-full text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Music4 className="mr-1 h-3.5 w-3.5" /> Pick the files
          </Button>
        </div>
      )}

      {unusable.length > 0 && !finished && (
        <p className="text-[11px] text-muted-foreground">
          {unusable.map((a) => a.name).join(', ')} {unusable.length === 1 ? 'is' : 'are'} not WAV or MP3. Export {unusable.length === 1 ? 'it' : 'them'} as WAV or MP3 and send again.
        </p>
      )}

      {advice && !finished && <p className="text-[11px] text-muted-foreground">{advice}</p>}

      {!finished ? (
        tracks.length > 0 && (
          <Button size="sm" className="h-10 w-full rounded-full text-xs" disabled={!ready} onClick={send}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
            {busy ? 'Working' : missingLabel ?? (landing ? 'Finish and send' : queued.length > 1 ? `Send all ${queued.length} in` : 'Send it in')}
          </Button>
        )
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-10 rounded-full text-xs" onClick={() => { reset(); setCover(null); }}>Start over</Button>
          <Button asChild size="sm" variant="ghost" className="h-10 rounded-full text-xs"><Link to="/studio">See it in the Studio</Link></Button>
        </div>
      )}
    </div>
  );
}

function Track({ track: t, busy, onTitle, onRemove }: { track: QueuedTrack; busy: boolean; onTitle: (v: string) => void; onRemove: () => void }) {
  const editable = t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId);
  return (
    <li className="rounded-xl border border-border p-2.5">
      <div className="flex items-center gap-2">
        <input value={t.title} onChange={(e) => onTitle(e.target.value)} disabled={!editable} placeholder="Song title" className={`${input} py-1.5`} />
        {editable && !busy && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${t.title}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        )}
      </div>
      {t.phase !== 'queued' && t.phase !== 'error' && <UploadProgress phase={t.phase} progress={t.progress} passed={t.result?.passed} compact />}
      {t.phase === 'done' && t.result?.hikulu && <p className="mt-1 text-xs text-muted-foreground">{t.result.hikulu}</p>}
      {t.phase === 'error' && <p className="mt-1 text-xs text-destructive">{t.error}</p>}
    </li>
  );
}
