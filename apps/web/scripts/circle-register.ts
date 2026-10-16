// Run ONCE, by the owner, in their own terminal (never through Claude):
//   CIRCLE_API_KEY=... bun scripts/circle-register.ts
// Generates an entity secret, registers it with Circle, writes the recovery file to ~/.circle/.
// Copy the printed ENTITY_SECRET into apps/web/.env.local; it is shown only here.
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) throw new Error("set CIRCLE_API_KEY");
const entitySecret = process.env.ENTITY_SECRET ?? randomBytes(32).toString("hex");
await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: path.join(os.homedir(), ".circle", "talos-recovery-file.json"),
});
console.log(`ENTITY_SECRET=${entitySecret}`);
console.log("recovery file: ~/.circle/talos-recovery-file.json (keep it outside the repo)");
