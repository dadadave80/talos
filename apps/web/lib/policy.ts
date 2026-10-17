import { formatUnits, keccak256, toBytes, type Address } from "viem";
import { PROMPT_HASH, PROMPT_VERSION } from "./brain/prompt";
import { chain, explorer, publicClient, vault, vaultAbi } from "./chain";

const usd = (n: bigint) => formatUnits(n, 6);
const TIERS = ["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"] as const;
const VELOCITY_KEY = keccak256(toBytes("talos.velocity"));

/// /policy: every value is read from the diamond, never from config.
export async function policy() {
  const c = { address: vault(), abi: vaultAbi } as const;
  const keys = [
    { role: "agent (commit, pay, queue)", address: process.env.AGENT_ADDRESS },
    { role: "hot (commit only)", address: process.env.HOT_COMMIT_ADDRESS },
  ].filter((k): k is { role: string; address: Address } => !!k.address);
  const [p, delay, stopped, tripped, count, ...validity] = await Promise.all([
    publicClient.readContract({ ...c, functionName: "params" }),
    publicClient.readContract({ ...c, functionName: "getMinDelay" }),
    publicClient.readContract({ ...c, functionName: "isStopped" }),
    publicClient.readContract({ ...c, functionName: "isTripped", args: [VELOCITY_KEY] }),
    publicClient.readContract({ ...c, functionName: "queueCount" }),
    ...keys.map((k) => publicClient.readContract({ ...c, functionName: "sessionKeyValidity", args: [k.address] })),
  ]);
  const queue = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) => publicClient.readContract({ ...c, functionName: "queued", args: [BigInt(i)] })),
  );
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
    agentKeys: keys.map((k, i) => ({ ...k, validUntil: Number(validity[i][1]) })),
    pending: queue
      .map((q, id) => ({ id, tier: TIERS[q.tier], payee: q.payee, usdc: usd(q.amount), decisionHash: q.decisionHash, status: q.status }))
      .filter((q) => q.status === 0),
    prompt: { version: PROMPT_VERSION, hash: PROMPT_HASH },
  };
}
