import { randomBytes } from "node:crypto";
import { getAddress, keccak256, toBytes, type Address } from "viem";
import { PROMPT_VERSION } from "./brain/prompt";
import { judge } from "./brain/verdict";
import { Tier, txUrl } from "./chain";
import { db } from "./db";
import { PendingTx } from "./signers/send";
import { clean, pay, precheckPay, queueForHuman, refuse, usdc, type Intent } from "./tools";

export const isTeam = (w: string) =>
  (process.env.TEAM_WALLETS ?? "").toLowerCase().split(",").includes(w.toLowerCase());

/// One message per wallet per 20 s. Call before spending a nonce, a free attempt or a toll.
export async function takeSlot(wallet: Address) {
  const { data } = await db().rpc("take_slot", { p_wallet: wallet, p_gap_seconds: 20 });
  return data === true;
}

export type Toll = { kind: "free" } | { kind: "facilitator"; paymentId: string; status: "pending" | "completed"; tx?: string };

/// One arena message (caller has taken the rate slot): attempt row -> brain -> exactly one tool -> commit. The payee is always the
/// attempt's wallet; message text can never name a payee or a tool.
export async function attempt(input: { wallet: Address; accountKind: "embedded" | "eoa"; message: string; toll: Toll }) {
  const sb = db();
  const wallet = getAddress(input.wallet);
  const id = `a-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const { data: recent } = await sb
    .from("attempts")
    .select("verdict,reason,ts")
    .eq("wallet", wallet.toLowerCase())
    .order("ts", { ascending: false })
    .limit(3);
  const { error: unrecorded } = await sb.from("attempts").insert({
    id,
    wallet: wallet.toLowerCase(),
    wallet_label: isTeam(wallet) ? "team" : "external",
    account_kind: input.accountKind,
    toll_kind: input.toll.kind,
    toll_payment_id: input.toll.kind === "facilitator" ? input.toll.paymentId : null,
    toll_status: input.toll.kind === "facilitator" ? input.toll.status : null,
    toll_tx: input.toll.kind === "facilitator" ? (input.toll.tx ?? null) : null,
    prompt_version: PROMPT_VERSION,
    message_excerpt: input.message.slice(0, 80), // the share receipt quotes this; the full message is never stored
  });
  // No row, no decision: nothing moves on chain unless the evidence log can hold it.
  if (unrecorded) return { status: 503, id, error: "could not record the attempt; nothing was decided" };

  const v = await judge({ message: input.message, wallet, context: { recentDecisionsForThisWallet: recent ?? [] } });
  // Only the server's own suffix below may say "[contract:"; neutralised before it is hashed, so the stored reason matches.
  const said = v.reason.replace(/\[contract:/gi, "(contract:");
  const intent: Intent = {
    attemptId: id,
    tier: Tier[v.tier],
    payee: wallet,
    amount: usdc(Math.max(0, v.amount_usdc).toFixed(6)),
    reason: said,
    model: v.model,
  };

  let verdict = v.verdict;
  let reason = said;
  if (verdict === "PAY") {
    const why = await precheckPay(intent);
    if (why?.startsWith("queue:")) {
      verdict = "QUEUE";
      reason = `${reason} [contract: ${why.slice(6)}]`;
    } else if (why) {
      verdict = "REFUSE";
      reason = `${reason} [contract: ${why}]`;
    }
  }
  intent.reason = reason;

  const row: Record<string, unknown> = {
    verdict,
    reason,
    model: v.model,
    tier_requested: v.tier,
    amount_usdc: verdict === "REFUSE" ? null : Number(intent.amount) / 1e6,
  };
  try {
    if (verdict === "PAY") {
      const r = await pay(intent);
      Object.assign(row, { decision_hash: r.decisionHash, commit_tx: r.commitTx, pay_tx: r.payTx });
      if (r.pending) row.note = `pay pending: ${r.pending}`;
      else if (r.failed) row.note = `pay reverted: ${r.failed}`;
    } else if (verdict === "QUEUE") {
      const r = await queueForHuman(intent);
      Object.assign(row, { decision_hash: r.decisionHash, commit_tx: r.commitTx });
    } else {
      const r = await refuse(intent);
      Object.assign(row, { decision_hash: r.decisionHash, commit_tx: r.commitTx });
    }
  } catch (e) {
    row.note = e instanceof PendingTx ? `tx pending: ${e.hash}` : `commit failed: ${clean(e)}`;
  }
  row.reason_hash = keccak256(toBytes(intent.reason)); // the reason committed in the decision hash
  await sb.from("attempts").update(row).eq("id", id);
  return {
    status: 200 as const,
    id,
    verdict,
    reason,
    note: (row.note as string) ?? null,
    commitTx: (row.commit_tx as string) ?? null,
    commitUrl: row.commit_tx ? txUrl(row.commit_tx as string) : null,
    payTx: (row.pay_tx as string) ?? null,
  };
}
