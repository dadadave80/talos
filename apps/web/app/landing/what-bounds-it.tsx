"use client";

import { useEffect, useRef, useState } from "react";

// "What bounds it": the vault with its three tier gates sized by cap, the agent key outside with its grants, the owner
// key and the signature line, and the timelock clock on the caps. Tap or focus a part for its live value and address.
// Draw-on only; every value is a prop read from the vault.

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

export function WhatBoundsIt(p: Props) {
  const root = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [sel, setSel] = useState<string>("vault");

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setDrawn(true);
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setDrawn(true), io.disconnect()), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const agent = p.keys.find((k) => k.role === "agent");
  const hot = p.keys.find((k) => k.role === "hot");
  const max = Math.max(...p.tiers.map((t) => Number(t.perTx)), 0.01);
  const gates = p.tiers.map((t, i) => ({ ...t, y: 120 + i * 70, h: Math.max(8, Math.round((Number(t.perTx) / max) * 56)) }));
  const vaultUrl = `${p.explorer}/address/${p.vault}`;
  const until = (k?: Key) => (k ? `expires ${new Date(k.validUntil * 1000).toISOString().slice(0, 10)}` : "");

  const parts: Record<string, { value: string; href: string; link: string }> = {
    vault: { value: `Vault · ${p.vaultUsdc} USDC${p.stopped ? " · paused" : ""} · ${short(p.vault)}`, href: vaultUrl, link: "explorer" },
    ...Object.fromEntries(gates.map((g) => [g.name, { value: `${g.name.toLowerCase()} tier · ${g.perTx} USDC per tx · ${g.daily} per rolling day`, href: "/policy#caps", link: "policy" }])),
    agent: { value: agent ? `agent key · ${agent.grants} · ${short(agent.address)} · ${until(agent)}` : "agent key not configured", href: agent ? `${p.explorer}/address/${agent.address}` : "/policy#keys", link: "explorer" },
    hot: { value: hot ? `hot key · ${hot.grants} only · ${short(hot.address)} · ${until(hot)}` : "hot key not configured", href: hot ? `${p.explorer}/address/${hot.address}` : "/policy#keys", link: "explorer" },
    owner: { value: `owner signature · above the cap or an unlisted payee · ${p.owner.perTx} per approval · ${p.owner.daily} a day`, href: "/policy#queue", link: "policy" },
    timelock: { value: `timelock · any cap, key or allowlist change waits ${p.delayHours} h in public`, href: "/policy#timelock", link: "policy" },
  };
  const cur = parts[sel] ?? parts.vault;
  const part = (id: string, label: string, children: React.ReactNode) => (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={sel === id}
      className={`part ${sel === id ? "on" : ""}`}
      onPointerEnter={() => setSel(id)}
      onFocus={() => setSel(id)}
      onClick={() => setSel(id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(id))}
    >
      {children}
    </g>
  );

  return (
    <div className="flex flex-col gap-3">
      <svg ref={root} viewBox="0 0 540 380" className={`bounds-fig w-full max-w-[600px] ${drawn ? "drawn" : ""}`} role="group" aria-label="What bounds Talos">
        {/* The vault: three walls drawn whole, the right wall with a gap per tier. */}
        {part("vault", "The vault", (
          <>
            <path d="M200,60 H30 V320 H200" pathLength={1} className="draw" />
            <text x="42" y="86" className="lbl">Vault</text>
            <text x="42" y="102" className="sub">{p.vaultUsdc} USDC</text>
          </>
        ))}
        {/* Right wall segments between gates, then each gate as a bracket sized by its per-tx cap. */}
        <path d={`M200,60 V${gates[0].y - gates[0].h / 2} ${gates.map((g, i) => `M200,${g.y + g.h / 2} V${i < gates.length - 1 ? gates[i + 1].y - gates[i + 1].h / 2 : 320}`).join(" ")}`} pathLength={1} className="draw" />
        {gates.map((g) => (
          <g key={g.name}>
            {part(g.name, `${g.name.toLowerCase()} tier gate, ${g.perTx} USDC per transaction`, (
              <>
                <path d={`M194,${g.y - g.h / 2} h12 M194,${g.y + g.h / 2} h12`} pathLength={1} className="draw" />
                <rect x="190" y={g.y - g.h / 2 - 6} width="180" height={g.h + 12} fill="transparent" />
                <text x="216" y={g.y + 4} className="lbl">{g.name.toLowerCase()}</text>
                <text x="216" y={g.y + 19} className="sub">{g.perTx} / tx · {g.daily} / day</text>
              </>
            ))}
          </g>
        ))}
        {/* The agent key, outside the vault, reaches the gates; the hot key only writes commits. */}
        {part("agent", "The agent key", (
          <>
            <circle cx="440" cy="50" r="7" className="draw" pathLength={1} />
            <path d="M433,50 h-22 M419,50 v6 M412,50 v6 M440,86 V104 H372" pathLength={1} className="draw" />
            <text x="440" y="30" textAnchor="middle" className="lbl">agent key</text>
            <text x="440" y="76" textAnchor="middle" className="sub">{agent?.grants ?? "commit · pay · queue"}</text>
          </>
        ))}
        {part("hot", "The hot key", (
          <>
            <circle cx="440" cy="140" r="5" className="draw" pathLength={1} />
            <path d="M435,140 h-16 M424,140 v5" pathLength={1} className="draw" />
            <text x="440" y="162" textAnchor="middle" className="sub">hot key · {hot?.grants ?? "commit"} only</text>
          </>
        ))}
        {/* The timelock clock sits on the cap values. */}
        {part("timelock", "The timelock", (
          <>
            <circle cx="440" cy="210" r="13" className="draw" pathLength={1} />
            <path d="M440,210 V201 M440,210 H447" pathLength={1} className="draw" />
            <text x="440" y="238" textAnchor="middle" className="sub">{p.delayHours} h to change</text>
          </>
        ))}
        {/* The owner's signature line reaches the smallest gate from below, for anything above a cap. */}
        {part("owner", "The owner's signature", (
          <>
            <circle cx="440" cy="310" r="7" className="draw" pathLength={1} />
            <path d="M433,310 h-22 M419,310 v6 M440,303 V282 H372" pathLength={1} className="draw" />
            <text x="440" y="336" textAnchor="middle" className="lbl">owner signs</text>
            <text x="440" y="352" textAnchor="middle" className="sub">above the cap</text>
          </>
        ))}
      </svg>
      <p className="flex min-h-11 flex-wrap items-center gap-x-3 font-mono text-[13px] leading-5 text-ink-2" aria-live="polite">
        <span>{cur.value}</span>
        <a href={cur.href} className="text-bronze">{cur.link} ↗</a>
      </p>
    </div>
  );
}
