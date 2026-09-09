import { Plus, X } from 'lucide-react';
import { isValidIsrc, type Credit, type Split, type SongDetails } from '@/lib/songDetails';
import { ReleasePicker } from '@/components/studio/ReleasePicker';

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60';
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

const CREDIT_ROLES = ['Producer', 'Writer', 'Composer', 'Featured artist', 'Mix', 'Master', 'Vocals', 'Instrument', 'Artwork', 'Video'];
const SPLIT_ROLES = ['Writer', 'Composer', 'Producer', 'Publisher', 'Performer'];

/**
 * The record's details: lyrics, credits, splits and the identifiers a rights
 * desk asks for. Every field is optional, and it says so once at the top
 * rather than on every line. Used at upload and again for editing, so the
 * two never drift.
 */
export function SongDetailsFields({
  value,
  onChange,
  disabled = false,
  artistId,
  shared = false,
}: {
  value: SongDetails;
  onChange: (next: SongDetails) => void;
  disabled?: boolean;
  /** When known, the track can be placed on one of this artist's releases. */
  artistId?: string | null;
  /**
   * The same details for a batch of records at once. Lyrics, the description
   * and the identifiers belong to one record each, so they are left out here
   * and added per track from the catalog.
   */
  shared?: boolean;
}) {
  const set = <K extends keyof SongDetails>(key: K, v: SongDetails[K]) => onChange({ ...value, [key]: v });
  const setCredit = (i: number, patch: Partial<Credit>) =>
    set('credits', value.credits.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const setSplit = (i: number, patch: Partial<Split>) =>
    set('splits', value.splits.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const splitTotal = value.splits.reduce((sum, s) => sum + (Number(s.share) || 0), 0);
  const isrcOk = isValidIsrc(value.isrc);
  const today = new Date().toISOString().slice(0, 10);
  const scheduled = Boolean((value.release_at && new Date(value.release_at).getTime() > Date.now()) || (!value.release_at && value.release_date && value.release_date > today));
  // datetime-local speaks the artist's own clock; the row keeps UTC.
  const localInput = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {shared
          ? 'Everything here is optional, applies to every track in this batch, and can be changed per record later. Lyrics, the write-up, ISRC and ISWC belong to one record each: add those from Edit details once the tracks land.'
          : 'Everything here is optional and can be changed later. Lyrics and credits show on the song page; the identifiers are what a distributor, a publisher or a sync desk asks for.'}
      </p>

      {artistId && (
        <ReleasePicker
          artistId={artistId}
          releaseId={value.release_id}
          trackNumber={value.track_number}
          disabled={disabled}
          hideTrackNumber={shared}
          onChange={(next) => onChange({ ...value, ...next })}
        />
      )}

      {!shared && <label className="block">
        <span className={label}>Lyrics</span>
        <textarea
          value={value.lyrics ?? ''}
          onChange={(e) => set('lyrics', e.target.value)}
          disabled={disabled}
          rows={8}
          maxLength={20000}
          placeholder="Paste the words as they are sung. Line breaks are kept."
          className={`${input} min-h-[9rem] resize-y font-mono text-[13px] leading-relaxed`}
        />
      </label>}

      {!shared && <label className="block">
        <span className={label}>About this record</span>
        <textarea
          value={value.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={2000}
          placeholder="Where it was made, who was in the room, what it is about. A few lines."
          className={`${input} resize-y`}
        />
      </label>}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className={`${label} mb-0`}>Credits</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => set('credits', [...value.credits, { role: 'Producer', name: '' }])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Add a credit
          </button>
        </div>
        {value.credits.length === 0 ? (
          <p className="text-xs text-muted-foreground">Producer, writers, features, mix and master. Name the people.</p>
        ) : (
          <ul className="space-y-2">
            {value.credits.map((c, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2">
                <select
                  value={c.role}
                  disabled={disabled}
                  onChange={(e) => setCredit(i, { role: e.target.value })}
                  className={input}
                >
                  {[...new Set([c.role, ...CREDIT_ROLES])].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <input
                  value={c.name}
                  disabled={disabled}
                  maxLength={120}
                  placeholder="Name"
                  onChange={(e) => setCredit(i, { name: e.target.value })}
                  className={input}
                />
                <button
                  type="button"
                  disabled={disabled}
                  aria-label="Remove credit"
                  onClick={() => set('credits', value.credits.filter((_, idx) => idx !== i))}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Language</span>
          <input value={value.language ?? ''} disabled={disabled} maxLength={40} placeholder="Bemba, English, Nyanja..." onChange={(e) => set('language', e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Release date and time</span>
          <input
            type="datetime-local"
            value={localInput(value.release_at) || (value.release_date ? `${value.release_date}T00:00` : '')}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { onChange({ ...value, release_at: null, release_date: null }); return; }
              const d = new Date(v);
              if (Number.isNaN(d.getTime())) return;
              onChange({ ...value, release_at: d.toISOString(), release_date: d.toISOString().slice(0, 10) });
            }}
            className={input}
          />
          <span className={`mt-1 block text-xs ${scheduled ? 'text-primary' : 'text-muted-foreground'}`}>
            {scheduled
              ? 'Scheduled. It stays yours alone until that moment, then goes public and your followers are told.'
              : 'Blank means out the minute the judges are done. A time ahead schedules it, to the minute.'}
          </span>
        </label>
        {!shared && <label className="block">
          <span className={label}>ISRC</span>
          <input
            value={value.isrc ?? ''}
            disabled={disabled}
            maxLength={15}
            placeholder="e.g. ZMA012600001"
            onChange={(e) => set('isrc', e.target.value)}
            aria-invalid={!isrcOk}
            className={`${input} font-mono uppercase ${isrcOk ? '' : 'border-destructive'}`}
          />
          {!isrcOk && (
            <span className="mt-1 block text-xs text-destructive">Twelve characters: country, registrant, year, number. Dashes are fine.</span>
          )}
        </label>}
        {!shared && <label className="block">
          <span className={label}>ISWC</span>
          <input value={value.iswc ?? ''} disabled={disabled} maxLength={15} placeholder="e.g. T-123.456.789-0" onChange={(e) => set('iswc', e.target.value)} className={`${input} font-mono uppercase`} />
        </label>}
        <label className="block">
          <span className={label}>Publisher</span>
          <input value={value.publisher ?? ''} disabled={disabled} maxLength={120} placeholder="Who administers the song, if anyone" onChange={(e) => set('publisher', e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Collecting society (PRO)</span>
          <input value={value.pro ?? ''} disabled={disabled} maxLength={60} placeholder="ZAMCOPS, PRS, ASCAP, BMI, SAMRO..." onChange={(e) => set('pro', e.target.value)} className={input} />
        </label>
      </div>

      <label className="flex items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value.explicit}
          disabled={disabled}
          onChange={(e) => set('explicit', e.target.checked)}
          className="h-4 w-4 accent-[hsl(var(--primary))]"
        />
        Explicit lyrics
      </label>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className={`${label} mb-0`}>Splits</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => set('splits', [...value.splits, { name: '', role: 'Writer', share: 0 }])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Add a share
          </button>
        </div>
        {value.splits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Who owns what share of the song, in whole percent. This is a note for people who need it, not a payout rule.
          </p>
        ) : (
          <>
            {/* Below sm the name gets its own line so it stays readable at 320px; role, share and remove sit on the line under it. */}
            <ul className="space-y-2">
              {value.splits.map((s, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_4.5rem_auto]">
                  <input value={s.name} disabled={disabled} maxLength={120} placeholder="Name" onChange={(e) => setSplit(i, { name: e.target.value })} className={`${input} col-span-full sm:col-span-1`} />
                  <select value={s.role} disabled={disabled} onChange={(e) => setSplit(i, { role: e.target.value })} className={input}>
                    {[...new Set([s.role, ...SPLIT_ROLES])].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={s.share}
                    disabled={disabled}
                    onChange={(e) => setSplit(i, { share: Number(e.target.value) })}
                    className={`${input} tabular-nums`}
                    aria-label="Share in percent"
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label="Remove share"
                    onClick={() => set('splits', value.splits.filter((_, idx) => idx !== i))}
                    className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <p className={`mt-1.5 text-xs tabular-nums ${splitTotal === 100 ? 'text-muted-foreground' : 'text-destructive'}`}>
              {splitTotal}% of 100{splitTotal !== 100 ? '. The shares have to add up to exactly 100 before this saves.' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Where the record lives. Two cards, one choice, and the wallet condition
 * said up front because a coin with no payout address has nowhere to pay.
 */
export function DistributionChoice({
  value,
  onChange,
  hasWallet,
  disabled = false,
}: {
  value: SongDetails['distribution'];
  onChange: (v: SongDetails['distribution']) => void;
  hasWallet: boolean;
  disabled?: boolean;
}) {
  const card = (active: boolean) =>
    `flex-1 cursor-pointer rounded-xl border p-3 text-left transition-colors ${
      active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'
    } ${disabled ? 'opacity-60' : ''}`;
  return (
    <div>
      <span className={label}>Where does it live?</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={disabled} onClick={() => onChange('app')} className={card(value === 'app')} aria-pressed={value === 'app'}>
          <span className="block text-sm font-semibold text-foreground">In the app</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Streams here, free to listeners, counted to you. You can take it on chain any time later.
          </span>
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange('onchain')} className={card(value === 'onchain')} aria-pressed={value === 'onchain'}>
          <span className="block text-sm font-semibold text-foreground">On chain, as a tradeable asset</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Streams here and also becomes a coin on Base that fans can hold. Every trade pays your wallet.
          </span>
        </button>
      </div>
      {value === 'onchain' && !hasWallet && (
        <p className="mt-2 text-xs text-amber-500">
          Connect a wallet in your profile first. The coin pays out to it, so without one there is nowhere for the money to go.
        </p>
      )}
    </div>
  );
}
