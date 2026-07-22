function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const R2B = "https://pub-221dc60ecc5143e3b28d9d2bfa2cbee0.r2.dev";
const R2C = "https://pub-16e4913e843a417aa5b0c907a4f79ba4.r2.dev";

interface ArtistMeta { name: string; img: string }
const ARTIST_META: Record<string, ArtistMeta> = {
  "1": { name: "7ROO7H BASED", img: `${R2B}/7ROO7H%20%20Based/7ROO7H%20Based%20(1).png` },
  "2": { name: "DenaJah", img: `${R2B}/DenaJah/file_0000000064dc71f5be6445bc8e4cda04.png` },
  "3": { name: "IMan Afrikah", img: `${R2B}/file_0000000077c8722f8f65c9d1abd8bca1-2.png` },
  "4": { name: "NDA", img: `${R2B}/NDA/NDA%20(1).png` },
  "5": { name: "PRP", img: `${R2B}/PRP/PRP%20(2).png` },
  "6": { name: "Sanchy", img: `${R2B}/Sanchy/Sanchy%20(1).png` },
  "7": { name: "Santana", img: `${R2B}/Santana/Santana%20(1).png` },
  "8": { name: "FAITH", img: `${R2B}/FAITH/Faith%20(2).png` },
  "9": { name: "JMN", img: `${R2B}/JMN.png` },
  "10": { name: "SAMMIE", img: `${R2B}/Sammie.png` },
  "11": { name: "N3M3SIS", img: `${R2C}/NEMESIS%20VS%20LADYRYN/NEMESIS%20VS%20LADYRN%20PFP.jpg` },
};

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id || "").trim();

  if (!id || !/^\d+$/.test(id)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
    return;
  }

  const artistUrl = `https://songchainn.xyz/artist/${id}`;
  const logoUrl = "https://songchainn.xyz/songchainn-logo.webp";

  const meta = ARTIST_META[id];
  let name = meta?.name || "$ongChainn";
  let img = meta?.img || logoUrl;

  // Enrich from DB for unlisted artist IDs
  if (!meta) {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "";

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        const { data } = await supabase
          .from("artist_accounts")
          .select("display_name, avatar_url")
          .eq("id", id)
          .maybeSingle();

        if (data) {
          if (data.display_name) name = data.display_name;
          if (data.avatar_url) img = data.avatar_url;
        }
      } catch {
        // keep defaults
      }
    }
  }

  const description = `Listen to ${name} on $ongChainn — Zambian music on Base`;

  const fcFrameJson = JSON.stringify({
    version: "next",
    imageUrl: img,
    button: {
      title: `🎵 ${name}`,
      action: {
        type: "launch_frame",
        name: "$ongChainn",
        url: artistUrl,
        splashImageUrl: logoUrl,
        splashBackgroundColor: "#1a0533",
      },
    },
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(name)} | $ongChainn</title>

  <meta property="og:title" content="${esc(name)} on $ongChainn" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(img)}" />
  <meta property="og:image:width" content="800" />
  <meta property="og:image:height" content="800" />
  <meta property="og:url" content="${esc(artistUrl)}" />
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="$ongChainn" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(name)} on $ongChainn" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(img)}" />
  <meta name="twitter:site" content="@songchainn" />

  <meta name="fc:frame" content="${esc(fcFrameJson)}" />

  <meta http-equiv="refresh" content="0;url=${esc(artistUrl)}" />
</head>
<body style="margin:0;background:#0a0a0a;">
  <script>window.location.replace("${artistUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}");</script>
  <noscript><a href="${esc(artistUrl)}">View artist</a></noscript>
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
