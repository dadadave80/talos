import Link from "next/link";
import { formatUnits } from "viem";
import { explorer } from "@/lib/chain";
import { policy } from "@/lib/policy";
import { network } from "@/lib/share";
import { snapshot } from "@/lib/snapshot";
import { BlastRadius, meterFor } from "./blast-radius";
import { PathOfAMessage } from "./landing/path-of-a-message";
import { loadTraces, TIERS } from "./landing/traces";
import { VerdictReplay, type Step } from "./landing/verdict-replay";
import { WhatBoundsIt } from "./landing/what-bounds-it";

export const revalidate = 15;

// The landing page: the thesis and three diagrams. Every number is read from the vault or the ledger at the block
// shown; the replay is a real team-test attempt. The arena (/arena) is where you make your case.

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const f2 = (v: string | number | bigint) => (typeof v === "bigint" ? Number(formatUnits(v, 6)) : Number(v)).toFixed(2);
const blk = (n: number | null) => (n ? `block ${n.toLocaleString("en-US")} · ` : "");

export default async function Home() {
  const [s, traces, pol] = await Promise.all([snapshot(), loadTraces().catch(() => null), policy().catch(() => null)]);
  const m = meterFor(s);
  const untaken = Number(s.paidToAttackers) === 0 && Number(s.contributorsPaid) === 0;
  const delayHours = Math.round((pol?.timelockDelaySeconds ?? 172_800) / 3600);
  const pay = traces?.pay ?? null;
  const refuse = traces?.refuse ?? null;
  const tier = pay ? TIERS.indexOf(pay.tier as (typeof TIERS)[number]) : -1;
  const p = traces?.params;
  const steps: Step[] | null = pay && [
    { k: "Message", text: pay.message_excerpt ? `“${pay.message_excerpt}”` : "Message not stored." },
    { k: "Verdict", text: `Pay ${f2(pay.amount_usdc ?? 0)} USDC · ${pay.model ?? "model not recorded"}`, mono: true },
    { k: "Reason", text: pay.reason },
    { k: "Commit", text: `${blk(pay.commit_block)}${short(pay.commit_tx!)}`, href: `${explorer}/tx/${pay.commit_tx}`, mono: true },
    {
      k: "Contract",
      text: tier >= 0 && p ? `asked ${f2(pay.amount_usdc ?? 0)} · cap ${f2(p.perTxCap[tier])} per message · ${f2(p.dailyCap[tier])} per rolling day` : `asked ${f2(pay.amount_usdc ?? 0)} · inside the vault's caps`,
      href: "/policy#caps",
      mono: true,
    },
    { k: "Settle", text: `paid ${f2(pay.amount_usdc ?? 0)} USDC → ${short(pay.wallet)} · ${blk(pay.pay_block)}${short(pay.pay_tx!)}`, href: `${explorer}/tx/${pay.pay_tx}`, mono: true },
  ];
  const proof: [string, string, string][] = [
    ["Attempts", String(s.attempts), "/evidence#attempts"],
    ["Wallets", String(s.wallets), "/evidence#attempts"],
    ["Refused", String(s.refusals), "/evidence?verdict=REFUSE#attempts"],
    ["Paid", `${f2(s.paidToAttackers)} USDC`, "/evidence?verdict=PAY#attempts"],
  ];
  const h2 = "font-display text-[28px] font-medium tracking-[-0.01em] lg:text-4xl";

  return (
    <main id="main" className="flex flex-col">
      <section className="grid grid-cols-1 gap-10 px-6 pb-16 pt-10 lg:grid-cols-12 lg:gap-x-6 lg:px-20 lg:pb-24 lg:pt-20">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <h1 className="font-display text-[40px] font-medium leading-[1.08] tracking-[-0.02em] text-balance lg:text-[60px] lg:leading-[1.04]">
            Talos runs an open-source project&apos;s treasury on {network}.{" "}
            <span className="text-bronze">Try to rob it. The most you can take is a contract parameter.</span>
          </h1>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-7">
            <Link href="/arena" className="press flex h-12 items-center bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
              Enter the arena
            </Link>
            <Link href="/evidence" className="flex h-11 items-center text-[15px] font-medium text-ink-2 underline decoration-rule underline-offset-[6px] hover:text-ink hover:decoration-ink">
              See every transaction
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-2 self-end lg:col-span-4">
          <span className="font-mono text-xs tabular-nums text-ink-3">As of block {Number(s.block).toLocaleString("en-US")}</span>
          <BlastRadius m={m} big />
        </div>
      </section>

      <section aria-labelledby="path" className="mx-6 flex flex-col gap-6 border-t border-ink pb-16 pt-6 lg:mx-20 lg:pb-24">
        <h2 id="path" className={h2}>The path of a message</h2>
        <PathOfAMessage
          perTx={m.perTx}
          cap={m.cap}
          delayHours={delayHours}
          commitUrl={pay ? `${explorer}/tx/${pay.commit_tx}` : null}
          payUrl={pay?.pay_tx ? `${explorer}/tx/${pay.pay_tx}` : null}
          refuseUrl={refuse ? `/v/${refuse.id}` : null}
        />
      </section>

      {pol && (
        <section aria-labelledby="bounds" className="mx-6 flex flex-col gap-6 border-t border-ink pb-16 pt-6 lg:mx-20 lg:pb-24">
          <h2 id="bounds" className={h2}>What bounds it</h2>
          <WhatBoundsIt
            tiers={pol.tiers}
            owner={pol.owner}
            keys={pol.agentKeys}
            delayHours={delayHours}
            vault={pol.vault}
            vaultUsdc={f2(s.vaultUsdc)}
            explorer={explorer}
            stopped={pol.stopped}
          />
        </section>
      )}

      {pay && steps && (
        <section id="replay" aria-labelledby="replay-h" className="mx-6 flex flex-col gap-6 border-t border-ink pb-16 pt-6 lg:mx-20 lg:max-w-[52rem] lg:pb-24">
          <h2 id="replay-h" className={h2}>One verdict, replayed</h2>
          {/* TODO(question): the brief says "Open the full receipt" links to Evidence; it links to the receipt itself (/v/id), which is the full receipt. */}
          <VerdictReplay steps={steps} stamp={`Pay ${f2(pay.amount_usdc ?? 0)} USDC`} tone="text-pay border-pay" receiptHref={`/v/${pay.id}`} />
        </section>
      )}

      <section aria-label="Live record" className="mx-6 flex flex-col gap-8 border-t border-ink pb-16 pt-6 lg:mx-20 lg:pb-24">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
          {proof.map(([l, v, href]) => (
            <Link key={l} href={href} className="flex flex-col gap-1 border-t border-rule py-3 text-ink hover:text-ink">
              <span className="text-[13px] text-ink-2">{l} · external wallets</span>
              <span className="font-display text-[28px] font-medium tabular-nums lg:text-[36px]">{v}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-col items-start gap-6">
          <p className="max-w-[24ch] font-display text-[32px] font-medium leading-[1.1] tracking-[-0.01em] text-balance lg:text-5xl">
            {m.num} USDC is on the table.{untaken && " Nobody outside the team has taken it yet."}
          </p>
          <Link href="/arena" className="press flex h-12 items-center bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
            Enter the arena
          </Link>
        </div>
      </section>
    </main>
  );
}
