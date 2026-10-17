// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye components/wallet/passkey.tsx.
// Talos changes: plain functions instead of a React context (one page uses it), Talos storage key.
"use client";
// Passkey account store, built on Circle Modular Wallets (passkey-owned MSCA on Arc). Persisted in localStorage:
// the stored credential is a public id + P-256 public key, not a secret; signing always re-prompts the authenticator.
import type { Address } from "viem";
import type { StoredCredential } from "@/lib/circleWallet";

export interface PasskeySession {
  address: Address; // the Circle smart-account (MSCA) address
  credential: StoredCredential; // WebAuthn credential (id + P-256 public key); rebuilds the account
  label?: string;
}

const STORE = "talos.passkey.v1";
interface Store { accounts: PasskeySession[]; current: string | null }

export function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "") || { accounts: [], current: null };
  } catch {
    return { accounts: [], current: null };
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {} // private mode: the session lasts for this page only
}

export const currentSession = () => {
  const s = readStore();
  return s.accounts.find((a) => a.address === s.current) ?? null;
};
export const lastSession = () => readStore().accounts.at(-1) ?? null;

export function addSession(session: PasskeySession) {
  const s = readStore();
  write({ accounts: [...s.accounts.filter((a) => a.address !== session.address), session], current: session.address });
}

export function signOutSession() {
  write({ ...readStore(), current: null });
}
