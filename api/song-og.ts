import { createClient } from "@supabase/supabase-js";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id || "").trim();

  if (!id || !/^\d+$/.test(id)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
    return;
  }

  const songUrl = `https://songchainn.xyz/song/${id}`;

  let title = "$ongChainn";
  let artist = "";
  let img = "https://songchainn.xyz/songchainn-logo.webp";

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });
      const { data } = await supabase
        .from("songs")
        .select("title, artist_name, cover_art_url")
        .eq("id", id)
        .maybeSingle();

      if (data) {
        if (data.title) title = data.title;
        if (data.artist_name) artist = data.artist_name;
        if (data.cover_art_url) img = data.cover_art_url;
      }
    } catch {
      // fallback to defaults
    }
  }

  const displayTitle = artist ? `${title} — ${artist}` : title;
  const description = artist
    ? `Listen to "${title}" by ${artist} on $ongChainn`
    : "Listen on $ongChainn";

  const fcFrameJson = JSON.stringify({
    version: "next",
    imageUrl: img,
    button: {
      title: "🎵 Listen Now",
      action: {
        type: "launch_frame",
        name: "$ongChainn",
        url: songUrl,
        splashImageUrl: "https://songchainn.xyz/assets/splash.png",
        splashBackgroundColor: "#1a0533",
      },
    },
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(displayTitle)} | $ongChainn</title>

  <meta property="og:title" content="${esc(displayTitle)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(img)}" />
  <meta property="og:image:width" content="800" />
  <meta property="og:image:height" content="800" />
  <meta property="og:url" content="${esc(songUrl)}" />
  <meta property="og:type" content="music.song" />
  <meta property="og:site_name" content="$ongChainn" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(displayTitle)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(img)}" />
  <meta name="twitter:site" content="@songchainn" />

  <meta name="fc:frame" content="${esc(fcFrameJson)}" />

  <meta http-equiv="refresh" content="0;url=${esc(songUrl)}" />
</head>
<body style="margin:0;background:#0a0a0a;">
  <script>window.location.replace("${songUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}");</script>
  <noscript><a href="${esc(songUrl)}">Click to listen</a></noscript>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400"
  );
  res.end(html);
}
