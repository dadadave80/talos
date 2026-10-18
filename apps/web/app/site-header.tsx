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

// One entry per Circle and Arc tool, worded as in the README's stack table. Only what runs in production says live.
const STATUS: { tool: string; use: string; status: "live" | "not built" | "cut"; proof?: string; proofLabel?: string }[] = [
  { tool: "Arc", use: "The vault, every commit and payment; USDC is gas", status: "live" },
  {
    tool: "Circle Modular Wallets",
    use: "Passkey sign-in and wallet recovery; undeployed accounts verify through ERC-6492",
    status: "live",
    proof: `${REPO}/blob/main/apps/web/scripts/circle-6492-check.ts`,
    proofLabel: "the ERC-6492 check script",
  },
  {
    tool: "Circle Gateway + x402",
    use: "The agent pays its own bills: a daily float, then an RPC read per cycle",
    status: "live",
    proof: "https://explorer.testnet.arc.io/tx/0xca88795c86c7e48dcc950db8343ba38ccb5cb1247b7b739225ac12d75cb85ea9",
    proofLabel: "the Gateway deposit",
  },
  { tool: "Circle Facilitator Service", use: "The 0.05 USDC paid attempt", status: "not built" },
  { tool: "Bridge Kit / CCTP", use: "Contributor payouts on Base", status: "cut" },
];
const TONE = { live: "text-pay", "not built": "text-ink-3", cut: "text-ink-3" } as const;

const link = "flex min-h-11 items-center gap-1.5 text-[15px] text-ink-2 hover:text-ink lg:min-h-8 lg:text-sm";
const head = "pb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3";

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title} className="flex flex-col">
      <h2 className={head}>{title}</h2>
      {children}
    </nav>
  );
}

export function SiteFooter() {
  const v = vault();
  return (
    <footer className="mt-8 border-t border-rule px-6 pb-10 pt-12 lg:px-20 lg:pt-16">
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-12">
        <div className="col-span-2 flex flex-col gap-4 lg:col-span-5">
          <span className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-[0.08em] text-ink">
            <Mark size={26} />
            TALOS
          </span>
          <p className="max-w-[34ch] font-display text-lg leading-7 text-ink-2">
            An AI treasurer for Lattice. Its limits live in a contract it cannot change.
          </p>
          <span className="inline-flex items-center gap-2 self-start border border-rule px-2.5 py-1 font-mono text-xs tabular-nums text-ink-2">
            <span aria-hidden="true" className="size-1.5 bg-pay" />
            {network} · chain {chain.id}
          </span>
        </div>
        <div className="lg:col-span-2">
          <Col title="Product">
            <Link href="/" className={link}>Home</Link>
            <Link href="/arena" className={link}>Arena</Link>
            <Link href="/evidence" className={link}>Evidence</Link>
            <Link href="/policy" className={link}>Policy</Link>
            <Link href="/account" className={link}>Account</Link>
          </Col>
        </div>
        <div className="lg:col-span-3">
          <Col title="On-chain">
            {v && (
              <a href={`${explorer}/address/${v}`} className={link}>
                Vault <span className="font-mono text-xs tabular-nums">{shortAddress(v)}</span> <span className="text-bronze">↗</span>
              </a>
            )}
            <a href={`${explorer}/address/${USDC}`} className={link}>
              USDC <span className="font-mono text-xs tabular-nums">{shortAddress(USDC)}</span> <span className="text-bronze">↗</span>
            </a>
            <a href={`${REPO}/blob/main/docs/ADDRESSES.md`} className={link}>Contracts</a>
            <Link href="/evidence#operator" className={link}>Operator log</Link>
          </Col>
        </div>
        <div className="lg:col-span-2">
          <Col title="Source">
            <a href={REPO} className={link}>GitHub <span className="text-bronze">↗</span></a>
            <a href="https://github.com/dadadave80/lattice" className={link}>Lattice <span className="text-bronze">↗</span></a>
            <a href={`${REPO}/blob/main/docs/OPERATIONS.md`} className={link}>Runbook</a>
            <a href={`${REPO}/blob/main/docs/PRIOR_WORK.md`} className={link}>Prior work</a>
          </Col>
        </div>
      </div>

      <section aria-labelledby="stack-title" className="mt-12 flex flex-col">
        <h2 id="stack-title" className={head}>Circle and Arc stack</h2>
        <ul className="grid grid-cols-1 border-t border-rule sm:grid-cols-2 lg:grid-cols-5">
          {STATUS.map((s, i) => (
            <li key={s.tool} className={`flex flex-col gap-1.5 border-b border-rule py-4 sm:pr-5 lg:border-b-0 ${i ? "lg:border-l lg:pl-5" : ""}`}>
              <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] ${TONE[s.status]}`}>
                <span aria-hidden="true" className={`size-1.5 ${s.status === "live" ? "bg-pay" : "border border-ink-3"}`} />
                {s.status}
              </span>
              <span className="text-sm font-medium text-ink">{s.tool}</span>
              <span className="text-[13px] leading-5 text-ink-2">{s.use}</span>
              {s.proof && (
                <a href={s.proof} className="inline-flex min-h-11 items-center self-start text-[13px] font-medium lg:min-h-6" aria-label={`Proof: ${s.proofLabel}`}>
                  Proof ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 flex flex-col gap-3 border-t border-rule pt-6 lg:flex-row lg:items-baseline lg:justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Built at Tameion · MMXXVI · Circle × Arc</span>
        <span className="max-w-[60ch] text-[13px] leading-5 text-ink-3">
          The arena is a security program, not a game of chance: no prize pool, no escalating fees, fixed micro-bounties.
        </span>
      </div>
    </footer>
  );
}
