// Signing pattern adapted from engye (Lepton, pre-Tameion): server-held EOA keys from env, viem wallet client.
// Talos change: nonces come from Supabase so concurrent serverless instances sharing one key never collide.
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, publicClient } from "../chain";
import { db } from "../db";

type Account = ReturnType<typeof privateKeyToAccount>;

/// The agent key: commit, pay, queue (SessionKey grants) and Gateway/x402 signing for the VENDOR flow.
export const agentAccount = (): Account => privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
/// The hot key: commit only, used for REFUSE commits so they never queue behind payments.
export const hotAccount = (): Account => privateKeyToAccount(process.env.HOT_COMMIT_KEY as Hex);

async function nextNonce(addr: Address, resync: boolean): Promise<number> {
  const sb = db();
  if (!resync) {
    const { data } = await sb.rpc("take_nonce", { p_address: addr });
    if (data !== null && data !== undefined) return Number(data);
  }
  // First use or a nonce error: the chain's pending nonce is authoritative.
  const pending = await publicClient.getTransactionCount({ address: addr, blockTag: "pending" });
  await sb.rpc("sync_nonce", { p_address: addr, p_next: pending + 1 });
  return pending;
}

/// A sent transaction whose receipt could not be read: it may have landed, so it is never reported as reverted.
export class PendingTx extends Error {
  hash: Hex;
  constructor(hash: Hex) {
    super(`pending: ${hash}`);
    this.hash = hash;
  }
}

/// Sends one transaction and waits for its receipt; a revert throws, an unreadable receipt throws PendingTx.
/// One resync + retry on a nonce error, and only while sending: a sent tx is never sent again.
export async function sendFrom(account: Account, to: Address, data: Hex): Promise<Hex> {
  const wallet = createWalletClient({ account, chain, transport: http(publicClient.transport.url) });
  let hash: Hex;
  for (let attempt = 0; ; attempt++) {
    const nonce = await nextNonce(account.address, attempt > 0);
    try {
      hash = await wallet.sendTransaction({ to, data, nonce });
      break;
    } catch (e) {
      if (attempt === 0 && /nonce/i.test(String(e))) continue;
      throw e;
    }
  }
  const r = await publicClient
    .waitForTransactionReceipt({ hash, timeout: 60_000 })
    .catch(() => publicClient.getTransactionReceipt({ hash }).catch(() => null));
  if (!r) throw new PendingTx(hash);
  if (r.status !== "success") throw new Error(`reverted: ${hash}`);
  return hash;
}
