"use client";

import { useEffect, useState } from "react";
import type { Receipt } from "@/lib/share";
import { useSession } from "./session";

// Share a receipt: the native share sheet on touch devices, a copied link elsewhere, and an X post. The text never
// quotes the message (it is its author's to share), speaks in the first person only to the author, and team rows
// get no boast.

const SITE = "https://talos-treasury.vercel.app";

function shareText(r: Receipt, mine: boolean) {
  const n = `attempt ${r.index}`;
  const amount = r.amount_usdc != null ? Number(r.amount_usdc).toFixed(2) : null;
  const committed = r.commit_tx ? " · committed on Arc before any money moved" : "";
  if (r.wallet_label !== "external") return `A Talos verdict · ${n} · team test, not counted${committed}.`;
  if (r.verdict === "PAY" && r.pay_tx && !r.note && amount)
    return mine ? `Talos paid me ${amount} USDC. Can you do better?` : `Someone talked Talos into paying ${amount} USDC · ${n}. Can you do better?`;
  if (r.verdict === "QUEUE")
    return `Talos queued ${mine ? "my claim" : n}${amount ? ` for ${amount} USDC` : ""} for its owner · nothing moves until a human signs.`;
  if (r.verdict === "REFUSE") return `Talos refused ${mine ? `me · ${n}` : n}${committed}. Can you do better?`;
  return `A Talos verdict · ${n}${committed}.`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.setAttribute("readonly", "");
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

export function ShareActions({ r, panel = false }: { r: Receipt; panel?: boolean }) {
  const { addr, announce } = useSession();
  const [origin, setOrigin] = useState(SITE);
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => setOrigin(location.origin), []);
  useEffect(() => {
    if (!label) return;
    const t = setTimeout(() => setLabel(null), 2000);
    return () => clearTimeout(t);
  }, [label]);

  const mine = !!addr && addr.toLowerCase() === r.wallet.toLowerCase();
  const text = shareText(r, mine);
  const url = `${origin}/v/${r.id}`;
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  async function share() {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: `Talos receipt · attempt ${r.index}`, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    const msg = (await copy(url)) ? "Link copied" : "Could not copy the link";
    setLabel(msg);
    announce(msg);
  }

  const cls = panel
    ? "flex h-11 flex-1 cursor-pointer items-center justify-center border border-rule px-4 text-sm font-semibold text-ink hover:border-bronze hover:text-ink"
    : "flex min-h-11 cursor-pointer items-center text-sm font-medium text-bronze hover:text-focus";
  return (
    <div className={panel ? "flex gap-3" : "flex flex-wrap items-center gap-x-5"}>
      <button type="button" onClick={share} className={cls}>
        {label ?? (panel ? "Share" : "Share this receipt")}
      </button>
      <a href={x} target="_blank" rel="noopener noreferrer" className={cls}>
        Post on X ↗<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
