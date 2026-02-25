import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getEnv } from '@/lib/env';
import { toast } from '@/hooks/use-toast';

const { supabaseUrl, supabaseAnonKey } = getEnv();
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const SUPABASE_STORAGE = typeof window !== 'undefined' ? window.localStorage : undefined;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
    console.log('[Supabase] invalid Supabase URL configured:', supabaseUrl);
  }
}
