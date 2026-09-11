import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArtFit } from '@/lib/artFit';
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
import { MyWorldsList } from '@/worlds/builder/MyWorldsList';
import { OtherWorlds } from '@/worlds/builder/OtherWorlds';
import { StreetKey } from '@/worlds/builder/StreetKey';
import { DropsPanel } from '@/worlds/builder/DropsPanel';
import { ArtPicker } from '@/worlds/builder/ArtPicker';
import { MoshaPanel } from '@/worlds/builder/MoshaPanel';
import { PublishBar, type Requirement } from '@/worlds/builder/PublishBar';
import { StagePicker } from '@/worlds/builder/StagePicker';
import { MoshaSuggest } from '@/worlds/builder/MoshaSuggest';
import { MoshaOnPage } from '@/worlds/builder/MoshaOnPage';
import { guidingWorld, noteDid, startGuiding, stopGuiding } from '@/lib/moshaWatch';
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

type Step = 'name' | 'streets' | 'blocks' | 'art' | 'key' | 'drops' | 'walk' | 'publish';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'streets', label: 'Streets' },
  { id: 'blocks', label: 'Fill' },
  { id: 'art', label: 'Art' },
  { id: 'key', label: 'Key' },
  { id: 'drops', label: 'Drops' },
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

  /* Mo$ha can send an artist straight to one step (the Art step, most often)
     instead of dropping them at the start of the rail. */
  const askedStep = params.get('step');
  const [step, setStep] = useState<Step>(
    worldId && STEPS.some((s) => s.id === askedStep) ? (askedStep as Step) : worldId ? 'streets' : 'name',
  );

  /* Mo$ha riding along on this page, for somebody who asked him to take them
     here from the chat. Stays for this world until they stop him. */
  const [guideOn, setGuideOn] = useState(() => params.get('guide') === '1' || (Boolean(worldId) && guidingWorld() === worldId));
  useEffect(() => {
    if (guideOn && worldId) startGuiding(worldId);
  }, [guideOn, worldId]);
  /* Which step they are on is part of what they are doing, for whichever Mo$ha
     they talk to next. */
  useEffect(() => {
    if (!worldId) return;
    const label = STEPS.find((s) => s.id === step)?.label;
    if (label) noteDid('step', `went to the ${label} step`);
  }, [step, worldId]);
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

  const fitOf = (key: string) => b.world?.art_fit?.[key];
  const setFit = (key: string) => (fit: ArtFit | null) => {
    void b.saveWorldKey('art_fit', key, fit);
  };

  const zoraLinkOk = /^https?:\/\/([a-z0-9-]+\.)*zora\.co\//i.test(b.world?.zora_profile_url ?? '');
  const zoraWalletOk = /^0x[0-9a-fA-F]{40}$/.test(b.world?.zora_wallet_address ?? '');

  /* What the server actually requires, named once. The publish screen and the
     bar at the top both read this, so they can never tell an artist two
     different stories about what is left. */
  const requirements: Requirement[] = [
    { ok: true, label: 'A key is set' },
    { ok: (b.world?.story?.length ?? 0) > 0, label: 'A story on the gate' },
    { ok: filledStreets >= 3, label: `Something on three streets (${filledStreets} so far)` },
    { ok: zoraLinkOk && zoraWalletOk, label: 'Your Zora account is on the world' },
  ];

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
                    className={`h-10 rounded-full px-3.5 text-xs font-medium transition-colors focus-ring ${
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

        {/* Opening the doors used to live only on the last screen of the rail,
            where an artist who had finished building could not find it. It now
            travels with them, says what is left, and offers a look at the world
            as it stands. */}
        {b.world ? (
          <PublishBar
            slug={b.world.slug}
            published={b.world.status === 'published'}
            worldNumber={b.world.world_number}
            requirements={requirements}
            onPublish={() => void doPublish()}
            onOpenPublishStep={() => setStep('publish')}
          />
        ) : null}

        {guideOn && b.world ? (
          <MoshaOnPage
            stepLabel={STEPS.find((s) => s.id === step)?.label ?? step}
            onStop={() => {
              stopGuiding();
              setGuideOn(false);
            }}
          />
        ) : null}

        {/* Mo$ha. One question per screen, real examples, no answer required.
            Everybody gets this, including lite: it is the intro, and on lite it
            is all he does. */}
        <MoshaPanel step={step} worldId={b.world?.id ?? ''} />
        {b.world ? <div className="mb-4"><MoshaSuggest step={step} b={b} /></div> : null}

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
            {/* A world made on their other login, theirs to claim or leave. */}
            <OtherWorlds mine={myWorlds} />
            {/* Anything already started comes first. Somebody who has a world
                in progress almost never wants a second one, and being offered
                a blank form is how they conclude their work is gone. */}
            {unopened.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-card/60 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {unopened.length === 1 ? 'You already started a world.' : 'You already started these.'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {unopened.length > 1
                    ? 'An account holds one world. Fold the spare into the one you are keeping and nothing is lost.'
                    : 'Pick up where you left off.'}
                </p>
                <MyWorldsList
                  className="mt-3"
                  worlds={unopened}
                  onOpen={(w) => {
                    setParams({ id: w.id });
                    setStep('streets');
                  }}
                />
              </div>
            )}

            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                {unopened.length > 0 ? 'Or name a new world' : 'Name your world'}
              </h1>
              {unopened.length > 0 && (
                <p className="mt-1 text-xs text-amber-500">
                  You already have a world, and an account holds one. Open that one, or merge above.
                </p>
              )}
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
                placeholder="For example, N3M3SIS"
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
                  {/* A street that is not finished does not have to be a
                      choice between an empty room and no room at all. */}
                  <StagePicker
                    className="mt-2.5"
                    stage={s.stage ?? (s.hidden ? 'away' : 'open')}
                    onChange={(stage) => b.saveStreet(s.id, { stage, hidden: stage === 'away' })}
                  />
                  <StreetKey street={s} worldSlug={b.world?.slug} onSave={(patch) => b.saveStreet(s.id, patch)} />
                </li>
              ))}
            </ul>

            {b.cities.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-3.5">
                <h2 className="text-sm font-semibold text-foreground">Your cities</h2>
                <p className="mt-1 text-xs text-muted-foreground">Starter names. Call them what they are in your world.</p>
                <ul className="mt-2 space-y-2">
                  {b.cities.map((c) => (
                    <li key={c.id}>
                      <input
                        className={input}
                        value={c.name}
                        maxLength={40}
                        aria-label="City name"
                        onChange={(e) => b.saveCity(c.id, { name: e.target.value })}
                      />
                      <StagePicker
                        className="mt-2"
                        stage={c.stage}
                        onChange={(stage) => b.saveCity(c.id, { stage })}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                    className={`h-10 rounded-full px-3.5 text-xs font-medium focus-ring ${
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
                            variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                            aria-label="Move up" disabled={i === 0}
                            onClick={() => b.moveBlock(street.id, blk.id, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                            aria-label="Move down" disabled={i === blocks.length - 1}
                            onClick={() => b.moveBlock(street.id, blk.id, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-11 w-11 shrink-0"
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

            <Button onClick={() => setStep('art')} size="lg" className="h-11 w-full rounded-full">
              Set the key
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

        {/* 4 -------------------------------------------------------- key */}
        {/* 4 -------------------------------------------------------- art */}
        {step === 'art' && b.world && (
          <section className="space-y-6">
            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Dress the world</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your own pictures on the doors, the streets and the skyline, the way World #001 is dressed.
                A still is enough anywhere; a silent loop plays over it where you add one. Every slot is optional.
              </p>
            </header>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">The doors</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <ArtPicker label="World hero" help="Behind the map. Wide." value={b.world.hero_image} onChange={(v) => b.saveWorld({ hero_image: v })} fit={fitOf('hero')} onFit={setFit('hero')} />
                <ArtPicker label="Hero loop" help="Silent video over the hero. Optional." kind="video" value={b.world.hero_video} onChange={(v) => b.saveWorld({ hero_video: v })} fit={fitOf('hero')} onFit={setFit('hero')} />
                <ArtPicker label="Entrance" help="The doors people walk through on arrival. Portrait." aspect="aspect-[9/16] max-h-64" value={b.world.entrance_poster} onChange={(v) => b.saveWorld({ entrance_poster: v })} fit={fitOf('entrance')} onFit={setFit('entrance')} />
                <ArtPicker label="Entrance loop" help="Under three seconds. Plays once a visit." kind="video" aspect="aspect-[9/16] max-h-64" value={b.world.entrance_video} onChange={(v) => b.saveWorld({ entrance_video: v })} fit={fitOf('entrance')} onFit={setFit('entrance')} />
              </div>
            </div>

            {b.streets.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">The streets</h2>
                <p className="text-xs text-muted-foreground">One picture per door.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {b.streets.map((s) => (
                    <div key={s.id} className="space-y-2">
                      <ArtPicker
                        label={s.name}
                        fit={fitOf(`room:${s.slug}`)}
                        onFit={setFit(`room:${s.slug}`)}
                        value={b.world?.room_art?.[s.slug]}
                        onChange={(v) => void b.saveWorldKey('room_art', s.slug, v)}
                      />
                      <ArtPicker
                        label={`${s.name} loop`}
                        fit={fitOf(`room:${s.slug}`)}
                        onFit={setFit(`room:${s.slug}`)}
                        kind="video"
                        aspect="aspect-[16/9] max-h-24"
                        value={b.world?.room_video?.[s.slug]}
                        onChange={(v) => void b.saveWorldKey('room_video', s.slug, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {b.cities.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">The skyline</h2>
                <p className="text-xs text-muted-foreground">One picture per city.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {b.cities.map((c) => (
                    <div key={c.id} className="space-y-2">
                      <ArtPicker
                        label={c.name}
                        fit={fitOf(`city:${c.slug}`)}
                        onFit={setFit(`city:${c.slug}`)}
                        value={b.world?.city_art?.[c.slug]}
                        onChange={(v) => void b.saveWorldKey('city_art', c.slug, v)}
                      />
                      <ArtPicker
                        label={`${c.name} loop`}
                        fit={fitOf(`city:${c.slug}`)}
                        onFit={setFit(`city:${c.slug}`)}
                        kind="video"
                        aspect="aspect-[16/9] max-h-24"
                        value={b.world?.city_video?.[c.slug]}
                        onChange={(v) => void b.saveWorldKey('city_video', c.slug, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <details className="rounded-lg border border-border bg-card p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">The world with depth</summary>
              <p className="mt-1 text-xs text-muted-foreground">Three textures for the 3D city. Skip it and the city keeps its flat colours, which is a valid world, just a barer one.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <ArtPicker label="Sky" help="Night sky, 2:1, wrapped around everything." aspect="aspect-[2/1]" value={b.world.depth?.sky} onChange={(v) => void b.saveWorldKey('depth', 'sky', v)} />
                <ArtPicker label="Facade" help="Seamless tile on every tower." aspect="aspect-square" value={b.world.depth?.facade} onChange={(v) => void b.saveWorldKey('depth', 'facade', v)} />
                <ArtPicker label="Ground" help="Seamless tile on the ground." aspect="aspect-square" value={b.world.depth?.ground} onChange={(v) => void b.saveWorldKey('depth', 'ground', v)} />
              </div>
            </details>

            {/* What the world shows in its advert on Home. World #001 shows its
                brass doors opening; every artist decides what theirs shows. */}
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">Your advert on Home</p>
              <p className="mt-1 text-xs text-muted-foreground">What people see of your world before they walk in.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([
                  ['entrance', 'The gate'],
                  ['hero', 'The hero'],
                  ['custom', 'A clip of my own'],
                ] as const).map(([v, t]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => b.saveWorld({ ad_kind: v })}
                    className={`h-10 rounded-full px-3.5 text-xs font-medium focus-ring ${
                      (b.world.ad_kind ?? 'entrance') === v ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {(b.world.ad_kind ?? 'entrance') === 'custom' ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ArtPicker label="Advert still" help="Wide." value={b.world.ad_image} onChange={(v) => b.saveWorld({ ad_image: v })} fit={fitOf('ad')} onFit={setFit('ad')} />
                  <ArtPicker label="Advert loop" help="Silent, a few seconds." kind="video" value={b.world.ad_video} onChange={(v) => b.saveWorld({ ad_video: v })} fit={fitOf('ad')} onFit={setFit('ad')} />
                </div>
              ) : null}
            </div>

            <Button onClick={() => setStep('key')} size="lg" className="h-11 w-full rounded-full">
              Set the key
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

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

            <Button onClick={() => setStep('drops')} size="lg" className="h-11 w-full rounded-full">
              Drops
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        )}

        {/* 5 ------------------------------------------------------ drops */}
        {step === 'drops' && b.world && (
          <section className="space-y-4">
            <header>
              <h1 className="font-heading text-2xl font-semibold text-foreground">Drops</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Turn a song, artwork or any content into an NFT on Base, minted by your own wallet.
                You set the price and the copies. Optional, and you can come back to it any time.
              </p>
            </header>
            <DropsPanel
              worldSlug={b.world.slug}
              worldId={b.world.id}
              worldName={b.world.artist_name || b.world.slug}
              artistId={artistId}
            />
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
                    className={`h-10 rounded-full px-3.5 text-xs font-medium focus-ring ${
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
                    className={`h-10 rounded-full px-3.5 text-xs font-medium focus-ring ${
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
              {requirements.map((r) => (
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

            {/* The artist's Zora account. Every world's key is a coin and every
                coin pays somewhere; both are written on the world before the
                doors open, so nobody has to chase them later. */}
            <div className="rounded-lg border border-border bg-card p-3.5">
              <h2 className="text-sm font-medium text-foreground">Your Zora account</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste your Zora profile or creator coin link, and the wallet address that account pays to. Both are needed to open the doors.
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="zora-link" className="mb-1.5 block text-sm font-medium text-foreground">
                    Zora profile or creator coin link
                  </label>
                  <input
                    id="zora-link"
                    className={`${input} text-xs`}
                    placeholder="https://zora.co/@yourname"
                    inputMode="url"
                    value={b.world.zora_profile_url ?? ''}
                    onChange={(e) => b.saveWorld({ zora_profile_url: e.target.value.trim() || null })}
                  />
                  {b.world.zora_profile_url && !zoraLinkOk ? (
                    <p className="mt-1 text-xs text-destructive">That is not a zora.co link.</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="zora-wallet" className="mb-1.5 block text-sm font-medium text-foreground">
                    Zora wallet address
                  </label>
                  <input
                    id="zora-wallet"
                    className={`${input} font-mono text-xs`}
                    placeholder="0x..."
                    spellCheck={false}
                    value={b.world.zora_wallet_address ?? ''}
                    onChange={(e) => b.saveWorld({ zora_wallet_address: e.target.value.trim() || null })}
                  />
                  {b.world.zora_wallet_address && !zoraWalletOk ? (
                    <p className="mt-1 text-xs text-destructive">A wallet address is 0x followed by 40 characters.</p>
                  ) : null}
                </div>
              </div>
            </div>

            <Button onClick={doPublish} size="lg" className="h-11 w-full rounded-full" disabled={!zoraLinkOk || !zoraWalletOk}>
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
