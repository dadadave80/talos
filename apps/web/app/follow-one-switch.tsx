"use client";

import { useState } from "react";

// Which trace "Follow one verdict" shows. Both are rendered on the server; this only picks one.
export function FollowOneSwitch({ pay, refuse }: { pay: React.ReactNode; refuse: React.ReactNode }) {
  const [view, setView] = useState<"pay" | "refuse">("pay");
  const option = (v: typeof view, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      aria-controls="follow-one-trace"
      onClick={() => setView(v)}
      className={`min-h-11 cursor-pointer border px-3 text-sm font-medium lg:min-h-10 ${view === v ? "border-ink text-ink" : "border-rule text-ink-2 hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <>
      <div role="group" aria-label="Which verdict to follow" className="flex flex-wrap gap-2">
        {option("pay", "The payout")}
        {option("refuse", "A refusal")}
      </div>
      <div id="follow-one-trace">{view === "pay" ? pay : refuse}</div>
    </>
  );
}
