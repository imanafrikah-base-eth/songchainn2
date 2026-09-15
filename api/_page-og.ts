// Link previews for the places in $ongChainn that are not a song, an artist or
// a world: the Room, the feed and a single post, Artist Worlds, WaveWarz Africa
// and its battle rooms, Discover, the Studio, the leaderboard and playlists.
//
// A shared /room link used to unfurl as the plain "$ongChainn: free music
// streaming" card, so nobody could tell it was an invitation into the Room
// (founder, 15 Sep 2026). Every link now says what it opens, with its own card.
// People never land here; vercel.json only routes link crawlers.

const SITE = "https://www.songchainn.xyz";
const LOGO = `${SITE}/icon-512.png`;
const MOSHA_ID = "0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d";

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Card {
  title: string;
  line: string;
  image: string;
  path: string;
  button: string;
  /** "large" for a 1200x630 card, "square" for cover art. */
  shape?: "large" | "square";
}

const STATIC: Record<string, Card> = {
  "/room": {
    title: "The Room on $ongChainn",
    line: "One song, everyone listening together. Walk in and hear it live.",
    image: `${SITE}/og/room.jpg`,
    path: "/room",
    button: "Join the Room",
  },
  "/social": {
    title: "The Feed on $ongChainn",
    line: "Posts, clips and songs from the artists and fans you follow.",
    image: `${SITE}/og/feed.jpg`,
    path: "/social",
    button: "Open the feed",
  },
  "/discover": {
    title: "Discover music on $ongChainn",
    line: "New releases, what is hot today, and every artist on $ongChainn. Every record streams free.",
    image: `${SITE}/og/discover.jpg`,
    path: "/discover",
    button: "Start listening",
  },
  "/artists": {
    title: "Artists on $ongChainn",
    line: "Independent artists from everywhere, releasing direct to their fans.",
    image: `${SITE}/og/discover.jpg`,
    path: "/artists",
    button: "Meet the artists",
  },
  "/studio": {
    title: "Release your music on $ongChainn",
    line: "Send a finished record and it is live the same minute. Artists keep everything.",
    image: `${SITE}/og/studio.jpg`,
    path: "/studio",
    button: "Open the Studio",
  },
  "/leaderboard": {
    title: "The $ongChainn leaderboard",
    line: "The listeners who show up most, ranked by real listening.",
    image: `${SITE}/og/leaderboard.jpg`,
    path: "/leaderboard",
    button: "See the leaderboard",
  },
  "/worlds": {
    title: "Artist Worlds on $ongChainn",
    line: "Artists do not get a page here. They get a world to walk into: streets, rooms, a stage and a key.",
    image: `${SITE}/og/worlds.jpg`,
    path: "/worlds",
    button: "Walk into a world",
  },
  "/wavewarz-africa": {
    title: "WaveWarz Africa on $ongChainn",
    line: "Live music battles. Two artists, two songs, one crowd, one verdict. Listen live and vote.",
    image: `${SITE}/og/wavewarz.jpg`,
    path: "/wavewarz-africa",
    button: "Enter the battle zone",
  },
  "/playlists": {
    title: "Playlists on $ongChainn",
    line: "Playlists built by listeners, free to play.",
    image: `${SITE}/og/discover.jpg`,
    path: "/playlists",
    button: "Open playlists",
  },
};

async function rest<T>(query: string, service = false): Promise<T[] | null> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = service
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return (await r.json()) as T[];
  } catch {
    return null;
  }
}

async function roomCard(): Promise<Card> {
  const card = { ...STATIC["/room"] };
  const rows = await rest<{ listener_count: number }>("room_live_counts?select=listener_count&room_id=eq.global&limit=1");
  const n = Number(rows?.[0]?.listener_count ?? 0);
  if (n > 1) card.line = `${n} people are listening together right now. Walk in and hear it live.`;
  else if (n === 1) card.line = "Someone is in there right now. Walk in and hear it live.";
  return card;
}

