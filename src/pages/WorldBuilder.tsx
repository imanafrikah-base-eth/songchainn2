import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navigation } from '@/components/Navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { BLOCK_TYPES, BlockList, getBlockType, type BlockContext } from '@/worlds/blocks';
import { PropForm } from '@/worlds/builder/PropForm';
import { useWorldBuilder, slugify } from '@/worlds/builder/useWorldBuilder';
import { useMyWorlds } from '@/worlds/builder/useMyWorlds';
import { StreetKey } from '@/worlds/builder/StreetKey';
import { MoshaPanel } from '@/worlds/builder/MoshaPanel';
import { MoshaChat, MoshaOptIn } from '@/worlds/builder/MoshaChat';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { useArtistGallery } from '@/hooks/useArtistMedia';
import type { WorldConfig, WorldRings } from '@/worlds/types';

/**
 * Create World, in six screens.
 *
 * Name it, lay out the streets, fill them, set the key, walk it, publish it.
 * Nothing else on the path. The whole point is that an artist who has never
 * opened a terminal can finish a world in an afternoon, so every screen does
 * exactly one thing and the language is access, never price.
 */

type Step = 'name' | 'streets' | 'blocks' | 'key' | 'walk' | 'publish';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'streets', label: 'Streets' },
  { id: 'blocks', label: 'Fill' },
  { id: 'key', label: 'Key' },
  { id: 'walk', label: 'Walk it' },
  { id: 'publish', label: 'Publish' },
];

const ACCESS_OPTIONS = [
  { value: 'public', label: 'Open to everyone' },
  { value: 'fan', label: 'Fans (ring 1)' },
  { value: 'insider', label: 'Insiders (ring 2)' },
  { value: 'council', label: 'Council (ring 3)' },
  { value: 'event', label: 'Event only' },
];

const RING_FOR: Record<string, number | null> = {
  public: 0,
  fan: 1,
  insider: 2,
  council: 3,
  event: null,
};

/** The four people every artist previews as, before anyone else sees it. */
const VIEWS = [
  { id: 'stranger', label: 'A stranger' },
  { id: 'fan', label: 'A fan' },
  { id: 'insider', label: 'An insider' },
  { id: 'council', label: 'The council' },
] as const;

function ringsFor(view: (typeof VIEWS)[number]['id']): WorldRings {
  return {
    ring0: true,
    ring1: view !== 'stranger',
    ring2: view === 'insider' || view === 'council',
    council: view === 'council',
    balance: 0,
    thresholds: { FAN: 0, INSIDER: 0 },
    rank: null,
    tokenLive: false,
  };
}

const input =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-ring';

