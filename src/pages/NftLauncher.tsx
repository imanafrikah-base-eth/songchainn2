import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Gem } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { fetchWorldBySlug } from '@/worlds/loader';
import { DropsPanel } from '@/worlds/builder/DropsPanel';
import type { WorldConfig } from '@/worlds/types';

/**
 * /drops/:worldSlug: the NFT launcher for one world, on its own page.
 *
 * The builder has the same panel as a step. This page exists for a world that
 * was not built in the builder (World #001 is code) and as a direct door for
 * an artist who wants to drop something without walking the six steps again.
 * It only lets the world's owner in: for a builder world that is the worlds
 * row's owner, for a code world it is the artist linked to that artist id.
 */
export default function NftLauncher() {
  const { worldSlug } = useParams<{ worldSlug: string }>();
  const { user, artistId } = useAuth();
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      const w = await fetchWorldBySlug(worldSlug);
      if (!live) return;
      setWorld(w);
      if (w && isSupabaseConfigured) {
        const { data } = await supabase.from('worlds').select('id, owner_id').eq('slug', w.slug).maybeSingle();
        if (!live) return;
        setWorldId((data as { id: string } | null)?.id ?? null);
        setOwnerId((data as { owner_id: string } | null)?.owner_id ?? null);
      }
      if (live) setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [worldSlug]);

  const isOwner = Boolean(
    user && world && (ownerId ? ownerId === user.id : artistId && world.artistId && artistId === world.artistId),
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <header className="mb-8">
          <Link
            to={world ? (ownerId ? `/w/${world.slug}` : `/world/${world.slug}`) : '/'}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to the world
          </Link>
          <span className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Gem className="h-3 w-3 text-primary" /> Drops
          </span>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {world ? `Make a drop in ${world.artistName} World` : 'Make a drop'}
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            A song, a piece of artwork or any content becomes an NFT on Base, minted by your own wallet.
            You set the price and the copies. It lives in your world, in the marketplace if you want,
            and it can be a key to your doors.
          </p>
        </header>

        {loading ? (
          <div className="h-6 w-40 animate-pulse rounded bg-secondary" />
        ) : !world ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">No world at this address.</p>
        ) : !user ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Sign in to make a drop.</p>
        ) : !isOwner ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Only the artist who owns this world can make drops in it.
          </p>
        ) : (
          <DropsPanel worldSlug={world.slug} worldId={worldId} worldName={world.artistName} artistId={world.artistId || artistId} />
        )}
      </main>
    </div>
  );
}
