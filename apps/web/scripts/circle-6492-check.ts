// Check against Arc testnet: a Circle MSCA (EOA-owned here, so no biometric is needed) signs the free-tier message
// while UNDEPLOYED; its ERC-6492-wrapped signature must pass the same verifyFreeTier the server runs. Needs a
// hostname the client key allows: CIRCLE_CHECK_HOST=<allowed host> bun scripts/circle-6492-check.ts. The owner is a
// throwaway key and nothing is sent anywhere. Run from apps/web: bun scripts/circle-6492-check.ts
import { createPublicClient, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { freeTierMessage, verifyFreeTier } from "../lib/accounts/freeTier";

// The SDK reads `window`; a bare stub is enough for the non-WebAuthn path exercised here.
// The SDK reports window.location.hostname to Circle, and the client key only works for hostnames allowed in the
// Circle Console, so the stub carries one (CIRCLE_CHECK_HOST, default localhost).
(globalThis as Record<string, unknown>).window ??= { location: { hostname: process.env.CIRCLE_CHECK_HOST ?? "localhost", protocol: "https:" } };
const { toCircleSmartAccount, toModularTransport } = await import("@circle-fin/modular-wallets-core");

const circle = createPublicClient({ chain: arcTestnet, transport: toModularTransport(`${process.env.NEXT_PUBLIC_CLIENT_URL}/arcTestnet`, process.env.NEXT_PUBLIC_CLIENT_KEY!) });
const arc = createPublicClient({ chain: arcTestnet, transport: http("https://rpc.testnet.arc.io") });
const vault = process.env.TALOS_VAULT as Address;

console.log("creating account…");
const account = await toCircleSmartAccount({ client: circle, owner: privateKeyToAccount(generatePrivateKey()) });
const nonce = crypto.randomUUID();
console.log("signing…");
const raw = await account.signMessage({ message: freeTierMessage(account.address, nonce, arcTestnet.id, vault) });
const wrapped = raw.toLowerCase().endsWith("6492".repeat(16));
console.log("account", account.address, "deployed:", await account.isDeployed(), "| signature ERC-6492 wrapped:", wrapped);
const ok = await verifyFreeTier(arc, { wallet: account.address, nonce, signature: raw }, arcTestnet.id, vault);
const tampered = await verifyFreeTier(arc, { wallet: account.address, nonce: nonce + "x", signature: raw }, arcTestnet.id, vault);
console.log("verifies:", !!ok, "| tampered nonce verifies:", !!tampered);
process.exit(ok && wrapped && !tampered ? 0 : 1);
