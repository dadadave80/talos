"use client";

import { useEffect, useState } from "react";

// Clipboard API first; the textarea fallback covers insecure origins and older WebViews.
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.setAttribute("readonly", "");
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

export function CopyButton({ text, className = "", label = "Copy" }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <>
      <button
        type="button"
        onClick={() => copy(text).then(setDone)}
        className={`inline-flex min-h-11 flex-none cursor-pointer items-center text-sm font-medium text-bronze hover:text-focus lg:min-h-10 ${className}`}
      >
        {done ? "Copied" : label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {done ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
