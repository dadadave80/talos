// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye components/wallet/passkey.tsx.
// Talos changes: plain functions instead of a React context (app/session.tsx wraps them), Talos storage key, switchTo/removeSession/createdAt.
"use client";
// Passkey account store, built on Circle Modular Wallets (passkey-owned MSCA on Arc). Persisted in localStorage:
// the stored credential is a public id + P-256 public key, not a secret; signing always re-prompts the authenticator.
import type { Address } from "viem";
import type { StoredCredential } from "@/lib/circleWallet";

export interface PasskeySession {
  address: Address; // the Circle smart-account (MSCA) address
  credential: StoredCredential; // WebAuthn credential (id + P-256 public key); rebuilds the account
  label?: string;
  createdAt?: string; // ISO; entries saved before this field existed have none
}

export const STORE = "talos.passkey.v1";
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
  const prev = s.accounts.find((a) => a.address === session.address);
  const entry = { ...session, label: prev?.label ?? session.label, createdAt: prev ? prev.createdAt : new Date().toISOString() };
  write({ accounts: [...s.accounts.filter((a) => a.address !== session.address), entry], current: session.address });
  return entry;
}

/// Makes a saved account current without a biometric prompt (the next signature prompts).
export function switchTo(address: string) {
  const s = readStore();
  const found = s.accounts.find((a) => a.address === address) ?? null;
  if (found) write({ ...s, current: found.address });
  return found;
}

export function removeSession(address: string) {
  const s = readStore();
  write({ accounts: s.accounts.filter((a) => a.address !== address), current: s.current === address ? null : s.current });
}

export function signOutSession() {
  write({ ...readStore(), current: null });
}
