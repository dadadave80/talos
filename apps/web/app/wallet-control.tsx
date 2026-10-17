// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye components/wallet/WalletControl.tsx.
// Talos changes: reads app/session.tsx; free attempts left on the chip; last 3 attempts; full keyboard menu (arrows,
// Home/End, Esc/Tab, focus return); explorer link; Sign out for both kinds, not in the refuse colour; Tailwind tokens.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FREE_PER_WALLET } from "@/lib/accounts/freeTier";
import { Address, shortAddress } from "./address";
import { useSession } from "./session";

const VERDICT = { PAY: ["Paid", "text-pay"], QUEUE: ["Queued", "text-queue"], REFUSE: ["Refused", "text-refuse"] } as const;

// The free tier resets at 00:00 UTC (lib/share.tsx keys the counter on the UTC date).
function untilReset() {
  const now = Date.now();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const m = Math.ceil((next.getTime() - now) / 60_000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const back = document.activeElement as HTMLElement | null;
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    back?.focus();
    return ok;
  }
}

// The signed-in chip's natural width (address, and from lg the free count), shared by the placeholder and Sign in.
const WIDTH = "w-[134px] lg:w-[178px]";
const base = "flex min-h-11 w-full cursor-pointer px-3 text-left text-ink hover:bg-bg hover:text-ink focus-visible:bg-bg focus-visible:-outline-offset-2 lg:min-h-10";
const item = `${base} items-center gap-2 text-sm`;

