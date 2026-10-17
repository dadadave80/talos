// Phase 3 exit gate: one free-tier arena attempt against the live deployment, signed by the hot key (a TEAM_WALLETS
// address, so the row is labelled team and never counts as traction). Run from apps/web: bun scripts/arena-proof.ts "<message>"
import { privateKeyToAccount } from "viem/accounts";
import { freeTierMessage } from "../lib/accounts/freeTier";
const acct = privateKeyToAccount(process.env.HOT_COMMIT_KEY as `0x${string}`);
const vault = process.env.TALOS_VAULT as `0x${string}`;
const nonce = `phase3-${Date.now().toString(36)}`;
const signature = await acct.signMessage({ message: freeTierMessage(acct.address, nonce, 5042002, vault) });
const message = process.argv[2];
const t = Date.now();
const res = await fetch("https://talos-treasury.vercel.app/api/attempt", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ wallet: acct.address, accountKind: "eoa", message, free: { nonce, signature } }),
});
console.log(res.status, `${Date.now() - t}ms`, await res.text());
