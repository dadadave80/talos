// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye lib/circleWallet.ts.
// Talos changes: only the passkey register/login/derive path is kept (no userOps, Gas Station, transfers or
// recovery: a free attempt is a signed message, not a transaction), plus signFreeTier for the EIP-191 free tier.
"use client";
// Circle Modular Wallets — passkey-owned MSCA (ERC-4337 + ERC-6900) on Arc (testnet unless NEXT_PUBLIC_CHAIN=arc). Circle owns the WebAuthn
// ceremony (register/login against a Console-registered passkey domain) and the account derivation.
// Needs NEXT_PUBLIC_CLIENT_KEY + NEXT_PUBLIC_CLIENT_URL from the Circle Console.
import { createPublicClient, type Hex } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { toWebAuthnAccount, type WebAuthnAccount } from "viem/account-abstraction";
import { WebAuthnMode, toCircleSmartAccount, toModularTransport, toPasskeyTransport, toWebAuthnCredential } from "@circle-fin/modular-wallets-core";

const CLIENT_KEY = process.env.NEXT_PUBLIC_CLIENT_KEY;
// Circle bakes the chain id into every replay-safe signature, so this must match the server's CHAIN.
const MAINNET = process.env.NEXT_PUBLIC_CHAIN === "arc";
const CHAIN = MAINNET ? arc : arcTestnet;
const CIRCLE_PATH = MAINNET ? "arc" : "arcTestnet";
const CLIENT_URL = process.env.NEXT_PUBLIC_CLIENT_URL;

/** Persistable WebAuthn credential (strip the non-serializable `raw` PublicKeyCredential). */
export interface StoredCredential { id: string; publicKey: Hex; rpId?: string }

/** True when the Circle Console values are wired — the passkey option is disabled otherwise. */
export const circleConfigured = () => !!CLIENT_KEY && !!CLIENT_URL;

function requireConfig() {
  if (!CLIENT_KEY || !CLIENT_URL) throw new Error("Passkey sign-in isn't configured yet (CLIENT_KEY/CLIENT_URL).");
  return { clientKey: CLIENT_KEY, clientUrl: CLIENT_URL };
}

function clients() {
  const { clientKey, clientUrl } = requireConfig();
  return {
    passkeyTransport: toPasskeyTransport(clientUrl, clientKey),
    public: createPublicClient({ chain: CHAIN, transport: toModularTransport(`${clientUrl}/${CIRCLE_PATH}`, clientKey) }),
  };
}

const strip = (c: { id: string; publicKey: Hex; rpId?: string }): StoredCredential => ({ id: c.id, publicKey: c.publicKey, rpId: c.rpId });

/** Register a NEW passkey (device biometrics via the Console-registered domain). */
export async function registerCredential(username: string): Promise<StoredCredential> {
  const { passkeyTransport } = clients();
  return strip(await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Register, username }));
}

/** Sign in with an EXISTING passkey (the browser/GPM shows the account picker). */
export async function loginCredential(): Promise<StoredCredential> {
  const { passkeyTransport } = clients();
  return strip(await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login }));
}

/** Deterministic MSCA for a stored credential (view-only; no biometric prompt). */
export async function accountFromCredential(credential: StoredCredential) {
  const { public: client } = clients();
  const owner = toWebAuthnAccount({ credential: credential as unknown as Parameters<typeof toWebAuthnAccount>[0]["credential"] }) as WebAuthnAccount;
  return toCircleSmartAccount({ client, owner });
}

/** Sign the free-attempt message with the passkey (one biometric prompt). The MSCA deploys lazily on its first
 *  userOp, which a free attempt never sends; viem's smart-account signMessage already wraps an undeployed account's
 *  signature in ERC-6492, so the server's verifyMessage simulates the deploy and checks it
 *  (scripts/circle-6492-check.ts proves this on Arc testnet). */
export async function signFreeTier(credential: StoredCredential, message: string): Promise<Hex> {
  const account = await accountFromCredential(credential);
  return account.signMessage({ message });
}
