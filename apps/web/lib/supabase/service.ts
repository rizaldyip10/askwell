import "server-only";

import type { Database } from "@askwell/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

export type ServiceClient = SupabaseClient<Database>;

/**
 * Supabase client with the secret key: acts as `service_role` and skips RLS.
 * Use it only after the route has checked ownership and plan (project.md §9), never for
 * owner reads with a manual owner filter. This is the only file that reads SUPABASE_SECRET_KEY.
 */
export function createServiceClient(): ServiceClient {
  const env = requireEnv("createServiceClient()", {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