/// Header account control. Before the session is read: a placeholder, so "Sign in" never flashes. Signed out: "Sign in".
/// Signed in: the address and free attempts left, opening a menu button (WAI-ARIA pattern). All three share one width,
/// so the header doesn't shift when the session loads.
export function WalletControl({ explorer }: { explorer: string }) {
  const session = useSession();
  const { ready, addr, kind, accounts, freeLeft, entries, openAuth, signOut, announce } = session;
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const toLast = useRef(false);
  const seen = useRef<string | null | undefined>(undefined);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // The header outlives client navigation, so the menu closes on a route change or when the session ends.
  useEffect(() => setOpen(false), [path, addr]);

  // Sign-in, switch and sign-out are announced once, from here; the silent restore on load is not.
  useEffect(() => {
    if (!ready) return;
    const was = seen.current;
    seen.current = addr;
    if (was === undefined || was === addr) return;
    announce(addr ? `${was ? "Switched to" : "Signed in as"} ${shortAddress(addr)}` : "Signed out");
  }, [ready, addr, announce]);

  useEffect(() => {
    if (!open) return;
    const list = items();
    (toLast.current ? list.at(-1) : list[0])?.focus();
    toLast.current = false;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const close = () => {
    trigger.current?.focus();
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!addr) return;
    if (!open) {
      if (e.target === trigger.current && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        toLast.current = e.key === "ArrowUp";
        setOpen(true);
      }
      return;
    }
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") close(); // no preventDefault: Tab carries on from the button
  };

  if (!ready) {
    return <span aria-hidden="true" className={`block h-11 flex-none border border-rule lg:h-9 ${WIDTH}`} />;
  }

  const short = addr ? shortAddress(addr) : "";
  const out = freeLeft === 0;
  const team = session.team || entries.some((r) => r.wallet_label === "team");
  const label = addr && `Account ${short}${freeLeft == null ? "" : `, ${freeLeft} free attempt${freeLeft === 1 ? "" : "s"} left`}, open menu`;

  return (
    // Not positioned on phone, so the menu anchors to the header and keeps a 16 px gutter at any width.
    <div ref={wrap} className="flex-none lg:relative" onKeyDown={onKey}>
      {/* One button for both states, so focus stays put across sign-in and sign-out. */}
      <button
        ref={trigger}
        id="account-button"
        type="button"
        onClick={addr ? () => setOpen((o) => !o) : () => openAuth()}
        aria-haspopup={addr ? "menu" : undefined}
        aria-expanded={addr ? open : undefined}
        aria-controls={addr && open ? "account-menu" : undefined}
        aria-label={label || undefined}
        className={
          addr
            ? `flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap border px-3 font-mono text-xs tabular-nums text-ink hover:border-bronze lg:h-9 ${WIDTH} ${open ? "border-bronze" : "border-rule"}`
            : `h-11 cursor-pointer border border-ink text-sm font-semibold text-ink hover:bg-raised lg:h-9 ${WIDTH}`
        }
      >
        {addr ? (
          <>
            <span className="size-1.5 flex-none bg-pay" aria-hidden="true" />
            {short}
            <span className={`max-lg:hidden ${out ? "text-queue" : "text-ink-2"}`}>
              · {freeLeft ?? "–"}/{FREE_PER_WALLET}
            </span>
            <span className="ml-auto text-ink-3" aria-hidden="true">▾</span>
          </>
        ) : (
          "Sign in"
        )}
      </button>
      {open && addr && (
        <div className="menu-in absolute right-4 top-full z-50 mt-1.5 w-72 max-w-[calc(100vw-32px)] rounded-md border border-rule bg-raised p-1 lg:right-0">
          <div className="flex flex-col gap-1 px-3 pb-3 pt-2.5 text-[13px] leading-5 text-ink-2">
            <Address value={addr} full copy={false} />
            <span>{kind === "passkey" ? "Passkey · Circle smart account" : "Browser wallet"}</span>
            <span className={out ? "text-queue" : ""}>
              Free attempts {freeLeft ?? "–"} of {FREE_PER_WALLET} · resets 00:00 UTC (in {untilReset()})
            </span>
            {team && <span className="text-ink-3">Team wallet · not counted</span>}
            {freeLeft != null && !entries.length && <span className="text-ink-3">No attempts yet.</span>}
          </div>
          <div ref={menu} id="account-menu" role="menu" aria-label="Account" className="flex flex-col">
            {entries.length > 0 && (
              <div role="group" aria-label="Your last attempts" className="flex flex-col border-t border-rule pt-1">
                <span aria-hidden="true" className="smallcaps px-3 pb-0.5 pt-1.5 text-xs text-ink-3">Your last attempts</span>
                {entries.slice(0, 3).map((r) => {
                  const [word, tone] = VERDICT[r.verdict];
                  const text = r.message_excerpt ?? `Attempt ${r.index}`;
                  return (
                    <Link key={r.id} role="menuitem" tabIndex={-1} href={`/v/${r.id}`} onClick={() => setOpen(false)} className={`${base} items-center gap-2 text-[13px]`}>
                      <span className={`smallcaps w-[8ch] flex-none ${tone}`}>{word}</span>
                      <span className="truncate text-ink-2">{text.length > 28 ? `${text.slice(0, 28).trimEnd()}…` : text}</span>
                    </Link>
                  );
                })}
              </div>
            )}
            <div role="separator" className="my-1 h-px bg-rule" />
            <Link role="menuitem" tabIndex={-1} href="/account" onClick={() => setOpen(false)} className={item}>
              Your account
            </Link>
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              className={item}
              onClick={() =>
                copyText(addr).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  announce("Address copied");
                })
              }
            >
              {copied ? "Copied" : "Copy address"}
            </button>
            <a role="menuitem" tabIndex={-1} href={`${explorer}/address/${addr}`} target="_blank" rel="noreferrer" onClick={close} className={item}>
              View on Arcscan <span className="text-bronze" aria-hidden="true">↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            {kind === "passkey" && accounts.length > 1 && (
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                className={item}
                onClick={() => {
                  close();
                  openAuth({ mode: "switch" });
                }}
              >
                Switch passkey
              </button>
            )}
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              className={item}
              onClick={() => {
                close();
                openAuth({ mode: "create" });
              }}
            >
              Add a passkey
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              className={`${base} flex-col justify-center py-2 text-sm`}
              onClick={() => {
                close();
                signOut();
              }}
            >
              Sign out
              {kind === "eoa" && <span className="text-xs text-ink-3">Your extension stays connected elsewhere</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
