import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses row-level security. Server only, and only for
// things a user can't do themselves (the shared extraction cache, reading uploads for AI).
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
