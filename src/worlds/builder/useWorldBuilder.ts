import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldStage } from '@/worlds/types';
import { noteDid } from '@/lib/moshaWatch';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CLASSIC_NINE_ROOMS } from '../rooms';
import { CLASSIC_FIVE_CITIES } from '../cities';
import type { Json } from '@/integrations/supabase/types';
import type { BlockInstance } from '../blocks';
import { normaliseFitMap, type ArtFitMap } from '@/lib/artFit';

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
  /* The art. Every slot World #001 has; all optional. */
  hero_video: string | null;
  entrance_poster: string | null;
  entrance_video: string | null;
  room_art: Record<string, string>;
  room_video: Record<string, string>;
  city_art: Record<string, string>;
  city_video: Record<string, string>;
  depth: { sky?: string; facade?: string; ground?: string };
  /** The artist's Zora account: profile or creator coin link, and the wallet it pays. Required to publish. */
  zora_profile_url: string | null;
  zora_wallet_address: string | null;
  /** The advert on Home: the gate loop (default), the hero loop, or a clip made for it. */
  ad_kind: 'entrance' | 'hero' | 'custom';
  ad_image: string | null;
  ad_video: string | null;
  /** How each slot's art sits in its frame. See src/lib/artFit.ts. */
  art_fit: ArtFitMap;
}

