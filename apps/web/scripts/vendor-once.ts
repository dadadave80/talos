// The VENDOR leg of the operator cycle, once, from a machine holding the production env. Without --yes it only
// reads: agent balances, the VENDOR budget, and the seller's unpaid 402 quote. With --yes it runs runVendor() for
// real: possibly a 1 USDC float from the vault and a Gateway deposit, then one x402 purchase, all on the ops log.
// Run from apps/web (Bun loads .env.local): bun scripts/vendor-once.ts [--yes]
import { formatUnits } from "viem";
import { runVendor } from "../lib/cycle";
import { gatewayBalance, MAX_PER_PURCHASE, quote } from "../lib/ops/vendor";
import { agentAccount } from "../lib/signers/send";
import { getBalances } from "../lib/tools";

const usd = (n: bigint) => formatUnits(n, 6);
// Errors from the RPC client quote its URL, which carries a key: print the message without URLs.
const clean = (e: unknown) => String((e as { shortMessage?: string })?.shortMessage ?? e).replace(/https?:\/\/\S+/g, "<url>");

try {
  const url = process.env.X402_VENDOR_URL;
  if (!url) throw new Error("X402_VENDOR_URL is unset (e.g. https://x402.quicknode.com/arc-testnet/)");
  const agent = agentAccount().address;
  const [bal, gw, q] = await Promise.all([getBalances(), gatewayBalance(agent), quote(url)]);
  console.log(`agent ${agent}: ${usd(bal.agentGasUsdc)} USDC on Arc, ${usd(gw)} USDC in Gateway`);
  console.log(`vault ${usd(bal.vaultUsdc)} USDC · VENDOR budget left today ${usd(bal.remaining.VENDOR)} USDC · stopped ${bal.stopped} · tripped ${bal.tripped}`);
  console.log(q.option ? `seller quote: ${q.req.seller} ${q.req.item}, ${usd(BigInt(q.option.amount))} USDC (cap ${usd(MAX_PER_PURCHASE)})` : `would not buy: ${q.why}`);
  if (!process.argv.includes("--yes")) {
    console.log("dry run: nothing signed. Pass --yes to run the vendor leg for real.");
    process.exit(0);
  }
  console.log(await runVendor());
  console.log(`agent Gateway balance now ${usd(await gatewayBalance(agent))} USDC`);
} catch (e) {
  console.error(clean(e));
  process.exit(1);
}
