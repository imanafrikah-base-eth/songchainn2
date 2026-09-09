// Link preview for an artist's world: /world/:slug and /w/:slug when the
// requester is a link crawler (WhatsApp, X, Facebook, Telegram, Discord,
// Slack, Farcaster). Humans never land here; vercel.json only routes crawlers.
//
// World #001 is hand-built in code, so its facts are written here; every
// other world is read from the database.

function esc(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const SITE = "https://www.songchainn.xyz";
const CODE_WORLDS: Record<string, { name: string; number: number; line: string; image: string }> = {
  "iman-afrikah": {
    name: "IMan Afrikah",
    number: 1,
    line: "Streets you walk, rooms that open on a key, a stage built for live moments. World #001 on $ongChainn.",
    image: `${SITE}/world-assets/square-hero.jpg`,
  },
};

export default async function handler(req: any, res: any) {
  const slug = String(req.query?.slug ?? "").trim().toLowerCase();
  const built = req.query?.built === "1";
  let name = "An artist world";
  let number = 0;
  let line = "Artists do not get a page here. They get a world. Streets you walk, rooms that open on a key, a stage built for live moments.";
  let image = `${SITE}/assets/splash.webp`;

  const coded = CODE_WORLDS[slug];
  if (coded) {
    name = coded.name; number = coded.number; line = coded.line; image = coded.image;
  } else if (slug) {
    try {
      const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        const r = await fetch(
          `${url}/rest/v1/worlds?select=artist_name,world_number,positioning,hero_image,entrance_poster,ad_kind,ad_image&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const rows = (await r.json()) as Array<Record<string, any>>;
        const w = rows?.[0];
        if (w) {
          name = w.artist_name || name;
          number = Number(w.world_number ?? 0);
          if (w.positioning) line = String(w.positioning);
          image = (w.ad_kind === "custom" && w.ad_image) || w.entrance_poster || w.hero_image || image;
        }
      }
    } catch {
      /* the generic preview still stands */
    }
  }

  const title = number ? `World #${String(number).padStart(3, "0")}: ${name}` : `${name} on $ongChainn`;
  const pageUrl = `${SITE}/${built || !coded ? "w" : "world"}/${slug}`;
  const html = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <title>${esc(title)} | $ongChainn</title>
  <meta name="description" content="${esc(line)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(line)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="$ongChainn" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(line)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta http-equiv="refresh" content="0;url=${esc(pageUrl)}" />
</head><body><a href="${esc(pageUrl)}">${esc(title)}</a></body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(200).send(html);
}
