import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CLASSIC_NINE_ROOMS } from '../rooms';
import { CLASSIC_FIVE_CITIES } from '../cities';
import type { Json } from '@/integrations/supabase/types';
import type { BlockInstance } from '../blocks';

/**
 * Every write the world builder makes.
 *
 * The UI never touches Supabase directly; it calls these. That keeps the
 * ordering rules in one place: a world is created as a draft with no number, a
 * number is only ever stamped by publish_world() on the server, and a street's
 * blocks are re-ordered by rewriting sort_order rather than by trusting array
 * position at read time.
 */

export interface DraftWorld {
  id: string;
  slug: string;
  artist_name: string;
  positioning: string;
  story: string[];
  accent: string;
  hero_image: string | null;
  token_symbol: string;
  status: string;
  world_number: number | null;
  tier: string;
  /** Who, besides the owner, may post inside this world. Off unless set. */
  visitor_posts: 'off' | 'members' | 'everyone';
  /** How much Mo$ha talks during the build. Only read on paid tiers. */
  mosha_mode: 'guided' | 'quiet';
}

export interface DraftStreet {
  id: string;
  slug: string;
  name: string;
  ring: number | null;
  access: string;
  tagline: string;
  teaser: string;
  hue: string;
  sort_order: number;
  /* Per-street key. null key_kind means this street inherits the world gate,
     which is how every street behaved before keys existed. The artist can
     change any of this at any time and it takes effect on the next load. */
  key_kind: 'open' | 'song' | 'token' | 'points' | 'nft' | null;
  key_song_id: string | null;
  key_threshold: string | null;
  /* The drop on this door, when key_kind is 'nft'. */
  key_nft_id: string | null;
}

export interface DraftGate {
  kind: 'token' | 'songchainn' | 'points' | 'pass';
  token_address: string | null;
  token_decimals: number;
  fan_threshold: number;
  insider_threshold: number;
  council_size: number;
}

export const DEFAULT_GATE: DraftGate = {
  kind: 'songchainn',
  token_address: null,
  token_decimals: 18,
  fan_threshold: 1000,
  insider_threshold: 10000,
  council_size: 10,
};

