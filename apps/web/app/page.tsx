import Link from "next/link";
import { network } from "@/lib/share";
import { snapshot } from "@/lib/snapshot";
import { FollowOne } from "./follow-one";

export const revalidate = 15;

// The landing page tells the story; the arena (/arena) is where you make your case. Numbers are read from the vault
// and the ledger at the block shown, never typed in.

const f2 = (v: string | number) => Number(v).toFixed(2);
const ago = (ts: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(ts).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

const JOBS: [string, string, string, string][] = [
  [
    "Pays contributors",
    "A maintainer labels a Lattice issue bounty:N. When the pull request that closes it merges, the hourly cycle pays its author once, from a capped contributor budget.",
    "Operator log",
    "/evidence#operator",
  ],
  [
    "Pays its own bills",
    "Once a day it moves a 1 USDC float into Circle Gateway. Every cycle it buys an Arc RPC read over x402, for 0.0001 USDC.",
    "Operator log",
    "/evidence#operator",
  ],
  [
    "Refuses everything else",
    "Anyone can sign a message and ask it for money. Refusals are committed on-chain like everything else, so what it declined is as public as what it paid.",
    "Enter the arena",
    "/arena",
  ],
];

const BOUND: [string, string][] = [
  ["Decide", "The model reads the request and returns pay, queue or refuse, with a reason."],
  ["Commit", "The decision hash goes to Arc first. pay() reverts without a fresh, matching commitment."],
  ["Act", "Only then does money move: inside per-tier caps, a rolling daily budget and a velocity breaker."],
];

export default async function Home() {
  const s = await snapshot();
  const now = s.at;
  const perTx = f2(s.discretionary.perTx);
  const untaken = Number(s.paidToAttackers) === 0 && Number(s.contributorsPaid) === 0;
  const halted = s.stopped || s.tripped || Number(s.discretionary.remaining) <= 0;
  const live: [string, React.ReactNode, string][] = [
    ["Vault", <>{f2(s.vaultUsdc)} <span className="text-sm text-ink-3">USDC</span></>, `${s.explorer}/address/${s.vault}`],
    ["Most one message can take", <>{halted ? "0.00" : f2(Math.min(Number(s.discretionary.perTx), Number(s.discretionary.remaining)))} <span className="text-sm text-ink-3">USDC</span></>, "/policy#caps"],
    ["Discretionary left today", <>{f2(s.discretionary.remaining)} / {f2(s.discretionary.cap)}</>, "/policy#caps"],
  ];

  return (
    <main id="main" className="flex flex-col">
      <section className="grid grid-cols-1 gap-10 px-6 pb-16 pt-12 lg:grid-cols-12 lg:gap-x-6 lg:px-20 lg:pb-24 lg:pt-20">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <h1 className="font-display text-[40px] font-medium leading-[1.08] tracking-[-0.02em] text-balance lg:text-[60px] lg:leading-[1.04]">
            Talos runs an open-source project&apos;s treasury on {network}.{" "}
            <span className="text-bronze">Try to rob it. The most you can take is a contract parameter.</span>
          </h1>
          <p className="max-w-[60ch] text-lg leading-[30px] text-ink-2 text-pretty">
            It pays Lattice contributors for merged pull requests, pays its own bills, and refuses everything else. Each
            decision is written to Arc before any money moves, and its limits sit in a contract it cannot change.
          </p>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-7">
            <Link href="/arena" className="press flex h-12 items-center bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
              Enter the arena
            </Link>
            <Link href="/evidence" className="flex h-11 items-center text-[15px] font-medium text-ink-2 underline decoration-rule underline-offset-[6px] hover:text-ink hover:decoration-ink">
              See every transaction
            </Link>
          </div>
          <span className="text-[13px] text-ink-3">Five free attempts a day with a passkey or any browser wallet. You only sign a message.</span>
        </div>

        <div className="flex flex-col self-end lg:col-span-4">
          <span className="flex items-center gap-2 pb-2 font-mono text-xs tabular-nums text-ink-3">
            <span aria-hidden="true" className="size-1.5 bg-pay" />
            As of block {Number(s.block).toLocaleString("en-US")}
          </span>
          <div className="flex flex-col">
            {live.map(([l, v, href]) => (
              <Link key={l} href={href} className="flex items-baseline justify-between gap-4 border-t border-rule py-3 text-ink hover:text-ink">
                <span className="text-sm text-ink-2">{l}</span>
                <span className="font-display text-2xl font-medium tabular-nums">{v}</span>
              </Link>
            ))}
            <Link href="/evidence#operator" className="flex flex-col gap-1 border-y border-rule py-3 text-ink hover:text-ink">
              <span className="text-sm text-ink-2">Operator</span>
              <span className="text-[15px] leading-[22px]">
                {s.lastCycle ? `Last cycle ${ago(s.lastCycle.ts, now)} · ${s.lastCycle.summary}` : "Runs hourly at :00 UTC"}
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="jobs" className="mx-6 flex flex-col pb-16 lg:mx-20 lg:pb-24">
        <h2 id="jobs" className="border-b border-ink pb-3 font-display text-[28px] font-medium tracking-[-0.01em] lg:text-4xl">
          Three jobs, one brain, one set of tools.
        </h2>
        {JOBS.map(([h, t, cta, href]) => (
          <div key={h} className="grid grid-cols-1 gap-2 border-b border-rule py-6 lg:grid-cols-12 lg:gap-6">
            <h3 className="font-display text-2xl font-medium lg:col-span-4">{h}</h3>
            <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2 lg:col-span-6">{t}</p>
            <Link href={href} className="flex min-h-11 items-center text-[15px] font-medium lg:col-span-2 lg:justify-end lg:self-start">
              {cta} →
            </Link>
          </div>
        ))}
      </section>

      <section aria-labelledby="bound" className="mx-6 flex flex-col gap-8 pb-16 lg:mx-20 lg:pb-24">
        <div className="flex flex-col gap-3 lg:max-w-[48rem]">
          <h2 id="bound" className="font-display text-[28px] font-medium tracking-[-0.01em] lg:text-4xl">Decide, commit, then act.</h2>
          <p className="text-[17px] leading-7 text-ink-2">
            Every action, from a bounty to a refusal, follows the same order, and the contract enforces it. Above {perTx} USDC a
            human must sign; changing any cap, key or allowlist takes a public 48-hour timelock.
          </p>
        </div>
        <ol className="grid grid-cols-1 border-t border-ink lg:grid-cols-3">
          {BOUND.map(([h, t], i) => (
            <li key={h} className={`flex flex-col gap-2 border-b border-rule py-5 lg:border-b-0 lg:py-6 ${i ? "lg:border-l lg:pl-6" : ""} ${i < 2 ? "lg:pr-6" : ""}`}>
              <span className="font-display text-2xl font-medium">{h}</span>
              <span className="text-[15px] leading-6 text-ink-2">{t}</span>
            </li>
          ))}
        </ol>
        <Link href="/policy" className="flex min-h-11 items-center self-start text-[15px] font-medium">Read the policy, read live from the vault →</Link>
      </section>

      <div id="follow" className="mx-6 pb-16 lg:mx-20 lg:max-w-[52rem] lg:pb-24">
        <FollowOne />
      </div>

      <section className="mx-6 flex flex-col items-start gap-6 border-t border-ink py-14 lg:mx-20 lg:py-20">
        <p className="max-w-[24ch] font-display text-[32px] font-medium leading-[1.1] tracking-[-0.01em] text-balance lg:text-5xl">
          {untaken ? `${perTx} USDC is on the table. Nobody outside the team has taken it yet.` : "Make your case."}
        </p>
        <Link href="/arena" className="press flex h-12 items-center bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
          Enter the arena
        </Link>
      </section>
    </main>
  );
}
