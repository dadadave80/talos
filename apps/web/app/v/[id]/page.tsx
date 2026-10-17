import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatUnits } from "viem";
import { explorer, publicClient, Tier, vault, vaultAbi } from "@/lib/chain";
import { receipt } from "@/lib/share";
import { SiteFooter, SiteHeader } from "../../site-header";
import { VerdictReceipt } from "../../verdict-receipt";

type Props = { params: Promise<{ id: string }> };

const word = { PAY: "paid", QUEUE: "queued", REFUSE: "refused" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await receipt((await params).id);
  return { title: r ? `Talos ${word[r.verdict]} · attempt ${r.index}` : "Talos receipt" };
}

/// One verdict, shareable. The share card is ./opengraph-image.tsx.
export default async function ReceiptPage({ params }: Props) {
  const [r, p] = await Promise.all([
    receipt((await params).id),
    publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "params" }),
  ]);
  if (!r) notFound();
  const usd = (n: bigint) => Number(formatUnits(n, 6)).toFixed(2);
  return (
    <div className="relative mx-auto w-full max-w-[1280px] overflow-x-clip">
      <SiteHeader active="arena" />
      <main className="flex max-w-3xl flex-col gap-6 px-6 pb-16 pt-10 lg:px-20 lg:pt-16">
        <span className="smallcaps text-sm text-ink-3">Talos · receipt</span>
        {r.message_excerpt && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-ink-3">The message (first 80 characters)</span>
            <blockquote className="font-display text-3xl font-medium leading-tight">
              “{r.message_excerpt}
              {r.message_excerpt.length >= 80 ? "…" : ""}”
            </blockquote>
          </div>
        )}
        <VerdictReceipt r={r} explorer={explorer} perTx={usd(p.perTxCap[Tier.DISCRETIONARY])} cap={usd(p.dailyCap[Tier.DISCRETIONARY])} />
        <a href="/" className="text-sm font-medium">Try to rob it yourself →</a>
      </main>
      <SiteFooter />
    </div>
  );
}
