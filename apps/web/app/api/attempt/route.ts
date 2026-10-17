import { z } from "zod";
import { FREE_GLOBAL_PER_DAY, FREE_PER_WALLET, verifyFreeTier } from "@/lib/accounts/freeTier";
import { attempt, isTeam, takeSlot } from "@/lib/arena";
import { chain, publicClient, vault } from "@/lib/chain";
import { db } from "@/lib/db";
import { freeLeft, receiptsFor } from "@/lib/share";
import { isAddress } from "viem";

export const maxDuration = 120;

const Body = z.object({
  wallet: z.string(),
  accountKind: z.enum(["embedded", "eoa"]),
  message: z.string().min(1).max(4000),
  free: z.object({ nonce: z.string(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).optional(),
});

/// GET ?wallet=0x…&limit=10: that wallet's latest decided attempts (at most 50), free attempts left today and
/// whether it is a team wallet. Attempts are public anyway (/evidence).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const wallet = q.get("wallet") ?? "";
  if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });
  const limit = Math.min(50, Math.max(1, Math.floor(Number(q.get("limit")) || 10)));
  const [entries, left] = await Promise.all([receiptsFor(wallet, limit), freeLeft(wallet, FREE_PER_WALLET)]);
  return Response.json({ entries, freeLeft: left, team: isTeam(wallet) }, { headers: { "cache-control": "no-store" } });
}

/// POST one arena message. Free tier: EIP-191 signature, 5 per wallet, 500 per day globally, nonce replay
/// rejected. The paid tier (Facilitator Service toll) is added in phase 4b; until then free is the only door.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const b = parsed.data;
  if (!b.free) return Response.json({ error: "paid attempts open in phase 4b" }, { status: 402 });

  const wallet = await verifyFreeTier(
    publicClient,
    { wallet: b.wallet, nonce: b.free.nonce, signature: b.free.signature as `0x${string}` },
    chain.id,
    vault(),
  );
  if (!wallet) return Response.json({ error: "signature does not verify" }, { status: 401 });

  if (!(await takeSlot(wallet))) return Response.json({ error: "one message per 20 seconds" }, { status: 429 });
  const sb = db();
  const { error: replay } = await sb.from("nonces").insert({ wallet: wallet.toLowerCase(), nonce: b.free.nonce });
  if (replay) return Response.json({ error: "nonce already used" }, { status: 409 });
  const { data: mine } = await sb.rpc("bump_counter", { p_wallet: wallet, p_kind: "free" });
  if (Number(mine) > FREE_PER_WALLET) return Response.json({ error: "free attempts used up" }, { status: 402 });
  const { data: all } = await sb.rpc("bump_counter", { p_wallet: "global", p_kind: "free" });
  if (Number(all) > FREE_GLOBAL_PER_DAY) return Response.json({ error: "free tier full for today" }, { status: 402 });

  const r = await attempt({ wallet, accountKind: b.accountKind, message: b.message, toll: { kind: "free" } });
  return Response.json(r, { status: r.status });
}
