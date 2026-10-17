import { formatUnits, getAddress, type Address } from "viem";
import { Tier } from "./chain";
import { db } from "./db";
import { gatewayBalance, gatewayDeposit, x402Buy } from "./ops/vendor";
import { agentAccount } from "./signers/send";
import { bountyPrs, openBounties } from "./bounty";
import { getBalances, pay, precheckPay, queueForHuman, usdc, type Intent } from "./tools";

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

/// Error text safe for the public ops log: viem's short message, with URLs (they can carry RPC keys) removed.
const clean = (e: unknown) =>
  String((e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : e))
    .replace(/https?:\/\/\S+/g, "<url>")
    .slice(0, 160);

/// The next bounty not yet claimed (claims are keyed on the bounty's source: the issue, or the PR's own label).
async function nextBounty() {
  const candidates = await bountyPrs(REPO);
  if (!candidates.length) return null;
  const { data: done } = await db()
    .from("ops")
    .select("ref")
    .eq("kind", "contributor")
    .in("ref", candidates.map((b) => b.ref));
  const seen = new Set((done ?? []).map((d) => d.ref));
  return candidates.find((b) => !seen.has(b.ref)) ?? null;
}

const FLOAT = usdc(1); // vault -> ops float per top-up, well inside VENDOR 5/tx, 10/day
const LOW = usdc(0.05); // top up only below this; one Arc RPC read costs 0.0001

/// VENDOR flow: when the agent's Gateway balance runs low, and at most once a day, the vault pays the ops float (the
/// agent's own address, VENDOR-allowlisted at init) and the agent deposits it into Gateway. Then it buys one metered
/// resource per cycle over x402. Every leg is on the ops log with its tx or settlement id. null = not configured.
export async function runVendor(): Promise<string | null> {
  const url = process.env.X402_VENDOR_URL;
  if (!url) return null;
  const sb = db();
  const agent = agentAccount().address;
  if ((await gatewayBalance(agent)) < LOW) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: floats } = await sb.from("ops").select("id").eq("kind", "vendor-float").gte("ts", since).limit(1);
    if (floats?.length) return "Gateway balance low; today's top-up already sent";
    const intent: Intent = { attemptId: `float-${since.slice(0, 13)}`, tier: Tier.VENDOR, payee: agent, amount: FLOAT, reason: "Daily ops float for metered x402 services (Gateway deposit)", model: MODEL };
    const why = await precheckPay(intent);
    if (why) return `Gateway top-up blocked: ${why}`;
    const r = await pay(intent);
    await sb.from("ops").insert({ kind: "vendor-float", ref: intent.attemptId, decision_hash: r.decisionHash, tx: r.payTx, detail: { usdc: 1, commitTx: r.commitTx, failed: r.failed } });
    if (r.failed) return "Gateway top-up reverted";
    const d = await gatewayDeposit(FLOAT);
    await sb.from("ops").insert({ kind: "vendor-deposit", tx: d.depositTx, detail: { usdc: 1, ...d } });
    // Arc finalises the deposit in about half a second; the seller's verify reads Gateway's API, so wait for it.
    for (let i = 0; i < 10 && (await gatewayBalance(agent).catch(() => 0n)) < LOW; i++) await new Promise((ok) => setTimeout(ok, 1500));
  }
  const r = await x402Buy(url);
  const usdcPaid = formatUnits(r.amount, 6);
  await sb.from("ops").insert({
    kind: "vendor",
    ref: r.settlement,
    detail: { url, seller: r.seller, item: r.item, result: r.result, usdc: Number(usdcPaid), payTo: r.payTo, network: r.network, settlement: r.settlement },
  });
  return `bought 1 ${r.item} over x402 (${usdcPaid} USDC)`;
}

type Outcome = { vendor: string | null; contributor: string | null; stopped: string | null };

