import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getEnv } from '@/lib/env';

const { supabaseUrl, supabaseAnonKey } = getEnv();
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Graceful localStorage wrapper — falls back to in-memory in private browsing / restricted webviews
function safeStorage(): Storage | undefined {
  try {
    window.localStorage.setItem('__sb_probe', '1');
    window.localStorage.removeItem('__sb_probe');
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const SUPABASE_STORAGE = typeof window !== 'undefined' ? safeStorage() : undefined;

export const supabase = createClient<Database>(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    storage: SUPABASE_STORAGE,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

if (import.meta.env.DEV) {
  try {
    const url = new URL(supabaseUrl);
    console.log('[Supabase] using project host:', url.hostname);
  } catch {
    if (supabaseUrl) console.log('[Supabase] invalid Supabase URL configured:', supabaseUrl);
  }
}
