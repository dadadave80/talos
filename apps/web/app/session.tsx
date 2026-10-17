// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye components/wallet/passkey.tsx and ConnectModal.tsx (the
// continue/login passkey flow). Talos changes: one provider for passkey and injected wallet, eth_accounts restore,
// cross-tab sync, free-attempt state from /api/attempt.
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getAddress, toHex, type Address, type Hex } from "viem";
import type { Receipt } from "@/lib/share";
import { accountFromCredential, circleConfigured, loginCredential, registerCredential, signFreeTier } from "@/lib/circleWallet";
import { AuthSheet, type SheetState } from "./auth-sheet";
import { addSession, lastSession, readStore, removeSession, signOutSession, STORE, switchTo as switchStored, type PasskeySession } from "./passkey-store";

// One sign-in for every page: a Circle Modular Wallets passkey (engye's flow) or any injected wallet. Passkeys live in
// the passkey store; a wallet is remembered under talos.wallet.v1 and restored only through eth_accounts, which never
// prompts. Other tabs follow through the storage event.

type Mode = "continue" | "create" | "login" | "switch";

export type Session = {
  ready: boolean; // false until localStorage/eth_accounts are read
  addr: Address | null;
  kind: "passkey" | "eoa" | null;
  passkey: PasskeySession | null;
  accounts: PasskeySession[]; // passkeys saved on this device
  freeLeft: number | null; // null while loading
  entries: Receipt[]; // GET /api/attempt?wallet=
  team: boolean; // a labelled team wallet: its attempts never count as external
  // `then` runs after the signed-in state has rendered; read state through a ref or a flag, not a stale closure.
  openAuth(o?: { mode?: Mode; then?: () => void }): void;
  switchTo(a: Address): void; // passkey: switch current saved account, no biometric
  forget(a: Address): void; // remove a saved passkey account from this device
  signOut(): void; // works for passkey and injected wallet
  refresh(): Promise<void>; // re-fetch entries + freeLeft
  announce(msg: string): void; // writes to one sr-only role=status region
  signMessage(message: string): Promise<Hex>; // passkey: signFreeTier; eoa: personal_sign
};

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, f: (a: string[]) => void) => void;
  removeListener?: (e: string, f: (a: string[]) => void) => void;
};
const eth = () => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Eth }).ethereum);

const WALLET = "talos.wallet.v1";
function readWallet(): Address | null {
  try {
    const a = JSON.parse(localStorage.getItem(WALLET) || "null")?.address;
    return a ? getAddress(a) : null;
  } catch {
    return null;
  }
}
function writeWallet(a: Address | null) {
  try {
    if (a) localStorage.setItem(WALLET, JSON.stringify({ address: a }));
    else localStorage.removeItem(WALLET);
  } catch {}
}

