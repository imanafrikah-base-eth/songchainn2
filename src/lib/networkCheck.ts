import { getEnv } from './env';
import { supabase } from '@/integrations/supabase/client';

export async function checkSupabaseReachability(): Promise<void> {
  const { supabaseUrl } = getEnv();
  if (!supabaseUrl) return;

  try {
    // Use a lightweight authenticated ping instead of an unauthenticated /settings request
    const { error } = await supabase.from('audience_profiles').select('id').limit(1);
    if (error && import.meta.env.DEV) {
      console.warn('[$ongChainn] Supabase reachability check failed:', error.message);
    }
  } catch {
    console.warn('[$ongChainn] Supabase unreachable');
  }
}
