// Creates the Talos agent signer: one EOA developer-controlled wallet, same address on Arc testnet and mainnet.
// Prints ids and the address only. Env (apps/web/.env.local): CIRCLE_API_KEY, ENTITY_SECRET.
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});
const set = await circle.createWalletSet({ name: "talos-agent" });
const walletSetId = set.data?.walletSet?.id!;
const res = await circle.createWallets({
  accountType: "EOA",
  blockchains: (process.env.CIRCLE_BLOCKCHAINS ?? "ARC-TESTNET").split(",") as never,
  count: 1,
  walletSetId,
  metadata: [{ name: "talos-agent", refId: "talos-agent" }],
});
for (const w of res.data?.wallets ?? []) console.log(`${w.blockchain}\tid=${w.id}\taddress=${w.address}`);
console.log(`walletSetId=${walletSetId}`);
