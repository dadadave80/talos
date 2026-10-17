import { evidence } from "@/lib/ledger/evidence";

export async function GET() {
  return Response.json(await evidence(), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
}
