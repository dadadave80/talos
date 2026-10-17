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
    // "The one that worked": the largest payout to an external wallet. Null until one exists.
    best: (() => {
      const b = e.attempts.filter((a) => a.wallet_label === "external" && a.verdict === "PAY" && a.pay_tx && !a.note).sort((x, y) => Number(y.amount_usdc) - Number(x.amount_usdc))[0];
      return b ? { id: b.id as string, excerpt: (b.message_excerpt as string | null) ?? null, reason: b.reason as string, amount: Number(b.amount_usdc).toFixed(2), payTx: b.pay_tx as string, wallet: b.wallet as string } : null;
    })(),
    feed: e.attempts
      .filter((a) => a.verdict && a.wallet_label !== "synthetic")
      .slice(0, 10)
      .map((a) => ({ id: a.id as string, verdict: a.verdict as "PAY" | "QUEUE" | "REFUSE", wallet: a.wallet as string, team: a.wallet_label !== "external", excerpt: (a.message_excerpt as string | null) ?? null, amount: (a.amount_usdc as number | null) ?? null, ts: a.ts as string })),
  };
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
