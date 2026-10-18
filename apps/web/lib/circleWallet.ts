// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye lib/circleWallet.ts.
// Talos changes: the passkey register/login/derive path, signFreeTier for the EIP-191 free tier, and recovery (register
// a wallet as the recovery key; restore a lost passkey with it). No transfers: a free attempt is a message, not a userOp.
"use client";
// Circle Modular Wallets — passkey-owned MSCA (ERC-4337 + ERC-6900) on Arc (testnet unless NEXT_PUBLIC_CHAIN=arc). Circle owns the WebAuthn
// ceremony (register/login against a Console-registered passkey domain) and the account derivation.
// Needs NEXT_PUBLIC_CLIENT_KEY + NEXT_PUBLIC_CLIENT_URL from the Circle Console.
import { createPublicClient, createWalletClient, custom, type Address, type EIP1193Provider, type Hex } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { createBundlerClient, toWebAuthnAccount, type WebAuthnAccount } from "viem/account-abstraction";
import {
  WebAuthnMode,
  getUserOperationGasPrice,
  recoveryActions,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  walletClientToLocalAccount,
} from "@circle-fin/modular-wallets-core";

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
  const modular = toModularTransport(`${clientUrl}/${CIRCLE_PATH}`, clientKey);
  return {
    passkeyTransport: toPasskeyTransport(clientUrl, clientKey),
    public: createPublicClient({ chain: CHAIN, transport: modular }),
    // Fees come from Circle's own gas oracle: viem's default estimate is rejected by Circle's Arc bundler (engye).
    bundler: createBundlerClient({
      chain: CHAIN,
      transport: modular,
      userOperation: {
        estimateFeesPerGas: async ({ bundlerClient }) => {
          const gp = await getUserOperationGasPrice(bundlerClient);
          return { maxFeePerGas: BigInt(gp.medium.maxFeePerGas), maxPriorityFeePerGas: BigInt(gp.medium.maxPriorityFeePerGas) };
        },
      },
    }),
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

// ---------- Recovery (Circle Modular Wallets recoveryActions), as in engye ----------
// SETUP, while the passkey still works: a wallet of the user's choice becomes the account's recovery key. The passkey
// signs the registration; the wallet only supplies its address. RESTORE, passkey lost: that wallet signs the swap of
// the account's owner to a fresh passkey. Both are user operations sponsored by Circle Gas Station.

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/\bAA33\b|paymaster (validation|deposit|balance)/i.test(msg)) return new Error(`Gas sponsorship is unavailable right now (Circle Gas Station). ${msg.split("\n")[0]}`);
  if (/AA23|AA24|signature/i.test(msg) && /recover/i.test(msg)) return new Error(`That wallet is not this account's recovery key. ${msg.split("\n")[0]}`);
  return new Error(msg.split("\n")[0]);
}

/// The account deploys on its first user operation, and a free attempt never sends one; recovery needs the contract,
/// so a sponsored no-op self-call deploys it first.
async function ensureDeployed(credential: StoredCredential) {
  const { public: client, bundler } = clients();
  const account = await accountFromCredential(credential);
  const code = await client.getCode({ address: account.address });
  if (code && code !== "0x") return;
  const hash = await bundler.sendUserOperation({ account, calls: [{ to: account.address, value: 0n, data: "0x" }], paymaster: true });
  const { receipt } = await bundler.waitForUserOperationReceipt({ hash });
  if (receipt.status !== "success") throw new Error("account deployment reverted");
}

/** Register `recoveryAddress` as the recovery key of the passkey's account (one biometric prompt per user operation).
 *  Returns the mined transaction hash. */
export async function registerRecovery(credential: StoredCredential, recoveryAddress: Address): Promise<Hex> {
  try {
    await ensureDeployed(credential);
    const { bundler } = clients();
    const account = await accountFromCredential(credential);
    const hash = await bundler.extend(recoveryActions).registerRecoveryAddress({ account, recoveryAddress, paymaster: true });
    const { receipt } = await bundler.waitForUserOperationReceipt({ hash });
    if (receipt.status !== "success") throw new Error("recovery registration reverted");
    return receipt.transactionHash;
  } catch (e) {
    throw friendly(e);
  }
}

/** Restore a lost passkey: mint a new passkey, then the registered recovery wallet signs the owner swap. Returns the
 *  new credential and the recovered account's address. */
export async function recoverWithWallet(provider: EIP1193Provider, wallet: Address, username: string): Promise<{ credential: StoredCredential; address: Address }> {
  try {
    const { passkeyTransport, public: client, bundler } = clients();
    const fresh = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Register, username });
    const walletClient = createWalletClient({ account: wallet, chain: CHAIN, transport: custom(provider) });
    const temp = await toCircleSmartAccount({ client, owner: walletClientToLocalAccount(walletClient) });
    const hash = await bundler.extend(recoveryActions).executeRecovery({ account: temp, credential: fresh, paymaster: true });
    const { receipt } = await bundler.waitForUserOperationReceipt({ hash });
    if (receipt.status !== "success") throw new Error("recovery reverted");
    const credential = strip(fresh);
    return { credential, address: (await accountFromCredential(credential)).address };
  } catch (e) {
    throw friendly(e);
  }
}
