"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { FREE_PER_WALLET } from "@/lib/accounts/freeTier";
import type { Address as Addr } from "viem";
import { circleConfigured, registerRecovery } from "@/lib/circleWallet";
import { getRecovery, setRecovery, type Recovery as Rec } from "../passkey-store";
import type { Receipt } from "@/lib/share";
import { Address, shortAddress } from "../address";
import { AddressGlyph } from "../address-glyph";
import { useSession } from "../session";
import { AccountOutline, SignInGate } from "../sign-in-gate";
import { VerdictReceipt } from "../verdict-receipt";

type Props = { explorer: string; perTx: string; cap: string };
type Mine = { addr: string; entries: Receipt[] | null; team: boolean }; // entries null: the read failed

const LIMIT = 50;
const tone = { PAY: "text-pay", QUEUE: "text-queue", REFUSE: "text-refuse" } as const;
const word = { PAY: "Pay", QUEUE: "Queue", REFUSE: "Refuse" } as const;
const excerpt = (s: string | null, n = 60) => (!s ? "—" : s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, "")}…`);
const ago = (ts: string, now: number) => {
  const m = Math.max(0, Math.floor((now - Date.parse(ts)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};
// The free tier counts per UTC calendar day (lib/share.tsx freeLeft reads today's UTC date).
const untilReset = (now: number) => {
  const d = new Date(now);
  const m = Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 60000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const COUNT = ["None", "One", "Two", "Three", "Four", "Five"];
const paid = (r: Receipt) => r.verdict === "PAY" && !!r.pay_tx && !r.note?.startsWith("pay reverted");

/// A clock that ticks on the minute.
function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let i: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      setNow(Date.now());
      i = setInterval(() => setNow(Date.now()), 60000);
    }, 60000 - (Date.now() % 60000));
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);
  return now;
}

function Block({ title, extra, className = "", children }: { title: string; extra?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`flex flex-col border-t border-rule pb-8 pt-3 ${className}`}>
      <div className="flex min-h-6 flex-wrap items-baseline justify-between gap-x-3">
        <h2 id={id} className="smallcaps text-sm text-ink-2">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

const Num = ({ v }: { v: number | string | null }) => <span className="inline-block min-w-[1ch] font-mono tabular-nums text-ink">{v ?? "–"}</span>;

const RIGHT = ["Identity", "Passkeys on this device", "Recovery", "Appearance"];
const LEFT = ["Today", "Record", "Your attempts"];

export function AccountPanel({ explorer, perTx, cap }: Props) {
  const s = useSession();
  const [mine, setMine] = useState<Mine | null>(null);
  const req = useRef({ addr: null as string | null, n: 0, done: 0, have: null as Mine | null });
  const latest = s.entries[0]?.id;

  // The session keeps the last 10; the record needs up to 50. Re-read when the session's newest attempt changes and
  // our read doesn't have it yet. Replies are kept by address and order, so a slower first read still lands.
  useEffect(() => {
    const q = req.current;
    q.addr = s.addr;
    if (!s.addr) return;
    const a = s.addr;
    if (q.have?.addr === a && q.have.entries && (latest == null || q.have.entries.some((e) => e.id === latest))) return;
    const n = ++q.n;
    const set = (m: Mine) => {
      if (q.addr !== a || n < q.done || (!m.entries && q.have?.addr === a && q.have.entries)) return;
      q.done = n;
      q.have = m;
      setMine(m);
    };
    fetch(`/api/attempt?wallet=${a}&limit=${LIMIT}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { entries: Receipt[]; team?: boolean } | null) => set({ addr: a, entries: b?.entries ?? null, team: !!b?.team }))
      .catch(() => set({ addr: a, entries: null, team: false }));
  }, [s.addr, latest]);

  if (!s.ready) {
    return (
      <div className="grid grid-cols-1 gap-x-10 px-6 pb-16 lg:grid-cols-12 lg:px-20" aria-busy="true">
        <span role="status" className="sr-only">Reading this device…</span>
        <div className="lg:col-span-7"><AccountOutline sections={LEFT} /></div>
        <div className="max-lg:hidden lg:col-span-5"><AccountOutline sections={RIGHT} /></div>
      </div>
    );
  }

  if (!s.addr) {
    return (
      <div className="grid grid-cols-1 gap-x-10 px-6 pb-16 lg:grid-cols-12 lg:px-20">
        <div className="flex flex-col lg:col-span-7">
          <SignInGate />
          <AccountOutline sections={LEFT} />
        </div>
        <div className="flex flex-col lg:col-span-5">
          <Appearance />
        </div>
      </div>
    );
  }

  const data = mine?.addr === s.addr ? mine : null;
  const team = data?.team || s.entries.some((e) => e.wallet_label === "team");
  return (
    <div className="grid grid-cols-1 gap-x-10 px-6 pb-16 lg:grid-cols-12 lg:px-20">
      <div className="flex min-w-0 flex-col lg:col-span-7">
        <Identity explorer={explorer} team={team} className="lg:hidden" />
        <Today />
        <Record entries={data?.entries ?? null} team={team} />
        <Attempts entries={data?.entries ?? null} failed={!!data && !data.entries} explorer={explorer} perTx={perTx} cap={cap} />
      </div>
      <div className="flex min-w-0 flex-col lg:col-span-5 lg:self-start lg:[@media(min-height:62rem)]:sticky lg:[@media(min-height:62rem)]:top-20">
        <Identity explorer={explorer} team={team} className="max-lg:hidden" />
        <Passkeys />
        <Recovery explorer={explorer} />
        <Appearance />
        <SignOut />
      </div>
    </div>
  );
}

