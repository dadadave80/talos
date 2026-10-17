import { createClient } from "@supabase/supabase-js";

// Server only: the service key bypasses RLS. Never import this from a client component.
export const db = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
