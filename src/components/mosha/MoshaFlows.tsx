// What Mo$ha can do for you, right here in the chat.
//
// Mo$ha decides when one of these opens (its reply carries the action); the
// flow itself is plain app code running with the person's own session, the
// same hooks the Studio and the builder use. Nothing here touches money, and
// nothing runs until the person taps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, ChevronUp, Eye, EyeOff, Globe2, Hammer, Loader2, Mic2, Music4, Plus, Settings2, Trash2, Upload, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBecomeArtist } from '@/hooks/useBecomeArtist';
import { requestWalletConnection } from '@/lib/walletGate';
import { useBatchUpload, type QueuedTrack } from '@/hooks/useArtistStudio';
import { useMediaUpload } from '@/hooks/useArtistMedia';
import { useWorldBuilder, slugify } from '@/worlds/builder/useWorldBuilder';
import { useMyWorlds } from '@/worlds/builder/useMyWorlds';
import { getBlockType } from '@/worlds/blocks';
import { UploadProgress } from '@/components/studio/UploadProgress';
import { EMPTY_DETAILS } from '@/lib/songDetails';

export type MoshaFlowName = 'upload_song' | 'build_world' | 'become_artist' | 'connect_wallet' | 'edit_world';

export const FLOW_LABEL: Record<MoshaFlowName, string> = {
  upload_song: 'Put a record out',
  build_world: 'Build my world',
  edit_world: 'Edit my world',
  become_artist: 'Make me an artist',
  connect_wallet: 'Connect my wallet',
};

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none';
const HUES = ['emerald', 'violet', 'sky', 'amber', 'rose', 'cyan', 'orange', 'yellow', 'red'];
/** The kinds a city may be (a database rule); a named city takes them in turn. */
const CITY_KINDS = ['music', 'canvas', 'motion', 'vault', 'word'];

export function MoshaFlow({ flow, onClose }: { flow: MoshaFlowName; onClose?: () => void }) {
  const [current, setCurrent] = useState<MoshaFlowName>(flow);
  return (
    <div className="mt-2 w-full rounded-2xl border border-primary/30 bg-card p-3 text-foreground">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">{FLOW_LABEL[current]}</span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close this" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {current === 'become_artist' && <BecomeArtistFlow onArtist={() => setCurrent('upload_song')} />}
      {current === 'connect_wallet' && <ConnectWalletFlow />}
      {current === 'upload_song' && <UploadSongFlow onNeedArtist={() => setCurrent('become_artist')} />}
      {current === 'build_world' && <BuildWorldFlow onNeedArtist={() => setCurrent('become_artist')} />}
      {current === 'edit_world' && <EditWorldFlow onNeedArtist={() => setCurrent('become_artist')} />}
    </div>
  );
}

/* --------------------------------------------------------- become artist --- */