/** Slugs are concept-locked once published, so make a clean one up front. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function useWorldBuilder(worldId?: string) {
  const { user, artistId } = useAuth();
  const [world, setWorld] = useState<DraftWorld | null>(null);
  const [streets, setStreets] = useState<DraftStreet[]>([]);
  const [gate, setGate] = useState<DraftGate>(DEFAULT_GATE);
  const [blocksByStreet, setBlocksByStreet] = useState<Record<string, BlockInstance[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (id: string) => {
      if (!isSupabaseConfigured) return;
      setLoading(true);
      setError(null);
      try {
        const { data: w, error: we } = await supabase
          .from('worlds')
          .select(
            'id, slug, artist_name, positioning, story, accent, hero_image, token_symbol, status, world_number, tier, visitor_posts, mosha_mode',
          )
          .eq('id', id)
          .maybeSingle();
        if (we || !w) throw new Error('That world could not be opened');
        setWorld(w as unknown as DraftWorld);

        const { data: s } = await supabase
          .from('world_streets')
          .select('id, slug, name, ring, access, tagline, teaser, hue, sort_order, key_kind, key_song_id, key_threshold, key_nft_id')
          .eq('world_id', id)
          .order('sort_order');
        const streetRows = (s ?? []) as unknown as DraftStreet[];
        setStreets(streetRows);

        const { data: g } = await supabase
          .from('world_gates')
          .select('kind, token_address, token_decimals, fan_threshold, insider_threshold, council_size')
          .eq('world_id', id)
          .maybeSingle();
        if (g) setGate(g as unknown as DraftGate);

        if (streetRows.length) {
          const { data: b } = await supabase
            .from('world_blocks')
            .select('id, street_id, block_type, props, sort_order')
            .in('street_id', streetRows.map((x) => x.id))
            .order('sort_order');
          const grouped: Record<string, BlockInstance[]> = {};
          for (const row of (b ?? []) as unknown as Array<BlockInstance & { street_id: string }>) {
            (grouped[row.street_id] ||= []).push(row);
          }
          setBlocksByStreet(grouped);
        } else {
          setBlocksByStreet({});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (worldId) void load(worldId);
  }, [worldId, load]);

  /** Create a draft. No number is assigned here; publish does that. */
  const createWorld = useCallback(
    async (opts: { name: string; artistName: string; positioning: string; useTemplate: boolean }) => {
      if (!user?.id) throw new Error('Sign in first');
      const slug = slugify(opts.name);
      if (!slug) throw new Error('Give your world a name first');

      const { data: created, error: ce } = await supabase
        .from('worlds')
        .insert({
          slug,
          owner_id: user.id,
          // Stamped from the signed-in artist's linked account, never typed.
          // Blocks scope the catalog by this id, so leaving it null makes 'The
          // records' fall back to matching on the artist name, which is only
          // right if they spell it exactly as the catalog does.
          artist_id: artistId,
          artist_name: opts.artistName || opts.name,
          positioning: opts.positioning,
          status: 'draft',
        })
        .select('id')
        .single();

      if (ce || !created) {
        throw new Error(
          ce?.code === '23505' ? 'That name is already taken' : 'Could not create the world',
        );
      }
      const id = (created as { id: string }).id;

      // Every world starts with a key, so publish is never blocked on a thing
      // the artist did not know they needed.
      await supabase.from('world_gates').insert({ world_id: id, ...DEFAULT_GATE });

      if (opts.useTemplate) {
        // The Classic Nine is the layout World #001 proved in front of a real
        // audience. Starting from it is the difference between a blank page
        // and a world someone can finish in an afternoon.
        await supabase.from('world_streets').insert(
          CLASSIC_NINE_ROOMS.map((r) => ({
            world_id: id,
            slug: r.slug,
            name: r.name,
            ring: r.ring,
            access: r.access,
            tagline: r.tagline,
            teaser: r.teaser,
            hue: r.hue,
            sort_order: r.order,
          })),
        );
        await supabase.from('world_cities').insert(
          CLASSIC_FIVE_CITIES.map((c) => ({
            world_id: id,
            slug: c.slug,
            name: c.name,
            kind: c.kind,
            tagline: c.tagline,
            teaser: c.teaser,
            empty_line: c.emptyLine,
            hue: c.hue,
            sort_order: c.order,
            buildings: c.buildings,
          })),
        );
      }
      return id;
    },
    [user?.id, artistId],
  );

  const saveWorld = useCallback(
    async (patch: Partial<DraftWorld>) => {
      if (!world) return;
      setWorld({ ...world, ...patch } as DraftWorld);
      await supabase.from('worlds').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', world.id);
    },
    [world],
  );

  const saveGate = useCallback(
    async (patch: Partial<DraftGate>) => {
      if (!world) return;
      const next = { ...gate, ...patch };
      setGate(next);
      await supabase.from('world_gates').upsert({ world_id: world.id, ...next }, { onConflict: 'world_id' });
    },
    [world, gate],
  );

  const addStreet = useCallback(
    async (name: string) => {
      if (!world) return;
      const slug = slugify(name);
      if (!slug) return;
      const { data } = await supabase
        .from('world_streets')
        .insert({
          world_id: world.id,
          slug,
          name,
          ring: 0,
          access: 'public',
          sort_order: streets.length,
        })
        .select('id, slug, name, ring, access, tagline, teaser, hue, sort_order, key_kind, key_song_id, key_threshold, key_nft_id')
        .single();
      if (data) setStreets((prev) => [...prev, data as unknown as DraftStreet]);
    },
    [world, streets.length],
  );

  const saveStreet = useCallback(async (id: string, patch: Partial<DraftStreet>) => {
    setStreets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await supabase.from('world_streets').update(patch).eq('id', id);
  }, []);

  const removeStreet = useCallback(async (id: string) => {
    setStreets((prev) => prev.filter((s) => s.id !== id));
    await supabase.from('world_streets').delete().eq('id', id);
  }, []);

  const addBlock = useCallback(
    async (streetId: string, blockType: string, defaults: Record<string, unknown>) => {
      const order = (blocksByStreet[streetId]?.length ?? 0);
      const { data } = await supabase
        .from('world_blocks')
        // props is free-form jsonb by design; cast once here at the boundary
        // rather than forcing every block author to satisfy the Json type.
        .insert({ street_id: streetId, block_type: blockType, props: defaults as Json, sort_order: order })
        .select('id, block_type, props, sort_order')
        .single();
      if (data) {
        setBlocksByStreet((prev) => ({
          ...prev,
          [streetId]: [...(prev[streetId] ?? []), data as unknown as BlockInstance],
        }));
      }
    },
    [blocksByStreet],
  );

  const saveBlock = useCallback(
    async (streetId: string, blockId: string, props: Record<string, unknown>) => {
      setBlocksByStreet((prev) => ({
        ...prev,
        [streetId]: (prev[streetId] ?? []).map((b) => (b.id === blockId ? { ...b, props } : b)),
      }));
      await supabase.from('world_blocks').update({ props: props as Json }).eq('id', blockId);
    },
    [],
  );

  const removeBlock = useCallback(async (streetId: string, blockId: string) => {
    setBlocksByStreet((prev) => ({
      ...prev,
      [streetId]: (prev[streetId] ?? []).filter((b) => b.id !== blockId),
    }));
    await supabase.from('world_blocks').delete().eq('id', blockId);
  }, []);

  /** Move a block up or down and rewrite every sort_order on that street. */
  const moveBlock = useCallback(
    async (streetId: string, blockId: string, direction: -1 | 1) => {
      const current = [...(blocksByStreet[streetId] ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const i = current.findIndex((b) => b.id === blockId);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= current.length) return;
      [current[i], current[j]] = [current[j], current[i]];
      const renumbered = current.map((b, idx) => ({ ...b, sort_order: idx }));
      setBlocksByStreet((prev) => ({ ...prev, [streetId]: renumbered }));
      await Promise.all(
        renumbered.map((b) => supabase.from('world_blocks').update({ sort_order: b.sort_order }).eq('id', b.id)),
      );
    },
    [blocksByStreet],
  );

  /** Ask the server to open the doors. It decides, and it stamps the number. */
  const publish = useCallback(async () => {
    if (!world) return { ok: false, message: 'No world open', world_number: null as number | null };
    const { data, error: pe } = await supabase.rpc('publish_world', { _world_id: world.id });
    if (pe) return { ok: false, message: 'Could not publish', world_number: null };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.ok) await load(world.id);
    return {
      ok: Boolean(row?.ok),
      message: String(row?.message ?? ''),
      world_number: (row?.world_number ?? null) as number | null,
    };
  }, [world, load]);

  return {
    world,
    streets,
    gate,
    blocksByStreet,
    loading,
    error,
    createWorld,
    saveWorld,
    saveGate,
    addStreet,
    saveStreet,
    removeStreet,
    addBlock,
    saveBlock,
    removeBlock,
    moveBlock,
    publish,
    reload: load,
  };
}
