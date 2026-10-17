import { formatUnits, keccak256, toBytes, type Address } from "viem";
import { FALLBACK_MODEL, MODEL } from "./brain/llm";
import { PROMPT_HASH, PROMPT_VERSION } from "./brain/prompt";
import { chain, explorer, publicClient, txUrl, vault, vaultAbi } from "./chain";
import { db } from "./db";

const usd = (n: bigint) => formatUnits(n, 6);
const TIERS = ["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"] as const;
const QUEUE_STATUS = ["pending", "approved", "rejected"] as const;
const VELOCITY_KEY = keccak256(toBytes("talos.velocity"));

/// /policy: every value is read from the diamond (or its mirrored events), never from config.
export async function policy() {
  const c = { address: vault(), abi: vaultAbi } as const;
  const keys = [
    { role: "agent", grants: "commit · pay · queue", address: process.env.AGENT_ADDRESS },
    { role: "hot", grants: "commit", address: process.env.HOT_COMMIT_ADDRESS },
  ].filter((k): k is { role: string; grants: string; address: Address } => !!k.address);
  const [p, delay, stopped, tripped, count, block, ...validity] = await Promise.all([
    publicClient.readContract({ ...c, functionName: "params" }),
    publicClient.readContract({ ...c, functionName: "getMinDelay" }),
    publicClient.readContract({ ...c, functionName: "isStopped" }),
    publicClient.readContract({ ...c, functionName: "isTripped", args: [VELOCITY_KEY] }),
    publicClient.readContract({ ...c, functionName: "queueCount" }),
    publicClient.getBlockNumber(),
    ...keys.map((k) => publicClient.readContract({ ...c, functionName: "sessionKeyValidity", args: [k.address] })),
  ]);
  const queue = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) => publicClient.readContract({ ...c, functionName: "queued", args: [BigInt(i)] })),
  );

  // Timelock and safety history from the mirrored diamond events.
  const { data: ev } = await db()
    .from("chain_events")
    .select("tx_hash,block,name,args")
    .in("name", ["CallScheduled", "CallExecuted", "Cancelled", "Resumed", "EmergencyStopped", "Queued"])
    .order("block", { ascending: false })
    .limit(500);
  const events = ev ?? [];
  const closed = new Set(events.filter((e) => e.name === "CallExecuted" || e.name === "Cancelled").map((e) => e.args.id));
  const scheduled = events.filter((e) => e.name === "CallScheduled" && !closed.has(e.args.id));
  const pendingOps = await Promise.all(
    scheduled.map(async (e) => {
      const b = await publicClient.getBlock({ blockNumber: BigInt(e.block) });
      return {
        id: e.args.id as string,
        selector: String(e.args.data).slice(0, 10),
        target: e.args.target as string,
        earliest: Number(b.timestamp) + Number(e.args.delay),
        tx: e.tx_hash as string,
        url: txUrl(e.tx_hash),
      };
    }),
  );
  const lastChange = events.find((e) => e.name === "CallExecuted");
  const queuedTx = new Map(events.filter((e) => e.name === "Queued").map((e) => [String(e.args.id), e.tx_hash as string]));

  const queueRows = queue.map((q, id) => ({
    id,
    tier: TIERS[q.tier],
    payee: q.payee,
    usdc: usd(q.amount),
    decisionHash: q.decisionHash,
    status: QUEUE_STATUS[q.status] ?? "unknown",
    tx: queuedTx.get(String(id)) ?? null,
  }));
  return {
    chainId: chain.id,
    block: block.toString(),
    vault: vault(),
    vaultUrl: `${explorer}/address/${vault()}`,
    explorer,
    timelockDelaySeconds: Number(delay),
    stopped,
    velocityTripped: tripped,
    tiers: TIERS.map((name, i) => ({ name, perTx: usd(p.perTxCap[i]), daily: usd(p.dailyCap[i]) })),
    owner: { perTx: usd(p.ownerPerTxCap), daily: usd(p.ownerDailyCap) },
    velocity: { max: Number(p.velocityMax), windowSeconds: Number(p.velocityWindow) },
    commitTtlBlocks: Number(p.commitTtl),
    agentKeys: keys.map((k, i) => ({ ...k, validUntil: Number(validity[i][1]) })),
    pendingOps,
    lastChange: lastChange ? { tx: lastChange.tx_hash as string, url: txUrl(lastChange.tx_hash), block: lastChange.block as number } : null,
    resumes: events.filter((e) => e.name === "Resumed").length,
    stops: events.filter((e) => e.name === "EmergencyStopped").length,
    queue: queueRows,
    pending: queueRows.filter((q) => q.status === "pending"),
    brain: { model: MODEL, fallback: FALLBACK_MODEL },
    prompt: { version: PROMPT_VERSION, hash: PROMPT_HASH },
  };
}
export type Policy = Awaited<ReturnType<typeof policy>>;
