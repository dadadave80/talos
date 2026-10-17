import { parseEventLogs } from "viem";
import { publicClient, vault, vaultAbi } from "../chain";
import { db } from "../db";

const SPAN = 9_999n; // Arc rejects eth_getLogs ranges of 10k blocks or more
const MAX_CHUNKS = 24; // per call; ~1.4 days of Arc blocks

/// Mirrors new diamond events into chain_events. Idempotent (primary key on tx_hash+log_index); safe to call
/// from every /evidence request and from the hourly cycle.
export async function syncEvents() {
  const sb = db();
  const v = vault().toLowerCase();
  const { data: cur } = await sb.from("sync_cursor").select("next_block").eq("vault", v).maybeSingle();
  const from = BigInt(cur?.next_block ?? process.env.DEPLOY_BLOCK ?? 0);
  const head = await publicClient.getBlockNumber();
  if (from > head) return head;

  const ranges: [bigint, bigint][] = [];
  for (let a = from; a <= head && ranges.length < MAX_CHUNKS; a += SPAN + 1n) {
    ranges.push([a, a + SPAN > head ? head : a + SPAN]);
  }
  const logs = (
    await Promise.all(ranges.map(([fromBlock, toBlock]) => publicClient.getLogs({ address: vault(), fromBlock, toBlock })))
  ).flat();
  const rows = parseEventLogs({ abi: vaultAbi, logs, strict: false }).map((l) => ({
    tx_hash: l.transactionHash,
    log_index: l.logIndex,
    block: Number(l.blockNumber),
    name: l.eventName,
    args: JSON.parse(JSON.stringify(l.args, (_, x) => (typeof x === "bigint" ? x.toString() : x))),
  }));
  if (rows.length) {
    const { error } = await sb.from("chain_events").upsert(rows, { ignoreDuplicates: true });
    if (error) throw error;
  }
  const next = ranges[ranges.length - 1][1] + 1n;
  await sb.from("sync_cursor").upsert({ vault: v, next_block: Number(next) });
  return next - 1n;
}
