import Link from "next/link";

// The blast-radius instrument: the most one message can take, over the rolling-day scale. Read from the vault; both
// the landing page and the arena draw it, so the two never disagree.
export type Meter = { num: string; numC: string; fill: string; line: string; lineC: string };

export function meterFor(s: { stopped: boolean; tripped?: boolean; discretionary: { perTx: string; cap: string; remaining: string } }): Meter & { usedPct: number; perTx: string; cap: string; remaining: string } {
  const f2 = (v: string | number) => Number(v).toFixed(2);
  const perTx = f2(s.discretionary.perTx);
  const cap = f2(s.discretionary.cap);
  const remaining = f2(s.discretionary.remaining);
  const used = Math.max(0, Number(cap) - Number(remaining));
  const usedPct = Math.min(100, (used / Number(cap)) * 100);
  const usedLine = `${used.toFixed(2)} of ${cap} USDC used over the rolling day`;
  const m: Meter = s.stopped
    ? { num: "0.00", numC: "", fill: "bg-ink-3", line: `Payouts paused by owner · ${usedLine}`, lineC: "text-ink-2" }
    : s.tripped
      ? { num: "0.00", numC: "", fill: "bg-ink-3", line: "Velocity breaker tripped · payouts resume when the owner resets it", lineC: "text-ink-2" }
      : Number(remaining) <= 0
        ? { num: "0.00", numC: "", fill: "bg-ink-3", line: "Spent for today · it refills over the rolling day", lineC: "text-ink-2" }
        : Number(remaining) < Number(perTx)
          ? { num: remaining, numC: "text-queue", fill: "bg-bronze", line: usedLine, lineC: "text-queue" }
          : { num: Math.min(Number(perTx), Number(remaining)).toFixed(2), numC: "", fill: "bg-bronze", line: usedLine, lineC: "text-ink-2" };
  return { ...m, usedPct, perTx, cap, remaining };
}

export function BlastRadius({ m, id, big = false }: { m: ReturnType<typeof meterFor>; id?: string; big?: boolean }) {
  return (
    <Link id={id} href="/policy#caps" className="flex flex-col gap-3 text-ink hover:text-ink" aria-label={`Most you can take now: ${m.num} USDC. ${m.line}. Read the caps`}>
      <div className={`flex items-baseline justify-between gap-3 ${big ? "lg:flex-col lg:items-start" : ""}`}>
        <span className="smallcaps text-sm text-ink-2">Most you can take now</span>
        <span className={`font-display text-2xl font-medium tabular-nums ${big ? "lg:text-[56px] lg:leading-[60px]" : ""} ${m.numC}`}>
          {m.num}
          <span className={`text-sm text-ink-2 ${big ? "lg:text-xl" : ""}`}> USDC</span>
        </span>
      </div>
      <div className="relative mt-1 h-7" aria-hidden="true">
        <div className="absolute inset-x-0 top-3.5 h-px bg-ink-3" />
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className="absolute top-2.5 h-[9px] w-px bg-rule" style={{ left: `${((i + 1) / 12) * 100}%` }} />
        ))}
        <div className={`absolute left-0 top-[13px] h-[3px] ${m.fill}`} style={{ width: `${m.usedPct}%` }} />
        <div className={`absolute top-1 h-5 w-0.5 ${m.fill}`} style={{ left: `${m.usedPct}%` }} />
        <div className="absolute right-0 top-0.5 h-6 w-[5px] border-x border-ink" />
      </div>
      <div className="flex justify-between font-mono text-xs text-ink-3">
        <span>0</span>
        <span>{m.cap} USDC / rolling day</span>
      </div>
      <span className={`text-sm ${m.lineC}`}>{m.line}</span>
    </Link>
  );
}
