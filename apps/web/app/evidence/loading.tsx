// Shown while the statement is read from Arc: the page head and six empty rows, static (no shimmer).
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="flex justify-between gap-4 px-6 pb-2.5 pt-5 smallcaps text-sm text-ink-3 lg:px-20">
        <span role="status">Talos · Evidence · reading the ledger…</span>
      </div>
      <section className="grid grid-cols-1 gap-8 border-t border-rule px-6 pb-10 pt-8 lg:mx-20 lg:grid-cols-12 lg:gap-x-6 lg:px-0">
        <div className="flex flex-col gap-3 lg:col-span-6">
          <h1 className="font-display text-[44px] font-medium leading-[48px] lg:text-[64px] lg:leading-[68px]">Statement</h1>
          <span className="max-w-[52ch] text-[15px] leading-[22px] text-ink-2">Every number links to a transaction.</span>
        </div>
        <div className="flex flex-col lg:col-span-5 lg:col-start-8 lg:self-end" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex h-12 items-center justify-between border-t border-rule">
              <span className="h-3 w-28 bg-raised" />
              <span className="h-4 w-14 bg-raised" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
