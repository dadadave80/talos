import { CopyButton } from "./copy-button";

export const shortAddress = (a: string) => (a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/// A mono address: short (0x1234…abcd) unless `full`, the full value in its title, with Copy and an explorer ↗.
export function Address({ value, href, full = false, copy = true }: { value: string; href?: string; full?: boolean; copy?: boolean }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-3">
      <span title={value} className={`min-w-0 font-mono text-xs tabular-nums text-ink ${full ? "break-all" : "whitespace-nowrap"}`}>
        {full ? value : shortAddress(value)}
      </span>
      {copy && <CopyButton text={value} className="font-sans" />}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${shortAddress(value)} on Arcscan (opens in a new tab)`}
          className="inline-flex min-h-11 min-w-11 flex-none items-center justify-center text-sm text-bronze lg:min-h-10 lg:min-w-0"
        >
          ↗
        </a>
      )}
    </span>
  );
}