async function postCard(id: string): Promise<Card> {
  const fallback: Card = { ...STATIC["/social"], path: `/post/${id}`, button: "See the post" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fallback;
  const posts = await rest<{
    user_id: string;
    content: string | null;
    media_url: string | null;
    media_kind: string | null;
    media_poster_url: string | null;
    song_id: string | null;
  }>(
    `social_posts?select=user_id,content,media_url,media_kind,media_poster_url,song_id&id=eq.${id}&visibility=eq.public&is_deleted=eq.false&limit=1`,
    true,
  );
  const post = posts?.[0];
  if (!post) return fallback;

  let name = "Someone";
  if (post.user_id === MOSHA_ID) name = "Mo$ha";
  else {
    const people = await rest<{ display_name: string | null; profile_name: string | null }>(
      `audience_profiles?select=display_name,profile_name&user_id=eq.${post.user_id}&limit=1`,
    );
    name = people?.[0]?.display_name || people?.[0]?.profile_name || name;
  }

  const isUrl = (u: string | null | undefined): u is string => !!u && /^https:\/\//i.test(u);
  let image: string | null = post.media_kind === "video" ? post.media_poster_url : post.media_url;
  if (!isUrl(image)) image = null;
  let songLine = "";
  if (post.song_id) {
    const songs = await rest<{ title: string; artist_name: string | null; cover_art_url: string | null }>(
      `songs?select=title,artist_name,cover_art_url&id=eq.${encodeURIComponent(post.song_id)}&limit=1`,
    );
    const s = songs?.[0];
    if (s) {
      songLine = ` with ${s.title}${s.artist_name ? ` by ${s.artist_name}` : ""}`;
      image = image || (isUrl(s.cover_art_url) ? s.cover_art_url : null);
    }
  }
  const words = (post.content ?? "").trim().replace(/\s+/g, " ");
  return {
    title: `${name} on $ongChainn`,
    line: words ? (words.length > 180 ? `${words.slice(0, 177)}...` : words) : `A post${songLine}. Tap to see it and play the song.`,
    image: image || fallback.image,
    shape: image ? "square" : "large",
    path: `/post/${id}`,
    button: "See the post",
  };
}

async function playlistCard(id: string): Promise<Card> {
  const fallback: Card = { ...STATIC["/playlists"], path: `/playlist/${id}`, button: "Play the playlist" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fallback;
  const lists = await rest<{ name: string; description: string | null; user_id: string }>(
    `playlists?select=name,description,user_id&id=eq.${id}&is_public=eq.true&limit=1`,
    true,
  );
  const list = lists?.[0];
  if (!list) return fallback;
  const tracks = await rest<{ song_id: string }>(`playlist_songs?select=song_id&playlist_id=eq.${id}&limit=1`, true);
  let image = fallback.image;
  let shape: Card["shape"] = "large";
  if (tracks?.[0]?.song_id) {
    const songs = await rest<{ cover_art_url: string | null }>(
      `songs?select=cover_art_url&id=eq.${encodeURIComponent(tracks[0].song_id)}&limit=1`,
    );
    if (songs?.[0]?.cover_art_url) {
      image = songs[0].cover_art_url;
      shape = "square";
    }
  }
  return {
    title: `${list.name}, a playlist on $ongChainn`,
    line: list.description?.trim() || "A playlist on $ongChainn. Every song streams free.",
    image,
    shape,
    path: `/playlist/${id}`,
    button: "Play the playlist",
  };
}

async function battleRoomCard(id: string): Promise<Card> {
  const card: Card = {
    title: "A WaveWarz Africa battle room",
    line: "Listen with the crowd, talk in the room and back your corner.",
    image: `${SITE}/og/wavewarzRoom.jpg`,
    path: `/wavewarz-africa/room/${id}`,
    button: "Join the room",
  };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return card;
  const rows = await rest<{ title: string | null; status: string; artist_a_name: string | null; artist_b_name: string | null; winner: string | null; room_closed_at: string | null }>(
    `battles?select=title,status,artist_a_name,artist_b_name,winner,room_closed_at&id=eq.${id}&limit=1`,
  );
  const b = rows?.[0];
  if (!b) return card;
  const a = b.artist_a_name || "Corner A";
  const c = b.artist_b_name || "Corner B";
  card.title = `${a} vs ${c}${b.title ? `: ${b.title}` : ""}`;
  if (b.status === "live") card.line = "Live now. Walk into the room, listen with the crowd, vote and back your corner.";
  else if (b.status === "ended" && !b.room_closed_at) card.line = "The verdict is in and the room is still open. Walk in and hear it read.";
  else if (b.status === "ended") card.line = "This battle is over. See how the crowd and the judges called it.";
  else card.line = "A WaveWarz Africa battle. Join the room when it goes live.";
  return card;
}

export async function pageOg(req: any, res: any) {
  const raw = String(req.query?.path ?? "/").split("?")[0].replace(/\/+$/, "") || "/";
  let card: Card;

  const post = raw.match(/^\/post\/([^/]+)$/);
  const playlist = raw.match(/^\/playlist\/([^/]+)$/);
  const battleRoom = raw.match(/^\/wavewarz-africa\/room\/([^/]+)$/);

  if (raw === "/room" || raw.startsWith("/room/")) card = await roomCard();
  else if (post) card = await postCard(post[1]);
  else if (playlist) card = await playlistCard(playlist[1]);
  else if (battleRoom) card = await battleRoomCard(battleRoom[1]);
  else if (raw.startsWith("/wavewarz-africa")) card = { ...STATIC["/wavewarz-africa"], path: raw };
  else card = STATIC[raw] ?? { ...STATIC["/discover"], path: raw };

  const pageUrl = `${SITE}${card.path}`;
  const large = card.shape !== "square";
  const frame = JSON.stringify({
    version: "next",
    imageUrl: card.image,
    button: { title: card.button, action: { type: "launch_frame", name: "$ongChainn", url: pageUrl, splashImageUrl: LOGO, splashBackgroundColor: "#101113" } },
  }).replace(/'/g, "&#39;");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(card.title)}</title>
<meta name="description" content="${esc(card.line)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="$ongChainn">
<meta property="og:title" content="${esc(card.title)}">
<meta property="og:description" content="${esc(card.line)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${esc(card.image)}">
${large ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@songchainn">
<meta name="twitter:title" content="${esc(card.title)}">
<meta name="twitter:description" content="${esc(card.line)}">
<meta name="twitter:image" content="${esc(card.image)}">
<meta name="fc:frame" content='${frame}'>
</head><body><h1>${esc(card.title)}</h1><p>${esc(card.line)}</p><a href="${pageUrl}">Open on $ongChainn</a></body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(html);
}
