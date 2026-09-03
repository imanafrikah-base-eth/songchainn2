/**
 * Same-origin image proxy, for WebGL only.
 *
 * The whole catalog's artwork lives on public R2 buckets that do not send
 * Access-Control-Allow-Origin. That is fine for an <img> tag, which is why the
 * app has always looked right, but WebGL refuses to make a texture out of a
 * cross-origin image it cannot read. Without this, every picture in a 3D world
 * hangs as an empty frame.
 *
 * So the bytes come back through our own origin, with CORS headers on them.
 *
 * Only used by the 3D rooms. Flat pages keep loading images directly from R2,
 * because putting the entire catalog's traffic through a function would be
 * bandwidth we do not need to pay for.
 *
 * If the R2 buckets are ever given a CORS policy allowing the site's domain,
 * this can be deleted and `proxied()` in src/worlds/three/imageProxy.ts made a
 * pass-through.
 */

export const config = { runtime: 'nodejs' };

/** Only these hosts. An open proxy is somebody else's bandwidth bill and a way
 *  to launder requests through our domain. */
const ALLOWED_HOST = /^pub-[a-z0-9]+\.r2\.dev$/i;

const CACHE = 'public, max-age=86400, s-maxage=604800, immutable';

export default async function handler(req: Request): Promise<Response> {
  const target = new URL(req.url).searchParams.get('u');
  if (!target) {
    return new Response('Missing u', { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response('Bad url', { status: 400 });
  }

  if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) {
    return new Response('Host not allowed', { status: 403 });
  }

  const upstream = await fetch(url.toString(), {
    headers: { accept: 'image/*' },
  }).catch(() => null);

  if (!upstream?.ok) {
    return new Response('Upstream failed', { status: 502 });
  }

  const type = upstream.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) {
    return new Response('Not an image', { status: 415 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': CACHE,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}
