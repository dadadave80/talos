import type { Metadata } from "next";
import Link from "next/link";

// Next reads this as the page of /_not-found and as the not-found module for notFound(); the layout's template makes it
// "Not found · Talos".
export const metadata: Metadata = { title: "Not found" };

/// Unknown routes and notFound() (a cut-short receipt link, most often), inside the site frame.
export default function NotFound() {
  return (
    <main id="main" className="flex max-w-3xl flex-col gap-6 px-6 pb-20 pt-10 lg:px-20 lg:pt-16">
      <span className="smallcaps text-sm text-ink-3">Talos · 404</span>
      <h1 className="font-display text-[40px] font-medium leading-[44px] lg:text-[56px] lg:leading-[60px]">Nothing at this address.</h1>
      <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2">
        Receipts live at <span className="font-mono text-[15px]">/v/&lt;id&gt;</span>. The link may have been cut short.
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/arena" className="press inline-flex h-12 items-center bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover hover:text-bg">
          Back to the arena
        </Link>
        <Link href="/evidence" className="inline-flex h-11 items-center text-[15px] font-medium text-ink underline decoration-rule underline-offset-[6px] hover:text-ink hover:decoration-ink">
          Every attempt is on Evidence
        </Link>
      </div>
    </main>
  );
}
