import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";

let client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | undefined;
export const circle = () =>
  (client ??= initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.ENTITY_SECRET!,
  }));

/// Sends calldata from the agent's Circle EOA (key held in Circle's MPC) and waits until it is in a block.
/// Rejects on FAILED / DENIED / CANCELLED / STUCK, so a revert surfaces as an error, never a silent success.
export async function circleSend(to: Address, callData: Hex, refId: string): Promise<Hex> {
  const c = circle();
  const res = await c.createContractExecutionTransaction({
    walletId: process.env.CIRCLE_AGENT_WALLET_ID!,
    contractAddress: to,
    callData,
    refId,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  const id = res.data?.id;
  if (!id) throw new Error("circle: no transaction id");
  const tx = await c.getTransaction({ id, waitForState: "CONFIRMED", pollingInterval: 500, signal: AbortSignal.timeout(90_000) });
  const hash = tx.data?.transaction?.txHash;
  if (!hash) throw new Error(`circle: ${id} confirmed without a hash`);
  return hash as Hex;
}
