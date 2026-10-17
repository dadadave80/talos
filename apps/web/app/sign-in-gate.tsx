"use client";

import { circleConfigured } from "@/lib/circleWallet";
import { useSession } from "./session";

/// Signed-out /account: one way in, then the page's outline dimmed below so the visitor sees what signing in shows.
export function SignInGate() {
  const { openAuth } = useSession();
  const passkeys = circleConfigured();
  return (
    <section aria-labelledby="account-gate" className="flex flex-col items-start gap-4 border-t border-ink pb-10 pt-6">
      <h2 id="account-gate" tabIndex={-1} className="font-display text-[28px] font-medium leading-8">
        Sign in to see your record
      </h2>
      <p className="max-w-[48ch] text-[15px] leading-[22px] text-ink-2">Five free signed attempts a day. Nothing leaves your wallet.</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <button onClick={() => openAuth({ mode: "continue" })} className="h-12 cursor-pointer bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover">
          {passkeys ? "Continue with passkey" : "Connect a wallet"}
        </button>
        {passkeys && (
          <button onClick={() => openAuth()} className="min-h-11 cursor-pointer text-[15px] font-medium text-ink underline decoration-rule underline-offset-[6px] hover:decoration-ink">
            Use a browser wallet
          </button>
        )}
      </div>
    </section>
  );
}

/// The account sections as empty rows: under the sign-in gate, and while the session is still being read.
export function AccountOutline({ sections }: { sections: string[] }) {
  return (
    <div aria-hidden="true" className="flex flex-col opacity-40">
      {sections.map((s) => (
        <div key={s} className="flex flex-col border-t border-rule pb-6 pt-3">
          <span className="smallcaps text-sm text-ink-2">{s}</span>
          <span className="mt-4 h-3 w-2/3 bg-rule" />
          <span className="mt-3 h-3 w-1/3 bg-rule" />
        </div>
      ))}
    </div>
  );
}
