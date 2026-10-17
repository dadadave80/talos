"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";

// Evidence attempts table: filters, wallet search (prefilled from ?wallet=), 20 per page, one row expanded at a time.
// Message text is not shown here (the receipt page is the author's to share). The right column is the live verdict feed.

export type Row = {
  id: string; ts: string; wallet: string; label: string; account: string; toll: string; tollStatus: string | null;
  verdict: "PAY" | "QUEUE" | "REFUSE"; amount: number | null; reason: string; reasonHash: string | null; note: string | null;
  decisionHash: string | null; model: string | null; promptVersion: string | null; commitTx: string | null; payTx: string | null;
  queueId: number | null; commitBlock: number | null; payBlock: number | null;
};

const PER_PAGE = 20;
const tone = { PAY: "text-pay", QUEUE: "text-queue", REFUSE: "text-refuse" } as const;
const word = { PAY: "Pay", QUEUE: "Queue", REFUSE: "Refuse" } as const;
const FILTERS = [["All", null], ["Refused", "REFUSE"], ["Paid", "PAY"], ["Queued", "QUEUE"]] as const;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const blk = (n: number) => Number(n).toLocaleString("en-US");
const utc = (ts: string) => new Date(ts).toISOString().slice(0, 16).replace("T", " ");
const ago = (ts: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};
const who = (r: Row) =>
  r.label === "team" ? "team test · not counted" : r.label !== "external" ? `${r.label} · not counted` : r.account === "embedded" ? "passkey" : "wallet";

// Its own Suspense boundary, so reading the query string keeps the rest of the table in the static render.
function WalletParam({ onWallet }: { onWallet: (w: string) => void }) {
  const w = useSearchParams().get("wallet");
  useEffect(() => {
    if (w) onWallet(w.trim().toLowerCase());
  }, [w, onWallet]);
  return null;
}

