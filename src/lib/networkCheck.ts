import { getEnv } from './env';

export async function checkSupabaseReachability(): Promise<void> {
  const { supabaseUrl } = getEnv();
  const url = `${supabaseUrl}/auth/v1/settings`;

  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res) throw new Error('No response object');
  } catch (e) {
    // Dev-only signal: avoid noisy error-level logs for transient network issues.
    console.warn('[$ongChainn] Supabase reachability check unavailable');
  }
}
