import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, GripVertical, RefreshCw, Wrench, X } from 'lucide-react';
import { GENRES } from '@/data/musicData';
import { TIER_LABEL, type QueuedTrack } from '@/hooks/useArtistStudio';
import { useCoverLanding, type CoverStatus } from '@/hooks/useCoverLanding';
import { UploadProgress } from '@/components/studio/UploadProgress';
import { ArtworkField } from '@/components/studio/ArtworkField';
import { FeaturedArtists } from '@/components/studio/FeaturedArtists';

function mmss(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60';

/**
 * One track on the tracklist: its place in the running order, its title, and
 * everything that can differ from the rest of the release (artwork, genre,
 * explicit, who is on it). Up and down buttons move it on any screen; on a
 * desktop the grip drags it too.
 */
export function TracklistRow({
  track: t,
  index,
  count,
  position,
  manualNumber,
  problem,
  note,
  busy,
  retryReady,
  ownArtwork,
  sharedGenre,
  sharedCoverPreview,
  artistId,
  dragOver,
  onTitle,
  onNumber,
  onRemove,
  onRetry,
  onAskAgain,
  onPickAgain,
  onMove,
  onExtras,
  onCover,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: {
  track: QueuedTrack;
  index: number;
  count: number;
  /** Show the running order number (a release made here). */
  position: boolean;
  /** Show an editable number (placing tracks on an existing release). */
  manualNumber: boolean;
  problem: string | null;
  note: string | null;
  busy: boolean;
  retryReady: boolean;
  /** This track can carry artwork of its own. */
  ownArtwork: boolean;
  sharedGenre: string;
  sharedCoverPreview: string | null;
  artistId: string | null;
  dragOver: boolean;
  onTitle: (v: string) => void;
  onNumber: (v: number | null) => void;
  onRemove: () => void;
  onRetry: () => void;
  onAskAgain: () => void;
  /** Open the file picker for a track the page lost before its file got in. */
  onPickAgain: () => void;
  onMove: (delta: number) => void;
  onExtras: (p: Partial<Pick<QueuedTrack, 'genre' | 'explicit' | 'featured'>>) => void;
  onCover: (key: string, status: CoverStatus, get: () => Promise<string> | null) => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const cover = useCoverLanding();
  const { status: coverStatus, whenReady } = cover;
  const { key } = t;
  useEffect(() => { onCover(key, coverStatus, whenReady); }, [key, coverStatus, whenReady, onCover]);

  const editable = t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId);
  const canMove = editable && !busy;
  const mb = (t.file.size / (1024 * 1024)).toFixed(1);
  const summary = [
    ownArtwork && coverStatus !== 'idle' ? 'Own artwork' : null,
    t.genre ? t.genre : null,
    t.explicit ? 'Explicit' : null,
    t.featured.length ? `ft ${t.featured.map((f) => f.name).join(', ')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <li
      draggable={armed && canMove}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); onDragStart(); }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); onDragEnter(); } }}
      onDrop={(e) => { if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); onDrop(); } }}
      onDragEnd={() => { setArmed(false); onDragEnd(); }}
      className={`rounded-xl border p-3 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <div className="flex items-start gap-2">
        {canMove && count > 1 && (
          <span
            onMouseDown={() => setArmed(true)}
            onMouseUp={() => setArmed(false)}
            aria-hidden="true"
            title="Drag to reorder"
            className="hidden h-10 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground sm:flex"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        {position && (
          <span className="flex h-10 w-8 shrink-0 items-center justify-center text-sm font-semibold tabular-nums text-muted-foreground">
            {index + 1}
          </span>
        )}
        {manualNumber && (
          <input
            type="number"
            min={1}
            max={99}
            value={t.trackNumber ?? ''}
            disabled={!editable}
            aria-label="Track number"
            placeholder="#"
            onChange={(e) => onNumber(e.target.value ? Number(e.target.value) : null)}
            className="h-10 w-14 shrink-0 rounded-xl border border-border bg-background px-2 text-center text-sm tabular-nums text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
          />
        )}
        <div className="min-w-0 flex-1">
          <input
            value={t.title}
            onChange={(e) => onTitle(e.target.value)}
            disabled={!editable}
            maxLength={120}
            placeholder="Song title"
            aria-label={`Title of track ${index + 1}`}
            className={`${input} h-10`}
          />
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t.existing
              ? `Already uploaded${t.seconds !== null ? `, ${mmss(t.seconds)} long` : ''}`
              : t.stopped
                ? `${t.file.name}, stopped before it finished uploading`
                : <>{t.file.name}{t.seconds !== null ? `, ${mmss(t.seconds)} long` : ''}, {mb} MB</>}
          </p>
        </div>
        {editable && !busy && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${t.title || t.file.name}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {problem && editable && <p className="mt-1.5 text-xs text-destructive">{problem}</p>}
      {!problem && editable && note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}

      {(t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || t.phase === 'auditioning') && (
        <UploadProgress phase={t.phase} progress={t.progress} />
      )}
      {t.phase === 'done' && t.result && (
        <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${t.result.passed ? 'text-primary' : 'text-amber-500'}`}>
          {t.result.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
          {t.result.passed ? (t.result.tier ? `Live. ${TIER_LABEL[t.result.tier]}` : 'Live') : 'In the workshop'}
        </p>
      )}
      {t.phase === 'error' && t.error && (
        <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
          <p className="text-xs text-foreground">{t.error}</p>
          <button
            type="button"
            onClick={t.stopped ? onPickAgain : t.songId ? onAskAgain : onRetry}
            disabled={busy || (!t.stopped && !t.songId && !retryReady)}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" /> {t.stopped ? 'Pick it again' : t.songId ? 'Ask the judges again' : 'Try again'}
          </button>
        </div>
      )}

      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={!canMove || index === 0}
                aria-label={`Move ${t.title || 'this track'} up`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={!canMove || index === count - 1}
                aria-label={`Move ${t.title || 'this track'} down`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            <span className="shrink-0">Track details</span>
            {summary && <span className="truncate font-normal text-muted-foreground">{summary}</span>}
          </button>
        </div>
      )}

      {/* Kept mounted while closed, so artwork picked here keeps uploading. */}
      <div hidden={!open || !editable} className="mt-3 space-y-4 border-t border-border pt-3">
        {ownArtwork && (
          <ArtworkField
            cover={cover}
            compact
            disabled={busy}
            label="Artwork for this track"
            fallbackPreview={sharedCoverPreview}
            fallbackNote={sharedCoverPreview ? 'Uses the shared artwork unless you add its own.' : 'Add artwork for this track, or add shared artwork above.'}
          />
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Genre for this track</span>
          <select
            value={t.genre ?? ''}
            disabled={busy}
            onChange={(e) => onExtras({ genre: e.target.value || null })}
            className={`${input} h-11`}
          >
            <option value="">{sharedGenre ? `Same as above (${sharedGenre})` : 'Same as above'}</option>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={t.explicit}
            disabled={busy}
            onChange={(e) => onExtras({ explicit: e.target.checked })}
            className="h-5 w-5 accent-[hsl(var(--primary))]"
          />
          Explicit lyrics
        </label>
        <FeaturedArtists
          value={t.featured}
          onChange={(featured) => onExtras({ featured })}
          disabled={busy}
          selfArtistId={artistId}
        />
      </div>
    </li>
  );
}