function Segmented({ label, options, value, onChange }: { label: string; options: [string, string | null][]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <span className="text-[13px] text-ink-2">{label}</span>
      <div className="flex">
        {options.map(([l, v]) => (
          <button
            key={l}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`-ml-px h-11 cursor-pointer border px-3 text-[13px] first:ml-0 ${value === v ? "relative border-bronze text-ink" : "border-rule text-ink-2 hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AttemptsTable({ rows, explorer }: { rows: Row[]; explorer: string }) {
  const [verdict, setVerdict] = useState<string | null>(null);
  const [toll, setToll] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [feed, setFeed] = useState<Snapshot["feed"] | null>(null);
  const [live, setLive] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const tx = (h: string) => `${explorer}/tx/${h}`;
  const fromUrl = useCallback((w: string) => (setQ(w), setPage(0), setOpen(null)), []);

  useEffect(() => {
    if (!live) return;
    const load = () =>
      fetch("/api/snapshot")
        .then((r) => (r.ok ? r.json() : null))
        .then((s: Snapshot | null) => s && (setFeed(s.feed), setNow(Date.now())))
        .catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [live]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (!verdict || r.verdict === verdict) && (!toll || r.toll === toll) && (!account || r.account === account) && (!needle || r.wallet.includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const slice = shown.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const reset = (f: () => void) => (f(), setPage(0), setOpen(null));
  // Also drops ?wallet= from the URL, so a reload or a shared link does not bring the filter back.
  const clearWallet = () => {
    reset(() => setQ(""));
    if (new URLSearchParams(location.search).has("wallet")) history.replaceState(null, "", location.pathname);
    document.getElementById("wallet-search")?.focus();
  };

  async function copy(r: Row) {
    const json = { id: r.id, verdict: r.verdict, amount_usdc: r.amount, reason: r.reason, reason_hash: r.reasonHash, decision_hash: r.decisionHash, model: r.model, prompt_version: r.promptVersion, commit_tx: r.commitTx, pay_tx: r.payTx };
    await navigator.clipboard.writeText(JSON.stringify(json, null, 2)).catch(() => {});
    setCopied(r.id);
  }

  const chip = (on: boolean) => `min-h-11 cursor-pointer px-3.5 text-sm first:-ml-3.5 font-medium underline decoration-2 underline-offset-8 ${on ? "text-ink decoration-bronze" : "text-ink-2 decoration-transparent"}`;

  return (
    <section id="attempts" aria-labelledby="attempts-h" className="grid grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-12 lg:gap-x-6 lg:px-20">
      <Suspense fallback={null}>
        <WalletParam onWallet={fromUrl} />
      </Suspense>
      <div className="flex min-w-0 flex-col lg:col-span-9">
        <div className="flex items-baseline justify-between border-b border-ink pb-2">
          <h2 id="attempts-h" className="font-display text-2xl font-medium">Attempts</h2>
          <span className="font-mono text-xs text-ink-3">{shown.length} rows</span>
        </div>
        <div className="flex flex-wrap items-center gap-y-1 py-2">
          {FILTERS.map(([l, v]) => (
            <button key={l} type="button" aria-pressed={verdict === v} onClick={() => reset(() => setVerdict(v))} className={chip(verdict === v)}>{l}</button>
          ))}
          <label className="ml-auto flex items-center max-lg:w-full">
            <span className="sr-only">Search wallet</span>
            <input
              id="wallet-search"
              name="wallet"
              value={q}
              onChange={(e) => reset(() => setQ(e.target.value))}
              placeholder="Search wallet 0x…"
              className="h-11 w-full border-b border-rule bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-3 lg:w-56"
            />
          </label>
          {needle && (
            <button type="button" onClick={clearWallet} className="min-h-11 cursor-pointer text-sm font-medium text-ink-2 underline decoration-rule underline-offset-4 lg:ml-4">
              Clear wallet filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 pb-4">
          <Segmented label="Toll" options={[["Any", null], ["Paid", "facilitator"], ["Free", "free"]]} value={toll} onChange={(v) => reset(() => setToll(v))} />
          <Segmented label="Account" options={[["Any", null], ["Passkey", "embedded"], ["Wallet", "eoa"]]} value={account} onChange={(v) => reset(() => setAccount(v))} />
        </div>

        <div className="grid grid-cols-[130px_150px_70px_90px_70px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-y border-rule py-2 smallcaps text-xs text-ink-3 max-lg:hidden">
          <span>Time UTC</span><span>Wallet</span><span>Toll</span><span>Verdict</span><span className="text-right">Amount</span><span>Commit</span><span>Pay / Queue</span>
        </div>
        {slice.map((r) => {
          const isOpen = open === r.id;
          const amt = r.amount != null && r.verdict !== "REFUSE" ? Number(r.amount).toFixed(2) : "0.00";
          const tollText = r.toll === "free" ? "free" : r.tollStatus === "completed" ? "0.05 ✓" : r.tollStatus === "settle_failed" ? "uncharged" : "0.05 …";
          const settle = r.payTx ? (
            <a href={tx(r.payTx)} className="font-mono text-xs">{short(r.payTx)} ↗</a>
          ) : r.verdict === "QUEUE" ? (
            <span className="font-mono text-xs text-queue">{r.queueId != null ? `Queue #${r.queueId}` : "queued"}</span>
          ) : (
            <span className="font-mono text-xs text-ink-3">{r.note ? r.note.split(":")[0] : "no money moved"}</span>
          );
          return (
            <div key={r.id} className={`border-b border-rule ${isOpen ? "bg-raised" : ""}`}>
              <button
                onClick={() => setOpen(isOpen ? null : r.id)}
                aria-expanded={isOpen}
                className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2.5 text-left lg:grid-cols-[130px_150px_70px_90px_70px_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <span className="font-mono text-xs text-ink-3 max-lg:hidden">{utc(r.ts)}</span>
                <span className="font-mono text-xs max-lg:order-3">
                  {short(r.wallet)} <span className="text-ink-3">{who(r)}</span>
                </span>
                <span className={`font-mono text-xs max-lg:order-4 max-lg:text-right ${r.tollStatus === "settle_failed" ? "text-refuse" : "text-ink-2"}`}>{tollText}</span>
                <span className={`smallcaps text-sm max-lg:order-1 ${tone[r.verdict]}`}>{word[r.verdict]}</span>
                <span className="text-right font-mono text-sm max-lg:order-2">{amt}</span>
                <span className="font-mono text-xs max-lg:hidden">{r.commitTx ? short(r.commitTx) : "—"}</span>
                <span className="max-lg:hidden">{settle}</span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3 pb-4 lg:pl-[130px]">
                  <div className="flex justify-between smallcaps text-sm text-ink-2">
                    <span>Attempt detail</span>
                    <span className="font-mono text-xs text-ink-3">{utc(r.ts)} UTC</span>
                  </div>
                  <p className="max-w-[70ch] text-[15px] leading-[22px]">{r.reason}</p>
                  <div className="flex flex-col text-[13px]">
                    {[
                      ["Committed on-chain", r.commitTx ? `${short(r.commitTx)}${r.commitBlock ? ` · block ${blk(r.commitBlock)}` : ""}` : "not committed", r.commitTx],
                      ["Verdict", `${word[r.verdict]}${r.verdict !== "REFUSE" ? ` ${amt} USDC` : ""}`, null],
                      ["Settled", r.payTx ? `${short(r.payTx)}${r.payBlock ? ` · block ${blk(r.payBlock)}` : ""} → ${short(r.wallet)}` : r.verdict === "QUEUE" ? "awaiting owner" : "no money moved", r.payTx],
                    ].map(([k, v, h]) => {
                      const cls = "grid grid-cols-[150px_minmax(0,1fr)_16px] items-center gap-3 border-t border-rule py-2";
                      const body = (<><span className="text-ink-2">{k}</span><span className="font-mono text-xs">{v}</span><span className="text-bronze">{h ? "↗" : ""}</span></>);
                      return h ? <a key={k} href={tx(h)} className={`${cls} text-ink hover:text-ink`}>{body}</a> : <div key={k} className={cls}>{body}</div>;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-ink-3">
                    {r.decisionHash && <span>decision {short(r.decisionHash)}</span>}
                    <span>model {r.model ?? "—"}</span>
                    <span>prompt {r.promptVersion ?? "—"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
                    <button type="button" onClick={() => reset(() => setQ(r.wallet))} className="min-h-11 cursor-pointer text-ink-2 underline decoration-rule underline-offset-4">Filter by this wallet</button>
                    <button type="button" onClick={() => copy(r)} className="min-h-11 cursor-pointer text-ink-2 underline decoration-rule underline-offset-4">{copied === r.id ? "Copied" : "Copy verdict JSON"}</button>
                    <Link href={`/v/${r.id}`} className="flex min-h-11 items-center text-sm">Receipt →</Link>
                    <span className="text-[13px] font-normal text-ink-3">Message text is shown on the receipt its author shares.</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!slice.length && <span className="py-6 text-sm text-ink-3">No attempts match.</span>}
        <div className="flex items-center justify-between py-1 font-mono text-xs text-ink-3">
          <span>p. {page + 1} of {pages}</span>
          <span className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => (setPage(page - 1), setOpen(null))} className="h-11 cursor-pointer px-2 text-ink-2 disabled:cursor-default disabled:text-ink-3">Previous</button>
            <button type="button" disabled={page >= pages - 1} onClick={() => (setPage(page + 1), setOpen(null))} className="h-11 cursor-pointer px-2 text-ink-2 disabled:cursor-default disabled:text-ink-3">Next</button>
          </span>
        </div>
      </div>

      <aside className="flex flex-col lg:col-span-3">
        <div className="flex items-center justify-between border-b border-ink">
          <h2 className="smallcaps text-sm text-ink-2">Last 10 verdicts</h2>
          <button type="button" onClick={() => setLive(!live)} className="h-11 cursor-pointer pl-3 text-sm font-medium text-ink-2">{live ? "Pause" : "Resume"}</button>
        </div>
        {(feed ?? []).map((f) => (
          <Link key={f.id} href={`/v/${f.id}`} className="flex min-h-11 items-center gap-3 border-b border-rule text-ink hover:text-ink">
            <span className={`smallcaps w-14 text-sm ${tone[f.verdict]}`}>{word[f.verdict]}</span>
            <span className="font-mono text-xs text-ink-2">{short(f.wallet)}{f.team ? " · team test" : ""}</span>
            <span className="ml-auto font-mono text-xs text-ink-3">{ago(f.ts, now)}</span>
          </Link>
        ))}
        {feed && !feed.length && <span className="py-3 text-sm text-ink-3">No verdicts yet.</span>}
        <span className="pt-2 font-mono text-[11px] text-ink-3">{live ? "Live · refreshed every 15 s" : "Paused"}</span>
      </aside>
    </section>
  );
}
