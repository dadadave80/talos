import { chain, explorer, publicClient, vault, vaultAbi } from "./chain";
import { evidence } from "./ledger/evidence";

/// Everything the Arena shows above the composer: external-only counters, the discretionary meter, the pause flag
/// and the latest decided attempts (team rows included but labelled). Served by the page and by /api/snapshot.
export async function snapshot() {
  const [e, stopped] = await Promise.all([evidence(), publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "isStopped" })]);
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
    feed: e.attempts
      .filter((a) => a.verdict && a.wallet_label !== "synthetic")
      .slice(0, 10)
      .map((a) => ({ id: a.id as string, verdict: a.verdict as "PAY" | "QUEUE" | "REFUSE", wallet: a.wallet as string, team: a.wallet_label !== "external", excerpt: (a.message_excerpt as string | null) ?? null, amount: (a.amount_usdc as number | null) ?? null, ts: a.ts as string })),
  };
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
