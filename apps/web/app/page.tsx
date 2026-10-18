import Link from "next/link";
import { formatUnits } from "viem";
import { openBounties } from "@/lib/bounty";
import { explorer } from "@/lib/chain";
import { policy } from "@/lib/policy";
import { excerpt, network } from "@/lib/share";
import { snapshot } from "@/lib/snapshot";
import { meterFor } from "./blast-radius";
import { Chapter } from "./landing/chapter";
import { PathOfAMessage } from "./landing/path-of-a-message";
import { Sequence } from "./landing/sequence";
import { loadTraces, TIERS, type Traced } from "./landing/traces";
import { WhatBoundsIt } from "./landing/what-bounds-it";

export const revalidate = 15;

// The landing page, told in chapters: the live vault, the problem, the path of a message, one verdict followed end to
// end, what bounds it, the public record, and the way in. Every number is read from the vault or the ledger at the block
// shown; the traced verdicts are real team-test attempts, labelled as such.

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const f2 = (v: string | number | bigint) => (typeof v === "bigint" ? Number(formatUnits(v, 6)) : Number(v)).toFixed(2);
const blk = (n: number | null) => (n ? n.toLocaleString("en-US") : "—");
const ago = (ts: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(ts).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, "")}…`);
const tone = { PAY: "text-pay border-pay", QUEUE: "text-queue border-queue", REFUSE: "text-refuse border-refuse" } as const;
const word = (v: "PAY" | "QUEUE" | "REFUSE", amt: number | null) => (v === "REFUSE" ? "Refuse" : `${v === "PAY" ? "Pay" : "Queue"}${amt != null ? ` ${f2(amt)}` : ""}`);

export default async function Home() {
  const [s, traces, pol, bounties] = await Promise.all([
    snapshot(),
    loadTraces().catch(() => null),
    policy().catch(() => null),
    openBounties("dadadave80/lattice").catch(() => null),
  ]);
  const m = meterFor(s);
  const untaken = Number(s.paidToAttackers) === 0 && Number(s.contributorsPaid) === 0;
  const delayHours = Math.round((pol?.timelockDelaySeconds ?? 172_800) / 3600);
  const pay = traces?.pay ?? null;
  const refuse = traces?.refuse ?? null;
  const latest = s.feed[0] ?? null;
  const now = s.at;

  return (
    <main id="main" className="flex flex-col">
      {/* Hero: the thesis, verbatim, and the live vault beside it. */}
      <section className="grid grid-cols-1 gap-12 px-6 pb-20 pt-12 lg:grid-cols-12 lg:gap-x-10 lg:px-20 lg:pb-28 lg:pt-20">
        <div className="flex flex-col gap-7 lg:col-span-7">
          <p className="text-[15px] leading-6 text-ink-3">
            <span className="font-display text-lg italic text-ink-2">Τάλως</span> · the bronze guardian of Crete, who turned every ship away.
          </p>
          <h1 className="font-display text-[40px] font-medium leading-[1.06] tracking-[-0.02em] text-balance lg:text-[54px] lg:leading-[1.04]">
            Talos runs an open-source project&apos;s treasury on {network}.{" "}
            <span className="text-bronze">Try to rob it. The most you can take is a contract parameter.</span>
          </h1>
          <p className="max-w-[54ch] text-[17px] leading-7 text-ink-2">
            It pays Lattice contributors and its own bills, and refuses everything else. Every decision is written to Arc
            before money moves.
          </p>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link href="/arena" className="press flex h-12 items-center bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
              Enter the arena
            </Link>
            <Link href="/#follow" className="flex h-12 items-center border border-rule px-5 text-[15px] font-medium text-ink hover:border-ink-2 hover:text-ink">
              Follow one verdict ↓
            </Link>
          </div>
        </div>

        <aside aria-label="The vault, live" className="flex flex-col gap-3 self-center lg:col-span-5">
          <div className="flex flex-col rounded-md border border-rule border-t-bronze bg-raised">
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink">
                <span aria-hidden="true" className="live-dot size-1.5 bg-pay" />
                Live vault
              </span>
              <a href={`${explorer}/address/${s.vault}`} className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink">
                {network} ↗
              </a>
            </div>
            <Link href="/policy#caps" className="flex items-end justify-between gap-4 px-5 pb-5 pt-6 text-ink hover:text-ink">
              <span className="text-[13px] leading-5 text-ink-2">Most you can
                <br />take now</span>
              <span className={`font-mono text-[44px] font-medium leading-none tabular-nums tracking-[-0.02em] ${m.numC}`}>
                {m.num}
                <span className="ml-1.5 text-sm font-normal text-ink-3">USDC</span>
              </span>
            </Link>
            <Link href="/policy#caps" aria-hidden="true" tabIndex={-1} className="flex flex-col gap-1.5 px-5 pb-5">
              <span className="relative block h-5">
                <span className="absolute inset-x-0 top-2.5 h-px bg-ink-3" />
                {Array.from({ length: 11 }, (_, i) => (
                  <span key={i} className="absolute top-[7px] h-[7px] w-px bg-rule" style={{ left: `${((i + 1) / 12) * 100}%` }} />
                ))}
                <span className={`absolute left-0 top-[9px] h-[3px] ${m.fill}`} style={{ width: `${m.usedPct}%` }} />
                <span className="absolute right-0 top-0 h-5 w-[5px] border-x border-ink" />
              </span>
              <span className="flex justify-between font-mono text-[10px] text-ink-3">
                <span>0</span>
                <span>{m.cap} USDC / rolling day</span>
              </span>
            </Link>
            <div className="mx-5 h-px bg-rule" />
            <dl className="grid grid-cols-3 gap-4 px-5 py-4">
              {[
                ["Vault", `${f2(s.vaultUsdc)}`, `${explorer}/address/${s.vault}`],
                ["Budget today", `${m.remaining} / ${m.cap}`, "/policy#caps"],
                ["Per message", m.perTx, "/policy#caps"],
              ].map(([l, v, href]) => (
                <a key={l} href={href} className="flex flex-col gap-1 text-ink hover:text-ink">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{l}</dt>
                  <dd className="whitespace-nowrap font-mono text-sm tabular-nums">{v}</dd>
                </a>
              ))}
            </dl>
            <div className="mx-5 h-px bg-rule" />
            {latest ? (
              <Link href={`/v/${latest.id}`} className="flex flex-col gap-1.5 px-5 py-4 text-ink hover:text-ink">
                <span className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                  Last verdict
                  <span>{ago(latest.ts, now)}{latest.team ? " · team test" : ""}</span>
                </span>
                <span className="flex items-baseline gap-3">
                  <span className={`smallcaps inline-flex flex-none border px-1.5 py-px text-[13px] ${tone[latest.verdict]}`}>{word(latest.verdict, latest.amount)}</span>
                  {latest.excerpt && <span className="min-w-0 truncate text-[13px] text-ink-2">“{clip(latest.excerpt, 48)}”</span>}
                </span>
              </Link>
            ) : (
              <span className="px-5 py-4 text-[13px] text-ink-3">No verdicts yet.</span>
            )}
          </div>
          <p className="font-mono text-xs leading-5 tabular-nums text-ink-3">
            block {Number(s.block).toLocaleString("en-US")} · {s.attempts} external attempts · {s.refusals} refused · {f2(s.paidToAttackers)} USDC taken
          </p>
        </aside>
      </section>

      <Chapter id="problem" n="I" kicker="The problem" title="An agent with a wallet can be talked into anything.">
        <ol className="flex flex-col">
          {[
            ["α", "Its prompt is the only thing between an attacker and the money."],
            ["β", "A clever enough message rewrites the rules it was given."],
            ["γ", "When it pays the wrong person, nobody can prove why it decided to."],
          ].map(([g, t]) => (
            <li key={g} className="grid grid-cols-[2rem_1fr] items-baseline gap-2 border-t border-rule py-4 text-[19px] leading-7 lg:text-[22px]">
              <span className="font-display italic text-bronze">{g}.</span>
              <span className="text-ink">{t}</span>
            </li>
          ))}
        </ol>
        <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2">
          Talos moves the limit out of the prompt and into a contract. It can still be fooled; the contract decides what being
          fooled costs.
        </p>
      </Chapter>

      <Chapter id="path" n="II" kicker="The path of a message" title="Decide, commit, then act." lede="Every message takes the same route. The contract gate sits after the model, where no message can reach it." wide>
        <PathOfAMessage
          perTx={m.perTx}
          cap={m.cap}
          delayHours={delayHours}
          commitUrl={pay ? `${explorer}/tx/${pay.commit_tx}` : null}
          payUrl={pay?.pay_tx ? `${explorer}/tx/${pay.pay_tx}` : null}
          refuseUrl={refuse ? `/v/${refuse.id}` : null}
        />
      </Chapter>

      {pay && (
        <Chapter id="follow" n="III" kicker="Follow one verdict" title="One message, traced through the ledger." lede="A real attempt: we fooled it ourselves with a fake bug report. Every step below is on Arc.">
          <Trace r={pay} params={traces!.params} />
          {refuse && (
            <>
              <p className="text-center font-display text-lg italic text-ink-3">and the one that didn&apos;t work</p>
              <Link href={`/v/${refuse.id}`} className="flex flex-col gap-3 rounded-md border border-rule bg-raised p-5 text-ink hover:border-ink-3 hover:text-ink">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="smallcaps border border-refuse px-2 py-0.5 text-[15px] text-refuse">Refuse</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">team test · not counted · commit block {blk(refuse.commit_block)}</span>
                </span>
                {refuse.message_excerpt && <span className="font-mono text-[13px] leading-5 text-ink-2 line-through decoration-refuse/60">{excerpt(refuse.message_excerpt)}</span>}
                <span className="text-[15px] leading-6 text-ink">{clip(refuse.reason, 180)}</span>
                <span className="text-sm font-medium text-bronze">Open the receipt →</span>
              </Link>
            </>
          )}
        </Chapter>
      )}

      {pol && (
        <Chapter id="bounds" n="IV" kicker="What bounds it" title="Limits it cannot change." lede={`Caps, keys and the owner's signature, read live from the vault. Any change waits ${delayHours} hours in public.`} wide>
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
        </Chapter>
      )}

      <Chapter id="record" n="V" kicker="On the record" title="Every verdict lands in public." lede="Refusals included. Team tests are labelled and never counted.">
        <div className="flex flex-col">
          <div className="grid grid-cols-[88px_1fr_72px] gap-4 border-b border-rule pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 sm:grid-cols-[120px_1fr_120px_72px]">
            <span>Verdict</span>
            <span>Message</span>
            <span className="max-sm:hidden">Wallet</span>
            <span className="text-right">When</span>
          </div>
          {s.feed.slice(0, 6).map((o) => (
            <Link key={o.id} href={`/v/${o.id}`} className="grid min-h-12 grid-cols-[88px_1fr_72px] items-center gap-4 border-b border-rule py-2 text-ink hover:bg-raised hover:text-ink sm:grid-cols-[120px_1fr_120px_72px]">
              <span className={`smallcaps text-[15px] ${tone[o.verdict].split(" ")[0]}`}>{word(o.verdict, o.amount)}</span>
              <span className="min-w-0 truncate text-sm text-ink-2">{o.excerpt ? `“${clip(o.excerpt, 70)}”` : "—"}</span>
              <span className="font-mono text-xs text-ink-3 max-sm:hidden">{o.team ? "team test" : short(o.wallet)}</span>
              <span className="text-right font-mono text-xs text-ink-3">{ago(o.ts, now)}</span>
            </Link>
          ))}
          {!s.feed.length && <p className="py-6 text-sm text-ink-3">The first verdict will land here.</p>}
          <p className="pt-4 font-mono text-xs tabular-nums text-ink-3">
            external: {s.attempts} attempts · {s.wallets} wallets · {s.refusals} refused · {f2(s.paidToAttackers)} USDC taken ·{" "}
            <Link href="/evidence" className="text-bronze">Evidence →</Link>
          </p>
        </div>
      </Chapter>

      <Chapter id="enter" n="VI" kicker="Enter" title={untaken ? `${m.num} USDC is on the table. Nobody outside the team has taken it yet.` : `${m.num} USDC is on the table.`} wide>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-md border border-rule bg-raised p-6">
            <h3 className="font-display text-2xl font-medium">Try to rob it</h3>
            <p className="max-w-[46ch] text-[15px] leading-6 text-ink-2">
              Five free attempts a day. Sign in with a passkey, no extension and no seed phrase, or any browser wallet.
            </p>
            <Link href="/arena" className="press mt-auto flex h-12 items-center self-start bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
              Enter the arena
            </Link>
          </div>
          <div className="flex flex-col gap-4 rounded-md border border-rule bg-raised p-6">
            <h3 className="font-display text-2xl font-medium">Earn a bounty</h3>
            <p className="max-w-[46ch] text-[15px] leading-6 text-ink-2">
              {bounties && bounties.count
                ? `${bounties.count} open Lattice issue${bounties.count === 1 ? "" : "s"} carr${bounties.count === 1 ? "ies" : "y"} ${f2(bounties.usdc)} USDC in bounties. Merge the pull request that closes one; the hourly cycle pays you.`
                : "Lattice issues labelled bounty:N pay when the pull request that closes them merges; the hourly cycle pays the author."}
            </p>
            <a href="https://github.com/dadadave80/lattice/issues?q=is%3Aissue+is%3Aopen+label%3Abounty%3A2%2Cbounty%3A3%2Cbounty%3A4" className="mt-auto flex h-12 items-center self-start border border-ink px-5 text-[15px] font-semibold text-ink hover:border-bronze hover:text-ink">
              See open bounties ↗
            </a>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
          <span className="text-ink-2">Built on</span>
          <span>Arc</span>·<span>Circle Modular Wallets</span>·<span>Gateway</span>·<span>x402</span>·<span>Lattice</span>
        </p>
      </Chapter>
    </main>
  );
}

