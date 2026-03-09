/**
 * Server-side Supabase client for API routes.
 * Uses service role key for full access; do not expose to client.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseServer() {
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createClient(url, serviceRoleKey);
}

export function hasSupabaseEnv(): boolean {
  return Boolean(url && serviceRoleKey);
}
