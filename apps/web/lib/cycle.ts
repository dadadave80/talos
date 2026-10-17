import { getAddress, type Address } from "viem";
import { Tier } from "./chain";
import { db } from "./db";
import { gatewayDeposit, x402Buy } from "./ops/vendor";
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

const FLOAT = usdc(1); // vault -> ops float per top-up, well inside VENDOR 5/tx, 10/day

/// VENDOR flow: vault pays the ops float (the agent's own Circle EOA, VENDOR-allowlisted at init) at most once a
/// day, the agent deposits it into Gateway, then buys one metered search per cycle over x402. Every leg is on the
/// ops log with its tx or settlement id.
async function runVendor() {
  const url = process.env.X402_VENDOR_URL;
  if (!url) return { vendor: "X402_VENDOR_URL unset" };
  const sb = db();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: floats } = await sb.from("ops").select("id").eq("kind", "vendor-float").gte("ts", since).limit(1);
  if (!floats?.length) {
    const agent = process.env.CIRCLE_AGENT_WALLET_ADDRESS as Address;
    const intent: Intent = { attemptId: `float-${since.slice(0, 13)}`, tier: Tier.VENDOR, payee: agent, amount: FLOAT, reason: "Daily ops float for metered x402 services (Gateway deposit)", model: MODEL };
    const why = await precheckPay(intent);
    if (why) return { vendor: `float blocked: ${why}` };
    const r = await pay(intent);
    await sb.from("ops").insert({ kind: "vendor-float", ref: intent.attemptId, decision_hash: r.decisionHash, tx: r.payTx, detail: { commitTx: r.commitTx, failed: r.failed } });
    if (r.failed) return { vendor: `float reverted: ${r.failed}` };
    const d = await gatewayDeposit(FLOAT);
    await sb.from("ops").insert({ kind: "vendor-deposit", tx: d.depositTx, detail: d });
  }
  const query = "EIP-2535 diamond facet vulnerability disclosure";
  const r = await x402Buy(url, { body: { query, numResults: 3 } });
  await sb.from("ops").insert({
    kind: "vendor",
    ref: r.settlement,
    detail: { url, query, usdc: Number(r.amount) / 1e6, results: Array.isArray(r.data?.results) ? r.data.results.length : null },
  });
  return { vendor: { settlement: r.settlement, usdc: Number(r.amount) / 1e6 } };
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

  const vendor = await runVendor().catch((e) => ({ vendor: `error: ${String(e).slice(0, 200)}` }));
  const pr = await nextBountyPr();
  if (!pr) return { ...vendor, contributor: "no unpaid bounty PRs" };
  const info = await checkPrMerged(REPO, pr.number);
  const payee = wallets().get(info.author.toLowerCase());

  // Claim the PR first: the unique index on (ref) where kind='contributor' makes a second run a no-op.
  const { error: claimed } = await sb.from("ops").insert({ kind: "contributor", ref: info.url, detail: { author: info.author, bounty: info.bountyUsdc, state: "claimed" } });
  if (claimed) return { ...vendor, contributor: `already handled ${info.url}` };
  if (!info.merged || !info.bountyUsdc || !payee) {
    await sb.from("ops").update({ detail: { author: info.author, state: payee ? "not-merged" : "no-wallet-on-file" } }).eq("kind", "contributor").eq("ref", info.url);
    return { ...vendor, contributor: `skipped ${info.url}` };
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
  return { ...vendor, contributor: info.url, outcome: !r ? why : "payTx" in r ? (r.failed ?? "paid") : "queued" };
}
