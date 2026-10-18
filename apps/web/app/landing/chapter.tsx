import type { ReactNode } from "react";

// A chapter of the landing page: a riveted rule (Talos is a bronze man; rivets are the one ornament), the chapter
// numeral, the heading and an optional one-line lede.
export function Chapter({ n, kicker, title, lede, id, children, wide = false }: { n: string; kicker: string; title: string; lede?: ReactNode; id: string; children: ReactNode; wide?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col">
      <div className="rivets" aria-hidden="true" />
      <div className={`mx-6 flex flex-col gap-8 py-16 lg:mx-20 lg:py-24 ${wide ? "" : "lg:mx-auto lg:w-full lg:max-w-[52rem]"}`}>
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-bronze">
            <span aria-hidden="true" className="h-px w-8 bg-bronze" />
            {n} · {kicker}
          </span>
          <h2 id={`${id}-h`} className="font-display text-[30px] font-medium leading-[1.12] tracking-[-0.01em] text-balance lg:text-[40px]">{title}</h2>
          {lede && <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2">{lede}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
