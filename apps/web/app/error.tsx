"use client";

import Link from "next/link";
import { useEffect } from "react";

/// A page that threw while rendering (usually Arc or Supabase not answering), inside the site frame. unstable_retry
/// re-fetches the segment, which is what a flaky read needs.
export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; reset: () => void; unstable_retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main id="main" className="flex max-w-3xl flex-col gap-6 px-6 pb-20 pt-10 lg:px-20 lg:pt-16">
      <span className="smallcaps text-sm text-refuse">Talos · error</span>
      <h1 className="font-display text-[40px] font-medium leading-[44px] lg:text-[56px] lg:leading-[60px]">This page didn&apos;t load.</h1>
      <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2">Arc or the database didn&apos;t answer. Nothing was decided or moved.</p>
      {error.digest && <code className="font-mono text-xs text-ink-3">Reference {error.digest}</code>}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <button type="button" onClick={() => unstable_retry()} className="h-12 cursor-pointer bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover">
          Try again
        </button>
        <Link href="/arena" className="inline-flex h-11 items-center text-[15px] font-medium text-ink underline decoration-rule underline-offset-[6px] hover:text-ink hover:decoration-ink">
          Back to the arena
        </Link>
      </div>
    </main>
  );
}