const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession() needs <SessionProvider>");
  return s;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [passkey, setPasskey] = useState<PasskeySession | null>(null);
  const [eoa, setEoa] = useState<Address | null>(null);
  const [accounts, setAccounts] = useState<PasskeySession[]>([]);
  const [entries, setEntries] = useState<Receipt[]>([]);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [team, setTeam] = useState(false);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [sheetError, setSheetError] = useState("");
  const [mode, setMode] = useState<Mode>("continue");
  const [said, setSaid] = useState("");
  const [signins, setSignins] = useState(0);
  const after = useRef<(() => void) | null>(null);
  const done = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef<Address | null>(null);
  const eoaRef = useRef<Address | null>(null);
  const addr = passkey?.address ?? eoa;
  const kind = passkey ? "passkey" : eoa ? "eoa" : null;

  // The current passkey, else a remembered wallet that eth_accounts still returns.
  const restore = useCallback(async () => {
    const s = readStore();
    const pk = s.accounts.find((a) => a.address === s.current) ?? null;
    setAccounts(s.accounts);
    setPasskey(pk);
    const saved = pk ? null : readWallet();
    const w = eth();
    if (!saved || !w) return setEoa(null);
    const live = await w.request({ method: "eth_accounts" }).then((a) => (a as string[]).map((x) => getAddress(x)), () => null);
    if (live && !live.includes(saved)) writeWallet(null);
    setEoa(live?.includes(saved) ? saved : null);
  }, []);

  useEffect(() => {
    eoaRef.current = eoa;
  }, [eoa]);

  useEffect(() => {
    // A wallet that never answers eth_accounts must not hold the header placeholder forever.
    const t = setTimeout(() => setReady(true), 1500);
    restore().finally(() => setReady(true));
    const w = eth();
    const onAccounts = (a: string[]) => {
      if (!eoaRef.current) return;
      const next = a[0] ? getAddress(a[0]) : null;
      writeWallet(next);
      setEoa(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORE || e.key === WALLET) restore();
    };
    w?.on?.("accountsChanged", onAccounts);
    addEventListener("storage", onStorage);
    return () => {
      clearTimeout(t);
      w?.removeListener?.("accountsChanged", onAccounts);
      removeEventListener("storage", onStorage);
    };
  }, [restore]);

  const load = useCallback(async (a: Address) => {
    const r = await fetch(`/api/attempt?wallet=${a}`).catch(() => null);
    if (!r?.ok) return;
    const body = (await r.json().catch(() => null)) as { entries: Receipt[]; freeLeft: number; team?: boolean } | null;
    if (!body || shown.current !== a) return;
    setEntries(body.entries);
    setFreeLeft(body.freeLeft);
    setTeam(!!body.team);
  }, []);

  useEffect(() => {
    shown.current = addr;
    setEntries([]);
    setFreeLeft(null);
    setTeam(false);
    if (addr) load(addr);
  }, [addr, load]);

  const refresh = useCallback(async () => {
    if (shown.current) await load(shown.current);
  }, [load]);

  // Runs the openAuth({then}) callback once the new session has rendered.
  useEffect(() => {
    const f = after.current;
    after.current = null;
    f?.();
  }, [signins]);

  // Closing and bumping `signins` in one render lets the sheet return focus to its opener before `then()` runs.
  const finish = useCallback(() => {
    clearTimeout(done.current ?? undefined);
    done.current = null;
    setSheet(null);
    setSignins((n) => n + 1);
  }, []);

  // `linger`: a sign-in from the sheet shows "Signed in as …" for a moment first; a switch from a menu doesn't.
  const signedIn = useCallback(
    (pk: PasskeySession | null, wallet: Address | null, linger = false) => {
      if (!pk) signOutSession();
      writeWallet(wallet);
      setPasskey(pk);
      setEoa(wallet);
      setAccounts(readStore().accounts);
      if (!linger) return finish();
      setSheet("done");
      done.current = setTimeout(finish, 800);
    },
    [finish],
  );

  // Passkey (engye's flow): "continue" reuses the last passkey on this device, else creates one; "login" picks an
  // existing one in the browser's passkey picker; "create" always makes a new one.
  const passkeyFlow = useCallback(
    async (m: "continue" | "create" | "login") => {
      setSheet("passkey");
      try {
        const known = m === "continue" ? lastSession() : null;
        const label = known?.label ?? `TALOS-${Math.random().toString(36).slice(2, 8)}`;
        const credential = known?.credential ?? (m === "login" ? await loginCredential() : await registerCredential(label));
        const account = await accountFromCredential(credential);
        signedIn(addSession({ address: account.address, credential, label }), null, true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[passkey]", e);
        const why = /NotAllowed|cancel|abort|timed out/i.test(msg) ? "The passkey prompt was cancelled" : /credentials|configured/i.test(msg) ? "Passkeys aren't enabled for this site yet; use a wallet for now" : "The passkey didn't complete";
        // Show the underlying reason too: the friendly line alone hides misconfiguration (e.g. an RP ID mismatch).
        setSheetError(`${why} (${msg.split("\n")[0].slice(0, 140)})`);
        setSheet("error");
      }
    },
    [signedIn],
  );

  const connect = useCallback(async () => {
    const w = eth();
    if (!w) {
      setSheetError("No browser wallet found. Install one (MetaMask, Rabby, Coinbase Wallet) and reload");
      return setSheet("error");
    }
    setSheet("connecting");
    try {
      const [a] = (await w.request({ method: "eth_requestAccounts" })) as string[];
      signedIn(null, getAddress(a), true);
    } catch {
      setSheetError("The wallet declined the connection");
      setSheet("error");
    }
  }, [signedIn]);

  const openAuth = useCallback((o?: { mode?: Mode; then?: () => void }) => {
    after.current = o?.then ?? null;
    setMode(o?.mode ?? "continue");
    setSheetError("");
    setSheet("open");
  }, []);

  const close = useCallback(() => {
    if (done.current) return finish();
    after.current = null;
    setSheet(null);
  }, [finish]);

  const switchTo = useCallback(
    (a: Address) => {
      const found = switchStored(a);
      if (found) signedIn(found, null);
    },
    [signedIn],
  );

  const forget = useCallback((a: Address) => {
    removeSession(a);
    setAccounts(readStore().accounts);
    setPasskey((p) => (p?.address === a ? null : p));
  }, []);

  // The extension stays connected to the site; this only forgets it here.
  const signOut = useCallback(() => {
    signOutSession();
    writeWallet(null);
    setPasskey(null);
    setEoa(null);
  }, []);

  const signMessage = useCallback(
    async (message: string): Promise<Hex> => {
      if (passkey) return signFreeTier(passkey.credential, message);
      const w = eth();
      if (!eoa || !w) throw new Error("Your wallet is no longer available; sign in again.");
      return (await w.request({ method: "personal_sign", params: [toHex(message), eoa] })) as Hex;
    },
    [passkey, eoa],
  );

  const announce = useCallback((msg: string) => {
    setSaid("");
    setTimeout(() => setSaid(msg), 50);
  }, []);

  const value = useMemo<Session>(
    () => ({ ready, addr, kind, passkey, accounts, freeLeft, entries, team, openAuth, switchTo, forget, signOut, refresh, announce, signMessage }),
    [ready, addr, kind, passkey, accounts, freeLeft, entries, team, openAuth, switchTo, forget, signOut, refresh, announce, signMessage],
  );

  return (
    <Ctx value={value}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">{said}</div>
      {sheet && (
        <AuthSheet
          state={sheet}
          mode={mode}
          error={sheetError}
          passkeys={circleConfigured()}
          onPasskey={() => passkeyFlow(mode === "continue" || mode === "create" ? mode : "login")}
          onPasskeyLogin={() => passkeyFlow("login")}
          onWallet={connect}
          onClose={close}
        />
      )}
    </Ctx>
  );
}
