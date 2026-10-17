import { keccak256, toBytes } from "viem";
import { chain, explorer, publicClient, vault, vaultAbi } from "./chain";
import { evidence } from "./ledger/evidence";

const VELOCITY_KEY = keccak256(toBytes("talos.velocity"));

/// Everything the Arena shows above the composer: external-only counters, team tests (counted apart), the discretionary
/// meter, the pause and velocity-breaker flags, the operator's last cycle and the latest decided attempts (team rows
/// included but labelled). Served by the page and by /api/snapshot.
export function snapshot() {
  return read().catch(() => new Promise((r) => setTimeout(r, 3000)).then(read));
}

async function read() {
  // A stalled RPC or database fails the request after 20 s instead of hanging it: the page keeps its last render and
  // the arena its "Read" time. The reads run on (the event sync is idempotent); only the wait is cut.
  const deadline = AbortSignal.timeout(20_000);
  const [e, stopped, tripped] = await Promise.race([
    Promise.all([
      evidence(),
      publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "isStopped" }),
      publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "isTripped", args: [VELOCITY_KEY] }),
    ]),
    new Promise<never>((_, no) => deadline.addEventListener("abort", () => no(deadline.reason), { once: true })),
  ]);
  const c = e.counters;
  const ext = (tier: string) => c.payments.find((p) => p.tier === tier)?.external.usdc ?? "0";
  return {
    at: Date.now(),
    block: e.syncedToBlock,
    chainId: chain.id,
    vault: e.vault,
    explorer,
    vaultUsdc: c.vaultUsdc,
    discretionary: c.blastRadius,
    attempts: c.attempts,
    wallets: c.externalWallets.total,
    refusals: c.refusals,
    paidToAttackers: ext("DISCRETIONARY"),
    contributorsPaid: ext("CONTRIBUTOR"),
    escalations: c.escalations.total,
    stopped,
    // The velocity breaker: while tripped every payout reverts, until the owner calls resume().
    tripped,
    team: c.team,
    // The newest decided attempt of any non-synthetic wallet, team tests included: it is a timestamp, not a count.
    lastVerdictAt: (e.attempts.find((a) => a.verdict && a.wallet_label !== "synthetic")?.ts as string | undefined) ?? null,
    lastCycle: e.lastCycle,
    // "The one that worked": the largest payout to an external wallet. Null until one exists.
    best: e.best,
    feed: e.attempts
      .filter((a) => a.verdict && a.wallet_label !== "synthetic")
      .slice(0, 10)
      .map((a) => ({ id: a.id as string, verdict: a.verdict as "PAY" | "QUEUE" | "REFUSE", wallet: a.wallet as string, team: a.wallet_label !== "external", excerpt: (a.message_excerpt as string | null) ?? null, amount: (a.amount_usdc as number | null) ?? null, ts: a.ts as string })),
  };
}
export type Snapshot = Awaited<ReturnType<typeof read>>;
