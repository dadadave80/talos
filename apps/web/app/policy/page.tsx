import type { Metadata } from "next";
import { toFunctionSelector } from "viem";
import { policy } from "@/lib/policy";
import { CopyButton } from "../copy-button";
import { SiteFooter, SiteHeader } from "../site-header";

export const revalidate = 15;
export const metadata: Metadata = { title: "Talos · Policy" };

const REPO = "https://github.com/dadadave80/talos/blob/main";
const f2 = (v: string | number) => Number(v).toFixed(2);
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
// Names for the calls a timelock round can carry, so a pending change reads as words.
const KNOWN = Object.fromEntries(
  [
    "setParams((uint256[3],uint256[3],uint256,uint256,uint256,uint48,uint64))",
    "setAllowlist(uint8,address,bool)",
    "registerSessionKey(address,uint48,uint48,(address,bytes4)[])",
    "revokeSessionKey(address)",
    "updateDelay(uint256)",
    "diamondCut((address,uint8,bytes4[])[],address,bytes)",
  ].map((sig) => [toFunctionSelector(`function ${sig}`), sig.split("(")[0]]),
);

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-rule px-6 py-8 lg:mx-20 lg:grid-cols-12 lg:gap-x-6 lg:px-0">
      <div className="flex flex-col gap-1.5 lg:col-span-4">
        <span className="smallcaps text-sm text-ink-2">{title}</span>
        {note && <span className="text-sm leading-5 text-ink-3">{note}</span>}
      </div>
      <div className="flex min-w-0 flex-col lg:col-span-8">{children}</div>
    </section>
  );
}

