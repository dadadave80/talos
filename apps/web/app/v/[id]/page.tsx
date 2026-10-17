import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { formatUnits } from "viem";
import { FREE_PER_WALLET } from "@/lib/accounts/freeTier";
import { explorer, publicClient, Tier, vault, vaultAbi } from "@/lib/chain";
import { excerpt, receipt, type Receipt } from "@/lib/share";
import { ShareActions } from "../../share-actions";
import { VerdictReceipt } from "../../verdict-receipt";

type Props = { params: Promise<{ id: string }> };

const word = { PAY: "Paid", QUEUE: "Queued", REFUSE: "Refused" } as const;
const get = cache(receipt);

const firstSentence = (s: string) => {
  const t = s.replace(/\s*\[contract:[^\]]*\]/, "").split(/(?<=[.!?])\s/)[0];
  return t.length > 160 ? `${t.slice(0, 159).replace(/\s+\S*$/, "")}…` : t;
};
function ogTitle(r: Receipt) {
  const n = `attempt ${r.index}`;
  const amount = r.amount_usdc != null ? Number(r.amount_usdc).toFixed(2) : null;
  const t =
    r.verdict === "REFUSE" ? `Talos refused ${n}`
    : r.verdict === "QUEUE" ? `Talos queued ${n} for its owner`
    : r.pay_tx && !r.note ? `Talos paid ${amount} USDC on ${n}`
    : `Talos said pay on ${n}; nothing moved`;
  return r.wallet_label === "external" ? t : `${t} · team test, not counted`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await get(id);
  if (!r) return { title: "Not found", robots: { index: false }, openGraph: { images: ["/opengraph-image"] }, twitter: { images: ["/opengraph-image"] } };
  const description = r.reason.includes("model_unavailable") ? "Model unavailable; the refusal was recorded on Arc." : firstSentence(r.reason);
  // A page's openGraph replaces the layout's, so siteName comes along; the image is ./opengraph-image.tsx.
  return {
    title: `${word[r.verdict]} · attempt ${r.index}`,
    description,
    openGraph: { title: ogTitle(r), description, siteName: "Talos", type: "article", url: `/v/${id}` },
  };
}

/// One verdict, shareable. The share card is ./opengraph-image.tsx.
export default async function ReceiptPage({ params }: Props) {
  const { id } = await params;
  const r = await get(id);
  if (!r) notFound();
  const p = await publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "params" });
  const usd = (n: bigint) => Number(formatUnits(n, 6)).toFixed(2);
  const perTx = usd(p.perTxCap[Tier.DISCRETIONARY]);
  return (
    <main id="main" className="grid grid-cols-1 gap-12 px-6 pb-16 pt-10 lg:grid-cols-12 lg:gap-x-6 lg:px-20 lg:pt-16">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
        <h1 className="smallcaps text-sm text-ink-3">Talos · receipt · attempt {r.index}</h1>
        {r.message_excerpt && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-ink-3">How the message began</span>
            <blockquote className="font-display text-3xl font-medium leading-tight break-words text-pretty">“{excerpt(r.message_excerpt)}”</blockquote>
          </div>
        )}
        <VerdictReceipt r={r} page explorer={explorer} perTx={perTx} cap={usd(p.dailyCap[Tier.DISCRETIONARY])} />
      </div>

      <aside aria-labelledby="your-turn" className="flex flex-col gap-4 border-t border-ink pt-2.5 lg:sticky lg:top-20 lg:col-span-5 lg:self-start">
        <h2 id="your-turn" className="smallcaps text-sm text-ink-2">Your turn</h2>
        <p className="text-[15px] leading-[22px] text-ink-2">
          Talos pays a wallet it doesn&apos;t know at most <span className="font-mono text-ink">{perTx} USDC</span> per message, and commits every
          verdict on Arc before any money moves. Signing is free and moves nothing.
        </p>
        <Link href="/#case" className="flex h-12 items-center justify-center bg-bronze px-5 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
          Try it free — {FREE_PER_WALLET} attempts a day
        </Link>
        <ShareActions r={r} panel />
        <figure className="flex flex-col gap-1.5 pt-2">
          <img
            src={`/v/${r.id}/opengraph-image`}
            alt={`Share card: ${ogTitle(r)}`}
            width={1200}
            height={630}
            loading="lazy"
            className="h-auto w-full border border-rule"
          />
          <figcaption className="font-mono text-xs text-ink-3">What a pasted link shows</figcaption>
        </figure>
      </aside>
    </main>
  );
}
