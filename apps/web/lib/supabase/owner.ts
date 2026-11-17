import "server-only";

import type { Database } from "@askwell/db";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

export type OwnerClient = SupabaseClient<Database>;

/**
 * Supabase client acting as the signed-in owner. Every request carries the owner's Clerk
 * session token (Supabase third-party auth), so RLS scopes rows by `auth.jwt()->>'sub'`.
 * Use it for every owner read (project.md §9 "Tenant leak"). Server only.
 *
 * With no signed-in user, `getToken()` returns null and requests go out with the
 * publishable key alone, as `anon`, which can read nothing.
 */
export function createOwnerClient(): OwnerClient {
  const env = requireEnv("createOwnerClient()", {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => (await auth()).getToken(),
  });
}