// Recovery, as in engye: register a wallet you control as this passkey account's recovery key (Circle Modular Wallets
// recoveryActions, gas sponsored). If the device is lost, "Recover a lost passkey" in the sign-in sheet uses it.
function Recovery({ explorer }: { explorer: string }) {
  const { kind, passkey, addr, announce } = useSession();
  const [rec, setRec] = useState<Rec | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setRec(addr ? getRecovery(addr) : null), [addr]);

  async function register() {
    if (!passkey || !addr) return;
    const w = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<unknown> } }).ethereum;
    if (!w) return setErr("No browser wallet here. Install one (MetaMask, Rabby, Coinbase Wallet), then try again.");
    setBusy(true);
    setErr(null);
    try {
      const [wallet] = (await w.request({ method: "eth_requestAccounts" })) as string[];
      if (!wallet) throw new Error("The wallet returned no account.");
      if (wallet.toLowerCase() === addr.toLowerCase()) throw new Error("That is this account. Pick a different wallet.");
      const tx = await registerRecovery(passkey.credential, wallet as Addr);
      const r = { wallet, tx, at: new Date().toISOString() };
      setRecovery(addr, r);
      setRec(r);
      announce(`Recovery key ${shortAddress(wallet)} registered`);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block
      title="Recovery"
      extra={
        kind === "passkey" && (
          <button onClick={register} disabled={busy} className="min-h-11 cursor-pointer text-sm font-medium text-bronze hover:text-focus disabled:cursor-wait disabled:text-ink-3 lg:min-h-8">
            {busy ? "Confirm on your device…" : rec ? "Change recovery key" : "Register a recovery key"}
          </button>
        )
      }
    >
      {kind !== "passkey" ? (
        <p className="mt-3 text-sm leading-5 text-ink-2">Recovery is for passkey accounts. A browser wallet recovers through its own seed phrase.</p>
      ) : rec ? (
        <div className="mt-3 flex gap-3 text-sm leading-5">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" className="mt-0.5 flex-none text-pay" aria-hidden="true">
            <path d="M8 1.5 2.5 3.5v4c0 3.3 2.3 5.9 5.5 7 3.2-1.1 5.5-3.7 5.5-7v-4L8 1.5Z" />
            <path d="m5.5 8 1.8 1.8L10.8 6.3" />
          </svg>
          <p className="text-ink-2">
            <span className="font-medium text-ink">Recovery is active.</span> Wallet <span className="font-mono text-xs text-ink">{shortAddress(rec.wallet)}</span> can hand
            this account to a new passkey: choose <span className="text-ink">Lost your passkey? Recover with a wallet</span> when signing in.{" "}
            <a href={`${explorer}/tx/${rec.tx}`} className="whitespace-nowrap font-medium">Registration ↗</a>
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-5 text-ink-2">
          No recovery key yet. This account lives only in this device&apos;s passkey; register a wallet you control so a lost or
          wiped device doesn&apos;t lock you out. Gas is sponsored.
        </p>
      )}
      {err && <p role="alert" className="mt-2 text-[13px] leading-5 text-refuse">{err}</p>}
    </Block>
  );
}