export default function WorldBuilder() {
  const [params, setParams] = useSearchParams();
  const worldId = params.get('id') ?? undefined;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, artistId } = useAuth();
  const b = useWorldBuilder(worldId);
  /* Worlds this artist already started. Without this the builder greets
     everybody with "name your world", including the person who is half way
     through one, and their draft becomes unreachable. */
  const { data: myWorlds = [] } = useMyWorlds();
  const unopened = myWorlds.filter((w) => w.id !== worldId);

  const [step, setStep] = useState<Step>(worldId ? 'streets' : 'name');
  const [draft, setDraft] = useState({ name: '', artistName: '', positioning: '', useTemplate: true });
  const [creating, setCreating] = useState(false);
  const [activeStreet, setActiveStreet] = useState<string | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('stranger');
  const [picking, setPicking] = useState(false);

  const street = b.streets.find((s) => s.id === activeStreet) ?? b.streets[0] ?? null;
  const blocks = street ? (b.blocksByStreet[street.id] ?? []) : [];

  /** What the preview and every block sees. Built from the draft, not the DB. */
  const previewWorld = useMemo<WorldConfig>(
    () => ({
      slug: b.world?.slug ?? 'preview',
      worldNumber: b.world?.world_number ?? 0,
      artistId: '',
      artistName: b.world?.artist_name ?? (draft.artistName || 'Your world'),
      tokenSymbol: b.world?.token_symbol ?? '',
      chain: 'base',
      swapUrl: null,
      positioning: b.world?.positioning ?? '',
      story: b.world?.story ?? [],
      featuredSongIds: [],
      rooms: [],
      cities: [],
      accent: b.world?.accent ?? 'violet',
      heroImage: b.world?.hero_image ?? undefined,
    }),
    [b.world, draft.artistName],
  );

  const ctx: BlockContext = {
    world: previewWorld,
    rings: ringsFor(view),
    streetSlug: street?.slug ?? '',
  };

  const filledStreets = useMemo(
    () => b.streets.filter((s) => (b.blocksByStreet[s.id]?.length ?? 0) > 0).length,
    [b.streets, b.blocksByStreet],
  );

  /* ------------------------------------------------------------ Mo$ha --- */

  /* What this artist already has on SONGCHAINN. Mo$ha quotes these back, so
     "you have 12 tracks" is a fact rather than a flourish. */
  const { songs: allPublished } = usePublishedCatalog();
  const { data: gallery = [] } = useArtistGallery(artistId);
  const songCount = useMemo(
    () => (artistId ? allPublished.filter((s) => s.artistId === artistId).length : 0),
    [allPublished, artistId],
  );
  const galleryCount = gallery.length;

  // 'lite' is the stock tier: the whole builder, all the blocks, and Mo$ha does
  // the per-screen intro and nothing more. The chat is what the paid tiers add.
  const moshaPremium = (b.world?.tier ?? 'lite') !== 'lite';
  const [moshaMode, setMoshaModeState] = useState<'guided' | 'quiet'>('quiet');
  const [showOptIn, setShowOptIn] = useState(false);

  // Ask once per world, the first time they open a premium build.
  useEffect(() => {
    if (!b.world || !moshaPremium) return;
    setMoshaModeState(b.world.mosha_mode ?? 'quiet');
    const key = `songchainn:mosha-optin:${b.world.id}`;
    try {
      if (!localStorage.getItem(key)) {
        setShowOptIn(true);
        localStorage.setItem(key, '1');
      }
    } catch {
      /* private browsing; worst case he asks again */
    }
  }, [b.world?.id, moshaPremium]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMoshaMode = useCallback(
    (m: 'guided' | 'quiet') => {
      setMoshaModeState(m);
      void b.saveWorld({ mosha_mode: m });
    },
    [b],
  );

  /* Everything Mo$ha is allowed to know. Real state, so he cannot invent a
     feature or misdescribe a world that is sitting right there. */
  const moshaFacts = useMemo(
    () => ({
      step,
      worldName: b.world?.artist_name ?? draft.name,
      tier: b.world?.tier ?? 'lite',
      streetCount: b.streets.length,
      filledStreets,
      blockCount: Object.values(b.blocksByStreet).reduce((n, list) => n + list.length, 0),
      gateKind: b.gate?.kind ?? null,
      visitorPosts: b.world?.visitor_posts ?? 'off',
      published: b.world?.status === 'published',
      worldNumber: b.world?.world_number ?? null,
      songCount: songCount,
      galleryCount: galleryCount,
    }),
    [step, b.world, b.streets.length, b.blocksByStreet, b.gate, filledStreets, draft.name, songCount, galleryCount],
  );

  const create = useCallback(async () => {
    if (!draft.name.trim()) {
      toast({ title: 'Give your world a name', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const id = await b.createWorld(draft);
      setParams({ id }, { replace: true });
      setStep('streets');
      toast({ title: 'World created', description: 'It is a draft. Nobody can see it yet.' });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Could not create the world',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }, [b, draft, setParams, toast]);

  const doPublish = useCallback(async () => {
    const res = await b.publish();
    toast({
      title: res.message || (res.ok ? 'Live' : 'Not yet'),
      description: res.ok && res.world_number ? `You are World #${String(res.world_number).padStart(3, '0')}.` : undefined,
      variant: res.ok ? undefined : 'destructive',
    });
    // A world built here lives in the database, so it opens at /w/:slug.
    // /world/:slug is the hand written registry and sends anything it does
    // not recognise to Not Found, which is where every publish used to land.
    if (res.ok && b.world) navigate(`/w/${b.world.slug}`);
  }, [b, navigate, toast]);

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-heading text-2xl font-semibold text-foreground">Sign in to build</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A world belongs to somebody, so it needs a name attached to it.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4 sm:px-6">
        {/* Step rail */}
        <nav aria-label="Build steps" className="mb-6 overflow-x-auto scrollbar-hide">
          <ol className="flex min-w-max items-center gap-1.5">
            {STEPS.map((s, i) => {
              const reachable = Boolean(b.world) || s.id === 'name';
              const current = s.id === step;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => setStep(s.id)}
                    className={`h-9 rounded-full px-3.5 text-xs font-medium transition-colors focus-ring ${
                      current
                        ? 'bg-primary text-primary-foreground'
                        : reachable
                          ? 'border border-border text-muted-foreground'
                          : 'border border-border text-muted-foreground/40'
                    }`}
                  >
                    {i + 1}. {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Mo$ha. One question per screen, real examples, no answer required.
            Everybody gets this, including lite: it is the intro, and on lite it
            is all he does. */}
        <MoshaPanel step={step} worldId={b.world?.id ?? ''} />

        {/* The chat is a premium thing. On lite the whole builder and all the
            stock is still there, he just does not talk. */}
        {moshaPremium && showOptIn && (
          <MoshaOptIn
            mode={moshaMode}
            onModeChange={setMoshaMode}
            onDismiss={() => setShowOptIn(false)}
          />
        )}

        {/* 1 ------------------------------------------------------- name */}
        {step === 'name' && (
          <section className="space-y-4">
            {/* Anything already started comes first. Somebody who has a world
                in progress almost never wants a second one, and being offered
                a blank form is how they conclude their work is gone. */}
            {unopened.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-card/60 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {unopened.length === 1 ? 'You already started a world.' : 'You already started these.'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pick up where you left off, or start another one below.
                </p>
                <ul className="mt-3 space-y-2">
                  {unopened.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setParams({ id: w.id });
                          setStep('streets');
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {w.artist_name || w.slug}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {w.status === 'published' ? 'Published' : 'Draft'}
                            {w.world_number ? ` · World #${String(w.world_number).padStart(3, '0')}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-primary">Continue</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                {unopened.length > 0 ? 'Or name a new world' : 'Name your world'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This is the whole of step one on purpose.
              </p>
            </header>

            <div>
              <label htmlFor="w-name" className="mb-1.5 block text-sm font-medium text-foreground">
                World name
              </label>
              <input
                id="w-name"
                className={input}
                value={draft.name}
                placeholder="N3M3SIS"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              {draft.name ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Address: songchainn.xyz/world/<span className="text-foreground">{slugify(draft.name)}</span>
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="w-artist" className="mb-1.5 block text-sm font-medium text-foreground">
                Artist name
              </label>
              <input
                id="w-artist"
                className={input}
                value={draft.artistName}
                placeholder="How you want to be credited"
                onChange={(e) => setDraft({ ...draft, artistName: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="w-pos" className="mb-1.5 block text-sm font-medium text-foreground">
                One line
              </label>
              <input
                id="w-pos"
                className={input}
                value={draft.positioning}
                placeholder="What this place is, in a sentence"
                onChange={(e) => setDraft({ ...draft, positioning: e.target.value })}
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3.5">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border"
                checked={draft.useTemplate}
                onChange={(e) => setDraft({ ...draft, useTemplate: e.target.checked })}
              />
              <span className="text-sm">
                <span className="block font-medium text-foreground">Start from The Classic Nine</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  The nine-street layout World #001 proved in front of a real audience. You can rename,
                  reorder or delete any of them. Uncheck to start from an empty city.
                </span>
              </span>
            </label>

            <Button onClick={create} disabled={creating} size="lg" className="h-11 w-full rounded-full">
              {creating ? 'Creating...' : 'Create my world'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

        {/* 2 ---------------------------------------------------- streets */}
        {step === 'streets' && b.world && (
          <section className="space-y-4">
            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Your streets</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                A street is a page. The key is set per street, never per block.
              </p>
            </header>

            <ul className="space-y-2">
              {b.streets.map((s) => (
                <li key={s.id} className="rounded-lg border border-border bg-card p-3.5">
                  <div className="flex items-start gap-2">
                    <input
                      className={`${input} flex-1`}
                      value={s.name}
                      onChange={(e) => b.saveStreet(s.id, { name: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label={`Remove ${s.name}`}
                      onClick={() => b.removeStreet(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <select
                      className={`${input} h-9 w-auto min-w-0 flex-1 py-1`}
                      value={s.access}
                      onChange={(e) =>
                        b.saveStreet(s.id, {
                          access: e.target.value,
                          ring: RING_FOR[e.target.value] ?? null,
                        })
                      }
                    >
                      {ACCESS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">
                      {(b.blocksByStreet[s.id]?.length ?? 0)} on it
                    </span>
                  </div>
                  <StreetKey street={s} onSave={(patch) => b.saveStreet(s.id, patch)} />
                </li>
              ))}
            </ul>

            <AddStreet onAdd={b.addStreet} />

            <Button onClick={() => setStep('blocks')} size="lg" className="h-11 w-full rounded-full">
              Fill them
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

        {/* 3 ----------------------------------------------------- blocks */}
        {step === 'blocks' && b.world && (
          <section className="space-y-4">
            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Fill your streets</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a street, then put things on it.
              </p>
            </header>

            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex min-w-max gap-1.5">
                {b.streets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStreet(s.id)}
                    className={`h-9 rounded-full px-3.5 text-xs font-medium focus-ring ${
                      street?.id === s.id
                        ? 'bg-secondary text-foreground'
                        : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {street ? (
              <>
                <ul className="space-y-2">
                  {blocks.map((blk, i) => {
                    const def = getBlockType(blk.block_type);
                    const open = openBlock === blk.id;
                    return (
                      <li key={blk.id} className="rounded-lg border border-border bg-card">
                        <div className="flex items-center gap-1 p-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left focus-ring"
                            onClick={() => setOpenBlock(open ? null : blk.id)}
                          >
                            <span className="block truncate text-sm font-medium text-foreground">
                              {def?.name ?? blk.block_type}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {def?.description ?? 'This block is no longer on the shelf'}
                            </span>
                          </button>
                          <Button
                            variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                            aria-label="Move up" disabled={i === 0}
                            onClick={() => b.moveBlock(street.id, blk.id, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                            aria-label="Move down" disabled={i === blocks.length - 1}
                            onClick={() => b.moveBlock(street.id, blk.id, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                            aria-label="Remove block"
                            onClick={() => b.removeBlock(street.id, blk.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {open && def ? (
                          <div className="border-t border-border p-3.5">
                            <PropForm
                              specs={def.props}
                              values={blk.props ?? {}}
                              onChange={(next) => b.saveBlock(street.id, blk.id, next)}
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                {picking ? (
                  <div className="rounded-lg border border-border bg-card p-3.5">
                    <p className="mb-2.5 text-sm font-medium text-foreground">Put on this street</p>
                    <ul className="space-y-1.5">
                      {BLOCK_TYPES.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg border border-border p-2.5 text-left focus-ring"
                            onClick={() => {
                              void b.addBlock(street.id, t.id, t.defaults);
                              setPicking(false);
                            }}
                          >
                            <span className="block text-sm text-foreground">{t.name}</span>
                            <span className="block text-xs text-muted-foreground">{t.description}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="h-11 w-full rounded-full"
                    onClick={() => setPicking(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add something
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Add a street first.</p>
            )}

            <Button onClick={() => setStep('key')} size="lg" className="h-11 w-full rounded-full">
              Set the key
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

        {/* 4 -------------------------------------------------------- key */}
        {step === 'key' && b.world && (
          <section className="space-y-4">
            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Set the key</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                What someone has to hold to get past a locked door. A world does not need a coin.
              </p>
            </header>

            <div className="space-y-2">
              {[
                { v: 'songchainn', t: '$ONGCHAINN', d: 'One key, many doors. Anyone holding it already walks into every world using it, so your world opens with people in it.' },
                { v: 'points', t: 'Loyalty points', d: 'No wallet involved at all. Gate on the tier someone has earned by listening.' },
                { v: 'pass', t: 'A pass', d: 'Bought with a card or given away. Simplest key there is.' },
                { v: 'token', t: 'My own token', d: 'An ERC-20 on Base that you launched. songchainn takes a share of your creator fee stream, never your supply.' },
              ].map((o) => (
                <label
                  key={o.v}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3.5 ${
                    b.gate.kind === o.v ? 'border-primary bg-card' : 'border-border bg-card'
                  }`}
                >
                  <input
                    type="radio"
                    name="gate-kind"
                    className="mt-0.5 h-4 w-4"
                    checked={b.gate.kind === o.v}
                    onChange={() => b.saveGate({ kind: o.v as typeof b.gate.kind })}
                  />
                  <span className="text-sm">
                    <span className="block font-medium text-foreground">{o.t}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>

            {b.gate.kind === 'token' ? (
              <div>
                <label htmlFor="tok" className="mb-1.5 block text-sm font-medium text-foreground">
                  Token contract on Base
                </label>
                <input
                  id="tok"
                  className={`${input} font-mono text-xs`}
                  placeholder="0x..."
                  value={b.gate.token_address ?? ''}
                  onChange={(e) => b.saveGate({ token_address: e.target.value })}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fan" className="mb-1.5 block text-sm font-medium text-foreground">
                  Fan at
                </label>
                <input
                  id="fan" type="number" className={input} value={b.gate.fan_threshold}
                  onChange={(e) => b.saveGate({ fan_threshold: Number(e.target.value) })}
                />
              </div>
              <div>
                <label htmlFor="ins" className="mb-1.5 block text-sm font-medium text-foreground">
                  Insider at
                </label>
                <input
                  id="ins" type="number" className={input} value={b.gate.insider_threshold}
                  onChange={(e) => b.saveGate({ insider_threshold: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Whether anybody but you may speak in here. Off by default,
                because a room that talks back is a decision, not a setting
                somebody should discover after the fact. */}
            <div className="rounded-lg border border-border bg-card p-3.5">
              <h2 className="text-sm font-medium text-foreground">Can visitors post here?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Their words, shares and song cards, on your streets. Photos and video stay with
                artists, in here as everywhere else.
              </p>
              <div className="mt-3 space-y-2">
                {[
                  { v: 'off', t: 'Only me', d: 'Your world, your voice. Nobody else posts.' },
                  { v: 'members', t: 'People past the key', d: 'Anyone holding what opens the door can speak inside.' },
                  { v: 'everyone', t: 'Anyone who walks in', d: 'Open floor. Most life, least control.' },
                ].map((o) => (
                  <label
                    key={o.v}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
                      (b.world?.visitor_posts ?? 'off') === o.v ? 'border-primary' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="visitor-posts"
                      className="mt-1"
                      checked={(b.world?.visitor_posts ?? 'off') === o.v}
                      onChange={() => b.saveWorld({ visitor_posts: o.v as 'off' | 'members' | 'everyone' })}
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">{o.t}</span>
                      <span className="block text-sm text-muted-foreground">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={() => setStep('walk')} size="lg" className="h-11 w-full rounded-full">
              Walk it
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

        {/* 5 ------------------------------------------------------- walk */}
        {step === 'walk' && b.world && (
          <section className="space-y-4">
            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Walk it</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Four people. See exactly what each one sees before anybody else does.
              </p>
            </header>

            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex min-w-max gap-1.5">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setView(v.id)}
                    className={`h-9 rounded-full px-3.5 text-xs font-medium focus-ring ${
                      view === v.id
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex min-w-max gap-1.5">
                {b.streets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStreet(s.id)}
                    className={`h-9 rounded-full px-3.5 text-xs font-medium focus-ring ${
                      street?.id === s.id
                        ? 'bg-secondary text-foreground'
                        : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 pb-4">
              {street && (street.access === 'public' || ctx.rings?.ring1) ? (
                blocks.length ? (
                  <BlockList blocks={blocks} ctx={ctx} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nothing on this street yet.
                  </p>
                )
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  This door is locked for {VIEWS.find((v) => v.id === view)?.label.toLowerCase()}.
                </p>
              )}
            </div>

            <Button onClick={() => setStep('publish')} size="lg" className="h-11 w-full rounded-full">
              Open the doors
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

        {/* 6 ---------------------------------------------------- publish */}
        {step === 'publish' && b.world && (
          <section className="space-y-4">
            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Open the doors</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your world number is stamped here, and only here. It is earned, not handed out.
              </p>
            </header>

            <ul className="space-y-2">
              {[
                { ok: true, label: 'A key is set' },
                { ok: (b.world.story?.length ?? 0) > 0, label: 'A story on the gate' },
                { ok: filledStreets >= 3, label: `Something on three streets (${filledStreets} so far)` },
              ].map((r) => (
                <li
                  key={r.label}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3.5 text-sm"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      r.ok ? 'bg-primary text-primary-foreground' : 'border border-border'
                    }`}
                  >
                    {r.ok ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className={r.ok ? 'text-foreground' : 'text-muted-foreground'}>{r.label}</span>
                </li>
              ))}
            </ul>

            {(b.world.story?.length ?? 0) === 0 ? (
              <div>
                <label htmlFor="story" className="mb-1.5 block text-sm font-medium text-foreground">
                  Your story
                </label>
                <textarea
                  id="story"
                  rows={5}
                  className={input}
                  placeholder="One paragraph per line. What this world is, in your own words."
                  onChange={(e) =>
                    b.saveWorld({
                      story: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
            ) : null}

            <Button onClick={doPublish} size="lg" className="h-11 w-full rounded-full">
              Open the doors
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You can keep editing after it is live.
            </p>
          </section>
        )}

        {b.world ? (
          <div className="mt-8 border-t border-border pt-4">
            <Link
              to={`/w/${b.world.slug}`}
              className="inline-flex items-center text-xs text-muted-foreground focus-ring"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              View your world
            </Link>
          </div>
        ) : null}
      </main>

      {/* Folded into the corner until pulled up. Paid tiers only: on lite the
          builder and every block is still there, Mo$ha just does not talk. */}
      {moshaPremium && b.world && (
        <MoshaChat
          facts={moshaFacts}
          worldId={b.world.id}
          worldSlug={b.world.slug}
          mode={moshaMode}
          onModeChange={setMoshaMode}
        />
      )}
    </div>
  );
}

function AddStreet({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2">
      <input
        className={`${input} flex-1`}
        placeholder="Add a street"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) {
            onAdd(name.trim());
            setName('');
          }
        }}
      />
      <Button
        variant="secondary"
        className="h-10 shrink-0 rounded-lg px-4"
        onClick={() => {
          if (name.trim()) {
            onAdd(name.trim());
            setName('');
          }
        }}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
