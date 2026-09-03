import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Rocket, Globe2, Coins, Wallet, Check, ExternalLink, Loader2, ArrowRight, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Navigation } from '@/components/Navigation';
import { ConsentNotice } from '@/components/ConsentNotice';
import { AdultOnly, useAdultGate } from '@/components/AdultOnly';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMyLaunches, useDeployedLaunches, useLaunchActions, type LaunchKind } from '@/hooks/useTokenLaunch';

/**
 * The launcher.
 *
 * Everything an artist makes on SONGCHAINN can go out two ways, and this page
 * exists to make the difference obvious before anybody picks one.
 *
 *   Online   it appears on the app, public or inside their world. Account only.
 *   On chain it becomes an asset they control, in a wallet they choose.
 *
 * The second one is what this page sets up. Nothing deploys from here on a
 * click: a launch signs a real transaction and puts real liquidity on Base, so
 * the artist fills this in, reads it back, and it goes out through the official
 * launcher with their own wallet. That is slower and it is the right kind of
 * slower.
 */

const KINDS: { id: LaunchKind; label: string; blurb: string }[] = [
  { id: 'artist', label: 'An artist token', blurb: 'You. The key to your world, and the thing your people hold.' },
  { id: 'song', label: 'A song', blurb: 'One record, on its own. For a release that deserves its own economy.' },
  { id: 'community', label: 'A community token', blurb: 'A crew, a label, a scene. Whoever holds it belongs.' },
  { id: 'other', label: 'Something else', blurb: 'Your idea. If it can be a token, it can go through here.' },
];

const input =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary';

