import { encodeAbiParameters, erc20Abi, formatUnits, keccak256 } from "viem";
import { publicClient, Tier, txUrl, USDC, vault, vaultAbi } from "../chain";
import { all, db } from "../db";
import { syncEvents } from "./events";

export const budgetKey = (tier: Tier) =>
  keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint8" }], ["talos.budget", tier]));

const usd = (n: bigint) => formatUnits(n, 6);
const TIERS = ["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"] as const;

/// Everything on /evidence. Payments, escalations and commits come from diamond events; the attempts table adds
/// what the chain cannot know (wallet label, account kind, toll settlement). Team and synthetic wallets are
/// excluded from every external counter.
export async function evidence() {
  const head = await syncEvents();
  const sb = db();
  const [events, attempts, { data: ops }] = await Promise.all([
    all((f, t) => sb.from("chain_events").select("tx_hash,block,log_index,name,args").order("block", { ascending: false }).order("log_index").range(f, t)),
    all((f, t) => sb.from("attempts").select("*").order("ts", { ascending: false }).order("id").range(f, t)),
    sb.from("ops").select("*").order("ts", { ascending: false }).limit(500),
  ]);
  const ev = events ?? [];
  const team = new Set((process.env.TEAM_WALLETS ?? "").toLowerCase().split(",").filter(Boolean));
  // A wallet added to TEAM_WALLETS after it played is relabelled here, so it drops out of every external counter.
  const at = (attempts ?? []).map((a) => (a.wallet_label === "external" && team.has(String(a.wallet).toLowerCase()) ? { ...a, wallet_label: "team" } : a));
  const ext = at.filter((a) => a.wallet_label === "external");
  const tm = at.filter((a) => a.wallet_label === "team");
  const byHash = new Map(at.map((a) => [a.decision_hash, a]));
  const distinct = (rows: typeof at) => new Set(rows.map((a) => a.wallet)).size;

  const commits = ev.filter((e) => e.name === "DecisionCommitted");
  const paid = ev.filter((e) => e.name === "Paid");
  const queued = ev.filter((e) => e.name === "Queued");
  const outcome = new Map<string, string>();
  for (const e of ev) if (e.name === "Approved" || e.name === "Rejected") outcome.set(String(e.args.id), e.name);
  const tolls = ext.filter((a) => a.toll_kind === "facilitator" && a.toll_status === "completed");
  const isTeamPay = (e: (typeof paid)[number]) =>
    team.has(String(e.args.payee).toLowerCase()) || byHash.get(e.args.decisionHash)?.wallet_label === "team";
  // The VENDOR ops float pays Talos's own agent (lib/cycle.ts): the operator's bills, never an external payout.
  const agent = (process.env.AGENT_ADDRESS ?? "").toLowerCase();
  const isOps = (e: (typeof paid)[number]) => Number(e.args.tier) === Tier.VENDOR && !!agent && String(e.args.payee).toLowerCase() === agent;
  const teamPaid = tm.filter((a) => a.verdict === "PAY" && a.pay_tx && !a.note);
  // Team Paid events with no attempt row: the phase-2 contract proofs (docs/ADDRESSES.md), not arena attempts.
  const offArena = paid.filter((e) => isTeamPay(e) && !isOps(e) && !byHash.has(e.args.decisionHash));
  const cycle = (ops ?? []).find((o) => o.kind === "cycle" && typeof o.detail?.summary === "string");

  const [available, params, vaultUsdc] = await Promise.all([
    publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "getAvailable", args: [budgetKey(Tier.DISCRETIONARY)] }),
    publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "params" }),
    publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [vault()] }),
  ]);

  return {
    vault: vault(),
    syncedToBlock: head.toString(),
    counters: {
      externalWallets: {
        total: distinct(ext),
        paid: distinct(ext.filter((a) => a.toll_kind === "facilitator")),
        free: distinct(ext.filter((a) => a.toll_kind === "free")),
        embedded: distinct(ext.filter((a) => a.account_kind === "embedded")),
        eoa: distinct(ext.filter((a) => a.account_kind === "eoa")),
      },
      attempts: ext.filter((a) => a.commit_tx).length,
      refusals: ext.filter((a) => a.commit_tx && a.verdict === "REFUSE").length,
      tollsReceived: { count: tolls.length, usdc: (tolls.length * 0.05).toFixed(2) },
      // Arena attempts from team wallets, never counted above. paidUsdc + offArena.usdc = the team sums in payments.
      team: {
        attempts: tm.filter((a) => a.commit_tx).length,
        wallets: distinct(tm),
        refused: tm.filter((a) => a.commit_tx && a.verdict === "REFUSE").length,
        queued: tm.filter((a) => a.commit_tx && a.verdict === "QUEUE").length,
        paid: teamPaid.length,
        paidUsdc: usd(teamPaid.reduce((s, a) => s + BigInt(Math.round(Number(a.amount_usdc) * 1e6)), 0n)),
        offArena: { count: offArena.length, usdc: usd(offArena.reduce((s, e) => s + BigInt(e.args.amount), 0n)), txs: offArena.map((e) => e.tx_hash as string) },
      },
      // Team wallets are labelled on the attempt row or listed in TEAM_WALLETS; they never count as external.
      payments: TIERS.map((name, tier) => {
        const rows = paid.filter((e) => Number(e.args.tier) === tier);
        const sum = (r: typeof rows) => usd(r.reduce((s, e) => s + BigInt(e.args.amount), 0n));
        const external = rows.filter((e) => !isTeamPay(e) && !isOps(e));
        const teamRows = rows.filter((e) => isTeamPay(e) && !isOps(e));
        return { tier: name, external: { count: external.length, usdc: sum(external) }, team: { count: teamRows.length, usdc: sum(teamRows) } };
      }),
      escalations: {
        total: queued.length,
        approved: queued.filter((q) => outcome.get(String(q.args.id)) === "Approved").length,
        rejected: queued.filter((q) => outcome.get(String(q.args.id)) === "Rejected").length,
      },
      onchainCommits: commits.length,
      vaultUsdc: usd(vaultUsdc),
      blastRadius: { remaining: usd(available), cap: usd(params.dailyCap[Tier.DISCRETIONARY]), perTx: usd(params.perTxCap[Tier.DISCRETIONARY]) },
    },
    payments: paid.map((e) => ({
      tx: e.tx_hash,
      url: txUrl(e.tx_hash),
      tier: TIERS[Number(e.args.tier)],
      payee: e.args.payee,
      usdc: usd(BigInt(e.args.amount)),
      label: team.has(String(e.args.payee).toLowerCase()) ? "team" : (byHash.get(e.args.decisionHash)?.wallet_label ?? null),
    })),
    escalations: queued.map((q) => ({ id: q.args.id, tx: q.tx_hash, url: txUrl(q.tx_hash), payee: q.args.payee, usdc: usd(BigInt(q.args.amount)), reason: q.args.reason, outcome: outcome.get(String(q.args.id)) ?? "pending" })),
    // tx hash -> block, for every mirrored diamond event (commits, pays, queues): trail rows show "block N".
    blocks: Object.fromEntries(ev.map((e) => [e.tx_hash, Number(e.block)])) as Record<string, number>,
    paidOutAll: usd(paid.reduce((s, e) => s + BigInt(e.args.amount), 0n)),
    attempts: at.slice(0, 200).map((a) => ({ ...a, commit_url: a.commit_tx ? txUrl(a.commit_tx) : null })),
    ops: ops ?? [],
    // The operator heartbeat: the newest "cycle" ops row. Null until the first cycle logs one.
    lastCycle: cycle ? { ts: cycle.ts as string, summary: cycle.detail.summary as string } : null,
  };
}
