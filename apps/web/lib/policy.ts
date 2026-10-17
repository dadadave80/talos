import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatUnits, keccak256, toBytes, type Address } from "viem";
import { chain, explorer, publicClient, vault, vaultAbi } from "./chain";

const usd = (n: bigint) => formatUnits(n, 6);
const TIERS = ["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"] as const;
const VELOCITY_KEY = keccak256(toBytes("talos.velocity"));

export const promptHash = () => keccak256(readFileSync(join(process.cwd(), "lib/brain/prompt.md")));

/// /policy: every value is read from the diamond, never from config.
export async function policy() {
  const c = { address: vault(), abi: vaultAbi } as const;
  const keys = [process.env.CIRCLE_AGENT_WALLET_ADDRESS, process.env.HOT_COMMIT_ADDRESS] as Address[];
  const [p, delay, stopped, tripped, count, ...validity] = await Promise.all([
    publicClient.readContract({ ...c, functionName: "params" }),
    publicClient.readContract({ ...c, functionName: "getMinDelay" }),
    publicClient.readContract({ ...c, functionName: "isStopped" }),
    publicClient.readContract({ ...c, functionName: "isTripped", args: [VELOCITY_KEY] }),
    publicClient.readContract({ ...c, functionName: "queueCount" }),
    ...keys.map((k) => publicClient.readContract({ ...c, functionName: "sessionKeyValidity", args: [k] })),
  ]);
  const queue = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) => publicClient.readContract({ ...c, functionName: "queued", args: [BigInt(i)] })),
  );
  let prompt: string | null = null;
  try {
    prompt = promptHash();
  } catch {}
  return {
    chainId: chain.id,
    vault: vault(),
    vaultUrl: `${explorer}/address/${vault()}`,
    timelockDelaySeconds: Number(delay),
    stopped,
    velocityTripped: tripped,
    tiers: TIERS.map((name, i) => ({ name, perTx: usd(p.perTxCap[i]), daily: usd(p.dailyCap[i]) })),
    owner: { perTx: usd(p.ownerPerTxCap), daily: usd(p.ownerDailyCap) },
    velocity: { max: Number(p.velocityMax), windowSeconds: Number(p.velocityWindow) },
    commitTtlBlocks: Number(p.commitTtl),
    agentKeys: keys.map((k, i) => ({ role: i ? "hot (commit only)" : "agent (commit, pay, queue)", address: k, validUntil: Number(validity[i][1]) })),
    pending: queue
      .map((q, id) => ({ id, tier: TIERS[q.tier], payee: q.payee, usdc: usd(q.amount), decisionHash: q.decisionHash, status: q.status }))
      .filter((q) => q.status === 0),
    promptHash: prompt,
  };
}