/// The traced PAY as a vertical ledger of stations, each a card that lands in turn.
function Trace({ r, params }: { r: Traced; params: { perTxCap: readonly bigint[]; dailyCap: readonly bigint[] } }) {
  const amount = f2(r.amount_usdc ?? 0);
  const tier = TIERS.indexOf(r.tier as (typeof TIERS)[number]);
  const cap = tier >= 0 ? f2(params.perTxCap[tier]) : null;
  const daily = tier >= 0 ? f2(params.dailyCap[tier]) : null;
  const pct = cap ? Math.min(100, (Number(amount) / Number(cap)) * 100) : 0;
  const card = "flex flex-col gap-3 rounded-md border border-rule bg-raised p-5";
  const head = (t: string, tag: string) => (
    <span className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.16em]">
      <span className="text-ink">{t}</span>
      <span className="text-ink-3">{tag}</span>
    </span>
  );
  const tx = (h: string, label: string) => (
    <a href={`${explorer}/tx/${h}`} className="font-mono text-[13px] tabular-nums text-bronze">{label} {short(h)} ↗</a>
  );
  return (
    <Sequence className="timeline flex flex-col gap-4">
      <div className={card}>
        {head("Message", "signed · free tier")}
        <p className="border-l border-ink-3 pl-4 text-[17px] leading-7 text-ink">“{r.message_excerpt ? excerpt(r.message_excerpt) : "not stored"}”</p>
        <span className="font-mono text-xs text-ink-3">from {short(r.wallet)} · team test, not counted</span>
      </div>
      <div className={card}>
        {head("Decision", `${r.model ?? "model"} · strict JSON`)}
        <pre className="whitespace-pre-wrap break-words rounded border border-rule bg-bg p-4 font-mono text-[12.5px] leading-5 text-ink-2">
{`{
  "verdict": "PAY",
  "tier":    "${r.tier ?? "?"}",
  "amount":  "${amount} USDC",
  "reason":  "${clip(r.reason, 64).replace(/"/g, "'")}"
}`}
        </pre>
      </div>
      <div className={card}>
        {head("Commit", `block ${blk(r.commit_block)}`)}
        <span className="font-mono text-[13px] text-ink">decision hash {r.decisionHash ? short(r.decisionHash) : "—"}</span>
        {tx(r.commit_tx!, "commit")}
        <span className="text-[13px] leading-5 text-ink-2">Written to Arc first. pay() reverts without this commitment.</span>
      </div>
      <div className={card}>
        {head("Contract gate", "params() · read live")}
        {cap ? (
          <>
            <div className="relative h-2 border-y border-rule" aria-hidden="true">
              <div className="absolute inset-y-0 left-0 bg-bronze" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-[13px] tabular-nums text-ink">asked {amount} · cap {cap} per message · {daily} per rolling day</span>
          </>
        ) : (
          <span className="font-mono text-[13px] text-ink">inside the vault&apos;s caps</span>
        )}
        <span className="text-[13px] leading-5 text-ink-2">The model chose to pay. The contract decided how much that could cost.</span>
      </div>
      <div className={card}>
        {head("Settle", `block ${blk(r.pay_block)}`)}
        <span className="flex flex-wrap items-center gap-3">
          <span className="smallcaps border border-pay px-2 py-0.5 text-[15px] text-pay">Paid {amount} USDC</span>
          {tx(r.pay_tx!, "pay")}
        </span>
        <Link href={`/v/${r.id}`} className="text-sm font-medium">Open the full receipt →</Link>
      </div>
    </Sequence>
  );
}
