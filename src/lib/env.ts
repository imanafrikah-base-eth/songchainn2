export type EnvConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

function stripWrappingQuotes(raw: string): string {
  let value = raw.trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [start, end] of pairs) {
      if (value.startsWith(start) && value.endsWith(end) && value.length >= 2) {
        value = value.slice(1, -1).trim();
        changed = true;
      }
    }
  }
  return value;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1];
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getSupabaseRefFromUrl(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split('.')[0];
    return ref && ref.length > 0 ? ref : null;
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

export function getEnv(): EnvConfig {
  const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').toString();
  const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').toString();
  const cleanedUrl = stripWrappingQuotes(rawUrl);
  const cleanedKey = stripWrappingQuotes(rawKey);

  const supabaseUrl = normalizeUrl(cleanedUrl);
  const supabaseAnonKey = cleanedKey.trim();

  const problems: string[] = [];
  if (!supabaseUrl) problems.push('VITE_SUPABASE_URL is missing');
  if (!supabaseAnonKey) problems.push('VITE_SUPABASE_ANON_KEY is missing');
  if (rawUrl.trim() && cleanedUrl !== rawUrl.trim()) {
    problems.push('VITE_SUPABASE_URL has wrapping quotes. Remove quotes in Vercel env');
  }
  if (rawKey.trim() && cleanedKey !== rawKey.trim()) {
    problems.push('VITE_SUPABASE_ANON_KEY has wrapping quotes. Remove quotes in Vercel env');
  }
  if (supabaseUrl && !supabaseUrl.includes('supabase.co')) {
    problems.push(`VITE_SUPABASE_URL looks wrong: "${supabaseUrl}"`);
  }
  if (supabaseAnonKey && !supabaseAnonKey.startsWith('eyJ')) {
    // Publishable keys (sb_publishable_...) require @supabase/supabase-js ≥ 2.49 and
    // may make an extra network round-trip on first load. If the project is paused or
    // the key is wrong this causes a blank-page hang. Use the JWT anon key instead.
    console.warn(
      '[$ongChainn] VITE_SUPABASE_ANON_KEY looks like a publishable key (not a JWT). ' +
      'Copy the "anon" JWT key from Supabase → Project Settings → API to avoid load hangs.'
    );
  }
  if (supabaseUrl && supabaseAnonKey.startsWith('eyJ')) {
    const urlRef = getSupabaseRefFromUrl(supabaseUrl);
    const payload = decodeJwtPayload(supabaseAnonKey);
    const keyRef = payload && typeof payload.ref === 'string' ? (payload.ref as string) : null;
    if (urlRef && keyRef && urlRef !== keyRef) {
      problems.push(
        `VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY do not match (url ref: "${urlRef}", key ref: "${keyRef}")`
      );
    }
  }

  if (problems.length > 0) {
    const message =
      '[$ongChainn ENV ERROR]\n' +
      problems.map((p) => `- ${p}`).join('\n') +
      '\n\nFix in:\n- Local: .env.local\n- Vercel: Project Settings → Environment Variables';

    console.error(message);
    // Render a visible error UI instead of throwing (which would blank the page before ErrorBoundary mounts)
    if (typeof document !== 'undefined') {
      const existing = document.getElementById('__env-error');
      if (!existing) {
        const div = document.createElement('div');
        div.id = '__env-error';
        div.style.cssText =
          'position:fixed;inset:0;z-index:9999;background:#0a0a0a;color:#ff4444;' +
          'display:flex;align-items:center;justify-content:center;padding:2rem;' +
          'font-family:monospace;font-size:14px;white-space:pre-wrap;text-align:left;';
        div.textContent = message;
        document.body.appendChild(div);
      }
    }
  }

  // Return whatever we have so the app can at least attempt to load
  return { supabaseUrl: supabaseUrl || '', supabaseAnonKey: supabaseAnonKey || '' };
}
