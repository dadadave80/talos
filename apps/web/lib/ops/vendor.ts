import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { encodeFunctionData, erc20Abi, parseAbi, recoverTypedDataAddress, isAddressEqual, type Address, type Hex } from "viem";
import { arc } from "viem/chains";
import { chain, USDC } from "../chain";
import { circle, circleSend } from "../signers/circle";

const GATEWAY_WALLET: Address =
  chain.id === arc.id ? "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE" : "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const gatewayAbi = parseAbi(["function deposit(address token, uint256 value)"]);

/// Most the agent will sign for a single x402 purchase (6-decimal USDC). Exa search is $0.007.
const MAX_PER_PURCHASE = 50_000n;

type Typed = Parameters<ConstructorParameters<typeof BatchEvmScheme>[0]["signTypedData"]>[0];

const DOMAIN_FIELDS = [
  ["name", "string"],
  ["version", "string"],
  ["chainId", "uint256"],
  ["verifyingContract", "address"],
] as const;

/// BatchEvmSigner over Circle's sign-typed-data API: the agent's key never leaves Circle's MPC.
export const circleBatchSigner = () => {
  const address = process.env.CIRCLE_AGENT_WALLET_ADDRESS as Address;
  return {
    address,
    async signTypedData(t: Typed): Promise<Hex> {
      const d = t as Typed & { message: Record<string, unknown> };
      const domain = d.domain as Record<string, unknown>;
      const data = JSON.stringify(
        {
          types: { EIP712Domain: DOMAIN_FIELDS.filter(([k]) => domain[k] !== undefined).map(([name, type]) => ({ name, type })), ...d.types },
          domain,
          primaryType: d.primaryType,
          message: d.message,
        },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
      );
      const res = await circle().signTypedData({ walletId: process.env.CIRCLE_AGENT_WALLET_ID!, data });
      const sig = res.data?.signature as Hex | undefined;
      if (!sig) throw new Error("circle: no signature");
      const signer = await recoverTypedDataAddress({ ...(d as object), signature: sig } as Parameters<typeof recoverTypedDataAddress>[0]);
      if (!isAddressEqual(signer, address)) throw new Error(`circle typed-data signature recovers to ${signer}`);
      return sig;
    },
  };
};

/// approve + deposit into Gateway from the agent's Circle EOA (credited on Arc in ~0.5 s).
export async function gatewayDeposit(amount: bigint) {
  const approveTx = await circleSend(USDC, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [GATEWAY_WALLET, amount] }), "gw-approve");
  const depositTx = await circleSend(GATEWAY_WALLET, encodeFunctionData({ abi: gatewayAbi, functionName: "deposit", args: [USDC, amount] }), "gw-deposit");
  return { approveTx, depositTx };
}

/// Buys one x402 resource through Gateway batching (mirrors GatewayClient.pay, with a Circle signer and a cap).
export async function x402Buy(url: string, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? "POST";
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const headers = { "content-type": "application/json" };
  const first = await fetch(url, { method, headers, body });
  if (first.status !== 402) throw new Error(`expected 402 from ${url}, got ${first.status}`);
  const required = JSON.parse(Buffer.from(first.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString("utf8"));
  const network = `eip155:${chain.id}`;
  const option = (required.accepts ?? []).find(
    (o: { network: string; extra?: { name?: string } }) => o.network === network && o.extra?.name === "GatewayWalletBatched",
  );
  if (!option) throw new Error(`${url} offers no Gateway option on ${network}`);
  if (BigInt(option.amount) > MAX_PER_PURCHASE) throw new Error(`price ${option.amount} above the per-purchase cap`);

  const payload = await new BatchEvmScheme(circleBatchSigner()).createPaymentPayload(required.x402Version ?? 2, option);
  const header = Buffer.from(JSON.stringify({ ...payload, resource: required.resource, accepted: option })).toString("base64");
  const paid = await fetch(url, { method, headers: { ...headers, "Payment-Signature": header }, body });
  const settle = paid.headers.get("PAYMENT-RESPONSE");
  const receipt = settle ? JSON.parse(Buffer.from(settle, "base64").toString("utf8")) : null;
  if (!paid.ok) throw new Error(`x402 ${url} failed: ${paid.status}`);
  return { data: await paid.json(), amount: BigInt(option.amount), settlement: receipt?.transaction ?? null, receipt };
}