/// Design: Talos Evidence and Policy, P1/P2. Every value is read from the vault at the block shown.
export default async function PolicyPage() {
  const p = await policy();
  const d = p.tiers[2];
  const hours = Math.round(p.timelockDelaySeconds / 3600);
  const read = `${p.vaultUrl}?tab=read_contract`;
  const caps = [
    ["Contributor", p.tiers[0], "allowlisted", "allowlist"],
    ["Vendor", p.tiers[1], "allowlisted", "allowlist"],
    ["Discretionary", p.tiers[2], "anyone", "anyone"],
    ["Owner (approvals)", { perTx: p.owner.perTx, daily: p.owner.daily }, "queued items only", "queued"],
  ] as const;
  const statusTone = { pending: "text-queue", approved: "text-pay", rejected: "text-refuse", unknown: "text-ink-3" } as const;

  return (
    <div className="relative mx-auto w-full max-w-[1280px] overflow-x-clip">
      <SiteHeader active="policy" />
      <section className="flex flex-col gap-6 px-6 pb-10 pt-10 lg:px-20 lg:pt-16">
        <h1 className="max-w-[16ch] font-display text-4xl font-medium leading-[1.1] tracking-[-0.01em] text-balance lg:text-[64px] lg:leading-[68px]">
          Nothing on this page can change in under {hours} hours.
        </h1>
        <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2">
          Talos can send at most <span className="font-mono text-ink">{f2(d.perTx)} USDC</span> per message and{" "}
          <span className="font-mono text-ink">{f2(d.daily)} USDC</span> per day to wallets it doesn&apos;t know. Changing that takes{" "}
          <span className="text-ink">{hours} hours</span> and a human signature.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 font-mono text-xs text-ink-3">
          read at block {p.block}
          <a href="/policy" className="font-sans text-sm font-medium">Refresh</a>
        </div>
      </section>

      <section className="mx-6 grid grid-cols-1 border-t border-ink lg:mx-20 lg:grid-cols-2">
        {[
          ["Per message", "The most Talos can send to a wallet it does not know, in one verdict.", d.perTx, "perTxCap[2]"],
          ["Per rolling day", "The discretionary total across all unknown wallets in 24 hours.", d.daily, "dailyCap[2]"],
        ].map(([l, desc, v, key]) => (
          <div key={l} className="flex flex-col gap-3 border-b border-rule py-6 lg:pr-10">
            <span className="text-[15px] font-medium">{l}</span>
            <span className="text-sm leading-5 text-ink-2">{desc}</span>
            <span className="font-display text-[56px] font-medium leading-[60px] tabular-nums">
              {f2(v)}
              <span className="text-xl text-ink-2"> USDC</span>
            </span>
            <a href={read} className="font-mono text-xs">params().{key} at {short(p.vault)} · block {p.block} ↗</a>
          </div>
        ))}
      </section>

      <Section title="Timelock" note={p.pendingOps.length ? `${p.pendingOps.length === 1 ? "One change is" : `${p.pendingOps.length} changes are`} waiting out its ${hours} hours.` : `Every change waits ${hours} hours.`}>
        {p.pendingOps.length ? (
          p.pendingOps.map((o) => {
            const left = Math.max(0, o.earliest * 1000 - Date.now());
            return (
              <div key={o.id} className="flex flex-col text-sm">
                <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 border-b border-rule py-2.5"><span className="text-ink-2">Change</span><span className="font-mono text-xs">{KNOWN[o.selector] ?? o.selector} on {short(o.target)}</span></div>
                <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 border-b border-rule py-2.5">
                  <span className="text-ink-2">Earliest execution</span>
                  <span className="font-mono text-xs">
                    {new Date(o.earliest * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
                    <span className="text-queue">{left ? `Timelocked · ${Math.floor(left / 3_600_000)}h ${Math.floor((left % 3_600_000) / 60_000)}m remaining` : "executable now"}</span>
                  </span>
                </div>
                <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 border-b border-rule py-2.5"><span className="text-ink-2">Scheduled in</span><a href={o.url} className="font-mono text-xs">{short(o.tx)} ↗</a></div>
              </div>
            );
          })
        ) : (
          <span className="border-b border-rule py-2.5 text-sm">
            No changes pending.{" "}
            {p.lastChange ? <a href={p.lastChange.url}>Last change at block {p.lastChange.block} ↗</a> : "No change has been made since deploy."}
          </span>
        )}
      </Section>

      <Section title="Caps" note={<>Read from <span className="font-mono">params()</span> at <a href={read}>{short(p.vault)}</a>, block {p.block}.</>}>
        <div className="grid grid-cols-[minmax(0,1.2fr)_1fr_1fr_minmax(0,1fr)] gap-3 border-b border-rule pb-2 smallcaps text-xs text-ink-3">
          <span>Tier</span><span>Per tx</span><span>Per rolling day</span><span>Who can be paid</span>
        </div>
        {caps.map(([t, c, who, whoS]) => (
          <div key={t} className="grid grid-cols-[minmax(0,1.2fr)_1fr_1fr_minmax(0,1fr)] gap-3 border-b border-rule py-2.5 text-sm">
            <span>{t}</span>
            <span className="font-mono">{f2(c.perTx)}</span>
            <span className="font-mono">{f2("daily" in c ? c.daily : 0)}</span>
            <span className="text-ink-2"><span className="max-lg:hidden">{who}</span><span className="lg:hidden">{whoS}</span></span>
          </div>
        ))}
        <span className="pt-2 text-[13px] text-ink-3">
          Velocity breaker: at most {p.velocity.max} payouts per {Math.round(p.velocity.windowSeconds / 60)} minutes. Commits expire after {p.commitTtlBlocks} blocks.
        </span>
      </Section>

      <Section title="Exits">
        <span className="max-w-[60ch] text-[15px] leading-[22px]">
          Money leaves this contract through exactly two functions, <span className="font-mono">pay</span> and <span className="font-mono">approveQueued</span>. A test checks that no other way out is installed on the diamond.
        </span>
        <a href={`${REPO}/contracts/test/TalosVault.t.sol#L215`} className="pt-2 font-mono text-xs">contracts/test/TalosVault.t.sol · test_noOtherAssetOutPath ↗</a>
      </Section>

      <Section title="Keys" note="The agent key cannot raise a cap, add a payee or change code.">
        {p.agentKeys.map((k) => (
          <div key={k.address} className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-rule py-2.5 text-sm lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
            <span>{k.role === "agent" ? "Agent key" : "Hot key"}</span>
            <a href={`${p.explorer}/address/${k.address}`} className="truncate font-mono text-xs">{k.address} ↗</a>
            <span className="text-ink-2 max-lg:col-span-2">{k.grants} · expires {new Date(k.validUntil * 1000).toISOString().slice(0, 10)}</span>
          </div>
        ))}
      </Section>

      <Section title="Safety switches" note="Shown as state. Nobody on this page can change them.">
        {[
          ["Emergency stop", p.stopped ? "On — payouts paused" : "Off", p.stopped ? "text-queue" : ""],
          ["Velocity breaker", `${p.velocity.max} payouts per ${Math.round(p.velocity.windowSeconds / 60)} min · ${p.velocityTripped ? "tripped" : "not tripped"}`, p.velocityTripped ? "text-queue" : ""],
          ["Stops and resumes logged", `${p.stops} stop${p.stops === 1 ? "" : "s"} · ${p.resumes} resume${p.resumes === 1 ? "" : "s"}`, ""],
        ].map(([l, v, c]) => (
          <div key={l} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-rule py-2.5 text-sm">
            <span>{l}</span>
            <span className={`font-mono text-xs ${c}`}>{v}</span>
          </div>
        ))}
      </Section>

      <Section title="Queue" note="Payments above a cap or to an unlisted payee wait here for the owner.">
        {p.queue.length ? (
          <>
            <div className="grid grid-cols-[40px_minmax(0,1fr)_70px_100px_minmax(0,1fr)] gap-3 border-b border-rule pb-2 smallcaps text-xs text-ink-3 max-lg:hidden">
              <span>ID</span><span>Payee</span><span>USDC</span><span>Status</span><span>Tx</span>
            </div>
            {p.queue.map((q) => (
              <div key={q.id} className="grid grid-cols-[40px_minmax(0,1fr)_70px] gap-3 border-b border-rule py-2.5 text-sm lg:grid-cols-[40px_minmax(0,1fr)_70px_100px_minmax(0,1fr)]">
                <span className="font-mono text-xs">#{q.id}</span>
                <span className="font-mono text-xs">{short(q.payee)} · {q.tier.toLowerCase()}</span>
                <span className="font-mono text-xs">{f2(q.usdc)}</span>
                <span className={`text-xs ${statusTone[q.status]}`}>{q.status === "pending" ? "Awaiting owner" : q.status[0].toUpperCase() + q.status.slice(1)}</span>
                {q.tx ? <a href={`${p.explorer}/tx/${q.tx}`} className="font-mono text-xs">{short(q.tx)} ↗</a> : <span />}
              </div>
            ))}
          </>
        ) : (
          <span className="border-b border-rule py-2.5 text-sm text-ink-2">Nothing has been queued yet.</span>
        )}
      </Section>

      <Section title="Brain" note={<>Verify: <span className="font-mono">keccak256(PROMPT)</span> should equal the hash. <a href={`${REPO}/apps/web/lib/brain/prompt.ts`}>prompt.ts ↗</a></>}>
        {[
          ["Model · fallback", `${p.brain.model} · ${p.brain.fallback}`],
          ["Prompt version", p.prompt.version],
        ].map(([k, v]) => (
          <div key={k} className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 border-b border-rule py-2.5 text-sm">
            <span className="text-ink-2">{k}</span>
            <span className="font-mono text-xs">{v}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 border-b border-rule py-2.5">
          <span className="min-w-0 flex-1 break-all font-mono text-xs">keccak256 {p.prompt.hash}</span>
          <CopyButton text={p.prompt.hash} />
        </div>
      </Section>
      <SiteFooter />
    </div>
  );
}
