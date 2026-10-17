import { getAddress, type Address } from "viem";
import { Tier } from "./chain";
import { db } from "./db";
import { checkPrMerged, getBalances, pay, precheckPay, queueForHuman, usdc, type Intent } from "./tools";

const REPO = "dadadave80/lattice";
const MIN_GAS = usdc(2);
const MODEL = "operator-cycle/v1"; // deterministic rules, no LLM: bounty label + merged + mapped wallet

/// GitHub login -> payout wallet, from CONTRIBUTOR_WALLETS ("login:0x…,login2:0x…"). The contract allowlist is the
/// real gate; this map only says which address a login is paid at.
const wallets = () =>
  new Map(
    (process.env.CONTRIBUTOR_WALLETS ?? "")
      .split(",")
      .filter(Boolean)
      .map((kv) => kv.split(":") as [string, string])
      .map(([login, addr]) => [login.toLowerCase(), getAddress(addr)] as [string, Address]),
  );

async function nextBountyPr() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=50`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const prs: { number: number; merged_at: string | null; html_url: string; labels: { name: string }[] }[] = await res.json();
  const candidates = prs.filter((p) => p.merged_at && p.labels.some((l) => /^bounty:\d+(\.\d+)?$/.test(l.name)));
  if (!candidates.length) return null;
  const { data: done } = await db()
    .from("ops")
    .select("ref")
    .eq("kind", "contributor")
    .in("ref", candidates.map((p) => p.html_url));
  const seen = new Set((done ?? []).map((d) => d.ref));
  return candidates.find((p) => !seen.has(p.html_url)) ?? null;
}

/// One idempotent step per invocation (GitHub cron and Vercel never retry): gas check, then at most one PR.
export async function runCycle() {
  const sb = db();
  const log = (kind: string, detail: object, extra: object = {}) => sb.from("ops").insert({ kind, detail, ...extra });
  const b = await getBalances();
  if (b.agentGasUsdc < MIN_GAS || b.hotGasUsdc < usdc(0.5)) {
    await log("gas-low", { agent: b.agentGasUsdc.toString(), hot: b.hotGasUsdc.toString() });
    return { stopped: "gas below floor; owner tops up" };
  }

  const pr = await nextBountyPr();
  if (!pr) return { contributor: "no unpaid bounty PRs" };
  const info = await checkPrMerged(REPO, pr.number);
  const payee = wallets().get(info.author.toLowerCase());

  // Claim the PR first: the unique index on (ref) where kind='contributor' makes a second run a no-op.
  const { error: claimed } = await sb.from("ops").insert({ kind: "contributor", ref: info.url, detail: { author: info.author, bounty: info.bountyUsdc, state: "claimed" } });
  if (claimed) return { contributor: `already handled ${info.url}` };
  if (!info.merged || !info.bountyUsdc || !payee) {
    await sb.from("ops").update({ detail: { author: info.author, state: payee ? "not-merged" : "no-wallet-on-file" } }).eq("kind", "contributor").eq("ref", info.url);
    return { contributor: `skipped ${info.url}` };
  }

  const intent: Intent = {
    attemptId: `pr-${REPO}-${pr.number}`,
    tier: Tier.CONTRIBUTOR,
    payee,
    amount: usdc(info.bountyUsdc),
    reason: `Merged PR ${info.url} by ${info.author}, label bounty:${info.bountyUsdc}`,
    model: MODEL,
  };
  const why = await precheckPay(intent);
  const r = !why ? await pay(intent) : why.startsWith("queue:") ? await queueForHuman(intent) : null;
  await sb
    .from("ops")
    .update({
      decision_hash: r?.decisionHash ?? null,
      tx: r && "payTx" in r ? r.payTx : (r?.commitTx ?? null),
      detail: { author: info.author, bounty: info.bountyUsdc, payee, state: !r ? `blocked: ${why}` : "payTx" in r ? (r.failed ? `pay reverted: ${r.failed}` : "paid") : "queued", commitTx: r?.commitTx },
    })
    .eq("kind", "contributor")
    .eq("ref", info.url);
  return { contributor: info.url, outcome: !r ? why : "payTx" in r ? (r.failed ?? "paid") : "queued" };
}
