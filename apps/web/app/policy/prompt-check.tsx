"use client";

import { useEffect, useState } from "react";
import { keccak256, toBytes } from "viem";

// Hashes the prompt shown on /policy in the visitor's browser and compares it with the hash that goes into every
// committed decision. Runs after mount, so the server never does the check for you.
export function PromptCheck({ text, hash }: { text: string; hash: string }) {
  const [got, setGot] = useState<string | null>(null);
  useEffect(() => setGot(keccak256(toBytes(text))), [text]);
  return (
    <p role="status" className="flex min-h-11 flex-wrap items-center gap-x-2 border-b border-rule py-2.5 text-sm">
      <span className="text-ink-2">Hashed in your browser:</span>
      {!got ? (
        <span className="text-ink-3">checking…</span>
      ) : got === hash.toLowerCase() ? (
        <span className="text-pay">Matches the committed hash ✓</span>
      ) : (
        <span className="break-all text-refuse">Does not match. Your browser got {got}</span>
      )}
    </p>
  );
}
