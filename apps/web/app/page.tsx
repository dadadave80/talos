import { network } from "@/lib/share";
import { snapshot } from "@/lib/snapshot";
import { Arena } from "./arena";

export const revalidate = 15;

const STACK = `${network} (USDC gas) · Circle Modular Wallets · Facilitator Service · Gateway · built on Lattice`;

export default async function Home() {
  const snap = await snapshot();
  return (
    <div className="relative mx-auto w-full max-w-[1280px] overflow-x-clip">
      <div className="absolute inset-y-0 left-2 w-px bg-bronze lg:left-10" aria-hidden="true" />
      <header className="flex h-14 items-center gap-10 border-b border-rule pl-6 pr-2 lg:px-20">
        <a href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-[0.08em] text-ink hover:text-ink">
          <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">
            <path d="M21,30 L46,20 L46,82 L33,77 Q21,72.5 21,60 Z M54,26 L79,36 L79,72 Q79,80.5 71,83 L54,88 Z" fill="currentColor" />
          </svg>
          TALOS
        </a>
        <nav className="flex text-sm font-medium max-lg:ml-auto lg:gap-7">
          <a href="/" aria-current="page" className="flex h-13 items-center px-2.5 text-ink underline decoration-bronze underline-offset-[6px] lg:px-0">Arena</a>
          <a href="/api/evidence" className="flex h-13 items-center px-2.5 text-ink-2 lg:px-0">Evidence</a>
          <a href="/api/policy" className="flex h-13 items-center px-2.5 text-ink-2 lg:px-0">Policy</a>
        </nav>
        <a href={`${snap.explorer}/address/${snap.vault}`} className="ml-auto font-mono text-xs text-ink-2 max-lg:hidden">
          {network} · vault {snap.vault.slice(0, 6)}…{snap.vault.slice(-4)} <span className="text-bronze">↗</span>
        </a>
      </header>

      <Arena initial={snap} network={network} />

      <footer className="flex flex-col gap-2.5 border-t border-rule px-6 pb-8 pt-6 text-[13px] lg:px-20">
        <span className="text-ink-2">{STACK}</span>
        <div className="flex gap-6 font-medium">
          <a href="https://github.com/dadadave80/talos" className="text-ink-2">GitHub repo</a>
          <a href="https://github.com/dadadave80/talos/blob/main/docs/ADDRESSES.md" className="text-ink-2">Contracts (ADDRESSES.md)</a>
          <a href="https://github.com/dadadave80/lattice" className="text-ink-2">Lattice</a>
        </div>
        <span className="text-ink-3">The arena is a security program, not a game of chance: no prize pool, no escalating fees, fixed micro-bounties.</span>
      </footer>
    </div>
  );
}
