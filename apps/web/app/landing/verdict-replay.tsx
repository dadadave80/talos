"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// "One verdict, replayed": the real team-test attempt as six ruled rows that land in sequence when the figure enters the
// viewport. The step list is a scrubber. Rows keep their height whether or not they have landed, so nothing shifts.
// Reduced motion shows every row at once.

export type Step = { k: string; text: string; href?: string; mono?: boolean };

export function VerdictReplay({ steps, stamp, tone, receiptHref }: { steps: Step[]; stamp: string; tone: string; receiptHref: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(steps.length);
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let n = 0;
        timer.current = setInterval(() => {
          n += 1;
          setShown(n);
          if (n >= steps.length) stop();
        }, 380);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  }, [steps.length]);

  return (
    <div ref={root} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`smallcaps inline-flex items-center border px-2 py-0.5 text-[15px] ${tone}`}>{stamp}</span>
        <span className="smallcaps text-sm text-ink-3">team test · not counted</span>
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.k}>
            <button
              onClick={() => (stop(), setShown(i + 1))}
              aria-current={shown === i + 1 ? "step" : undefined}
              className={`flex min-h-11 cursor-pointer items-center gap-1.5 smallcaps text-[13px] lg:min-h-8 ${i < shown ? "text-ink" : "text-ink-3"}`}
            >
              <span className={`size-1.5 ${i < shown ? "bg-bronze" : "border border-rule"}`} aria-hidden="true" />
              {s.k}
            </button>
          </li>
        ))}
      </ol>
      <ol className="flex flex-col border-b border-rule">
        {steps.map((s, i) => (
          <li
            key={s.k}
            className={`grid grid-cols-1 gap-x-3 gap-y-1 border-t border-rule py-3 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:grid-cols-[88px_minmax(0,1fr)] ${i < shown ? "" : "translate-y-1.5 opacity-0"}`}
            aria-hidden={i < shown ? undefined : true}
          >
            <span className="smallcaps text-sm text-ink-3 sm:pt-0.5">{s.k}</span>
            {s.href ? (
              <a href={s.href} className={`min-w-0 break-words ${s.mono ? "font-mono text-[13px] tabular-nums" : "text-[15px] leading-[22px]"} text-ink hover:text-ink`}>
                {s.text} <span className="text-bronze">↗</span>
              </a>
            ) : (
              <span className={`min-w-0 max-w-[60ch] break-words ${s.mono ? "font-mono text-[13px] tabular-nums" : "text-[15px] leading-[22px]"} text-ink`}>{s.text}</span>
            )}
          </li>
        ))}
      </ol>
      <Link href={receiptHref} className="flex min-h-11 items-center self-start text-sm font-medium">Open the full receipt →</Link>
    </div>
  );
}
