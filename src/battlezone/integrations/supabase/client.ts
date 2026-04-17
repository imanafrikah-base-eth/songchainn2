import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getEnv } from "@/lib/env";

const { supabaseUrl, supabaseAnonKey } = getEnv();
const SUPABASE_STORAGE = typeof window !== "undefined" ? window.localStorage : undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SUPABASE_STORAGE,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
