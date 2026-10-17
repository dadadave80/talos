// Shown while the policy is read from the vault: the page head and six empty rows, static (no shimmer).
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <section className="flex flex-col gap-6 px-6 pb-10 pt-10 lg:px-20 lg:pt-16">
        <h1 className="max-w-[16ch] font-display text-4xl font-medium leading-[1.1] tracking-[-0.01em] text-balance lg:text-[64px] lg:leading-[68px]">
          Policy
        </h1>
        <span role="status" className="font-mono text-xs text-ink-3">Reading the vault on Arc…</span>
      </section>
      <section className="mx-6 flex flex-col border-t border-ink lg:mx-20" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-12 items-center justify-between border-b border-rule">
            <span className="h-3 w-32 bg-raised" />
            <span className="h-3 w-20 bg-raised" />
          </div>
        ))}
      </section>
    </main>
  );
}
