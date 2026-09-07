import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { Navigation } from '@/components/Navigation';
import { BlockList, type BlockContext, type BlockInstance } from '@/worlds/blocks';
import { fetchWorldBySlug } from '@/worlds/loader';
import { WalkIn3D, panelsFromBlocks } from '@/worlds/three/WalkIn3D';
import type { WorldConfig, WorldRings } from '@/worlds/types';
import { WorldDrops } from '@/worlds/components/WorldDrops';
import { useAuth } from '@/context/AuthContext';

/**
 * Viewing a world that was built in the builder.
 *
 * Deliberately a separate route from /world/:worldSlug. That one renders the
 * hand-built World #001 and is held behind WORLDS_ENABLED until its artist is
 * ready; nothing here is allowed to open that door early. A world someone
 * builds needs somewhere to live today, so it lives here.
 *
 * Access is still resolved by the server. This page paints doors, it never
 * decides them, and a failed read closes a door rather than opening it.
 */

const OPEN_TO_ALL = new Set(['public', 'event']);

export default function BuiltWorld() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [streets, setStreets] = useState<
    Array<{ id: string; slug: string; name: string; access: string; tagline: string }>
  >([]);
  const [blocks, setBlocks] = useState<Record<string, BlockInstance[]>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const { user } = useAuth();

  const activeSlug = params.get('street');

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      const w = await fetchWorldBySlug(slug);
      if (!live) return;
      if (!w) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setWorld(w);

      if (isSupabaseConfigured) {
        const { data: row } = await supabase
          .from('worlds')
          .select('id, owner_id')
          .eq('slug', slug ?? '')
          .maybeSingle();
        const worldId = (row as { id: string } | null)?.id;
        if (live) setOwnerId((row as { owner_id: string | null } | null)?.owner_id ?? null);
        if (worldId) {
          const { data: s } = await supabase
            .from('world_streets')
            .select('id, slug, name, access, tagline, sort_order')
            .eq('world_id', worldId)
            .order('sort_order');
          const rows = (s ?? []) as unknown as Array<{
            id: string; slug: string; name: string; access: string; tagline: string;
          }>;
          if (!live) return;
          setStreets(rows);

          if (rows.length) {
            const { data: bl } = await supabase
              .from('world_blocks')
              .select('id, street_id, block_type, props, sort_order')
              .in('street_id', rows.map((r) => r.id))
              .order('sort_order');
            const grouped: Record<string, BlockInstance[]> = {};
            for (const r of (bl ?? []) as unknown as Array<BlockInstance & { street_id: string }>) {
              (grouped[r.street_id] ||= []).push(r);
            }
            if (live) setBlocks(grouped);
          }
        }
      }
      if (live) setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [slug]);

  // No wallet resolution on this route yet, so everyone is a stranger: open
  // streets are open, gated streets read as locked. Failing closed is the rule.
  const rings: WorldRings | null = null;

  const street = useMemo(
    () => streets.find((s) => s.slug === activeSlug) ?? streets[0] ?? null,
    [streets, activeSlug],
  );

  const ctx: BlockContext | null = world && street
    ? { world, rings, streetSlug: street.slug }
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto max-w-3xl px-4 py-16">
          <div className="h-6 w-40 animate-pulse rounded bg-secondary" />
        </main>
      </div>
    );
  }

  if (notFound || !world) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="font-heading text-2xl font-semibold text-foreground">No world here</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing has been built at this address yet.
          </p>
        </main>
      </div>
    );
  }

  const open = street ? OPEN_TO_ALL.has(street.access) : false;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4 sm:px-6">
        <header className="border-b border-border pb-5">
          {world.worldNumber ? (
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              World #{String(world.worldNumber).padStart(3, '0')}
            </p>
          ) : null}
          <h1 className="mt-1.5 font-heading text-3xl font-semibold text-foreground sm:text-4xl">
            {world.artistName}
          </h1>
          {world.positioning ? (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
              {world.positioning}
            </p>
          ) : null}
        </header>

        {streets.length > 1 ? (
          <nav aria-label="Streets" className="my-5 overflow-x-auto scrollbar-hide">
            <ul className="flex min-w-max gap-1.5">
              {streets.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`?street=${s.slug}`}
                    className={`inline-flex h-9 items-center rounded-full px-3.5 text-xs font-medium focus-ring ${
                      street?.id === s.id
                        ? 'bg-secondary text-foreground'
                        : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {OPEN_TO_ALL.has(s.access) ? null : <Lock className="mr-1.5 h-3 w-3" />}
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {street && ctx ? (
          open ? (
            <>
              <WalkIn3D
                panels={panelsFromBlocks(blocks[street.id] ?? [])}
                title={street.name}
              />
              <BlockList blocks={blocks[street.id] ?? []} ctx={ctx} />
            </>
          ) : (
            <div className="mt-6 rounded-lg border border-border bg-card px-5 py-12 text-center">
              <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">{street.name} is locked</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {street.tagline || 'Hold the key to this world to come in.'}
              </p>
            </div>
          )
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">This world has no streets yet.</p>
        )}

        {/* Drops minted from inside this world. Nothing renders when there
            are none; the owner always gets the door to make one. */}
        <div className="mt-6 border-t border-border">
          <WorldDrops worldSlug={world.slug} ownerLink={user && ownerId === user.id ? `/drops/${world.slug}` : null} />
        </div>

        {world.story?.length ? (
          <section className="mt-10 border-t border-border pt-6">
            {world.story.map((p, i) => (
              <p key={i} className="mb-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {p}
              </p>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
