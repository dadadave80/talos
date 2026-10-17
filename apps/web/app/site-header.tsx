import Link from "next/link";
import { chain, explorer, USDC, vault } from "@/lib/chain";
import { network } from "@/lib/share";
import { shortAddress } from "./address";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { WalletControl } from "./wallet-control";

const REPO = "https://github.com/dadadave80/talos";

function Mark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path d="M21,30 L46,20 L46,82 L33,77 Q21,72.5 21,60 Z M54,26 L79,36 L79,72 Q79,80.5 71,83 L54,88 Z" fill="currentColor" />
    </svg>
  );
}

/// The page frame: the bronze line down the left edge and the sticky header, rendered once by the layout. Desktop is
/// one row; phone is two (mark and account controls, then the nav, which scrolls sideways if it must). From lg the bottom
/// rule runs the full viewport width: a fixed ::after escapes the 1280 px frame's overflow clip, and since the header
/// always sticks at the top, its border is always at 3.5rem - 1px.
export function SiteHeader() {
  return (
    <>
      <div className="absolute inset-y-0 left-2 w-px bg-bronze lg:left-10" aria-hidden="true" />
      <header className="sticky top-0 z-40 flex flex-wrap items-center border-b border-rule bg-bg lg:h-14 lg:flex-nowrap lg:gap-10 lg:px-20 lg:after:pointer-events-none lg:after:fixed lg:after:inset-x-0 lg:after:top-[calc(3.5rem-1px)] lg:after:h-px lg:after:bg-rule">
        {/* The header paints over the edge line while it sticks, so it carries its own piece of it. */}
        <div className="absolute inset-y-0 left-2 w-px bg-bronze lg:left-10" aria-hidden="true" />
        <Link href="/" className="flex h-14 flex-none items-center gap-2 pl-6 font-display text-lg font-semibold tracking-[0.08em] text-ink hover:text-ink lg:pl-0">
          <Mark size={26} />
          TALOS
        </Link>
        <nav
          aria-label="Primary"
          className="order-last flex w-full overflow-x-auto border-t border-rule pl-2 text-sm font-medium [scrollbar-width:none] lg:order-none lg:h-14 lg:w-auto lg:gap-7 lg:overflow-visible lg:border-0 lg:pl-0"
        >
          <NavLinks />
        </nav>
        <div className="ml-auto flex flex-none items-center gap-2 pr-4 lg:gap-3 lg:pr-0">
          <WalletControl explorer={explorer} />
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}

// One row per Circle and Arc tool, worded as in the README's stack table. Only what runs in production says live.
const STATUS: { tool: string; use: string; status: string; tone: string; proof?: string }[] = [
  { tool: "Arc", use: `The vault, every commit and payment, USDC as gas · ${network}`, status: "live", tone: "text-pay" },
  {
    tool: "Circle Modular Wallets",
    use: "Passkey sign-in: a passkey-owned smart account (MSCA) signs free attempts; undeployed accounts verify through ERC-6492",
    status: "live",
    tone: "text-pay",
    proof: `${REPO}/blob/main/apps/web/scripts/circle-6492-check.ts`,
  },
  {
    tool: "Circle Gateway + x402",
    use: "The agent pays its own bills: a daily float into Gateway, then an Arc RPC read from Quicknode each cycle over x402",
    status: "live",
    tone: "text-pay",
    proof: "https://explorer.testnet.arc.io/tx/0xca88795c86c7e48dcc950db8343ba38ccb5cb1247b7b739225ac12d75cb85ea9",
  },
  { tool: "Circle Facilitator Service", use: "The 0.05 USDC paid attempt, settled into the vault", status: "not built", tone: "text-ink-3" },
  { tool: "Bridge Kit / CCTP", use: "Contributor payouts on Base", status: "cut", tone: "text-ink-3" },
];

const link = "flex h-11 items-center text-ink-2 hover:text-ink lg:h-8";

export function SiteFooter() {
  const v = vault();
  return (
    <footer className="border-t border-rule px-6 pb-10 pt-10 text-[13px] lg:px-20">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-x-6">
        <div className="flex flex-col gap-3 lg:col-span-5">
          <span className="flex items-center gap-2 font-display text-lg font-semibold tracking-[0.08em] text-ink">
            <Mark size={22} />
            TALOS
          </span>
          <p className="max-w-[40ch] text-[15px] leading-[22px] text-ink-2">An AI treasury operator for Lattice, bounded by contract.</p>
          <span className="font-mono text-xs tabular-nums text-ink-3">
            {network} · chain {chain.id}
          </span>
        </div>
        <nav aria-label="Site" className="flex flex-col lg:col-span-3">
          <h2 className="smallcaps pb-1 text-[13px] text-ink-3">Site</h2>
          <Link href="/" className={link}>Arena</Link>
          <Link href="/evidence" className={link}>Evidence</Link>
          <Link href="/policy" className={link}>Policy</Link>
          <Link href="/account" className={link}>Account</Link>
        </nav>
        <div className="flex flex-col lg:col-span-4">
          <h2 className="smallcaps pb-1 text-[13px] text-ink-3">On-chain</h2>
          {v && (
            <a href={`${explorer}/address/${v}`} className={link}>
              <span>
                Vault <span className="font-mono text-xs tabular-nums">{shortAddress(v)}</span> <span className="text-bronze">↗</span>
              </span>
            </a>
          )}
          <a href={`${explorer}/address/${USDC}`} className={link}>
            <span>
              USDC <span className="font-mono text-xs tabular-nums">{shortAddress(USDC)}</span> <span className="text-bronze">↗</span>
            </span>
          </a>
          <a href={`${REPO}/blob/main/docs/ADDRESSES.md`} className={link}>Contracts (ADDRESSES.md)</a>
          <a href={REPO} className={link}>GitHub</a>
          <a href="https://github.com/dadadave80/lattice" className={link}>Lattice</a>
        </div>
      </div>
      <section aria-labelledby="stack-title" className="mt-10 flex flex-col">
        <h2 id="stack-title" className="smallcaps pb-2 text-[13px] text-ink-3">Circle and Arc stack</h2>
        <ul className="flex flex-col">
          {STATUS.map((s) => (
            <li key={s.tool} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-rule py-2.5 lg:grid-cols-[220px_1fr_auto] lg:items-baseline">
              <span className="font-medium text-ink">{s.tool}</span>
              <span className="col-span-2 row-start-2 text-ink-2 lg:col-span-1 lg:row-start-auto">{s.use}</span>
              <span className={`col-start-2 row-start-1 text-right ${s.tone} lg:col-start-auto lg:row-start-auto`}>
                {s.status}
                {s.proof && (
                  <>
                    {" · "}
                    <a href={s.proof} className="inline-flex min-h-11 items-center underline decoration-rule underline-offset-4 lg:min-h-0" aria-label="Proof: the ERC-6492 check script on GitHub">
                      proof ↗
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-6 flex flex-col gap-2 border-t border-rule pt-6">
        <span className="text-ink-3">The arena is a security program, not a game of chance: no prize pool, no escalating fees, fixed micro-bounties.</span>
        <span className="text-ink-3">Built for Tameion · 2026</span>
      </div>
    </footer>
  );
}
