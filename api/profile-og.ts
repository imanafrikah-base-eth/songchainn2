// Link preview for a person's profile: /audience/:userId when the requester
// is a link crawler. The card carries their picture and their name on a
// $ongChainn frame; people never land here.

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SITE = "https://www.songchainn.xyz";
const LOGO = `${SITE}/icon-512.png`;

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id ?? "").trim();
  const pageUrl = `${SITE}/audience/${encodeURIComponent(id)}`;
  let name = "A listener on $ongChainn";
  let line = "Music straight from the artist. Free to stream, yours to hold.";
  let image = LOGO;

  if (/^[0-9a-f-]{36}$/i.test(id)) {
    try {
      const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        const r = await fetch(
          `${url}/rest/v1/audience_profiles?select=display_name,username,profile_name,bio,avatar_url,profile_picture_url,is_public&user_id=eq.${encodeURIComponent(id)}&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const rows = (await r.json()) as Array<Record<string, any>>;
        const p = rows?.[0];
        if (p && p.is_public !== false) {
          name = `${p.display_name || p.profile_name || p.username || "Someone"} on $ongChainn`;
          if (p.bio) line = String(p.bio).slice(0, 180);
          const pic = p.profile_picture_url || p.avatar_url;
          if (pic) image = /^https?:\/\//.test(pic) ? pic : `${SITE}${pic.startsWith("/") ? "" : "/"}${pic}`;
        }
      }
    } catch {
      /* the plain card still stands */
    }
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(name)}</title>
<meta name="description" content="${esc(line)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="$ongChainn">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(line)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="${image === LOGO ? "summary" : "summary_large_image"}">
<meta name="twitter:site" content="@songchainn">
<meta name="twitter:title" content="${esc(name)}">
<meta name="twitter:description" content="${esc(line)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${pageUrl}">
</head><body><a href="${pageUrl}">${esc(name)}</a></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.status(200).send(html);
}
