"use client";

import { useState } from "react";
import type { Receipt } from "@/lib/share";

// Design: VerdictReceipt. One decided attempt as a ledger entry: stamp, rationale, what moved, the on-chain trail.
// `pending` is the in-flight state (the attempt API is not streaming, so this stands in for the design's streaming
// state). Block numbers are not stored, so trail rows show the tx and link to the explorer.

type Props = { r?: Receipt; pending?: boolean; arriving?: boolean; explorer: string; perTx: string; cap: string };
type Row = { k: string; v: string; s: "pending" | "landed" | "none" | "fail"; href?: string };

const tone = { PAY: "text-pay border-pay", QUEUE: "text-queue border-queue", REFUSE: "text-refuse border-refuse" } as const;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export function VerdictReceipt({ r, pending, arriving, explorer, perTx, cap }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const tx = (h: string) => `${explorer}/tx/${h}`;
  const amount = r?.amount_usdc != null ? Number(r.amount_usdc).toFixed(2) : null;

  if (pending || !r) {
    return (
      <div className="flex flex-col border-t border-ink" role="status" aria-live="polite">
        <p className="pt-2.5 smallcaps text-sm text-ink-2">Deciding…</p>
        <div className="py-4 text-ink-2">
          Reading the message, then committing a verdict to Arc before anything moves.<span className="caret" />
        </div>
        <Trail rows={[{ k: "Commit", v: "Committing to Arc…", s: "pending" }, { k: "Verdict", v: "awaiting commit", s: "pending" }, { k: "Settle", v: "—", s: "none" }]} />
      </div>
    );
  }

  const stamp = r.verdict === "PAY" ? `Pay ${amount ?? ""} USDC` : r.verdict === "QUEUE" ? `Queue ${amount ?? ""} USDC` : "Refuse";
  const commitFailed = r.note?.startsWith("commit failed");
  const payFailed = r.note?.startsWith("pay reverted");
  const rows: Row[] = [
    r.commit_tx ? { k: "Commit", v: short(r.commit_tx), s: "landed", href: tx(r.commit_tx) } : { k: "Commit", v: commitFailed ? "commit failed" : "not committed", s: "fail" },
    { k: "Verdict", v: r.verdict === "REFUSE" ? "Refuse" : `${r.verdict === "PAY" ? "Pay" : "Queue"} ${amount ?? ""}`, s: r.commit_tx ? "landed" : "none" },
    r.verdict === "PAY"
      ? r.pay_tx && !payFailed
        ? { k: "Settle", v: `paid ${amount} USDC → ${short(r.wallet)} · ${short(r.pay_tx)}`, s: "landed", href: tx(r.pay_tx) }
        : { k: "Settle", v: "pay reverted, nothing moved", s: "fail" }
      : r.verdict === "QUEUE"
        ? { k: "Queue", v: "awaiting owner", s: "none" }
        : { k: "Settle", v: "no money moved", s: "none" },
  ];
  const caption = r.reason.includes("model_unavailable")
    ? { t: "Model unavailable; refusal recorded on-chain.", muted: true }
    : commitFailed
      ? { t: "The commit did not land, so no verdict is on-chain and nothing moved.", muted: false }
      : payFailed
        ? { t: "The payment reverted on-chain; nothing moved.", muted: false }
        : null;
  const contractRead = r.verdict !== "REFUSE" || r.reason.includes("[contract:");
  const moved = r.verdict === "QUEUE" ? `${amount ?? "0.00"} USDC` : r.verdict === "PAY" && !payFailed ? `${amount} USDC` : "0.00 USDC";

  async function share() {
    const url = `${location.origin}/v/${r!.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      location.href = url;
    }
  }

  return (
    <div className="flex flex-col border-t border-ink">
      <div className="flex items-baseline gap-3 pt-2.5">
        <span className="smallcaps text-sm text-ink-2">
          Attempt {r.index}
          {r.wallet_label !== "external" && " · team test, not counted"}
        </span>
        <span className="ml-auto font-mono text-xs text-ink-3">{new Date(r.ts).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
      </div>
      <div className="flex pb-3 pt-4">
        <span className={`smallcaps inline-flex items-center border px-2 py-0.5 text-[17px] ${tone[r.verdict]} ${arriving ? "stamp-arrive" : ""}`}>{stamp}</span>
      </div>
      <p className="max-w-[60ch] text-base leading-6 text-pretty">{r.reason}</p>
      {caption && <p className={`pt-2 text-[13px] leading-5 ${caption.muted ? "text-ink-2" : "text-refuse"}`}>{caption.t}</p>}
      <div className="flex items-baseline gap-2 pb-1 pt-4 text-sm text-ink-2">
        <span>{r.verdict === "QUEUE" ? "Queued for owner" : "Moved to sender"}</span>
        <span className="flex-1 -translate-y-1 border-b border-dotted border-ink-3" />
        <span className="font-mono text-sm font-medium text-ink">{moved}</span>
      </div>
      <button onClick={() => setOpen(!open)} className="flex min-h-10 cursor-pointer items-center self-start text-sm font-medium text-ink-2 underline decoration-rule underline-offset-4">
        {open ? "Hide what Talos checked" : "What Talos checked"}
      </button>
      {open && (
        <div className="flex flex-col pb-2 text-[13px]">
          <Check k="Model" v={r.model ?? "—"} />
          {contractRead && <Check k="Cap read" v={`params() → ${perTx} / ${cap} USDC per rolling day`} />}
          <Check k="Payee" v={`the signing wallet only · ${short(r.wallet)}`} />
          {r.commit_tx && <Check k="Decision hash committed" v={short(r.commit_tx)} href={tx(r.commit_tx)} />}
        </div>
      )}
      <Trail rows={rows} />
      <div className="flex min-h-10 items-center gap-4">
        <button onClick={share} className="cursor-pointer text-sm font-medium text-bronze hover:text-focus">
          {copied ? "Link copied" : "Share this receipt"}
        </button>
        <a href={`/v/${r.id}`} className="text-sm text-ink-3">/v/{r.id}</a>
      </div>
    </div>
  );
}

function Check({ k, v, href }: { k: string; v: string; href?: string }) {
  const body = (
    <>
      <span className="text-ink">{k}</span>
      <span className="font-mono text-xs text-ink-2">{v}</span>
      <span className="text-bronze">{href ? "↗" : ""}</span>
    </>
  );
  const cls = "grid min-h-10 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_16px] items-center gap-3 border-t border-rule";
  return href ? <a href={href} className={cls}>{body}</a> : <div className={cls}>{body}</div>;
}

function Trail({ rows }: { rows: Row[] }) {
  const color = { pending: "text-ink-2 underline decoration-dotted decoration-ink-3 underline-offset-4", landed: "text-ink", none: "text-ink-3", fail: "text-refuse" };
  return (
    <div className="flex flex-col border-t border-rule">
      {rows.map((row) => {
        const body = (
          <>
            <span className="smallcaps text-sm text-ink-3">{row.k}</span>
            <span className={`font-mono text-[13px] ${color[row.s]}`}>{row.v}</span>
            <span className={`text-bronze ${row.href ? "" : "opacity-0"}`}>↗</span>
          </>
        );
        const cls = "grid min-h-10 grid-cols-[64px_minmax(0,1fr)_16px] items-center gap-3 border-b border-rule";
        return row.href ? <a key={row.k} href={row.href} className={cls}>{body}</a> : <div key={row.k} className={cls}>{body}</div>;
      })}
    </div>
  );
}