function Identity({ explorer, team, className }: { explorer: string; team: boolean; className: string }) {
  const { addr, kind, passkey } = useSession();
  if (!addr) return null;
  const rp = passkey?.credential.rpId ?? location.hostname;
  return (
    <Block title="Identity" className={className}>
      <div className="mt-3 flex items-start gap-4">
        <AddressGlyph value={addr} size={40} />
        <div className="flex min-w-0 flex-col">
          <Address value={addr} full href={`${explorer}/address/${addr}`} />
        </div>
      </div>
      <div className="mt-2 flex flex-col text-sm leading-5">
        {kind === "passkey" ? (
          <>
            <p className="border-t border-rule py-2.5">
              <span className="text-ink">Passkey</span>
              <span className="text-ink-2"> · Circle Modular Wallets smart account (MSCA). Signing needs no deployment (ERC-6492); registering a recovery key deploys it, gas sponsored.</span>
            </p>
            <p className="border-t border-rule py-2.5 text-ink-2">
              Passkey bound to <span className="font-mono text-xs text-ink">{rp}</span>
            </p>
          </>
        ) : (
          <p className="border-t border-rule py-2.5">
            <span className="text-ink">Browser wallet</span>
            <span className="text-ink-2"> · signs plain messages (personal_sign). No gas, nothing moves.</span>
          </p>
        )}
        {team && (
          <p className="border-t border-rule py-2.5">
            <span className="smallcaps text-ink">Team wallet · not counted</span>
            <span className="text-ink-2"> Its attempts are real and on-chain, but never counted in the external record.</span>
          </p>
        )}
      </div>
    </Block>
  );
}

function Today() {
  const { freeLeft, refresh } = useSession();
  const now = useMinute();
  const day = new Date(now).toISOString().slice(0, 10);
  const [seen, setSeen] = useState(day);
  // Crossing 00:00 UTC restores the quota: re-read it instead of showing yesterday's count.
  useEffect(() => {
    if (day === seen) return;
    setSeen(day);
    refresh();
  }, [day, seen, refresh]);
  const left = freeLeft;
  const used = left == null ? 0 : FREE_PER_WALLET - left;
  const out = left === 0;
  return (
    <Block title="Today">
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule pb-3">
        <span className="text-[15px]">
          Free attempts left <Num v={left} /> <span className="text-ink-2">of {FREE_PER_WALLET}</span>
        </span>
        <span role="img" aria-label={left == null ? "Loading free attempts" : `${left} of ${FREE_PER_WALLET} free attempts left`} className="flex gap-1.5">
          {Array.from({ length: FREE_PER_WALLET }, (_, i) => (
            <span key={i} className={`size-3 ${left == null ? "border border-rule" : i < left ? "bg-bronze" : "border border-rule"}`} />
          ))}
        </span>
      </div>
      <p className={`pt-3 text-[13px] ${out ? "text-queue" : "text-ink-2"}`}>
        {out ? "None left today. " : ""}Resets <span className="font-mono text-xs">00:00 UTC</span> · in{" "}
        <span className="font-mono text-xs tabular-nums [word-spacing:-0.25em]">{untilReset(now)}</span>
      </p>
      {!out && (
        <Link href="/arena#case" className="mt-3 inline-flex min-h-11 items-center self-start text-[15px] font-medium">
          Make your case →
        </Link>
      )}
    </Block>
  );
}

