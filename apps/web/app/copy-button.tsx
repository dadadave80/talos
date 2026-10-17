"use client";

import { useState } from "react";

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => setDone(true), () => {})}
      className={`cursor-pointer text-sm font-medium text-bronze hover:text-focus ${className}`}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
