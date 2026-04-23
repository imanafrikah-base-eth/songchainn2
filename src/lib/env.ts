export type EnvConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

export function getEnv(): EnvConfig {
  const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').toString();
  const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').toString();

  const supabaseUrl = normalizeUrl(rawUrl);
  const supabaseAnonKey = rawKey.trim();

  const problems: string[] = [];
  if (!supabaseUrl) problems.push('VITE_SUPABASE_URL is missing');
  if (!supabaseAnonKey) problems.push('VITE_SUPABASE_ANON_KEY is missing');
  if (supabaseUrl && !supabaseUrl.includes('supabase.co')) {
    problems.push(`VITE_SUPABASE_URL looks wrong: "${supabaseUrl}"`);
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
