import { encodeFunctionData, formatUnits, keccak256, parseAbi, parseUnits, toBytes, type Address, type Hex } from "viem";
import { PROMPT_HASH } from "./brain/prompt";
import { chain, publicClient, Tier, USDC, vault, vaultAbi, Verdict } from "./chain";
import { decisionHash } from "./ledger/decision";
import { budgetKey } from "./ledger/evidence";
import { agentAccount, hotAccount, PendingTx, sendFrom } from "./signers/send";

const VELOCITY_KEY = keccak256(toBytes("talos.velocity"));
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const c = () => ({ address: vault(), abi: vaultAbi }) as const;

export const attemptRef = (attemptId: string) => keccak256(toBytes(attemptId));

/// Error text safe for the public logs: viem's short message, with URLs (they can carry RPC keys) removed.
export const clean = (e: unknown) =>
  String((e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : e))
    .replace(/https?:\/\/\S+/g, "<url>")
    .slice(0, 160);

export async function getBalances() {
  const agent = agentAccount().address;
  const hot = hotAccount().address;
  const [vaultUsdc, agentGas, hotGas, tripped, stopped, ...avail] = await Promise.all([
    publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [vault()] }),
    publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [agent] }),
    publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [hot] }),
    publicClient.readContract({ ...c(), functionName: "isTripped", args: [VELOCITY_KEY] }),
    publicClient.readContract({ ...c(), functionName: "isStopped" }),
    ...[Tier.CONTRIBUTOR, Tier.VENDOR, Tier.DISCRETIONARY].map((t) =>
      publicClient.readContract({ ...c(), functionName: "getAvailable", args: [budgetKey(t)] }),
    ),
  ]);
  return {
    vaultUsdc,
    agentGasUsdc: agentGas,
    hotGasUsdc: hotGas,
    remaining: { CONTRIBUTOR: avail[0], VENDOR: avail[1], DISCRETIONARY: avail[2] },
    tripped,
    stopped,
  };
}

export type Intent = { attemptId: string; tier: Tier; payee: Address; amount: bigint; reason: string; model: string };

const hashOf = (i: Intent) =>
  decisionHash({
    chainId: chain.id,
    vault: vault(),
    attemptId: attemptRef(i.attemptId),
    payee: i.payee,
    amount: i.amount,
    tier: i.tier,
    reason: i.reason,
    modelId: i.model,
    promptHash: PROMPT_HASH,
  });

/// Off-chain mirror of TreasuryPolicyFacet.pay's checks, to avoid spending gas on a commit that cannot clear.
/// Returns null when the payment should clear, else why not ("queue:" = a human may approve it).
export async function precheckPay(i: Intent): Promise<string | null> {
  const [p, stopped, tripped, available, allowed] = await Promise.all([
    publicClient.readContract({ ...c(), functionName: "params" }),
    publicClient.readContract({ ...c(), functionName: "isStopped" }),
    publicClient.readContract({ ...c(), functionName: "isTripped", args: [VELOCITY_KEY] }),
    publicClient.readContract({ ...c(), functionName: "getAvailable", args: [budgetKey(i.tier)] }),
    i.tier === Tier.DISCRETIONARY
      ? Promise.resolve(true)
      : publicClient.readContract({ ...c(), functionName: "isAllowlisted", args: [i.tier, i.payee] }),
  ]);
  if (stopped) return "vault paused by the owner";
  if (tripped) return "velocity breaker tripped";
  if (i.amount > p.perTxCap[i.tier]) return `queue:above the ${formatUnits(p.perTxCap[i.tier], 6)} USDC tier cap`;
  if (!allowed) return "queue:payee not allowlisted";
  if (i.amount > available) return "daily budget exhausted";
  return null;
}

const send = (data: Hex, _ref: string) => sendFrom(agentAccount(), vault(), data);

/// commit(PAY) then pay(), both from the agent key. A failed pay() (cap, blocklisted payee, anything)
/// is a failed attempt: the decision hash is never retried. pending = sent, receipt unknown (it may have landed).
export async function pay(i: Intent) {
  const h = hashOf(i);
  const commitTx = await send(encodeFunctionData({ abi: vaultAbi, functionName: "commit", args: [h, Verdict.PAY, attemptRef(i.attemptId)] }), `commit-${i.attemptId}`);
  try {
    const payTx = await send(encodeFunctionData({ abi: vaultAbi, functionName: "pay", args: [h, i.tier, i.payee, i.amount] }), `pay-${i.attemptId}`);
    return { decisionHash: h, commitTx, payTx, pending: null, failed: null };
  } catch (e) {
    if (e instanceof PendingTx) return { decisionHash: h, commitTx, payTx: null, pending: e.hash, failed: null };
    return { decisionHash: h, commitTx, payTx: null, pending: null, failed: clean(e) };
  }
}

/// commit(QUEUE) then queue(); the owner approves or rejects on /policy (cut list item 4: no push card).
export async function queueForHuman(i: Intent) {
  const h = hashOf(i);
  const commitTx = await send(encodeFunctionData({ abi: vaultAbi, functionName: "commit", args: [h, Verdict.QUEUE, attemptRef(i.attemptId)] }), `commit-${i.attemptId}`);
  const queueTx = await send(
    encodeFunctionData({ abi: vaultAbi, functionName: "queue", args: [h, i.tier, i.payee, i.amount, i.reason.slice(0, 280)] }),
    `queue-${i.attemptId}`,
  );
  return { decisionHash: h, commitTx, queueTx };
}

/// commit(REFUSE) from the hot commit-only key.
export async function refuse(i: Intent) {
  const h = hashOf(i);
  const commitTx = await sendFrom(hotAccount(), vault(), encodeFunctionData({ abi: vaultAbi, functionName: "commit", args: [h, Verdict.REFUSE, attemptRef(i.attemptId)] }));
  return { decisionHash: h, commitTx };
}

export const usdc = (s: string | number) => parseUnits(String(s), 6);
