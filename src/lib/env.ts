// src/lib/env.ts
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
      '[SongChainn ENV ERROR]\n' +
      problems.map((p) => `- ${p}`).join('\n') +
      '\n\nFix in:\n- Local: .env.local\n- Vercel: Project Settings → Environment Variables\n\nExpected:\n' +
      'VITE_SUPABASE_URL=https://wsjhbfmzbonxmxaaassu.supabase.co';

    console.error(message);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-alert
      alert(message);
    }

    throw new Error(message);
  }

  return { supabaseUrl, supabaseAnonKey };
}

