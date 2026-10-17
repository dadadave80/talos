import { policy } from "@/lib/policy";

export async function GET() {
  return Response.json(await policy(), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
}
