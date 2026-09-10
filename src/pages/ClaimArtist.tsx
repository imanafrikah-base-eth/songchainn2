import { useMemo, useState } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Check, Loader2, Mic2, RefreshCw, Search } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { ClaimArtistPage } from '@/components/ClaimArtistPage';
import { useAuth } from '@/context/AuthContext';
import { useBecomeArtist } from '@/hooks/useBecomeArtist';
import { supabase } from '@/integrations/supabase/client';
import { ARTISTS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';

/**
 * /claim: how a person with a listening account becomes the artist they are.
 *
 * Two doors, and only one of them is guarded. Claiming a page that already
 * exists in the catalogue (an artist somebody could be pretending to be)
 * files an artist_claims row and waits for Admin > Claims; approval hands the
 * page over. A page of your OWN needs nobody's approval: "New here?" calls
 * become_artist and this account is an artist account right now, with an id
 * of its own. Until 9 Sep 2026 that second door was also a review queue, and
 * a new musician's first hour on SONGCHAINN was a form and a wait.
 */

type Claim = { id: string; artist_id: string; status: 'pending' | 'approved' | 'rejected'; created_at: string };

export default function ClaimArtist() {
  const { user, isArtist, artistId, refreshArtistStatus } = useAuth();
  const { becomeArtist, pending: becoming } = useBecomeArtist();
  const queryClient = useQueryClient();
  const { artists: published } = usePublishedCatalog();
  const [q, setQ] = useState('');
  const [checking, setChecking] = useState(false);

  const catalogue = useMemo(() => {
    const seen = new Set<string>();
    return [...ARTISTS, ...published]
      .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      .filter((a) => !a.id.startsWith('u-'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [published]);

  // Which pages are already somebody's. Readable by anyone: it is the same
  // fact the artist page uses to draw the verified tick.
  const { data: owned = {} } = useQuery({
    queryKey: ['artist-accounts-owned'],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data } = await supabase.from('artist_accounts').select('artist_id, user_id');
      const out: Record<string, boolean> = {};
      for (const row of (data ?? []) as Array<{ artist_id: string; user_id: string | null }>) {
        out[row.artist_id] = Boolean(row.user_id);
      }
      return out;
    },
    staleTime: 60_000,
  });

  const { data: mine = [] } = useQuery({
    queryKey: ['my-artist-claims', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Claim[]> => {
      const { data } = await supabase
        .from('artist_claims')
        .select('id, artist_id, status, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as Claim[];
    },
  });

  const newArtistId = user ? `u-${user.id}` : '';

  const checkAgain = async () => {
    setChecking(true);
    try {
      await refreshArtistStatus();
      await queryClient.invalidateQueries({ queryKey: ['my-artist-claims', user?.id] });
    } finally {
      setChecking(false);
    }
  };

  const filtered = catalogue.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pending = mine.filter((c) => c.status === 'pending');

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <header className="mb-8">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Mic2 className="h-3 w-3 text-primary" /> Artist account
          </span>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {isArtist ? 'This is an artist account' : 'Are you an artist on here?'}
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            {isArtist
              ? 'The Studio, the launcher, your world and your drops are all open to you.'
              : 'A listening account and an artist account are the same account. Make music? Open your Studio and it is yours right now. Already have a page on here? Claim it and we hand it over once we confirm it is you.'}
          </p>
        </header>

        {!user ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Sign in first, then come back here.
          </p>
        ) : isArtist ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BadgeCheck className="h-4 w-4 text-emerald-500" /> Artist id {artistId}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild><Link to="/studio">Open the Studio</Link></Button>
              <Button asChild variant="outline"><Link to="/world-builder">Build your world</Link></Button>
              <Button asChild variant="outline"><Link to="/launch">The launcher</Link></Button>
            </div>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="mb-8 rounded-2xl border border-primary/30 bg-primary/5 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Your claim is under review
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pending.map((c) => (c.artist_id === newArtistId ? 'New artist page' : catalogue.find((a) => a.id === c.artist_id)?.name ?? c.artist_id)).join(', ')}.
                  Once it is approved this account becomes the artist account.
                </p>
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void checkAgain()} disabled={checking}>
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check again
                </Button>
              </div>
            )}

            <section className="mb-10">
              <h2 className="font-heading text-lg font-semibold text-foreground">Already on SONGCHAINN?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Find your page and tell us it is yours.</p>
              <label className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  placeholder="Your artist name"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
                {filtered.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">No page by that name. If you are new here, open your Studio below.</li>
                ) : (
                  filtered.map((a) => {
                    const taken = owned[a.id] === true;
                    const myClaim = mine.find((c) => c.artist_id === a.id);
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                        {a.profileImage ? (
                          <img src={a.profileImage} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">{a.name.charAt(0)}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground"><ArtistName name={a.name} artistId={a.id} size={14} /></span>
                          <span className="block text-xs text-muted-foreground">
                            {taken ? 'This page already has its artist' : myClaim?.status === 'pending' ? 'Claim under review' : 'Not claimed yet'}
                          </span>
                        </span>
                        {taken ? (
                          <Check className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ClaimArtistPage artistId={a.id} artistName={a.name} isClaimed={false} />
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-heading text-lg font-semibold text-foreground">New here?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A page of your own needs nobody's approval. Open your Studio and this account becomes your artist account right now; the first record you send goes live the same minute.
              </p>
              <Button onClick={() => void becomeArtist()} disabled={becoming} className="mt-4 gap-1.5">
                {becoming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />} I make music, open my Studio
              </Button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
