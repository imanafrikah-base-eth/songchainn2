function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const R2B = "https://pub-221dc60ecc5143e3b28d9d2bfa2cbee0.r2.dev";
const R2C = "https://pub-16e4913e843a417aa5b0c907a4f79ba4.r2.dev";

// The pictures the founding artists shipped with. Only used when the artist
// has not put up a picture of their own.
interface ArtistMeta { name: string; img: string }
const ARTIST_META: Record<string, ArtistMeta> = {
  "1": { name: "7ROO7H", img: `${R2B}/7ROO7H%20%20Based/7ROO7H%20Based%20(1).png` },
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

const slugOf = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type Row = Record<string, any>;

async function db() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";
  if (!supabaseUrl || !supabaseKey) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

export default async function handler(req: any, res: any) {
  // Reached by name (/n3m3sis, any artist, founding or joined through the
  // app) or by id (/artist/11, /share/artist/11).
  // An artist who was renamed keeps their old address working.
  const RENAMED: Record<string, string> = { "7roo7h-based": "7roo7h" };
  const rawSlug = slugOf(String(req.query?.slug || ""));
  const slugParam = RENAMED[rawSlug] || rawSlug;
  let id =
    String(req.query?.id || "").trim() ||
    Object.keys(ARTIST_META).find((k) => slugOf(ARTIST_META[k].name) === slugParam) ||
    "";

  const logoUrl = "https://songchainn.xyz/songchainn-logo.webp";
  let name = "";
  let picture = "";

  try {
    const supabase = await db();
    if (supabase) {
      const { data: accounts } = await supabase.from("artist_accounts").select("artist_id, user_id");
      const rows = (accounts ?? []) as Row[];
      const userIds = rows.map((r) => r.user_id).filter(Boolean);
      const { data: profiles } = userIds.length
        ? await supabase
            .from("audience_profiles")
            .select("user_id, id, profile_name, display_name, profile_picture_url, avatar_url")
            .in("user_id", userIds)
        : { data: [] as Row[] };
      const profileOf = (userId: string) =>
        ((profiles ?? []) as Row[]).find((p) => p.user_id === userId || p.id === userId);

      // An artist who joined through the app is found by the name they go by.
      if (!id && slugParam) {
        const hit = rows.find((r) => {
          const p = r.user_id ? profileOf(r.user_id) : undefined;
          const n = p?.profile_name || p?.display_name;
          return n && slugOf(n) === slugParam;
        });
        if (hit) id = hit.artist_id;
      }

      const account = rows.find((r) => r.artist_id === id);
      const profile = account?.user_id ? profileOf(account.user_id) : undefined;
      if (profile) {
        // Same order as the artist page: the picture they last put up first.
        picture = profile.profile_picture_url || profile.avatar_url || "";
        if (!ARTIST_META[id]) name = profile.profile_name || profile.display_name || "";
      }
    }
  } catch {
    // keep what the catalog knows
  }

  if (!id || !/^(\d+|u-[0-9a-f-]{36})$/i.test(id)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
    return;
  }

  const meta = ARTIST_META[id];
  name = meta?.name || name || "$ongChainn";
  const img = picture || meta?.img || logoUrl;

  // The address people share is the artist's name, never the catalog number.
  const artistUrl =
    name !== "$ongChainn" && slugOf(name)
      ? `https://songchainn.xyz/${slugOf(name)}`
      : `https://songchainn.xyz/artist/${id}`;

  const description = `${name}, straight from the artist on $ongChainn. Stream free, hold the records you love.`;

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
  // Short, so a new picture shows up in previews within minutes.
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.end(html);
}
