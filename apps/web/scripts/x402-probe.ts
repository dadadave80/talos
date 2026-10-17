// Unpaid x402 probe: sends the request the operator cycle would send, decodes the seller's 402 challenge and prints
// whether lib/ops/vendor.ts would pick an option (network, GatewayWalletBatched v1, Circle's GatewayWallet, price
// under the cap). It never signs or pays. Run from apps/web:
//   bun scripts/x402-probe.ts [url] [--payer 0x…]   (url defaults to X402_VENDOR_URL; --payer prints its Gateway balance)
import { formatUnits, type Address } from "viem";
import { chain } from "../lib/chain";
import { gatewayBalance, MAX_PER_PURCHASE, quote } from "../lib/ops/vendor";

// Only to build the request body (the vault address in Quicknode's eth_call); the testnet vault is public.
process.env.TALOS_VAULT ??= "0x8e3B18feB46a10F5829DE7C26e5535Fd6662bd89";

const args = process.argv.slice(2);
const payer = args.includes("--payer") ? (args[args.indexOf("--payer") + 1] as Address) : null;
const url = args.find((a) => /^https?:\/\//.test(a)) ?? process.env.X402_VENDOR_URL;
if (!url) {
  console.error("usage: bun scripts/x402-probe.ts <url> [--payer 0x…]  (or set X402_VENDOR_URL)");
  process.exit(2);
}

const q = await quote(url);
console.log(`${q.req.method} ${url}  (${q.req.seller}: ${q.req.item})`);
console.log(`chain eip155:${chain.id} · cap ${formatUnits(MAX_PER_PURCHASE, 6)} USDC · status ${q.status}`);
console.log("accepts (network, amount at 6 dp, scheme extra):");
for (const o of q.required?.accepts ?? [])
  console.log(`  ${o.network.padEnd(42)} ${formatUnits(BigInt(o.amount), 6).padStart(10)}  ${o.extra?.name ?? "-"}${o.extra?.version ? ` v${o.extra.version}` : ""}  payTo ${o.payTo}`);
const ext = (q.required as { extensions?: object } | null)?.extensions;
if (ext) console.log(`extensions: ${Object.keys(ext).join(", ")}`);
console.log(
  q.option
    ? `WOULD PICK: ${q.option.network} ${formatUnits(BigInt(q.option.amount), 6)} USDC to ${q.option.payTo} via ${q.option.extra?.verifyingContract}`
    : `WOULD NOT BUY: ${q.why}`,
);
if (payer) console.log(`Gateway balance of ${payer}: ${formatUnits(await gatewayBalance(payer), 6)} USDC`);
process.exit(q.option ? 0 : 1);
