// Run ONCE, by the owner, in their own terminal (never through Claude), from apps/web:
//   1. put CIRCLE_API_KEY=<TEST key> in apps/web/.env.local (Bun loads it automatically)
//   2. bun scripts/circle-register.ts
// Generates an entity secret, registers it with Circle, writes the recovery file into ~/.circle/ and appends
// ENTITY_SECRET to .env.local. Nothing secret is printed.
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) throw new Error("put CIRCLE_API_KEY in apps/web/.env.local first");
if (process.env.ENTITY_SECRET) throw new Error("ENTITY_SECRET is already set in .env.local; refusing to register again");

const dir = path.join(os.homedir(), ".circle"); // the SDK takes a directory and names the file itself
mkdirSync(dir, { recursive: true });
const entitySecret = randomBytes(32).toString("hex");
await registerEntitySecretCiphertext({ apiKey, entitySecret, recoveryFileDownloadPath: dir });

appendFileSync(".env.local", `ENTITY_SECRET=${entitySecret}\n`);
chmodSync(".env.local", 0o600);
const file = readdirSync(dir).filter((f) => f.startsWith("recovery_file_")).sort().pop();
console.log("registered; ENTITY_SECRET written to apps/web/.env.local");
console.log(`recovery file: ~/.circle/${file} (back it up outside the repo)`);
