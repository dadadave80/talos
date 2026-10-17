"use client";

import { useState } from "react";
import { Flow, Node } from "./flow";

// "What bounds it": the vault with its three tier gates (bars sized by per-tx cap), the agent key outside it with its
// grants, the hot key that can only commit, the owner's signature above the cap, and the timelock on every change.
// Hover, tap or focus a part: its live value and address appear below. Draw-on only; every value is read from the vault.

type Tier = { name: string; perTx: string; daily: string };
type Key = { role: string; grants: string; address: string; validUntil: number };
type Props = {
  tiers: Tier[];
  owner: { perTx: string; daily: string };
  keys: Key[];
  delayHours: number;
  vault: string;
  vaultUsdc: string;
  explorer: string;
  stopped: boolean;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const f2 = (v: string) => Number(v).toFixed(2);

export function WhatBoundsIt(p: Props) {
  const [sel, setSel] = useState("vault");
  const agent = p.keys.find((k) => k.role === "agent");
  const hot = p.keys.find((k) => k.role === "hot");
  const max = Math.max(...p.tiers.map((t) => Number(t.perTx)), 0.01);
  const until = (k?: Key) => (k ? `expires ${new Date(k.validUntil * 1000).toISOString().slice(0, 10)}` : "");
  const vaultUrl = `${p.explorer}/address/${p.vault}`;
  const parts: Record<string, { value: string; href: string; link: string }> = {
    vault: { value: `Vault · ${p.vaultUsdc} USDC${p.stopped ? " · paused" : ""} · ${short(p.vault)}`, href: vaultUrl, link: "explorer" },
    ...Object.fromEntries(p.tiers.map((t) => [t.name, { value: `${t.name.toLowerCase()} tier · ${f2(t.perTx)} USDC per transaction · ${f2(t.daily)} per rolling day`, href: "/policy#caps", link: "policy" }])),
    agent: { value: agent ? `agent key · ${agent.grants} · ${short(agent.address)} · ${until(agent)}` : "agent key not configured", href: agent ? `${p.explorer}/address/${agent.address}` : "/policy#keys", link: "explorer" },
    hot: { value: hot ? `hot key · ${hot.grants} only, so the key exposed to attackers cannot move funds · ${short(hot.address)}` : "hot key not configured", href: hot ? `${p.explorer}/address/${hot.address}` : "/policy#keys", link: "explorer" },
    owner: { value: `owner signature · anything above a cap, or to an unlisted payee · ${f2(p.owner.perTx)} per approval · ${f2(p.owner.daily)} a day`, href: "/policy#queue", link: "policy" },
    timelock: { value: `timelock · any cap, key or allowlist change waits ${p.delayHours} h in public before it applies`, href: "/policy#timelock", link: "policy" },
  };
  const cur = parts[sel] ?? parts.vault;
  const pick = (id: string) => ({
    onPointerEnter: () => setSel(id),
    onFocus: () => setSel(id),
    onClick: () => setSel(id),
  });
  const last = p.tiers[p.tiers.length - 1]?.name;

  return (
    <div className="flex flex-col gap-4">
      <Flow
        edges={[
          ...p.tiers.map((t) => ({ from: "agent", to: `gate-${t.name}`, part: "agent" })),
          { from: "hot", to: "vault", part: "hot" },
          ...(last ? [{ from: `gate-${last}`, to: "owner", part: "owner" }] : []),
          { from: "timelock", to: "vault", part: "timelock" },
        ]}
        part={sel}
        edgeClass="max-lg:hidden"
        label="What bounds Talos: the vault's three tier gates, the agent key and its grants, the hot key, the owner's signature and the timelock."
        className="grid grid-cols-1 gap-y-8 lg:grid-cols-[1fr_1.6fr_1fr] lg:items-center lg:gap-x-16"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-10">
          <Node id="agent" title="Agent key" sub={agent?.grants ?? "commit · pay · queue"} part="agent" {...pick("agent")} />
          <Node id="hot" title="Hot key" sub={`${hot?.grants ?? "commit"} only`} part="hot" {...pick("hot")} />
        </div>

        <div data-node="vault" className={`relative z-[1] flex flex-col rounded-md border bg-raised ${sel === "vault" ? "border-ink-2" : "border-rule"}`}>
          <button {...pick("vault")} className="flex cursor-pointer items-baseline justify-between gap-3 px-4 pt-3 pb-2 text-left">
            <span className={`text-[15px] font-medium ${sel === "vault" ? "text-bronze" : "text-ink"}`}>Vault</span>
            <span className="font-mono text-xs text-ink-3">{p.vaultUsdc} USDC</span>
          </button>
          <ul className="flex flex-col">
            {p.tiers.map((t) => {
              const w = Math.max(6, Math.round((Number(t.perTx) / max) * 100));
              const on = sel === t.name;
              return (
                <li key={t.name} data-node={`gate-${t.name}`}>
                  <button {...pick(t.name)} aria-pressed={on} className="flex w-full cursor-pointer flex-col gap-1.5 border-t border-rule px-4 py-3 text-left">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm font-medium ${on ? "text-bronze" : "text-ink"}`}>{t.name.toLowerCase()}</span>
                      <span className="font-mono text-xs text-ink-3">{f2(t.perTx)} / tx · {f2(t.daily)} / day</span>
                    </span>
                    <span className="relative block h-2 w-full" aria-hidden="true">
                      <span className="absolute inset-y-0 left-0 w-full border-y border-rule" />
                      <span className={`absolute inset-y-0 left-0 ${on ? "bg-bronze" : "bg-ink-3"}`} style={{ width: `${w}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-10">
          <Node id="owner" title="Owner signs" sub="above the cap" part="owner" {...pick("owner")} />
          <Node id="timelock" title="Timelock" sub={`${p.delayHours} h to change anything`} part="timelock" {...pick("timelock")} />
        </div>
      </Flow>
      <p className="flex min-h-11 flex-wrap items-center gap-x-3 font-mono text-[13px] leading-5 text-ink-2" aria-live="polite">
        <span>{cur.value}</span>
        <a href={cur.href} className="text-bronze">{cur.link} ↗</a>
      </p>
    </div>
  );
}
