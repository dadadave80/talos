import { timingSafeEqual } from "node:crypto";
import { runCycle } from "@/lib/cycle";
import { syncEvents } from "@/lib/ledger/events";

export const maxDuration = 300;

const authorized = (req: Request) => {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`);
  return !!process.env.CRON_SECRET && got.length === want.length && timingSafeEqual(got, want);
};

/// Hourly operator cycle, called by .github/workflows/cycle.yml. Idempotent and chunked: neither GitHub nor
/// Vercel retries a failed run, and schedules slip, so every step must be safe to repeat.
export async function POST(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  const result = await runCycle();
  const syncedTo = await syncEvents();
  return Response.json({ ...result, syncedTo: syncedTo.toString() });
}
