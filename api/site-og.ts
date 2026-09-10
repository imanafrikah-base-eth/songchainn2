// What a search engine or an AI answer engine sees at / and /about.
//
// The app is a single page that renders in the browser, which crawlers that
// do not run JavaScript read as an empty shell. vercel.json sends only
// crawlers here (people never land on this), and this hands them a plain
// page that says what $ongChainn is for a listener and for an artist, in the
// words a person would search with, with structured data an answer engine
// can quote. It says what the place does and what it is for. It does not say
// how it is built or how the judging, the money rails or the ranking work.

const SITE = "https://www.songchainn.xyz";
const NAME = "$ongChainn";
const TAGLINE = "Free music streaming where artists keep everything and fans can own the songs they love.";
const DESCRIPTION =
  "$ongChainn is a free music streaming app where every song streams free, artists release directly to fans and keep everything, and the fans who care can own a record, walk into an artist's world, book time with the artist, or back a side in a live music battle. Built for independent artists worldwide, starting with Zambian and African music.";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What is $ongChainn?",
    a: "$ongChainn is a free music streaming app and a direct line between artists and fans. Every song streams free. Artists release here first and keep everything. Fans who want more than a stream can own a record, enter an artist's world, book time with the artist, or back a side in a live battle.",
  },
  {
    q: "Is $ongChainn free to use?",
    a: "Yes. Listening is free, releasing is free, and no wallet is needed for either. A wallet is only needed if you choose to own a record or hold a world key.",
  },
  {
    q: "How do artists get paid on $ongChainn?",
    a: "Directly. When a fan buys a copy of a record, the money goes to the artist's own wallet, not to the platform. There is no distributor fee, no middleman, and the platform never holds anyone's money.",
  },
  {
    q: "How do I release my music on $ongChainn?",
    a: "Sign up free, say you make music, and the Studio opens. Send a finished WAV or MP3 with a square cover, or several at once for an EP. It is reviewed and, if it passes, live the same minute. Keep your distributor for the stores; this is where fans can hold your records and reach you.",
  },
  {
    q: "What does it mean to own a song on $ongChainn?",
    a: "Some records are also available as copies on Base. Holding a copy means the record plays offline for you and you are counted among the people who backed that artist. It is a way to support an artist you love; it is not an investment and its value can fall to zero.",
  },
  {
    q: "What is an Artist World?",
    a: "An artist on $ongChainn gets a world, not a page: streets to walk, rooms that open with the artist's key, a gallery, a screening room, a parlour where fans can book time with the artist, and a 3D city you can enter in VR. World #001 belongs to IMan Afrikah.",
  },
  {
    q: "What is WaveWarz Africa?",
    a: "Live music battles inside $ongChainn: two artists, two songs, one crowd that listens and votes, and AI judges who score the craft and the feeling of the actual audio.",
  },
  {
    q: "Which artists are on $ongChainn?",
    a: "Independent artists from anywhere in the world. The first roster is Zambian, including IMan Afrikah, whose world is open now. Any artist can join and release today.",
  },
  {
    q: "Do I need crypto or a wallet to use $ongChainn?",
    a: "No. You can stream everything, follow artists, post, message and release music with nothing but an email. A wallet is only for the optional parts: owning a record or holding a world key.",
  },
];

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function handler(req: any, res: any) {
  const path = String(req.query?.path ?? "/");
  const isAbout = path === "/about";
  const title = isAbout ? `About ${NAME}: free music streaming, artists paid direct` : `${NAME}: ${TAGLINE}`;
  const canonical = isAbout ? `${SITE}/about` : SITE;

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: NAME,
      alternateName: ["SONGCHAINN", "SongChainn", "Song Chainn"],
      url: SITE,
      logo: `${SITE}/icon-512.png`,
      email: "songchaindao@gmail.com",
      sameAs: ["https://x.com/songchainn"],
      description: DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: NAME,
      url: SITE,
      applicationCategory: "MusicApplication",
      operatingSystem: "Web, Android, iOS (installable web app)",
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free to listen, free to release." },
      featureList: [
        "Free music streaming",
        "Offline playback",
        "Artists release directly to fans and keep everything",
        "Own a copy of a record",
        "Artist Worlds with rooms, a gallery, a parlour and VR",
        "Live music battles with a voting crowd",
        "Direct messages, playlists, a live listening room",
      ],
      audience: [
        { "@type": "Audience", audienceType: "Music listeners" },
        { "@type": "Audience", audienceType: "Independent musicians and artists" },
        { "@type": "Audience", audienceType: "Record labels and music managers" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(DESCRIPTION)}" />
<meta name="keywords" content="free music streaming app, own the songs you love, artists keep 100 percent, release music directly to fans, independent artist platform, music app for artists, African music streaming, Zambian music, IMan Afrikah, artist worlds, VR music experience, live music battles, WaveWarz Africa, music on Base, song copies, get paid direct as an artist, music without a middleman" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(NAME)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(TAGLINE)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${SITE}/icon-512.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@songchainn" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(TAGLINE)}" />
<meta name="twitter:image" content="${SITE}/icon-512.png" />
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:32px 20px;line-height:1.55;color:#111;background:#fff}h1{font-size:1.9rem;line-height:1.2}h2{margin-top:2rem}a{color:#0a58ca}</style>
</head>
<body>
<h1>${esc(NAME)}</h1>
<p><strong>${esc(TAGLINE)}</strong></p>
<p>${esc(DESCRIPTION)}</p>
<p><a href="${SITE}/?auth=signup">Join free</a> · <a href="${SITE}/discover">Listen now</a> · <a href="${SITE}/studio">Release your music</a> · <a href="${SITE}/worlds">Artist Worlds</a> · <a href="${SITE}/wavewarz-africa">WaveWarz Africa</a></p>

<h2>If you listen</h2>
<ul>
<li>Every record streams free, and keeps playing offline.</li>
<li>Own a copy of a song you love and be counted among the people who backed the artist.</li>
<li>Walk into an artist's world: streets, rooms, a gallery, a stage, a parlour where you can book time with the artist, and a 3D city you can enter in VR.</li>
<li>Listen live with everyone in the Room, or watch two artists go head to head in a battle and vote.</li>
<li>Follow artists, message anyone, build playlists, earn points for real listening.</li>
</ul>

<h2>If you make music</h2>
<ul>
<li>Release here first, then everywhere. Send a finished record, or a whole EP, and it is live the same minute if it passes review.</li>
<li>Keep everything. No distributor fee, no middleman. When a fan buys a copy, it pays your own wallet directly.</li>
<li>Get a world, not a page: your own streets and rooms, your key, your gallery, your stage, built with a guide that does the work with you.</li>
<li>See who really listens: plays by day, city and source, saves, followers, holders and every purchase.</li>
<li>Free to release. No wallet needed to start.</li>
</ul>

<h2>If you run a label or manage artists</h2>
<ul>
<li>Non-custodial: the platform never holds anyone's money, coins or keys.</li>
<li>Direct artist-to-fan distribution beside your existing stores, with licensing requests landing in the artist's Studio.</li>
<li>Contact: <a href="mailto:songchaindao@gmail.com">songchaindao@gmail.com</a></li>
</ul>

<h2>Questions people ask</h2>
${FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("\n")}

<p><a href="${SITE}/about">More about ${esc(NAME)}</a> · <a href="${SITE}/terms">Terms</a> · <a href="${SITE}/privacy">Privacy</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  res.status(200).send(html);
}
