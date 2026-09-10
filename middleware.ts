// Crawlers and answer engines asking for "/" get the plain page.
//
// vercel.json rewrites cannot catch "/": the built index.html is a real file
// and the filesystem wins before any rewrite is read. This runs before that
// check. Only the home path is matched, only known crawler user agents are
// sent on, and a person never sees it. /about is handled in vercel.json.

const BOT =
  /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|discordbot|slackbot|linkedinbot|farcaster|warpcast|pinterest|embedly|skypeuripreview|applebot|googlebot|bingbot|iframely|redditbot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|anthropic-ai|perplexitybot|google-extended|duckduckbot|yandexbot|baiduspider|bytespider|ccbot|amazonbot|petalbot|ia_archiver/i;

export const config = { matcher: ['/'] };

export default function middleware(request: Request): Response | undefined {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT.test(ua)) return undefined;
  const url = new URL(request.url);
  // A shared link that opens the app on a state (sign-in, an invite code) is
  // for a person, even when a preview bot fetches it first for the card.
  if (url.searchParams.has('auth') || url.searchParams.has('ref') || url.searchParams.has('code')) return undefined;
  return new Response(null, {
    headers: { 'x-middleware-rewrite': new URL('/api/site-og?path=/', request.url).toString() },
  });
}
