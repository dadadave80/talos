// Runs against a local anvil (standard EVM: verification is plain eth_call, no Arc precompile involved).
// Needs `forge build` in contracts/ for the mock smart-account bytecode.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getContractAddress,
  http,
  keccak256,
  parseAbi,
  serializeErc6492Signature,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { freeTierMessage, verifyFreeTier } from "./freeTier";

const out = (f: string, c: string) =>
  JSON.parse(readFileSync(`${import.meta.dir}/../../../../contracts/out/${f}/${c}.json`, "utf8")).bytecode.object as Hex;

const PORT = 8547;
const VAULT = "0x1111111111111111111111111111111111111111" as Address;
const transport = http(`http://127.0.0.1:${PORT}`);
const pc = createPublicClient({ chain: foundry, transport });
let anvil: ReturnType<typeof Bun.spawn>;
let factory: Address;
const owner = privateKeyToAccount(generatePrivateKey());
const factoryAbi = parseAbi(["function deploy(address o) returns (address)"]);

const sca = (): Address =>
  getContractAddress({
    opcode: "CREATE2",
    from: factory,
    salt: `0x${"00".repeat(32)}`,
    bytecodeHash: keccak256(
      (out("Mock1271Wallet.sol", "Mock1271Wallet") + owner.address.slice(2).toLowerCase().padStart(64, "0")) as Hex,
    ),
  });

beforeAll(async () => {
  anvil = Bun.spawn(["anvil", "--port", String(PORT), "--silent"]);
  for (let i = 0; i < 50; i++) {
    if (await pc.getChainId().catch(() => 0)) break;
    await Bun.sleep(100);
  }
  // anvil's well-known dev account 0
  const dev = createWalletClient({
    chain: foundry,
    transport,
    account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
  });
  const hash = await dev.deployContract({ abi: factoryAbi, bytecode: out("Mock1271Wallet.sol", "Mock1271Factory") });
  factory = (await pc.waitForTransactionReceipt({ hash })).contractAddress!;
});

afterAll(() => anvil?.kill());

const nonce = "test-nonce-0001";
const sign = (wallet: Address) => owner.signMessage({ message: freeTierMessage(wallet, nonce, foundry.id, VAULT) });

test("EOA", async () => {
  const signature = await sign(owner.address);
  expect(await verifyFreeTier(pc, { wallet: owner.address, nonce, signature }, foundry.id, VAULT)).toBe(owner.address);
});

test("undeployed smart account (ERC-6492)", async () => {
  const wallet = sca();
  expect(await pc.getCode({ address: wallet })).toBeUndefined();
  const signature = serializeErc6492Signature({
    address: factory,
    data: encodeFunctionData({ abi: factoryAbi, args: [owner.address] }),
    signature: await sign(wallet),
  });
  expect(await verifyFreeTier(pc, { wallet, nonce, signature }, foundry.id, VAULT)).toBe(wallet);
});

test("deployed smart account (ERC-1271)", async () => {
  const wallet = sca();
  const dev = createWalletClient({
    chain: foundry,
    transport,
    account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
  });
  await pc.waitForTransactionReceipt({
    hash: await dev.writeContract({ address: factory, abi: factoryAbi, functionName: "deploy", args: [owner.address] }),
  });
  expect(await pc.getCode({ address: wallet })).toBeDefined();
  const signature = await sign(wallet);
  expect(await verifyFreeTier(pc, { wallet, nonce, signature }, foundry.id, VAULT)).toBe(wallet);
});

test("tampered signature, wrong wallet, other chain all fail", async () => {
  const signature = await sign(owner.address);
  const flipped = (signature.slice(0, -4) + (signature.slice(-4, -2) === "00" ? "01" : "00") + signature.slice(-2)) as Hex;
  expect(await verifyFreeTier(pc, { wallet: owner.address, nonce, signature: flipped }, foundry.id, VAULT)).toBeNull();
  expect(await verifyFreeTier(pc, { wallet: VAULT, nonce, signature }, foundry.id, VAULT)).toBeNull();
  expect(await verifyFreeTier(pc, { wallet: owner.address, nonce, signature }, 5042, VAULT)).toBeNull();
});
