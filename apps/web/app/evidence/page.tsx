import type { Metadata } from "next";
import { explorer, txUrl } from "@/lib/chain";
import { evidence } from "@/lib/ledger/evidence";
import { AttemptsTable, type Row } from "./table";

export const revalidate = 15;
export const metadata: Metadata = { title: "Evidence" };

const f2 = (v: string | number) => Number(v).toFixed(2);
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const utc = (ts: string) => String(ts).slice(0, 16).replace("T", " ");
const CYCLES_SHOWN = 24;

/// Design: Talos Evidence and Policy, E1/E2. The statement (the vault's books, every tier, team included) and the
/// band (external wallets only) are kept apart on purpose.
export default async function EvidencePage() {
  const e = await evidence();
  const c = e.counters;
  const ext = (t: string) => c.payments.find((p) => p.tier === t)?.external.usdc ?? "0";
  const logs = `${explorer}/address/${e.vault}?tab=logs`;
  const transfers = `${explorer}/address/${e.vault}?tab=token_transfers`;
  // No deposit events exist for the USDC precompile, so funding is derived from the other three lines; its row opens
  // the vault's token transfers, where each funding transfer is listed.
  const funded = Number(c.vaultUsdc) + Number(e.paidOutAll) - Number(c.tollsReceived.usdc);
  const recon: [string, string, string, string][] = [
    ["Funded by owner", "", f2(funded), transfers],
    ["Tolls in", "+", f2(c.tollsReceived.usdc), logs],
    ["Paid out", "−", f2(e.paidOutAll), logs],
  ];
  const t = c.team;
  const band: [string, string, string, string][] = [
    ["Attempts", String(c.attempts), `paid ${c.attemptsByToll.paid} · free ${c.attemptsByToll.free}`, "commit logs"],
    ["Distinct wallets", String(c.externalWallets.total), `passkey ${c.externalWallets.embedded} · wallet ${c.externalWallets.eoa}`, "commit logs"],
    ["Refusals", String(c.refusals), "", "verdict logs"],
    ["Escalations", String(c.escalations.total), `approved ${c.escalations.approved} · rejected ${c.escalations.rejected} · pending ${c.escalations.total - c.escalations.approved - c.escalations.rejected}`, "queued()"],
    ["Paid to attackers", f2(ext("DISCRETIONARY")), "USDC", "pay txs"],
    ["Contributors paid", f2(ext("CONTRIBUTOR")), "USDC", "pay txs"],
    ["Tolls in", f2(c.tollsReceived.usdc), "USDC", "settlements"],
    ["Vault balance", f2(c.vaultUsdc), "USDC · the whole vault", "balanceOf"],
  ];
  const rows: Row[] = e.attempts
    .filter((a) => a.verdict)
    .map((a) => ({
      id: a.id, ts: a.ts, wallet: a.wallet, label: a.wallet_label, account: a.account_kind, toll: a.toll_kind, tollStatus: a.toll_status,
      verdict: a.verdict, amount: a.amount_usdc, reason: a.reason, reasonHash: a.reason_hash, note: a.note, decisionHash: a.decision_hash,
      model: a.model, promptVersion: a.prompt_version, commitTx: a.commit_tx, payTx: a.pay_tx, queueId: a.queue_id,
      commitBlock: a.commit_tx ? (e.blocks[a.commit_tx] ?? null) : null, payBlock: a.pay_tx ? (e.blocks[a.pay_tx] ?? null) : null,
    }));
  // Cycle rows are hourly heartbeats: keep the newest day of them, and every row where the operator acted.
  let cycles = 0;
  const ops = e.ops.filter((o) => o.kind !== "cycle" || cycles++ < CYCLES_SHOWN).map((o) => {
    const d = (o.detail ?? {}) as Record<string, unknown>;
    const tx = o.tx as string | null;
    switch (o.kind) {
      case "contributor":
        return { ts: o.ts, k: "Contributor", what: `${String(d.pr ?? o.ref)} by ${d.author ?? "?"} · ${d.state ?? ""}`, href: tx ? txUrl(tx) : (d.pr as string) ?? o.ref, link: tx ? `${short(tx)} ↗` : "PR ↗", amt: d.bounty ? f2(String(d.bounty)) : "—" };
      case "vendor":
        // o.ref is a Gateway settlement id, not an Arc tx: plain text, never an explorer link.
        return { ts: o.ts, k: "Bill", what: `${d.seller ?? "Seller"} ${d.item ?? "resource"} over x402${d.result ? ` · ${String(d.result)}` : ""}`, href: null, link: o.ref ? `settlement ${String(o.ref).slice(0, 12)}…` : "—", amt: d.usdc != null ? Number(d.usdc).toFixed(4) : "—" };
      case "vendor-float":
        // A reverted float is still logged, but nothing moved.
        return { ts: o.ts, k: "Float", what: `Daily ops float to the agent (VENDOR tier)${d.failed ? " · reverted, nothing moved" : d.pending ? " · sent, receipt not read yet" : ""}`, href: tx ? txUrl(tx) : null, link: tx ? `${short(tx)} ↗` : "—", amt: d.failed ? "0.00" : f2(Number(d.usdc ?? 1)) };
      case "vendor-deposit":
        return { ts: o.ts, k: "Gateway", what: "Ops float deposited into Circle Gateway", href: tx ? txUrl(tx) : null, link: tx ? `${short(tx)} ↗` : "—", amt: f2(Number(d.usdc ?? 1)) };
      case "cycle":
        return { ts: o.ts, k: "Cycle", what: String(d.summary ?? "ran"), href: null, link: "—", amt: "—" };
      case "gas-low":
        return { ts: o.ts, k: "Alert", what: "Signer gas below floor; cycle stopped until topped up", href: null, link: "—", amt: "—" };
      default:
        return { ts: o.ts, k: String(o.kind), what: String(o.ref ?? ""), href: tx ? txUrl(tx) : null, link: tx ? `${short(tx)} ↗` : "—", amt: "—" };
    }
  });
  const updated = new Date().toISOString().slice(11, 16);

  return (
    <main id="main">
      <div className="flex justify-between gap-4 px-6 pb-2.5 pt-5 smallcaps text-sm text-ink-3 lg:px-20">
        <span>Talos · Evidence · as of block {Number(e.syncedToBlock).toLocaleString("en-US")}</span>
        <span>Updated {updated} UTC</span>
      </div>

      <section className="grid grid-cols-1 gap-8 border-t border-rule px-6 pb-10 pt-8 lg:mx-20 lg:grid-cols-12 lg:gap-x-6 lg:px-0">
        <div className="flex flex-col gap-3 lg:col-span-6">
          <h1 className="font-display text-[44px] font-medium leading-[48px] lg:text-[64px] lg:leading-[68px]">Statement</h1>
          <span className="max-w-[52ch] text-[15px] leading-[22px] text-ink-2">
            Every number links to a transaction. External wallets only in the counters below; team and test wallets are labelled and excluded.
          </span>
          <span className="font-mono text-xs text-ink-3">Period since the vault was deployed · the vault&apos;s own books include every tier</span>
        </div>
        <div className="flex flex-col lg:col-span-5 lg:col-start-8 lg:self-end">
          {recon.map(([l, op, v, href]) => (
            <a key={l} href={href} className="grid grid-cols-[minmax(0,1fr)_16px_auto] items-baseline gap-3 border-t border-rule py-2.5 text-ink hover:text-ink">
              <span className="text-[15px] text-ink-2">{l}</span>
              <span className="font-mono text-sm text-ink-3">{op}</span>
              <span className="font-display text-2xl font-medium tabular-nums">{v}</span>
            </a>
          ))}
          <a href={logs} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 pb-2.5 pl-4 text-ink hover:text-ink">
            <span className="text-[13px] text-ink-3">of which Talos&apos;s own bills (ops float)</span>
            <span className="font-mono text-sm tabular-nums text-ink-2">{f2(c.opsFloat.usdc)}</span>
          </a>
          <a href={`${explorer}/address/${e.vault}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-y-2 border-ink py-3 text-ink hover:text-ink">
            <span className="text-[15px] font-medium">Vault balance, carried forward</span>
            <span className="font-display text-[32px] font-medium tabular-nums">{f2(c.vaultUsdc)}</span>
          </a>
          <span className="pt-2 font-mono text-xs text-ink-3">USDC · funded = balance + paid out − tolls · each line opens the vault on the explorer</span>
        </div>
      </section>

      <section aria-labelledby="band-h" className="mx-6 flex flex-col lg:mx-20">
        <h2 id="band-h" className="pb-2 smallcaps text-sm text-ink-2">External wallets only</h2>
        <div className="grid grid-cols-2 border-t border-rule lg:grid-cols-4">
          {band.map(([l, v, split, src]) => (
            <div key={l} className="flex flex-col gap-1 border-b border-rule py-4 pr-4">
              <span className="text-[13px] text-ink-2">{l}</span>
              <span className="font-display text-[28px] font-medium tabular-nums lg:text-[36px]">{v}</span>
              <span className="min-h-4 font-mono text-[11px] text-ink-3">{split}</span>
              <a href={logs} className="font-mono text-[11px] max-lg:hidden">Source: {src} ↗</a>
            </div>
          ))}
        </div>
        {t && (
          <p className="pt-3 text-[13px] leading-5 text-ink-3">
            Team tests, not counted: {count(t.attempts, "attempt")} · {t.refused} refused
            {t.queued ? ` · ${t.queued} queued` : ""} · {t.paid} paid{t.paid ? ` ${f2(t.paidUsdc)} USDC` : ""}
            {t.bounties.count ? (
              <>
                {" · "}
                <a href={t.bounties.txs.length === 1 ? txUrl(t.bounties.txs[0]) : "#operator"}>{count(t.bounties.count, "bounty payout")}</a> {f2(t.bounties.usdc)} USDC
              </>
            ) : null}
            {t.offArena?.count ? (
              <>
                {" · "}
                <a href={t.offArena.txs?.length === 1 ? txUrl(t.offArena.txs[0]) : "https://github.com/dadadave80/talos/blob/main/docs/ADDRESSES.md"}>{count(t.offArena.count, "contract proof")}</a> paid {f2(t.offArena.usdc)} USDC
              </>
            ) : null}
            {" · "}
            <a href="#attempts">receipts ↓</a>
          </p>
        )}
      </section>

      <AttemptsTable rows={rows} explorer={explorer} />

      <section id="operator" className="mx-6 flex flex-col pb-12 lg:mx-20">
        <div className="flex items-baseline justify-between border-b border-ink pb-2">
          <h2 className="font-display text-2xl font-medium">What Talos did for the project</h2>
          <span className="smallcaps text-sm text-ink-3 max-lg:hidden">Talos&apos;s own spending</span>
        </div>
        <span className="py-2 font-mono text-xs text-ink-3">
          Hourly cycle, due at :00 UTC · {e.lastCycle ? `last ran ${utc(e.lastCycle.ts)} UTC` : "no cycle logged yet"}
        </span>
        <div className="grid grid-cols-[150px_100px_minmax(0,1fr)_160px_80px] gap-4 border-b border-rule py-2 smallcaps text-xs text-ink-3 max-lg:hidden">
          <span>Time UTC</span><span>Kind</span><span>Action</span><span>Record</span><span className="text-right">USDC</span>
        </div>
        {ops.map((o, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-rule py-2.5 text-sm lg:grid-cols-[150px_100px_minmax(0,1fr)_160px_80px]">
            <span className="font-mono text-xs text-ink-3 max-lg:order-3">{utc(o.ts)}</span>
            <span className="text-ink-2 max-lg:order-1">{o.k}</span>
            <span className="min-w-0 truncate max-lg:order-4 max-lg:col-span-2">{o.what}</span>
            {o.href ? <a href={o.href} className="font-mono text-xs max-lg:hidden">{o.link}</a> : <span className="font-mono text-xs text-ink-3 max-lg:hidden">{o.link}</span>}
            <span className="text-right font-mono text-sm max-lg:order-2">{o.amt}</span>
          </div>
        ))}
        {!ops.length && <span className="py-4 text-sm text-ink-3">No operator actions yet. Next cycle due at :00 UTC; every bounty payment and bill lands here.</span>}
      </section>
    </main>
  );
}
