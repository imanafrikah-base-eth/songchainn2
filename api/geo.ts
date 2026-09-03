/**
 * Where this request came from, to the city, for the activity board.
 *
 * Vercel stamps every request with the city and country it resolved from the
 * network address. This hands those two words back and nothing else: no
 * address, no coordinates, no cookie. The client keeps the answer for the
 * session and attaches it to play events so an artist can see streams by
 * city. Outside Vercel the headers are absent and the answer is empty.
 */
export default function handler(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (b: unknown) => void } },
) {
  const pick = (name: string): string | null => {
    const raw = req.headers[name];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (!v) return null;
    try {
      return decodeURIComponent(v).slice(0, 80);
    } catch {
      return v.slice(0, 80);
    }
  };
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    city: pick('x-vercel-ip-city'),
    country: pick('x-vercel-ip-country'),
  });
}
