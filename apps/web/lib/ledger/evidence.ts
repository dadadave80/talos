import { encodeAbiParameters, formatUnits, keccak256 } from "viem";
import { publicClient, Tier, txUrl, vault, vaultAbi } from "../chain";
import { db } from "../db";
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
  const [{ data: events }, { data: attempts }, { data: ops }] = await Promise.all([
    sb.from("chain_events").select("tx_hash,block,name,args").order("block", { ascending: false }),
    sb.from("attempts").select("*").order("ts", { ascending: false }).limit(5000),
    sb.from("ops").select("*").order("ts", { ascending: false }).limit(500),
  ]);
  const ev = events ?? [];
  const at = attempts ?? [];
  const ext = at.filter((a) => a.wallet_label === "external");
  const byHash = new Map(at.map((a) => [a.decision_hash, a]));
  const team = new Set((process.env.TEAM_WALLETS ?? "").toLowerCase().split(",").filter(Boolean));
  const distinct = (rows: typeof at) => new Set(rows.map((a) => a.wallet)).size;

  const commits = ev.filter((e) => e.name === "DecisionCommitted");
  const paid = ev.filter((e) => e.name === "Paid");
  const queued = ev.filter((e) => e.name === "Queued");
  const outcome = new Map<string, string>();
  for (const e of ev) if (e.name === "Approved" || e.name === "Rejected") outcome.set(String(e.args.id), e.name);
  const tolls = ext.filter((a) => a.toll_kind === "facilitator" && a.toll_status === "completed");

  const [available, params] = await Promise.all([
    publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "getAvailable", args: [budgetKey(Tier.DISCRETIONARY)] }),
    publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "params" }),
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
      // Team wallets are labelled on the attempt row or listed in TEAM_WALLETS; they never count as external.
      payments: TIERS.map((name, tier) => {
        const rows = paid.filter((e) => Number(e.args.tier) === tier);
        const sum = (r: typeof rows) => usd(r.reduce((s, e) => s + BigInt(e.args.amount), 0n));
        const isTeam = (e: (typeof rows)[number]) =>
          team.has(String(e.args.payee).toLowerCase()) || byHash.get(e.args.decisionHash)?.wallet_label === "team";
        const external = rows.filter((e) => !isTeam(e));
        const teamRows = rows.filter(isTeam);
        return { tier: name, external: { count: external.length, usdc: sum(external) }, team: { count: teamRows.length, usdc: sum(teamRows) } };
      }),
      escalations: {
        total: queued.length,
        approved: queued.filter((q) => outcome.get(String(q.args.id)) === "Approved").length,
        rejected: queued.filter((q) => outcome.get(String(q.args.id)) === "Rejected").length,
      },
      onchainCommits: commits.length,
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
    attempts: at.slice(0, 200).map((a) => ({ ...a, commit_url: a.commit_tx ? txUrl(a.commit_tx) : null })),
    ops: ops ?? [],
  };
}
