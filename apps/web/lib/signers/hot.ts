import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, publicClient } from "../chain";
import { db } from "../db";

const account = () => privateKeyToAccount(process.env.HOT_COMMIT_KEY as Hex);

async function nextNonce(addr: Address, resync: boolean): Promise<number> {
  const sb = db();
  if (!resync) {
    const { data } = await sb.rpc("take_hot_nonce", { p_address: addr });
    if (data !== null && data !== undefined) return Number(data);
  }
  // First use or a nonce error: the chain's pending nonce is authoritative.
  const pending = await publicClient.getTransactionCount({ address: addr, blockTag: "pending" });
  await sb.rpc("sync_hot_nonce", { p_address: addr, p_next: pending + 1 });
  return pending;
}

/// Commit-only hot key: REFUSE commits go out from here so they never wait on Circle's MPC signer. Nonces come
/// from Supabase so concurrent serverless instances do not collide; one resync + retry on a nonce error.
export async function hotSend(to: Address, data: Hex): Promise<Hex> {
  const acct = account();
  const wallet = createWalletClient({ account: acct, chain, transport: http(publicClient.transport.url) });
  for (let attempt = 0; ; attempt++) {
    const nonce = await nextNonce(acct.address, attempt > 0);
    try {
      const hash = await wallet.sendTransaction({ to, data, nonce });
      const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (r.status !== "success") throw new Error(`hot commit reverted: ${hash}`);
      return hash;
    } catch (e) {
      if (attempt === 0 && /nonce/i.test(String(e))) continue;
      throw e;
    }
  }
}