function Record({ entries, team }: { entries: Receipt[] | null; team: boolean }) {
  const n = (v: Receipt["verdict"]) => (entries ? entries.filter((e) => e.verdict === v).length : null);
  const usdc = entries ? entries.filter(paid).reduce((t, e) => t + Number(e.amount_usdc ?? 0), 0).toFixed(2) : null;
  const stats: [string, number | string | null][] = [
    ["Refused", n("REFUSE")],
    ["Queued", n("QUEUE")],
    ["Paid", entries ? entries.filter(paid).length : null],
    ["Paid to you", usdc == null ? null : `${usdc} USDC`],
  ];
  return (
    <Block
      title="Record"
      extra={team ? <span className="smallcaps text-[13px] text-ink">Team wallet · not counted</span> : null}
    >
      <dl className="mt-3 grid grid-cols-2 border-t border-rule sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 border-b border-rule py-3">
            <dt className="text-[13px] text-ink-2">{k}</dt>
            <dd className="text-lg">
              <Num v={v} />
            </dd>
          </div>
        ))}
      </dl>
      {entries && entries.length >= LIMIT && <p className="pt-2 text-[13px] text-ink-3">From your last {LIMIT} decided attempts.</p>}
    </Block>
  );
}

function Attempts({ entries, failed, explorer, perTx, cap }: { entries: Receipt[] | null; failed: boolean; explorer: string; perTx: string; cap: string }) {
  const { addr, freeLeft } = useSession();
  const now = useMinute();
  const [open, setOpen] = useState<string | null>(null);
  const rows = entries?.slice(0, 10) ?? [];
  const free = freeLeft == null ? null : freeLeft === 0 ? "No free attempts left today." : `${COUNT[freeLeft] ?? freeLeft} ${freeLeft === 1 ? "is" : "are"} free today.`;
  return (
    <Block
      title="Your attempts"
      extra={
        entries?.length ? (
          <Link href={`/evidence?wallet=${addr}`} className="inline-flex min-h-11 items-center text-sm font-medium">
            See all on Evidence →
          </Link>
        ) : null
      }
    >
      {failed ? (
        <p className="mt-3 text-sm text-ink-2">
          Your attempts didn&apos;t load.{" "}
          <Link href={`/evidence?wallet=${addr}`} className="font-medium">
            See them on Evidence →
          </Link>
        </p>
      ) : !entries ? (
        <p className="mt-3 text-sm text-ink-3" role="status">Loading your attempts…</p>
      ) : !rows.length ? (
        <div className="mt-3 flex flex-col items-start gap-3 border-t border-rule pt-4">
          <p className="text-[15px] text-ink-2">No attempts yet.{free ? ` ${free}` : ""}</p>
          <Link href="/arena" className="inline-flex min-h-11 items-center text-[15px] font-medium">
            Go to the arena →
          </Link>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col border-b border-rule">
          {rows.map((r) => {
            const on = open === r.id;
            return (
              <li key={r.id} className="border-t border-rule">
                <div className="flex items-stretch">
                  <button
                    onClick={() => setOpen(on ? null : r.id)}
                    aria-expanded={on}
                    aria-controls={`receipt-${r.id}`}
                    className="grid min-h-12 min-w-0 flex-1 cursor-pointer grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 text-left"
                  >
                    <span className={`smallcaps text-sm ${tone[r.verdict]}`}>{word[r.verdict]}</span>
                    <span className="truncate text-sm text-ink">{excerpt(r.message_excerpt)}</span>
                    <span className="font-mono text-xs tabular-nums text-ink-3">{ago(r.ts, now)}</span>
                  </button>
                  <Link href={`/v/${r.id}`} aria-label={`Open the receipt for attempt ${r.index}`} className="flex w-11 flex-none items-center justify-center text-bronze">
                    ↗
                  </Link>
                </div>
                {on && (
                  <div id={`receipt-${r.id}`} className="pb-6 pt-2">
                    <VerdictReceipt r={r} explorer={explorer} perTx={perTx} cap={cap} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {entries && entries.length > rows.length && <p className="pt-2 text-[13px] text-ink-3">Showing your last {rows.length}.</p>}
    </Block>
  );
}

function Passkeys() {
  const { accounts, passkey, switchTo, forget, openAuth, announce } = useSession();
  const enabled = circleConfigured();
  return (
    <Block title="Passkeys on this device">
      {accounts.length ? (
        <ul className="mt-3 flex flex-col border-b border-rule">
          {[...accounts].reverse().map((a) => {
            const current = a.address === passkey?.address;
            const created = a.createdAt ? `Created ${new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Saved earlier";
            return (
              <li key={a.address} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule py-2.5">
                <AddressGlyph value={a.address} size={20} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-ink">{a.label ?? "Passkey"}</span>
                  <span className="font-mono text-xs tabular-nums text-ink-2">
                    {shortAddress(a.address)} · <span className="font-sans">{created}</span>
                  </span>
                </div>
                {current ? (
                  <span className="smallcaps text-sm text-pay">Current</span>
                ) : (
                  <div className="flex gap-4">
                    <button
                      onClick={() => switchTo(a.address)}
                      className="min-h-11 cursor-pointer text-sm font-medium text-bronze hover:text-focus"
                    >
                      Switch
                    </button>
                    <button
                      onClick={() => {
                        forget(a.address);
                        announce(`Removed ${shortAddress(a.address)} from this device`);
                      }}
                      className="min-h-11 cursor-pointer text-sm font-medium text-ink-2 hover:text-ink"
                    >
                      Forget
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-2">No passkey saved on this device.</p>
      )}
      {enabled ? (
        <button
          onClick={() => openAuth({ mode: "create" })}
          className="mt-4 h-11 cursor-pointer self-start border border-ink px-4 text-sm font-semibold text-ink hover:border-bronze"
        >
          Add a passkey
        </button>
      ) : (
        <p className="mt-3 text-sm text-ink-3">Passkeys aren&apos;t enabled on this deployment.</p>
      )}
      <p className="mt-4 text-[13px] leading-5 text-ink-3">
        Your passkey lives in your device&apos;s password manager and signs with your fingerprint, face or screen lock. Talos and Circle never see it.
        Don&apos;t create one on a shared device. Forget only removes it from this list; sign in with it to bring it back.
      </p>
    </Block>
  );
}

const MODES = [["system", "System"], ["light", "Light"], ["dark", "Dark"]] as const;
const onTheme = (f: () => void) => {
  addEventListener("talos-theme", f);
  return () => removeEventListener("talos-theme", f);
};

function Appearance() {
  const mode = useSyncExternalStore(onTheme, () => window.__talosTheme?.get() ?? "system", () => "system");
  return (
    <Block title="Appearance">
      <div role="group" aria-label="Theme" className="mt-3 grid grid-cols-3 border border-rule">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            onClick={() => window.__talosTheme?.set(m)}
            aria-pressed={mode === m}
            className={`h-11 cursor-pointer text-sm font-medium ${mode === m ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-ink-3">System follows your device. Light and dark are remembered on this browser.</p>
    </Block>
  );
}

function SignOut() {
  const { kind, signOut } = useSession();
  return (
    <Block title="Sign out">
      <button
        onClick={() => {
          signOut();
          requestAnimationFrame(() => document.getElementById("account-gate")?.focus());
        }}
        className="mt-3 h-11 cursor-pointer self-start border border-rule px-4 text-sm font-semibold text-ink hover:border-ink"
      >
        Sign out
      </button>
      <p className="mt-2 text-[13px] leading-5 text-ink-3">
        {kind === "eoa"
          ? "Talos forgets this wallet on this browser. Your extension stays connected; disconnect the site there if you want."
          : "Saved passkeys stay on this device; Forget removes them."}
      </p>
    </Block>
  );
}
