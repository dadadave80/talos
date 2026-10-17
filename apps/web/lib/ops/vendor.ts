import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { encodeFunctionData, erc20Abi, formatUnits, parseAbi, parseUnits, type Address } from "viem";
import { arc } from "viem/chains";
import { chain, USDC, vault } from "../chain";
import { agentAccount, sendFrom } from "../signers/send";

/// Circle's GatewayWallet (developers.circle.com/gateway/references/contract-addresses; same in the x402-batching SDK).
export const GATEWAY_WALLET: Address =
  chain.id === arc.id ? "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE" : "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_API = chain.id === arc.id ? "https://gateway-api.circle.com/v1" : "https://gateway-api-testnet.circle.com/v1";
const ARC_DOMAIN = 26;
const gatewayAbi = parseAbi(["function deposit(address token, uint256 value)"]);

/// Most the agent will sign for a single x402 purchase (6-decimal USDC). Quicknode's Arc RPC read is 0.0001.
export const MAX_PER_PURCHASE = 10_000n;

/// approve + deposit into Gateway from the agent key (credited on Arc in ~0.5 s).
export async function gatewayDeposit(amount: bigint) {
  const approveTx = await sendFrom(agentAccount(), USDC, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [GATEWAY_WALLET, amount] }));
  const depositTx = await sendFrom(agentAccount(), GATEWAY_WALLET, encodeFunctionData({ abi: gatewayAbi, functionName: "deposit", args: [USDC, amount] }));
  return { approveTx, depositTx };
}

/// The depositor's available Gateway balance on Arc, from Circle's Gateway API (read-only, no key).
export async function gatewayBalance(depositor: Address) {
  const res = await fetch(`${GATEWAY_API}/balances`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "USDC", sources: [{ domain: ARC_DOMAIN, depositor }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const balance = (await res.json().catch(() => null))?.balances?.[0]?.balance;
  if (!res.ok || typeof balance !== "string") throw new Error(`gateway balances ${res.status}`);
  return parseUnits(balance, 6);
}

/// What each known seller is asked for. Unknown sellers are refused rather than sent a guessed body.
/// Quicknode: one JSON-RPC read on its Arc node (the vault's USDC balance); Arc is nanopayment-only there.
/// BotPay: a paid receipt, the other Gateway-batched seller on Arc testnet in Circle's discovery catalog.
export function vendorRequest(url: string) {
  const host = new URL(url).host;
  if (host === "x402.quicknode.com") {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [vault()] });
    return {
      seller: "Quicknode",
      item: "Arc RPC read",
      method: "POST",
      body: { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC, data }, "latest"] } as unknown,
      read: (d: { result?: unknown }) => (typeof d?.result === "string" && /^0x[0-9a-f]+$/i.test(d.result) ? `vault holds ${formatUnits(BigInt(d.result), 6)} USDC` : null),
    };
  }
  if (host === "api.botpay.network")
    return { seller: "BotPay", item: "paid receipt", method: "GET", body: undefined as unknown, read: (d: { receiptId?: unknown }) => (d?.receiptId ? `receipt ${String(d.receiptId)}` : null) };
  throw new Error(`no request defined for x402 seller ${host}`);
}

type Option = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string; verifyingContract?: string };
};
type Required = { x402Version?: number; resource?: unknown; accepts?: Option[] };

/// The option x402Buy would sign, or why none: Gateway batching v1 on this chain, against Circle's GatewayWallet,
/// at or under the cap. Mirrors GatewayClient.supports() plus the contract and price checks.
export function pick(required: Required): { option: Option; why: null } | { option: null; why: string } {
  const network = `eip155:${chain.id}`;
  const batched = (required.accepts ?? []).filter((o) => o.network === network && o.extra?.name === "GatewayWalletBatched" && o.extra.version === "1");
  if (!batched.length) return { option: null, why: `no GatewayWalletBatched v1 option on ${network}` };
  const option = batched.find((o) => o.extra?.verifyingContract?.toLowerCase() === GATEWAY_WALLET.toLowerCase());
  if (!option) return { option: null, why: `verifyingContract is not Circle's GatewayWallet ${GATEWAY_WALLET}` };
  if (BigInt(option.amount) > MAX_PER_PURCHASE)
    return { option: null, why: `price ${formatUnits(BigInt(option.amount), 6)} USDC is above the ${formatUnits(MAX_PER_PURCHASE, 6)} USDC cap` };
  return { option, why: null };
}

const fromB64 = (s: string) => JSON.parse(Buffer.from(s, "base64").toString("utf8"));
const send = (url: string, method: string, body: unknown, extra: Record<string, string> = {}) =>
  fetch(url, {
    method,
    headers: { "content-type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

/// The unpaid first request only: the seller's 402 challenge, decoded, and what pick() makes of it. Signs nothing.
export async function quote(url: string) {
  const req = vendorRequest(url);
  const res = await send(url, req.method, req.body);
  const header = res.headers.get("PAYMENT-REQUIRED");
  const required: Required | null = res.status !== 402 ? null : header ? fromB64(header) : await res.json().catch(() => null);
  const why = res.status !== 402 ? `expected 402, got ${res.status}` : "402 without a readable PAYMENT-REQUIRED challenge";
  const choice = required ? pick(required) : ({ option: null, why } as const);
  return { req, status: res.status, required, ...choice };
}

/// Buys one x402 resource through Gateway batching (mirrors GatewayClient.pay, with the agent key and the cap).
/// Returns the settlement id only: Quicknode's PAYMENT-RESPONSE also carries a session JWT that must not be logged.
export async function x402Buy(url: string) {
  const q = await quote(url);
  if (!q.option || !q.required) throw new Error(`${new URL(url).host}: ${q.why}`);
  const payload = await new BatchEvmScheme(agentAccount()).createPaymentPayload(q.required.x402Version ?? 2, q.option);
  const signature = Buffer.from(JSON.stringify({ ...payload, resource: q.required.resource, accepted: q.option })).toString("base64");
  const paid = await send(url, q.req.method, q.req.body, { "Payment-Signature": signature });
  const settle = paid.headers.get("PAYMENT-RESPONSE");
  const receipt = settle ? fromB64(settle) : null;
  if (!paid.ok) throw new Error(`${new URL(url).host} refused the paid request: ${paid.status} ${(await paid.text().catch(() => "")).slice(0, 120)}`);
  // Paid for by now: a body that is not JSON must not stop the purchase from being logged.
  const data = await paid.json().catch(() => null);
  return {
    seller: q.req.seller,
    item: q.req.item,
    result: q.req.read(data),
    amount: BigInt(q.option.amount),
    payTo: q.option.payTo,
    network: q.option.network,
    settlement: typeof receipt?.transaction === "string" && receipt.transaction ? (receipt.transaction as string) : null,
  };
}
