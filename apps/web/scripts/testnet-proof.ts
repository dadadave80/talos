// Phase 2 exit gate on Arc testnet, with real transactions (not simulations):
//   1. pay() with no commit is mined and reverts (NotCommitted)
//   2. commit(PAY) -> pay() clears 0.25 USDC DISCRETIONARY to a labelled team wallet
//   3. the hot key commits a REFUSE
// Run from apps/web: bun scripts/testnet-proof.ts <payee>. Keys come from .env.local; nothing secret is printed.
import { createWalletClient, encodeFunctionData, http, keccak256, toBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { PROMPT_HASH } from "../lib/brain/prompt";
import { Tier, vaultAbi, Verdict } from "../lib/chain";
import { decisionHash } from "../lib/ledger/decision";

const rpc = http("https://rpc.testnet.arc.io");
const vault = process.env.TALOS_VAULT as Address;
const payee = process.argv[2] as Address;
const agent = createWalletClient({ account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex), chain: arcTestnet, transport: rpc });
const hot = createWalletClient({ account: privateKeyToAccount(process.env.HOT_COMMIT_KEY as Hex), chain: arcTestnet, transport: rpc });
const { createPublicClient } = await import("viem");
const pc = createPublicClient({ chain: arcTestnet, transport: rpc });
const url = (h: Hex) => `https://explorer.testnet.arc.io/tx/${h}`;

async function send(w: typeof agent, data: Hex, gas?: bigint) {
  const hash = await w.sendTransaction({ to: vault, data, gas });
  const r = await pc.waitForTransactionReceipt({ hash });
  return { hash, status: r.status };
}

const run = Date.now().toString(36);
const intent = (id: string, tier: Tier, amount: bigint, reason: string) => ({
  chainId: arcTestnet.id, vault, attemptId: keccak256(toBytes(id)), payee, amount, tier, reason,
  modelId: "testnet-proof/v1", promptHash: PROMPT_HASH,
});

// 1. pay without commit: fixed gas so the tx is mined and reverts on-chain instead of failing estimation
const h0 = decisionHash(intent(`proof-${run}-nocommit`, Tier.DISCRETIONARY, 250_000n, "no commit"));
const r0 = await send(agent, encodeFunctionData({ abi: vaultAbi, functionName: "pay", args: [h0, Tier.DISCRETIONARY, payee, 250_000n] }), 200_000n);
console.log(`1. pay without commit: ${r0.status} ${url(r0.hash)}`);

// 2. commit(PAY) then pay
const i1 = intent(`proof-${run}-pay`, Tier.DISCRETIONARY, 250_000n, "Testnet proof: commit-before-pay clears within the DISCRETIONARY cap");
const h1 = decisionHash(i1);
const c1 = await send(agent, encodeFunctionData({ abi: vaultAbi, functionName: "commit", args: [h1, Verdict.PAY, i1.attemptId] }));
const p1 = await send(agent, encodeFunctionData({ abi: vaultAbi, functionName: "pay", args: [h1, Tier.DISCRETIONARY, payee, 250_000n] }));
console.log(`2. commit(PAY): ${c1.status} ${url(c1.hash)}\n   pay 0.25 USDC: ${p1.status} ${url(p1.hash)}\n   decisionHash ${h1}`);

// 3. REFUSE from the hot key
const i2 = intent(`proof-${run}-refuse`, Tier.DISCRETIONARY, 250_000n, "Testnet proof: refusal committed by the commit-only hot key");
const h2 = decisionHash(i2);
const c2 = await send(hot, encodeFunctionData({ abi: vaultAbi, functionName: "commit", args: [h2, Verdict.REFUSE, i2.attemptId] }));
console.log(`3. hot-key commit(REFUSE): ${c2.status} ${url(c2.hash)}\n   decisionHash ${h2}`);