/// One idempotent step per invocation (GitHub cron and Vercel never retry): gas check, then at most one PR.
async function step(out: Outcome) {
  const sb = db();
  const bal = await getBalances();
  if (bal.agentGasUsdc < MIN_GAS || bal.hotGasUsdc < usdc(0.5)) {
    await sb.from("ops").insert({ kind: "gas-low", detail: { agent: bal.agentGasUsdc.toString(), hot: bal.hotGasUsdc.toString() } });
    out.stopped = "signer gas below floor; owner tops up";
    return;
  }

  out.vendor = await runVendor().catch((e) => `vendor step failed: ${clean(e)}`);
  const b = await nextBounty();
  if (!b) {
    out.contributor = "nothing to pay";
    return;
  }
  const payee = wallets().get(b.author.toLowerCase());
  const base = { author: b.author, bounty: b.usdc, pr: b.url };

  // Claim the bounty first: the unique index on (ref) where kind='contributor' makes a second run, or a second PR
  // closing the same issue, a no-op.
  const { error: claimed } = await sb.from("ops").insert({ kind: "contributor", ref: b.ref, detail: { ...base, state: "claimed" } });
  if (claimed) {
    out.contributor = `PR #${b.number} already handled`;
    return;
  }
  if (!payee) {
    await sb.from("ops").update({ detail: { ...base, state: "no-wallet-on-file" } }).eq("kind", "contributor").eq("ref", b.ref);
    out.contributor = `skipped PR #${b.number}: no wallet on file for @${b.author}`;
    return;
  }

  const intent: Intent = {
    attemptId: `pr-${REPO}-${b.number}`,
    tier: Tier.CONTRIBUTOR,
    payee,
    amount: usdc(b.usdc),
    reason: `Merged PR ${b.url} by ${b.author}, bounty:${b.usdc}${b.ref === b.url ? "" : ` from ${b.ref}`}`,
    model: MODEL,
  };
  const why = await precheckPay(intent);
  const r = !why ? await pay(intent) : why.startsWith("queue:") ? await queueForHuman(intent) : null;
  await sb
    .from("ops")
    .update({
      decision_hash: r?.decisionHash ?? null,
      tx: r && "payTx" in r ? r.payTx : (r?.commitTx ?? null),
      detail: { ...base, payee, state: !r ? `blocked: ${why}` : "payTx" in r ? (r.failed ? `pay reverted: ${r.failed}` : "paid") : "queued", commitTx: r?.commitTx },
    })
    .eq("kind", "contributor")
    .eq("ref", b.ref);
  out.contributor = !r
    ? `PR #${b.number} blocked: ${why}`
    : "payTx" in r
      ? r.failed
        ? `PR #${b.number} payment reverted`
        : `paid ${b.usdc} USDC for PR #${b.number}`
      : `queued ${b.usdc} USDC for PR #${b.number} for owner approval`;
}

/// The heartbeat: one "cycle" row per run, stopped and failed runs included. It never throws.
async function heartbeat(out: Outcome, open: { count: number; usdc: number } | null) {
  const summary = [
    open && (open.count ? `${open.count} open ${open.count === 1 ? "bounty" : "bounties"} (${open.usdc} USDC)` : "no open bounties"),
    out.vendor,
    out.contributor,
    out.stopped && `stopped: ${out.stopped}`,
  ]
    .filter(Boolean)
    .join(" · ") || "ran, nothing to report";
  try {
    const { error } = await db().from("ops").insert({ kind: "cycle", tx: null, detail: { summary, openBounties: open?.count ?? null, openUsdc: open?.usdc ?? null, ...out } });
    if (error) console.error("cycle heartbeat:", error.message);
  } catch (e) {
    console.error("cycle heartbeat:", clean(e));
  }
  return summary;
}

export async function runCycle() {
  const open = openBounties(REPO).catch(() => null);
  const out: Outcome = { vendor: null, contributor: null, stopped: null };
  let summary = "";
  try {
    await step(out);
  } catch (e) {
    out.stopped = clean(e);
    throw e;
  } finally {
    summary = await heartbeat(out, await open);
  }
  return { ...out, summary };
}
