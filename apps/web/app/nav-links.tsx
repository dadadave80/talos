"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGES = [
  ["Arena", "/"],
  ["Evidence", "/evidence"],
  ["Policy", "/policy"],
  ["Account", "/account"],
] as const;

// The active item follows the URL, so the header can live in the layout; receipts (/v/*) mark none.
export function NavLinks() {
  const path = usePathname();
  return PAGES.map(([label, href]) => {
    const on = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        aria-current={on ? "page" : undefined}
        className={`flex h-11 flex-none items-center px-4 underline-offset-[6px] max-lg:focus-visible:-outline-offset-2 lg:h-14 lg:px-0 ${on ? "text-ink underline decoration-bronze" : "text-ink-2 hover:text-ink"}`}
      >
        {label}
      </Link>
    );
  });
}
