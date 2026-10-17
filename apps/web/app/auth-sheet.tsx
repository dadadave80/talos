"use client";

import { useEffect, useRef, useState } from "react";
import { shortAddress } from "./address";
import { useSession } from "./session";

export type SheetState = "open" | "passkey" | "connecting" | "error" | "done";
type Mode = "continue" | "create" | "login" | "switch" | "wallet";

// Safari and iOS don't focus a button on click, so the control last clicked stands in for document.activeElement.
let clicked: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    clicked = e.target instanceof Element ? e.target.closest<HTMLElement>("button, a[href], [tabindex]") : null;
  }, true);
}

const quiet = "inline-flex min-h-11 cursor-pointer items-center font-sans text-[13px] font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink disabled:cursor-wait lg:min-h-8";

/// Design: Sheets and States, sign-in sheet. A native modal <dialog>: showModal gives the focus trap, the inert page
/// and Esc. The primary action is a Circle Modular Wallets passkey; a browser wallet is the equal second. Both only
/// ever sign messages for free attempts. Driven by app/session.tsx (it renders inside the provider, so it reads the
/// saved accounts itself); closing returns focus to whatever opened it, else to the header's account button. `mode` is
/// optional so older callers still fit.
export function AuthSheet(p: {
  state: SheetState; error: string; passkeys: boolean; mode?: Mode;
  onPasskey: () => void; onPasskeyLogin: () => void; onWallet: () => void; onClose: () => void;
}) {
  const { addr, passkey, accounts, freeLeft, switchTo, forget, announce } = useSession();
  // "wallet" is "continue" opened from a browser-wallet button: the wallet button is the first action.
  const wallet = p.mode === "wallet";
  const mode = p.mode === "wallet" ? "continue" : (p.mode ?? "continue");
  const [view, setView] = useState<"main" | "switch">(mode === "switch" ? "switch" : "main");
  const dialog = useRef<HTMLDialogElement>(null);
  const down = useRef<EventTarget | null>(null);
  const busy = p.state === "passkey" || p.state === "connecting";
  const failed = p.state === "error";

  useEffect(() => {
    const d = dialog.current;
    const active = document.activeElement as HTMLElement | null;
    const opener = active && active !== document.body ? active : clicked;
    if (d && !d.open) d.showModal();
    return () => {
      (opener?.isConnected ? opener : document.getElementById("account-button"))?.focus();
    };
  }, []);

  // Focus the first live control on open, on a view change, and after a failure re-enables the buttons.
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("[data-first]:not(:disabled)")?.focus();
  }, [view, failed, accounts.length]);

  const last = accounts.at(-1) ?? null;
  const pick = mode === "login" || mode === "switch";
  const host = typeof location === "undefined" ? "this site" : location.hostname;
  const title = view === "switch" ? "Switch passkey" : p.state === "done" ? "Signed in" : mode === "create" ? "Add a passkey" : "Sign in";
  const cancelled = p.error.startsWith("The passkey prompt was cancelled");

  return (
    <dialog
      ref={dialog}
      aria-labelledby="auth-title"
      onClose={p.onClose}
      onPointerDown={(e) => (down.current = e.target)}
      onClick={(e) => {
        // Only a press that starts and ends on the backdrop closes; a text selection dragged out of the sheet doesn't.
        if (e.target === e.currentTarget && down.current === e.currentTarget) p.onClose();
      }}
      className="auth-sheet m-0 mt-auto w-full max-w-none border-0 bg-transparent p-0 text-ink lg:m-auto lg:w-[440px]"
    >
      <div className="sheet-in relative flex flex-col gap-3.5 rounded-t-md border-t border-ink bg-raised px-6 pb-8 pt-3 lg:rounded-md lg:border lg:border-rule">
        <h2 id="auth-title" className="pr-10 pt-2.5 font-display text-[28px] font-medium leading-8">{title}</h2>

        {view === "switch" ? (
          <>
            <ul className="flex flex-col border-b border-rule">
              {[...accounts].reverse().map((a) => {
                const on = passkey?.address === a.address;
                return (
                  <li key={a.address} className="flex h-12 items-center gap-3 border-t border-rule">
                    <button
                      type="button"
                      data-first
                      disabled={on || busy}
                      onClick={() => switchTo(a.address)}
                      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-default"
                    >
                      <span className="font-mono text-sm tabular-nums text-ink" title={a.address}>{shortAddress(a.address)}</span>
                      {a.label && <span className="truncate text-[13px] text-ink-3">{a.label}</span>}
                    </button>
                    {on ? (
                      <span className="smallcaps text-[13px] text-pay">Current</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          forget(a.address);
                          announce(`Forgot ${shortAddress(a.address)} on this device`);
                        }}
                        aria-label={`Forget ${shortAddress(a.address)} on this device`}
                        className={quiet}
                      >
                        Forget
                      </button>
                    )}
                  </li>
                );
              })}
              {!accounts.length && <li className="border-t border-rule py-3 text-[13px] text-ink-3">No passkeys are saved on this device.</li>}
            </ul>
            <p className="text-[13px] leading-5 text-ink-3">
              Switching asks for nothing; your next signature does. Forget removes a passkey from this device only; it stays in your password manager.
            </p>
            <button type="button" data-first onClick={() => setView("main")} className="h-11 cursor-pointer self-start text-[15px] font-medium text-ink underline decoration-rule underline-offset-[6px]">
              ← Back
            </button>
          </>
        ) : p.state === "done" ? (
          // WalletControl announces the sign-in once, from the header.
          <p className="font-mono text-sm tabular-nums text-ink">
            Signed in as {addr ? shortAddress(addr) : "…"}
            {freeLeft != null && ` · ${freeLeft} free attempt${freeLeft === 1 ? "" : "s"} today`}
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-[22px] text-ink-2">Talos only pays the wallet that signs. Signing is free and moves nothing.</p>
            {p.passkeys ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  data-first={wallet ? undefined : true}
                  onClick={pick ? p.onPasskeyLogin : p.onPasskey}
                  disabled={busy}
                  className="h-12 cursor-pointer bg-bronze px-6 text-base font-semibold text-bg hover:bg-bronze-hover disabled:cursor-wait disabled:bg-rule disabled:text-ink"
                >
                  {p.state === "passkey" ? "Confirm on your device…" : mode === "create" ? "Create a passkey" : pick ? "Sign in with a passkey" : "Continue with passkey"}
                </button>
                <span className="text-center text-[13px] text-ink-3">Circle smart account · no extension · no seed phrase</span>
              </div>
            ) : (
              <p className="text-[13px] leading-5 text-ink-3">Passkey sign-in isn&apos;t switched on for this deployment; use a browser wallet.</p>
            )}
            {p.passkeys && mode === "continue" && last && (
              <p className="flex flex-wrap items-center gap-x-4 text-[13px] text-ink-2">
                <span className="font-mono text-xs tabular-nums" title={last.address}>Continues as {shortAddress(last.address)}</span>
                {accounts.length > 1 && (
                  <button type="button" onClick={() => setView("switch")} disabled={busy} className={quiet}>
                    Switch
                  </button>
                )}
                <button type="button" onClick={p.onPasskeyLogin} disabled={busy} className={quiet}>
                  Use another passkey
                </button>
              </p>
            )}
            <button
              type="button"
              data-first={p.passkeys && !wallet ? undefined : true}
              onClick={p.onWallet}
              disabled={busy}
              className="h-12 cursor-pointer border border-ink text-base font-semibold text-ink hover:bg-bg disabled:cursor-wait disabled:border-rule disabled:text-ink-3"
            >
              {p.state === "connecting" ? "Approve in your wallet…" : "Use a browser wallet"}
            </button>
            {p.passkeys && mode === "continue" && !last && (
              <button type="button" onClick={p.onPasskeyLogin} disabled={busy} className="h-11 cursor-pointer text-[15px] font-medium text-ink underline decoration-rule underline-offset-[6px] disabled:cursor-wait">
                Already have a passkey? Sign in
              </button>
            )}
            {failed && (
              <p role="alert" className="text-[13px] leading-5 text-refuse">
                {cancelled ? "You closed the passkey prompt. Nothing was created." : `${p.error}. Try again.`}
              </p>
            )}
            {p.passkeys && (
              <p className="text-[13px] leading-5 text-ink-3">
                Your device asks for your fingerprint, face or screen lock. The passkey stays in your password manager, bound to {host}.
              </p>
            )}
          </>
        )}
        {/* Last in the DOM so opening focuses the sheet's first action, not Close. */}
        <button type="button" onClick={p.onClose} aria-label="Close" className="absolute right-3 top-3 flex size-11 cursor-pointer items-center justify-center text-ink-2 hover:text-ink">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>
    </dialog>
  );
}
