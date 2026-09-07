// Token and collection metadata for drops, served from the app's own domain.
//
// A Zora 1155 token points at a URI and the URI is what every wallet,
// marketplace and explorer reads to draw the token. This route answers with
// standard ERC-1155 metadata built from the world_nfts row, so the artwork,
// the audio and the description a collector sees are the ones the artist
// put in the app, and the app never has to pin anything to IPFS or pay to.
//
//   /nft/:id/metadata.json            one token (rewritten to ?id=)
//   /nft/world/:slug/contract.json    the world's collection (rewritten to ?world=)
//
// Only live, paused or minting drops answer; drafts are private until the
// chain has them, and a token URI that 404s until then is correct.

export const config = { runtime: 'nodejs' };

const ORIGIN = 'https://songchainn.xyz';

function send(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Cache-Control',
    status === 200 ? 'public, max-age=300, stale-while-revalidate=3600' : 'public, max-age=30',
  );
  res.end(JSON.stringify(body));
}

async function client() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    '';
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Worlds defined in code (src/worlds/registry.ts) have no worlds row, so their
 * display name is mirrored here. A world built in the builder has a row and
 * never reaches this table.
 */
const CODE_WORLD_NAMES: Record<string, string> = {
  'iman-afrikah': 'IMan Afrikah',
};

function titleCase(slug: string): string {
  return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** The MIME type a wallet should expect, from the file itself, not a guess. */
function mimeFor(url: string, kind: string | null): string | null {
  const ext = (url.split('?')[0].split('#')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const table: Record<string, string> = {
    wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
    oga: 'audio/ogg', flac: 'audio/flac', opus: 'audio/opus', aiff: 'audio/aiff', aif: 'audio/aiff',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  };
  if (table[ext]) return table[ext];
  return kind === 'audio' ? 'audio/mpeg' : kind === 'video' ? 'video/mp4' : null;
}

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id || '').trim();
  const world = String(req.query?.world || '').trim().toLowerCase();

  const db = await client();
  if (!db) return send(res, 503, { error: 'Metadata is not configured' });

  if (world) {
    if (!/^[a-z0-9-]{1,64}$/.test(world)) return send(res, 400, { error: 'Bad world' });
    const { data } = await db
      .from('worlds')
      .select('slug, artist_name, positioning, hero_image')
      .eq('slug', world)
      .maybeSingle();
    const name = (data as any)?.artist_name || CODE_WORLD_NAMES[world] || titleCase(world);
    return send(res, 200, {
      name: `${name} World`,
      description:
        (data as any)?.positioning ||
        `Drops made in ${name}'s world on SONGCHAINN and minted on Base.`,
      image: (data as any)?.hero_image || `${ORIGIN}/songchainn-logo.webp`,
      external_link: `${ORIGIN}/w/${world}`,
    });
  }

  if (!UUID.test(id)) return send(res, 400, { error: 'Bad id' });

  const { data: drop } = await db
    .from('world_nfts')
    .select(
      'id, world_slug, artist_id, kind, title, description, song_id, image_url, media_url, media_kind, status, copies, key_ring',
    )
    .eq('id', id)
    .maybeSingle();

  const d = drop as any;
  if (!d || !['live', 'paused', 'minting'].includes(d.status)) {
    return send(res, 404, { error: 'No such drop' });
  }

  // The world's name: its row if it was built, the code table if it is World
  // #001, the slug as a last resort. The artist is named the same way when
  // there is no payout row to read the name from.
  const { data: worldRow } = await db.from('worlds').select('artist_name').eq('slug', d.world_slug).maybeSingle();
  const worldName = (worldRow as any)?.artist_name || CODE_WORLD_NAMES[d.world_slug] || titleCase(d.world_slug);
  let artist = '';
  if (d.artist_id) {
    const { data: a } = await db.from('artist_wallets').select('artist_name').eq('artist_id', d.artist_id).maybeSingle();
    artist = (a as any)?.artist_name || '';
  }
  if (!artist) artist = worldName;

  const attributes: Array<{ trait_type: string; value: string | number }> = [
    { trait_type: 'Kind', value: d.kind },
    { trait_type: 'World', value: d.world_slug },
    { trait_type: 'Platform', value: 'SONGCHAINN' },
  ];
  if (artist) attributes.push({ trait_type: 'Artist', value: artist });
  if (d.copies) attributes.push({ trait_type: 'Edition size', value: d.copies });
  if (d.key_ring) attributes.push({ trait_type: 'Opens', value: `${d.key_ring} doors` });

  const meta: Record<string, unknown> = {
    name: d.title,
    description: d.description || `${d.title}, made in ${worldName} World on SONGCHAINN.`,
    image: d.image_url,
    external_url: `${ORIGIN}/w/${d.world_slug}`,
    attributes,
  };
  if (d.media_url) {
    meta.animation_url = d.media_url;
    const mime = mimeFor(d.media_url, d.media_kind);
    if (mime) meta.content = { mime, uri: d.media_url };
  }
  return send(res, 200, meta);
}
