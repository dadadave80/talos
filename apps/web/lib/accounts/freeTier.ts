import { getAddress, isAddress, type Address, type Hex, type PublicClient } from "viem";

export const FREE_PER_WALLET = 5;
export const FREE_GLOBAL_PER_DAY = 500;

/// The exact text a wallet signs for one free attempt. Binding the chain and the vault means a signature for
/// testnet or another deployment is useless here.
export const freeTierMessage = (wallet: Address, nonce: string, chainId: number, vault: Address) =>
  `I am attempting Talos, nonce ${nonce}\nwallet: ${getAddress(wallet)}\nchain: ${chainId}\nvault: ${getAddress(vault)}`;

export type FreeTierClaim = { wallet: string; nonce: string; signature: Hex };

/// Verifies an EIP-191 signature from an EOA, a deployed smart account (ERC-1271) or an undeployed one
/// (ERC-6492): viem's publicClient.verifyMessage covers all three with one eth_call. Replay and per-wallet
/// limits are enforced by the caller against Supabase (nonces primary key, bump_counter).
export async function verifyFreeTier(
  client: Pick<PublicClient, "verifyMessage">,
  claim: FreeTierClaim,
  chainId: number,
  vault: Address,
): Promise<Address | null> {
  if (!isAddress(claim.wallet) || !/^[A-Za-z0-9-]{8,64}$/.test(claim.nonce)) return null;
  const wallet = getAddress(claim.wallet);
  const ok = await client
    .verifyMessage({ address: wallet, message: freeTierMessage(wallet, claim.nonce, chainId, vault), signature: claim.signature })
    .catch(() => false);
  return ok ? wallet : null;
}
