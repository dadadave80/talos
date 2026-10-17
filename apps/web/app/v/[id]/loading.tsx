// Shown while the receipt is read: the page frame and empty trail rows, static (no shimmer). It also puts the page
// under a Suspense boundary, so notFound() for a cut-short link renders inside the server-rendered frame.
export default function Loading() {
  return (
    <main id="main" aria-busy="true" className="grid grid-cols-1 gap-12 px-6 pb-16 pt-10 lg:grid-cols-12 lg:gap-x-6 lg:px-20 lg:pt-16">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
        <span role="status" className="smallcaps text-sm text-ink-3">Talos · receipt · reading…</span>
        <div className="flex flex-col gap-3" aria-hidden="true">
          <span className="h-7 w-11/12 bg-raised" />
          <span className="h-7 w-2/3 bg-raised" />
        </div>
        <div className="flex flex-col border-t border-ink" aria-hidden="true">
          <span className="mt-4 h-7 w-24 bg-raised" />
          <span className="mt-4 h-4 w-full max-w-[60ch] bg-raised" />
          <span className="mt-2 h-4 w-3/4 max-w-[45ch] bg-raised" />
          <div className="mt-6 flex flex-col border-t border-rule">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex h-11 items-center gap-3 border-b border-rule">
                <span className="h-3 w-14 bg-raised" />
                <span className="h-3 w-40 bg-raised" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 border-t border-ink pt-2.5 lg:col-span-5" aria-hidden="true">
        <span className="h-3 w-20 bg-raised" />
        <span className="h-12 w-full bg-raised" />
      </div>
    </main>
  );
}
