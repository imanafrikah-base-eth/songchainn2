// Link preview for a battle: /wavewarz-africa/battle/:id when the requester is
// a link crawler (WhatsApp, X, Facebook, Telegram, Discord, Slack, Farcaster).
// People never land here; vercel.json only routes crawlers. The card shows the
// two artists, the score when the battle is decided, and who won.

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SITE = "https://www.songchainn.xyz";
const LOGO = `${SITE}/icon-512.png`;

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id ?? "").trim();
  const pageUrl = `${SITE}/wavewarz-africa/battle/${encodeURIComponent(id)}`;
  let title = "WaveWarz Africa on $ongChainn";
  let line = "Two artists, their songs, one crowd, one verdict. Listen live and vote.";
  let image = `${SITE}/wavewarz-africa-background.webp`;

  if (/^[0-9a-f-]{36}$/i.test(id)) {
    try {
      const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        const r = await fetch(
          `${url}/rest/v1/battles?select=title,status,artist_a_name,artist_b_name,artist_a_image,artist_b_image,winner,hikulu_points_a,hikulu_points_b,nakulu_points_a,nakulu_points_b,stage&id=eq.${encodeURIComponent(id)}&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const rows = (await r.json()) as Array<Record<string, any>>;
        const b = rows?.[0];
        if (b) {
          const a = b.artist_a_name || "Artist A";
          const c = b.artist_b_name || "Artist B";
          title = `${a} vs ${c}${b.title ? `: ${b.title}` : ""}`;
          const done = b.status === "ended" || b.status === "completed" || !!b.winner;
          if (done && b.winner) line = `${b.winner} took it. The crowd voted, $HIKULU and NAKULU scored the records. See the verdict.`;
          else if (b.status === "live") line = "Live now. Listen, vote, and watch the judges score the records.";
          else line = "A WaveWarz Africa battle. Listen live, vote, and read the judges' verdicts.";
          image = b.artist_a_image || b.artist_b_image || image;
        }
      }
    } catch {
      /* the plain card still stands */
    }
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(line)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="$ongChainn">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(line)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@songchainn">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(line)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="fc:frame" content='${JSON.stringify({ version: "next", imageUrl: image, button: { title: "Open the battle", action: { type: "launch_frame", name: "$ongChainn", url: pageUrl, splashImageUrl: LOGO, splashBackgroundColor: "#101113" } } }).replace(/'/g, "&#39;")}'>
<meta http-equiv="refresh" content="0;url=${pageUrl}">
</head><body><a href="${pageUrl}">${esc(title)}</a></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  res.status(200).send(html);
}