export interface DraftCity {
  id: string;
  slug: string;
  name: string;
  kind: string;
  hue: string;
  sort_order: number;
  /** How visitors see it while it is being built: open, coming soon, off the map. */
  stage?: WorldStage;
  /** Street slugs standing in this city, in the order they stand. */
  buildings?: string[];
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
  /** Put away: kept with everything on it, off the map until shown again. */
  hidden: boolean;
  /**
   * How visitors see it while it is being built. 'away' is the same thing
   * `hidden` has always meant, and the database keeps the two in step, so
   * older code that only reads `hidden` is unaffected.
   */
  stage?: WorldStage;
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

/* How each saved change is said to Mo$ha: [set, cleared]. Only what an artist
   would recognise as a thing they did; everything else stays unsaid. */
const WORLD_FIELD_WORDS: Partial<Record<keyof DraftWorld, [string, string]>> = {
  hero_image: ['set the hero picture', 'took the hero picture off'],
  hero_video: ['set the hero loop', 'took the hero loop off'],
  entrance_poster: ['set the entrance picture', 'took the entrance picture off'],
  entrance_video: ['set the entrance loop', 'took the entrance loop off'],
  story: ['changed the story on the gate', 'cleared the story on the gate'],
  positioning: ['changed the line about the world', 'cleared the line about the world'],
  artist_name: ['changed the name on the world', 'cleared the name on the world'],
  accent: ['changed the colour of the world', 'changed the colour of the world'],
  visitor_posts: ['changed who may post in the world', 'changed who may post in the world'],
  ad_kind: ['changed what the advert on Home shows', 'changed what the advert on Home shows'],
  ad_image: ['set the picture for the advert on Home', 'took the advert picture off'],
  ad_video: ['set the clip for the advert on Home', 'took the advert clip off'],
  zora_profile_url: ['put in their Zora link', 'took their Zora link off'],
  zora_wallet_address: ['put in the wallet their Zora account pays to', 'took the Zora payout wallet off'],
  mosha_mode: ['changed how much Mo$ha talks while they build', 'changed how much Mo$ha talks while they build'],
};

const STAGE_WORDS: Record<string, string> = { open: 'open to visitors', soon: 'Coming soon', away: 'off the map' };

function noteWorldPatch(patch: Partial<DraftWorld>) {
  for (const [field, value] of Object.entries(patch)) {
    const words = WORLD_FIELD_WORDS[field as keyof DraftWorld];
    if (!words) continue;
    const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
    noteDid(`world:${field}`, empty ? words[1] : words[0]);
  }
}

export function useWorldBuilder(worldId?: string) {
  const { user, artistId } = useAuth();
  const [world, setWorld] = useState<DraftWorld | null>(null);
  const [streets, setStreets] = useState<DraftStreet[]>([]);
  const [cities, setCities] = useState<DraftCity[]>([]);
  const [gate, setGate] = useState<DraftGate>(DEFAULT_GATE);
  const [blocksByStreet, setBlocksByStreet] = useState<Record<string, BlockInstance[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The world as of the last save, not as of the last render. An upload can
     take minutes, and the save that runs when it finishes used to build on the
     world as it was when the file was picked, wiping whatever was set while it
     was on its way. */
  const worldRef = useRef<DraftWorld | null>(null);
  useEffect(() => {
    worldRef.current = world;
  }, [world]);
  /* Names, for saying what was changed in words the artist chose. */
  const streetsRef = useRef<DraftStreet[]>([]);
  const citiesRef = useRef<DraftCity[]>([]);
  useEffect(() => {
    streetsRef.current = streets;
  }, [streets]);
  useEffect(() => {
    citiesRef.current = cities;
  }, [cities]);
  const streetName = (id: string) => streetsRef.current.find((s) => s.id === id)?.name ?? 'a street';
  const nameForSlug = (slug: string) =>
    streetsRef.current.find((s) => s.slug === slug)?.name ?? citiesRef.current.find((c) => c.slug === slug)?.name ?? slug;

  const load = useCallback(
    async (id: string) => {
      if (!isSupabaseConfigured) return;
      setLoading(true);
      setError(null);
      try {
        const { data: w, error: we } = await supabase
          .from('worlds')
          .select(
            'id, slug, artist_name, positioning, story, accent, hero_image, token_symbol, status, world_number, tier, visitor_posts, mosha_mode, hero_video, entrance_poster, entrance_video, room_art, room_video, city_art, city_video, depth, zora_profile_url, zora_wallet_address, ad_kind, ad_image, ad_video, art_fit',
          )
          .eq('id', id)
          .maybeSingle();
        if (we || !w) throw new Error('That world could not be opened');
        const row = w as unknown as DraftWorld;
        setWorld({
          ...row,
          room_art: (row.room_art as Record<string, string> | null) ?? {},
          room_video: (row.room_video as Record<string, string> | null) ?? {},
          city_art: (row.city_art as Record<string, string> | null) ?? {},
          city_video: (row.city_video as Record<string, string> | null) ?? {},
          depth: (row.depth as DraftWorld['depth'] | null) ?? {},
          art_fit: normaliseFitMap(row.art_fit),
        });

        const { data: c } = await supabase
          .from('world_cities')
          .select('id, slug, name, kind, hue, sort_order, stage, buildings')
          .eq('world_id', id)
          .order('sort_order');
        setCities((c ?? []) as unknown as DraftCity[]);

        const { data: s } = await supabase
          .from('world_streets')
          .select('id, slug, name, ring, access, tagline, teaser, hue, sort_order, key_kind, key_song_id, key_threshold, key_nft_id, hidden, stage')
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
        // The rules that refuse a world (an account holds one; a name belongs
        // to whoever took it) say why in plain words and name the world to
        // open instead, so the artist reads that rather than a code.
        throw new Error(
          ce?.message && ce.code === '23505'
            ? ce.message
            : ce?.code === '23505'
              ? 'That name is already taken'
              : ce?.message || 'Could not create the world',
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

  const writeWorld = useCallback(async (patch: Partial<DraftWorld>) => {
    const current = worldRef.current;
    if (!current) return;
    worldRef.current = { ...current, ...patch };
    setWorld((prev) => (prev ? { ...prev, ...patch } : prev));
    await supabase.from('worlds').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', current.id);
  }, []);

  const saveWorld = useCallback(
    async (patch: Partial<DraftWorld>) => {
      noteWorldPatch(patch);
      await writeWorld(patch);
    },
    [writeWorld],
  );

  /** One entry in one of the world's maps (a street's picture, a city's loop, a frame), merged into the latest map. */
  const saveWorldKey = useCallback(
    async (column: 'room_art' | 'room_video' | 'city_art' | 'city_video' | 'art_fit' | 'depth', key: string, value: unknown) => {
      const current = worldRef.current;
      if (!current) return;
      const next: Record<string, unknown> = { ...((current[column] as Record<string, unknown> | null) ?? {}) };
      const on = value !== null && value !== undefined;
      if (on) next[key] = value;
      else delete next[key];

      const place = nameForSlug(key.includes(':') ? key.split(':')[1] : key);
      const said: Record<typeof column, string> = {
        room_art: on ? `put a picture on the street ${place}` : `took the picture off the street ${place}`,
        room_video: on ? `put a loop on the street ${place}` : `took the loop off the street ${place}`,
        city_art: on ? `put a picture on the city ${place}` : `took the picture off the city ${place}`,
        city_video: on ? `put a loop on the city ${place}` : `took the loop off the city ${place}`,
        art_fit: `framed the ${key.includes(':') ? `picture on ${place}` : `${key} picture`}`,
        depth: on ? `set the 3D ${key} texture` : `took the 3D ${key} texture off`,
      };
      noteDid(`${column}:${key}`, said[column]);
      await writeWorld({ [column]: next } as Partial<DraftWorld>);
    },
    [writeWorld],
  );

  const saveGate = useCallback(
    async (patch: Partial<DraftGate>) => {
      if (!world) return;
      const next = { ...gate, ...patch };
      setGate(next);
      noteDid('gate', 'changed the key to the world or how much of it opens each door');
      await supabase.from('world_gates').upsert({ world_id: world.id, ...next }, { onConflict: 'world_id' });
    },
    [world, gate],
  );

  const addStreet = useCallback(
    async (name: string) => {
      if (!world) return null;
      const slug = slugify(name);
      if (!slug) return null;
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
        .select('id, slug, name, ring, access, tagline, teaser, hue, sort_order, key_kind, key_song_id, key_threshold, key_nft_id, hidden, stage')
        .single();
      if (data) {
        setStreets((prev) => [...prev, data as unknown as DraftStreet]);
        noteDid(`street-add:${slug}`, `added a street called ${name}`);
        return slug;
      }
      return null;
    },
    [world, streets.length],
  );

  const saveCity = useCallback(async (id: string, patch: Partial<DraftCity>) => {
    const name = patch.name ?? citiesRef.current.find((c) => c.id === id)?.name ?? 'a city';
    if (patch.name !== undefined) noteDid(`city-name:${id}`, `renamed a city to ${patch.name}`);
    if (patch.stage) noteDid(`city-stage:${id}`, `set the city ${name} to ${STAGE_WORDS[patch.stage] ?? patch.stage}`);
    if (patch.buildings) noteDid(`city-buildings:${id}`, `rearranged the streets standing in the city ${name}`);
    setCities((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase.from('world_cities').update(patch).eq('id', id);
  }, []);

  const saveStreet = useCallback(async (id: string, patch: Partial<DraftStreet>) => {
    const name = patch.name ?? streetName(id);
    if (patch.name !== undefined) noteDid(`street-name:${id}`, `renamed a street to ${patch.name}`);
    if (patch.stage) noteDid(`street-stage:${id}`, `set the street ${name} to ${STAGE_WORDS[patch.stage] ?? patch.stage}`);
    else if (patch.hidden !== undefined) noteDid(`street-stage:${id}`, patch.hidden ? `put the street ${name} off the map` : `put the street ${name} back on the map`);
    if (patch.access !== undefined) noteDid(`street-access:${id}`, `changed who gets into ${name}`);
    if (patch.key_kind !== undefined || patch.key_song_id !== undefined || patch.key_nft_id !== undefined || patch.key_threshold !== undefined) {
      noteDid(`street-key:${id}`, `changed the key on ${name}`);
    }
    if (patch.tagline !== undefined || patch.teaser !== undefined) noteDid(`street-words:${id}`, `changed the words on ${name}`);
    setStreets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await supabase.from('world_streets').update(patch).eq('id', id);
  }, []);

  const removeStreet = useCallback(async (id: string) => {
    noteDid(`street-remove:${id}`, `deleted the street ${streetName(id)}`);
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
        noteDid(`block-add:${streetId}:${blockType}`, `added ${blockType.replace(/-/g, ' ')} to ${streetName(streetId)}`);
      }
    },
    [blocksByStreet],
  );

  const saveBlock = useCallback(
    async (streetId: string, blockId: string, props: Record<string, unknown>) => {
      noteDid(`block-edit:${blockId}`, `edited something on ${streetName(streetId)}`);
      setBlocksByStreet((prev) => ({
        ...prev,
        [streetId]: (prev[streetId] ?? []).map((b) => (b.id === blockId ? { ...b, props } : b)),
      }));
      await supabase.from('world_blocks').update({ props: props as Json }).eq('id', blockId);
    },
    [],
  );

  const removeBlock = useCallback(async (streetId: string, blockId: string) => {
    noteDid(`block-remove:${blockId}`, `removed something from ${streetName(streetId)}`);
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
      noteDid(`block-move:${streetId}`, `reordered what is on ${streetName(streetId)}`);
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
    noteDid('publish', row?.ok ? 'opened the doors of the world' : `tried to open the doors and was told: ${String(row?.message ?? 'not yet')}`);
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
    cities,
    gate,
    blocksByStreet,
    loading,
    error,
    createWorld,
    saveWorld,
    saveWorldKey,
    saveGate,
    addStreet,
    saveStreet,
    saveCity,
    removeStreet,
    addBlock,
    saveBlock,
    removeBlock,
    moveBlock,
    publish,
    reload: load,
  };
}
