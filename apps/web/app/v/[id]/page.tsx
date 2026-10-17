import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { txUrl } from "@/lib/chain";
import { network, receipt } from "@/lib/share";

type Props = { params: Promise<{ id: string }> };

const word = { PAY: "Paid", QUEUE: "Queued for the owner", REFUSE: "Refused" } as const;
const color = { PAY: "text-pay border-pay", QUEUE: "text-queue border-queue", REFUSE: "text-refuse border-refuse" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await receipt((await params).id);
  return { title: r ? `Talos ${word[r.verdict].toLowerCase()} · attempt ${r.index}` : "Talos receipt" };
}

/// Plain receipt page; the share card is ./opengraph-image.tsx.
export default async function Receipt({ params }: Props) {
  const r = await receipt((await params).id);
  if (!r) notFound();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 border-l-2 border-bronze px-6 py-16 sm:px-10">
      <p className="smallcaps text-sm text-ink-2">
        Talos · receipt · {r.wallet_label === "external" ? `attempt ${r.index}` : "team test, not counted"}
      </p>
      <p className={`smallcaps self-start border-2 px-4 py-1 text-2xl ${color[r.verdict]}`}>
        {word[r.verdict]}
        {r.amount_usdc != null && r.verdict !== "REFUSE" ? ` ${Number(r.amount_usdc).toFixed(2)} USDC` : ""}
      </p>
      {r.message_excerpt && <blockquote className="font-display text-3xl leading-tight">“{r.message_excerpt}”</blockquote>}
      <p className="text-lg leading-7 text-ink-2">{r.reason}</p>
      <p className="font-mono text-sm text-ink-3">
        {r.commit_tx ? <a href={txUrl(r.commit_tx)}>commit {r.commit_tx.slice(0, 10)}…</a> : "not committed"} · {network} ·{" "}
        {new Date(r.ts).toUTCString()}
      </p>
    </main>
  );
}
