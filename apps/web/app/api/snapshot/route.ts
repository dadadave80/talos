import { snapshot } from "@/lib/snapshot";

/// The Arena's live strip and feed, polled every 15 s and cached at the edge for the same.
export async function GET() {
  return Response.json(await snapshot(), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
}