export default function Launch() {
  const { user, isArtist } = useAuth();
  const { data: mine = [], isLoading } = useMyLaunches();
  const { data: deployed = [] } = useDeployedLaunches();
  const { create, update } = useLaunchActions();
  const { allowed: adultAllowed } = useAdultGate();

  const [kind, setKind] = useState<LaunchKind>('artist');
  const [form, setForm] = useState({
    name: '',
    symbol: '',
    description: '',
    image_url: '',
    owner_wallet: '',
    website_url: '',
    vault_percentage: 10,
    vault_days: 180,
  });

  const draft = useMemo(() => mine.find((l) => l.status === 'draft') ?? null, [mine]);

  // Editing an existing draft rather than starting a second one, because two
  // half-filled launches is how somebody deploys the wrong one.
  useEffect(() => {
    if (!draft) return;
    setKind(draft.kind);
    setForm({
      name: draft.name,
      symbol: draft.symbol,
      description: draft.description ?? '',
      image_url: draft.image_url ?? '',
      owner_wallet: draft.owner_wallet ?? '',
      website_url: draft.website_url ?? '',
      vault_percentage: draft.vault_percentage,
      vault_days: draft.vault_days,
    });
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const walletLooksReal = !form.owner_wallet || /^0x[0-9a-fA-F]{40}$/.test(form.owner_wallet.trim());
  const canSave = form.name.trim().length > 1 && form.symbol.trim().length > 1 && walletLooksReal;

  const save = async (submit: boolean) => {
    if (!canSave) {
      toast.error('It needs a name and a symbol', {
        description: !walletLooksReal ? 'And that wallet address does not look right.' : undefined,
      });
      return;
    }
    const payload = {
      ...form,
      kind,
      owner_wallet: form.owner_wallet.trim() || null,
      status: submit ? ('submitted' as const) : ('draft' as const),
    };
    try {
      if (draft) await update.mutateAsync({ id: draft.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(submit ? 'Sent to the launcher' : 'Saved as a draft', {
        description: submit
          ? 'Nothing is on chain yet. You sign it with your own wallet, and this page will show the address the moment one exists.'
          : 'Nobody sees it but you.',
      });
    } catch (e) {
      toast.error('Could not save that', { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <header className="mb-8">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Rocket className="h-3 w-3 text-primary" /> The SONGCHAINN launcher
          </span>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Put it out, or put it on chain
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            Everything you make here can go two ways, and neither one is the lesser. Pick the one
            that fits what you are doing.
          </p>
        </header>

        {/* The two paths, side by side, because the whole point is the choice. */}
        <div className="mb-10 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <Globe2 className="mb-3 h-6 w-6 text-primary" />
            <h2 className="font-heading text-lg font-semibold text-foreground">Online</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              It appears on the app. Public, or only inside your world, your call. No wallet, no
              fee, no waiting on anybody.
            </p>
            <Link
              to="/studio"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              Go to the Studio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <Coins className="mb-3 h-6 w-6 text-primary" />
            <h2 className="font-heading text-lg font-semibold text-foreground">On chain</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              It becomes an asset you control, deployed to a wallet you choose. It can be the key to
              your world, and it is yours whatever happens to this app.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Set it up below.</p>
          </div>
        </div>

        {/* -------------------------------------------------------- form --- */}

        {!user ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Sign in to set up a launch.
          </p>
        ) : !isArtist ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground">The launcher is for artist accounts.</p>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              Everything else on SONGCHAINN is open to you. If you make music and want a page and a
              launcher of your own, put a record out and the rest follows.
            </p>
          </div>
        ) : !adultAllowed ? (
          /* Clause 3 of the Terms closes the launcher to under-18s. It used to
             gate on isArtist alone, so a 14 year old with a release could
             launch a token the Terms said they could not. */
          <AdultOnly reason="launch">{null}</AdultOnly>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">
                What are you launching?
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      kind === k.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {kind === k.id && <Check className="h-3.5 w-3.5 text-primary" />}
                      {k.label}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{k.blurb}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mb-8 space-y-4">
              <h2 className="font-heading text-lg font-semibold text-foreground">The token</h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-foreground">Name</span>
                  <input
                    className={input}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="IMan Afrikah"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-foreground">Symbol</span>
                  <input
                    className={`${input} font-mono uppercase`}
                    value={form.symbol}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase().slice(0, 11) }))}
                    placeholder="IMAN"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm text-foreground">What is it for?</span>
                <textarea
                  className={`${input} min-h-[80px] resize-none`}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Keys to my world on SONGCHAINN."
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-foreground">Token image</span>
                <input
                  className={input}
                  value={form.image_url}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                  placeholder="https://..."
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Square, and hosted somewhere permanent. This one is hard to change later.
                </span>
              </label>
            </section>

            <section className="mb-8 space-y-4">
              <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
                <Wallet className="h-4 w-4 text-primary" /> Where it lands
              </h2>
              <label className="block">
                <span className="mb-1 block text-sm text-foreground">Your wallet</span>
                <input
                  className={`${input} font-mono`}
                  value={form.owner_wallet}
                  onChange={(e) => setForm((f) => ({ ...f, owner_wallet: e.target.value }))}
                  placeholder="0x..."
                  spellCheck={false}
                />
                <span className="mt-1 block max-w-prose text-xs text-muted-foreground">
                  This wallet ends up owning the token and its treasury. Use one you control and
                  keep safe, not an exchange account. Nobody at SONGCHAINN can recover it for you.
                </span>
                {!walletLooksReal && (
                  <span className="mt-1 block text-xs text-destructive">
                    That is not a wallet address. It starts with 0x and is 42 characters.
                  </span>
                )}
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-foreground">
                    Held back for the treasury: {form.vault_percentage}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={form.vault_percentage}
                    onChange={(e) => setForm((f) => ({ ...f, vault_percentage: Number(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Locked for your community rather than sold at launch.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-foreground">
                    Locked for {form.vault_days} days
                  </span>
                  <input
                    type="range"
                    min={30}
                    max={365}
                    step={30}
                    value={form.vault_days}
                    onChange={(e) => setForm((f) => ({ ...f, vault_days: Number(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Longer reads as more serious. We confirm the lock with you before anything is deployed.
                  </span>
                </label>
              </div>
            </section>

            <ConsentNotice which="launch_risk" className="mb-4" />

            <div className="mb-10 flex flex-wrap gap-2">
              <Button onClick={() => void save(false)} variant="outline" disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save draft'}
              </Button>
              <Button onClick={() => void save(true)} className="gap-1.5" disabled={!canSave}>
                <Sparkles className="h-4 w-4" /> Send it to the launcher
              </Button>
            </div>

            <p className="mb-10 max-w-prose rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Nothing deploys from this page. </span>
              A launch signs a real transaction and puts real liquidity on Base, so it goes out
              through the official SONGCHAINN launcher with your own wallet, and only after you have
              read back exactly what it will do. This page will show the contract address the moment
              one genuinely exists, and not a second before.
            </p>

            {/* ------------------------------------------------- yours --- */}

            <section className="mb-10">
              <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">Your launches</h2>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : mine.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing set up yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {mine.map((l) => (
                    <li key={l.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{l.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">${l.symbol}</span>
                        <StatusPill status={l.status} />
                      </div>
                      {l.status_note && (
                        <p className="mt-1 text-xs text-muted-foreground">{l.status_note}</p>
                      )}
                      {l.token_address && (
                        <a
                          href={`https://basescan.org/token/${l.token_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-primary"
                        >
                          {l.token_address.slice(0, 10)}...{l.token_address.slice(-6)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* ----------------------------------------------- already live --- */}

        {deployed.length > 0 && (
          <section>
            <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">
              Launched through here
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {deployed.map((l) => (
                <li key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  {l.image_url ? (
                    <img src={l.image_url} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                      <Coins className="h-4 w-4 text-primary" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{l.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">${l.symbol}</span>
                  </span>
                  {l.token_address && (
                    <a
                      href={`https://basescan.org/token/${l.token_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${l.name} on Basescan`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === 'deployed'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
      : status === 'failed'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : status === 'submitted'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground';
  const label =
    status === 'deployed'
      ? 'Live on Base'
      : status === 'submitted'
        ? 'With the launcher'
        : status === 'failed'
          ? 'Did not go through'
          : status === 'cancelled'
            ? 'Cancelled'
            : 'Draft';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>
  );
}