function BecomeArtistFlow({ onArtist }: { onArtist: () => void }) {
  const { isArtist } = useAuth();
  const { becomeArtist, pending } = useBecomeArtist();
  const [done, setDone] = useState(false);
  if (isArtist || done) {
    return (
      <div className="space-y-2">
        <p className="text-sm">This is an artist account. The Studio is open.</p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="h-9 rounded-full text-xs" onClick={onArtist}><Upload className="mr-1 h-3.5 w-3.5" /> Put a record out here</Button>
          <Button asChild size="sm" variant="outline" className="h-9 rounded-full text-xs"><Link to="/studio">Open the Studio</Link></Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">One tap and this same account becomes your artist account. Your page, your Studio, your world.</p>
      <Button
        size="sm"
        className="h-9 rounded-full text-xs"
        disabled={pending}
        onClick={async () => {
          const ok = await becomeArtist({ quiet: true, to: window.location.pathname + window.location.search });
          if (ok) setDone(true);
        }}
      >
        {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mic2 className="mr-1 h-3.5 w-3.5" />} I make music, open my Studio
      </Button>
    </div>
  );
}

/* -------------------------------------------------------- connect wallet --- */

function ConnectWalletFlow() {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm">{address ? `Connected: ${address.slice(0, 6)}…${address.slice(-4)}` : 'Your wallet, on this device. You come straight back here.'}</p>
      {!address && (
        <Button size="sm" className="h-9 rounded-full text-xs" disabled={busy} onClick={async () => { setBusy(true); try { setAddress(await requestWalletConnection()); } finally { setBusy(false); } }}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wallet className="mr-1 h-3.5 w-3.5" />} Connect a wallet
        </Button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- upload song --- */

function UploadSongFlow({ onNeedArtist }: { onNeedArtist: () => void }) {
  const { isArtist, audienceProfile } = useAuth();
  const { tracks, busy, landing, finished, add, remove, setTitle, start, reset, setDefaults } = useBatchUpload();
  const [artistName, setArtistName] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!artistName && audienceProfile) setArtistName(audienceProfile.display_name || audienceProfile.username || '');
  }, [audienceProfile, artistName]);
  useEffect(() => { setDefaults({ artistName: artistName.trim() || audienceProfile?.display_name || '' }); }, [artistName, audienceProfile, setDefaults]);

  if (!isArtist) {
    return (
      <div className="space-y-2">
        <p className="text-sm">Records come from artist accounts. Yours can be one right now.</p>
        <Button size="sm" className="h-9 rounded-full text-xs" onClick={onNeedArtist}><Mic2 className="mr-1 h-3.5 w-3.5" /> Make this an artist account</Button>
      </div>
    );
  }

  const queued = tracks.filter((t) => t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId));
  const ready = queued.length > 0 && queued.every((t) => t.title.trim()) && artistName.trim() && !busy;
  const send = () => void start({ artistName: artistName.trim(), cover, details: EMPTY_DETAILS });

  return (
    <div className="space-y-2">
      {!finished && (
        <>
          <input ref={fileRef} type="file" multiple accept=".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg" className="hidden" onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={tracks.length ? 'outline' : 'default'} className="h-9 rounded-full text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Music4 className="mr-1 h-3.5 w-3.5" /> {tracks.length ? 'Add more' : 'Pick the audio'}
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={busy} onClick={() => coverRef.current?.click()}>
              {cover ? 'Cover: ' + cover.name.slice(0, 14) : 'Cover art'}
            </Button>
          </div>
          {tracks.length > 0 && (
            <input value={artistName} onChange={(e) => setArtistName(e.target.value)} disabled={busy} placeholder="Artist name" className={input} />
          )}
        </>
      )}
      {tracks.length > 0 && (
        <ul className="space-y-2">
          {tracks.map((t) => <FlowTrack key={t.key} track={t} busy={busy} onTitle={(v) => setTitle(t.key, v)} onRemove={() => remove(t.key)} />)}
        </ul>
      )}
      {!finished ? (
        tracks.length > 0 && (
          <Button size="sm" className="h-10 w-full rounded-full text-xs" disabled={!ready} onClick={send}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
            {busy ? 'Working' : landing ? 'Finish and send' : queued.length > 1 ? `Send all ${queued.length} in` : 'Send it in'}
          </Button>
        )
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" onClick={() => { reset(); setCover(null); }}>Send another</Button>
          <Button asChild size="sm" variant="ghost" className="h-9 rounded-full text-xs"><Link to="/studio">See it in the Studio</Link></Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">WAV or MP3, up to 100 MB each. Lyrics and credits can be added later from the Studio.</p>
    </div>
  );
}

function FlowTrack({ track: t, busy, onTitle, onRemove }: { track: QueuedTrack; busy: boolean; onTitle: (v: string) => void; onRemove: () => void }) {
  const editable = t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId);
  return (
    <li className="rounded-xl border border-border p-2.5">
      <div className="flex items-center gap-2">
        <input value={t.title} onChange={(e) => onTitle(e.target.value)} disabled={!editable} placeholder="Song title" className={`${input} py-1.5`} />
        {editable && !busy && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${t.title}`} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        )}
      </div>
      {t.phase !== 'queued' && t.phase !== 'error' && <UploadProgress phase={t.phase} progress={t.progress} passed={t.result?.passed} compact />}
      {t.phase === 'done' && t.result?.hikulu && <p className="mt-1 text-xs text-muted-foreground">{t.result.hikulu}</p>}
      {t.phase === 'error' && <p className="mt-1 text-xs text-destructive">{t.error}</p>}
    </li>
  );
}

/* ----------------------------------------------------------- build world --- */

interface Picture { url: string | null; busy: boolean; pct: number }

function PictureSlot({ label, value, onFile, hint }: { label: string; value: Picture; onFile: (f: File) => void; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border p-2">
      <button type="button" onClick={() => ref.current?.click()} disabled={value.busy} className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-black/30">
        {value.url ? <img src={value.url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label.slice(0, 8)}</span>}
        {value.busy && <span className="absolute inset-x-0 bottom-0 h-1 bg-primary" style={{ width: `${value.pct}%` }} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{value.url ? 'Set' : hint ?? 'Tap to add a picture'}</p>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {value.busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : value.url ? <Check className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}

function BuildWorldFlow({ onNeedArtist }: { onNeedArtist: () => void }) {
  const { user, isArtist, audienceProfile } = useAuth();
  const { upload } = useMediaUpload();
  const [step, setStep] = useState<'about' | 'cities' | 'pictures' | 'zora' | 'building' | 'done'>('about');
  const [name, setName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [line, setLine] = useState('');
  const [cityText, setCityText] = useState('');
  const [pics, setPics] = useState<Record<string, Picture>>({});
  const [zoraLink, setZoraLink] = useState('');
  const [wallet, setWallet] = useState('');
  const [worldId, setWorldId] = useState<string | undefined>();
  const [slug, setSlug] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const b = useWorldBuilder(worldId);

  useEffect(() => {
    if (!artistName && audienceProfile) setArtistName(audienceProfile.display_name || audienceProfile.username || '');
  }, [audienceProfile, artistName]);

  const cities = useMemo(() => cityText.split(/[,\n]/).map((c) => c.trim()).filter(Boolean).slice(0, 8), [cityText]);
  const slots = useMemo(() => [{ key: 'gate', label: 'Gate' }, { key: 'hero', label: 'Hero' }, ...cities.map((c) => ({ key: `city:${slugify(c)}`, label: c }))], [cities]);
  const zoraLinkOk = /^https?:\/\/([a-z0-9-]+\.)*zora\.co\//i.test(zoraLink.trim());
  const walletOk = /^0x[0-9a-fA-F]{40}$/.test(wallet.trim());

  const pick = useCallback(async (key: string, file: File) => {
    setPics((p) => ({ ...p, [key]: { url: p[key]?.url ?? null, busy: true, pct: 0 } }));
    const item = await upload(file, { title: key, private: true });
    setPics((p) => ({ ...p, [key]: { url: item?.public_url ?? p[key]?.url ?? null, busy: false, pct: 100 } }));
    if (!item) toast.error('That picture did not upload');
  }, [upload]);

  if (!isArtist) {
    return (
      <div className="space-y-2">
        <p className="text-sm">Worlds belong to artist accounts. Yours can be one right now.</p>
        <Button size="sm" className="h-9 rounded-full text-xs" onClick={onNeedArtist}><Mic2 className="mr-1 h-3.5 w-3.5" /> Make this an artist account</Button>
      </div>
    );
  }

  const build = async () => {
    if (!user) return;
    setStep('building');
    const say = (s: string) => setLog((l) => [...l, s]);
    try {
      say('Laying the streets');
      const id = await b.createWorld({ name: name.trim(), artistName: artistName.trim() || name.trim(), positioning: line.trim(), useTemplate: true });
      const mySlug = slugify(name);
      setSlug(mySlug);

      // Cities: the names they gave, or the Classic Five that came with the template.
      let cityArt: Record<string, string> = {};
      if (cities.length) {
        say('Naming the cities');
        // The template's cities go only once the named ones are in, so a
        // refused insert never leaves the world with no cities at all.
        const { data: existing } = await supabase.from('world_cities').select('id, slug').eq('world_id', id);
        const taken = new Set(((existing ?? []) as Array<{ slug: string }>).map((c) => c.slug));
        const rows = cities.map((c, i) => {
          let slug = slugify(c) || `city-${i + 1}`;
          if (taken.has(slug)) slug = `${slug}-city`;
          return {
            world_id: id, slug, name: c, kind: CITY_KINDS[i % CITY_KINDS.length], hue: HUES[i % HUES.length], sort_order: i + 1,
            tagline: '', teaser: '', empty_line: 'Nothing standing here yet.', buildings: [] as string[],
          };
        });
        const { error: cityErr } = await supabase.from('world_cities').insert(rows as never);
        if (cityErr) throw new Error('The cities could not be named: ' + cityErr.message);
        const keep = new Set(rows.map((r) => r.slug));
        const old = ((existing ?? []) as Array<{ id: string; slug: string }>).filter((c) => !keep.has(c.slug)).map((c) => c.id);
        if (old.length) await supabase.from('world_cities').delete().in('id', old);
        for (const r of rows) {
          const url = pics[`city:${slugify(r.name)}`]?.url;
          if (url) cityArt[r.slug] = url;
        }
      } else {
        cityArt = {};
      }

      say('Hanging the pictures');
      await supabase.from('worlds').update({
        story: line.trim() ? [line.trim()] : [],
        hero_image: pics.hero?.url ?? null,
        entrance_poster: pics.gate?.url ?? null,
        city_art: cityArt,
        zora_profile_url: zoraLink.trim() || null,
        zora_wallet_address: wallet.trim() || null,
        ad_kind: 'entrance',
        updated_at: new Date().toISOString(),
      } as never).eq('id', id);

      say('Putting your records on the first streets');
      const { data: streets } = await supabase.from('world_streets').select('id').eq('world_id', id).order('sort_order').limit(3);
      for (const s of (streets ?? []) as Array<{ id: string }>) {
        await supabase.from('world_blocks').insert({ street_id: s.id, block_type: 'catalog-list', props: { heading: 'The records', limit: 8 } as never, sort_order: 0 } as never);
      }

      // A creator coin link carries the coin: that is the key.
      const coin = zoraLink.match(/base:(0x[0-9a-fA-F]{40})/);
      if (coin) {
        say('Setting your coin as the key');
        await supabase.from('world_gates').upsert({ world_id: id, kind: 'token', token_address: coin[1], token_decimals: 18, fan_threshold: 1000, insider_threshold: 10000, council_size: 10 } as never, { onConflict: 'world_id' });
      }

      setWorldId(id);
      say('Built');
      setStep('done');
    } catch (err) {
      toast.error((err as Error)?.message || 'That did not build. Try a different name.');
      setStep('about');
    }
  };

  const publish = async () => {
    const res = await b.publish();
    setPublishMsg(res.ok ? `The doors are open. You are World #${String(res.world_number).padStart(3, '0')}.` : res.message || 'Not yet.');
  };

  if (step === 'about') return (
    <div className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="World name" className={input} maxLength={60} />
      <input value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Artist name" className={input} maxLength={80} />
      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="One line about it, in your words" className={input} maxLength={200} />
      <Button size="sm" className="h-9 rounded-full text-xs" disabled={!name.trim()} onClick={() => setStep('cities')}>Next <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
    </div>
  );

  if (step === 'cities') return (
    <div className="space-y-2">
      <p className="text-sm">Name your cities, comma separated. Leave it blank for the classic five.</p>
      <input value={cityText} onChange={(e) => setCityText(e.target.value)} placeholder="Music City, Canvas City, Film City" className={input} />
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs" onClick={() => setStep('about')}>Back</Button>
        <Button size="sm" className="h-9 rounded-full text-xs" onClick={() => setStep('pictures')}>Next <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );

  if (step === 'pictures') return (
    <div className="space-y-2">
      <p className="text-sm">Pictures. Each one goes where its name says. Skip any; you can add them later.</p>
      {slots.map((s) => (
        <PictureSlot key={s.key} label={s.label} value={pics[s.key] ?? { url: null, busy: false, pct: 0 }} onFile={(f) => void pick(s.key, f)} hint={s.key === 'gate' ? 'The doors people walk through' : s.key === 'hero' ? 'Behind the map, wide' : 'The tower on the map'} />
      ))}
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs" onClick={() => setStep('cities')}>Back</Button>
        <Button size="sm" className="h-9 rounded-full text-xs" disabled={Object.values(pics).some((p) => p.busy)} onClick={() => setStep('zora')}>Next <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );

  if (step === 'zora') return (
    <div className="space-y-2">
      <p className="text-sm">Your Zora account. The coin link becomes the key; the wallet is where it pays.</p>
      <input value={zoraLink} onChange={(e) => setZoraLink(e.target.value)} placeholder="https://zora.co/@you or your creator coin link" inputMode="url" className={input} />
      {zoraLink && !zoraLinkOk && <p className="text-xs text-destructive">That is not a zora.co link.</p>}
      <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x wallet address" spellCheck={false} className={`${input} font-mono text-xs`} />
      {wallet && !walletOk && <p className="text-xs text-destructive">A wallet address is 0x followed by 40 characters.</p>}
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs" onClick={() => setStep('pictures')}>Back</Button>
        <Button size="sm" className="h-9 rounded-full text-xs" onClick={() => void build()}><Hammer className="mr-1 h-3.5 w-3.5" /> Build it</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Both are needed to open the doors; you can build now and add them before publishing.</p>
    </div>
  );

  if (step === 'building') return (
    <ul className="space-y-1 text-sm">
      {log.map((l, i) => <li key={i} className="flex items-center gap-2">{i === log.length - 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Check className="h-3.5 w-3.5 text-primary" />}{l}</li>)}
    </ul>
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Your world is built.</p>
      <p className="text-xs text-muted-foreground">Walk it, change anything in the builder, or open the doors now.</p>
      <div className="flex flex-wrap gap-1.5">
        <Button asChild size="sm" className="h-9 rounded-full text-xs"><Link to={`/w/${slug}`}><Globe2 className="mr-1 h-3.5 w-3.5" /> Preview</Link></Button>
        <Button asChild size="sm" variant="outline" className="h-9 rounded-full text-xs"><Link to="/world-builder"><Hammer className="mr-1 h-3.5 w-3.5" /> Edit</Link></Button>
        <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={!b.world || !zoraLinkOk || !walletOk} onClick={() => void publish()}>Open the doors</Button>
      </div>
      {!(zoraLinkOk && walletOk) && <p className="text-[11px] text-muted-foreground">Add your Zora link and wallet in the builder's Publish step to open the doors.</p>}
      {publishMsg && <p className="text-sm text-primary">{publishMsg}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ edit world --- */

const QUICK_ADD: Array<{ id: string; label: string; defaults: Record<string, unknown> }> = [
  { id: 'catalog-list', label: 'The records', defaults: { heading: 'The records', limit: 8 } },
  { id: 'story', label: 'A story', defaults: { heading: '', body: '' } },
  { id: 'gallery-grid', label: 'A gallery', defaults: { heading: '', images: '' } },
  { id: 'note', label: 'A note', defaults: { text: '', insidersOnly: false } },
];

function EditWorldFlow({ onNeedArtist }: { onNeedArtist: () => void }) {
  const { isArtist } = useAuth();
  const { data: mine = [] } = useMyWorlds();
  const [worldId, setWorldId] = useState<string | undefined>(mine.length === 1 ? mine[0].id : undefined);
  const [streetId, setStreetId] = useState<string | null>(null);
  const [tab, setTab] = useState<'streets' | 'settings'>('streets');
  const [log, setLog] = useState<string[]>([]);
  const b = useWorldBuilder(worldId);
  const done = (what: string) => { setLog((l) => [...l.slice(-4), what]); toast('Done', { description: what }); };

  useEffect(() => { if (!worldId && mine.length === 1) setWorldId(mine[0].id); }, [mine, worldId]);
  useEffect(() => { if (!streetId && b.streets[0]) setStreetId(b.streets[0].id); }, [b.streets, streetId]);

  if (!isArtist) {
    return <Button size="sm" className="h-9 rounded-full text-xs" onClick={onNeedArtist}><Mic2 className="mr-1 h-3.5 w-3.5" /> Make this an artist account</Button>;
  }
  if (!mine.length) {
    return <p className="text-sm">You have no world yet. Say "build my world" and I will make one with you.</p>;
  }
  if (!worldId) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {mine.map((w) => <Button key={w.id} size="sm" variant="outline" className="h-9 rounded-full text-xs" onClick={() => setWorldId(w.id)}>{w.artist_name || w.slug} ({w.status})</Button>)}
      </div>
    );
  }
  const street = b.streets.find((s) => s.id === streetId) ?? null;
  const blocks = street ? [...(b.blocksByStreet[street.id] ?? [])].sort((a, c) => a.sort_order - c.sort_order) : [];
  const w = b.world;

  if (tab === 'settings' && w) {
    const zoraCoin = (w.zora_profile_url ?? '').match(/base:(0x[0-9a-fA-F]{40})/);
    return (
      <div className="space-y-3">
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setTab('streets')} className="h-8 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground">Streets</button>
          <button type="button" className="h-8 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground">Settings</button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Names</p>
          <ul className="mt-1 space-y-1.5">
            {b.streets.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <input value={s.name} maxLength={40} aria-label="Street name" onChange={(e) => void b.saveStreet(s.id, { name: e.target.value })} className={`${input} py-1.5`} />
                <select value={s.access} aria-label="Who gets in" onChange={(e) => { void b.saveStreet(s.id, { access: e.target.value }); done(`${s.name}: ${e.target.value === 'public' ? 'open to everyone' : e.target.value + ' door'}`); }} className="h-9 rounded-xl border border-border bg-background px-2 text-xs text-foreground">
                  <option value="public">Everyone</option>
                  <option value="fan">Fans</option>
                  <option value="insider">Insiders</option>
                  <option value="council">Council</option>
                  <option value="event">Event</option>
                </select>
                <button type="button" aria-label={s.hidden ? 'Show' : 'Hide'} onClick={() => { void b.saveStreet(s.id, { hidden: !s.hidden }); done(`${s.name} ${s.hidden ? 'shown' : 'hidden'}`); }} className={`rounded-full p-1.5 ${s.hidden ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {s.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button type="button" aria-label="Delete street" onClick={() => { void b.removeStreet(s.id); done(`${s.name} deleted`); }} className="rounded-full p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
            {b.cities.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <input value={c.name} maxLength={40} aria-label="City name" onChange={(e) => void b.saveCity(c.id, { name: e.target.value })} className={`${input} py-1.5`} />
                <span className="shrink-0 text-[11px] text-muted-foreground">city</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who may post</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([['off', 'Only me'], ['members', 'People past the key'], ['everyone', 'Anyone']] as const).map(([v, t]) => (
              <button key={v} type="button" onClick={() => { void b.saveWorld({ visitor_posts: v }); done(`Posting: ${t}`); }} className={`h-8 rounded-full px-3 text-xs font-medium ${(w.visitor_posts ?? 'off') === v ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}>{t}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">The key</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([['songchainn', '$ONGCHAINN'], ['points', 'Loyalty points'], ['pass', 'A pass'], ['token', zoraCoin ? 'My creator coin' : 'My own token']] as const).map(([v, t]) => (
              <button key={v} type="button" disabled={v === 'token' && !zoraCoin && !b.gate.token_address} onClick={() => { void b.saveGate({ kind: v, ...(v === 'token' && zoraCoin ? { token_address: zoraCoin[1] } : {}) }); done(`Key: ${t}`); }} className={`h-8 rounded-full px-3 text-xs font-medium disabled:opacity-40 ${b.gate.kind === v ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}>{t}</button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-muted-foreground">Fan at<input type="number" value={b.gate.fan_threshold} onChange={(e) => void b.saveGate({ fan_threshold: Number(e.target.value) })} className={`${input} mt-0.5 py-1`} /></label>
            <label className="text-[11px] text-muted-foreground">Insider at<input type="number" value={b.gate.insider_threshold} onChange={(e) => void b.saveGate({ insider_threshold: Number(e.target.value) })} className={`${input} mt-0.5 py-1`} /></label>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advert on Home</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([['entrance', 'The gate'], ['hero', 'The hero'], ['custom', 'A clip of my own']] as const).map(([v, t]) => (
              <button key={v} type="button" onClick={() => { void b.saveWorld({ ad_kind: v }); done(`Advert: ${t}`); }} className={`h-8 rounded-full px-3 text-xs font-medium ${(w.ad_kind ?? 'entrance') === v ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}>{t}</button>
            ))}
          </div>
          {w.ad_kind === 'custom' ? <p className="mt-1 text-[11px] text-muted-foreground">Add the clip itself from the builder's Art step.</p> : null}
        </div>

        {log.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {log.map((l, i) => <li key={i} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" />{l}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-xs"><Link to="/world-builder">Full builder</Link></Button>
          {w.slug && <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-xs"><Link to={`/w/${w.slug}`}>Walk it</Link></Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button type="button" className="h-8 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground">Streets</button>
        <button type="button" onClick={() => setTab('settings')} className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground"><Settings2 className="h-3.5 w-3.5" /> Settings</button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {b.streets.map((s) => (
          <button key={s.id} type="button" onClick={() => setStreetId(s.id)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-medium ${street?.id === s.id ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}>{s.name}</button>
        ))}
      </div>
      {street && (
        <>
          {blocks.length === 0 ? <p className="text-xs text-muted-foreground">Nothing on {street.name} yet.</p> : (
            <ul className="space-y-1.5">
              {blocks.map((blk, i) => (
                <li key={blk.id} className="flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{getBlockType(blk.block_type)?.name ?? blk.block_type}</span>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => void b.moveBlock(street.id, blk.id, -1)} className="rounded-full p-1 text-muted-foreground disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => void b.moveBlock(street.id, blk.id, 1)} className="rounded-full p-1 text-muted-foreground disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" aria-label="Delete" onClick={() => { void b.removeBlock(street.id, blk.id); toast('Gone', { description: `Removed from ${street.name}.` }); }} className="rounded-full p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ADD.map((q) => (
              <Button key={q.id} size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => { void b.addBlock(street.id, q.id, q.defaults); toast('Added', { description: `${q.label} is on ${street.name}.` }); }}>
                <Plus className="mr-1 h-3 w-3" /> {q.label}
              </Button>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-xs"><Link to="/world-builder">Full builder</Link></Button>
        {b.world?.slug && <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-xs"><Link to={`/w/${b.world.slug}`}>Walk it</Link></Button>}
      </div>
    </div>
  );
}
