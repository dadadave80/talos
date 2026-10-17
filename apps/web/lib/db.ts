import { createClient } from "@supabase/supabase-js";

// Server only: the service key bypasses RLS. Never import this from a client component.
export const db = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

/// Reads every row of a query, 1000 at a time (PostgREST caps a single read at its max-rows setting).
export async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
