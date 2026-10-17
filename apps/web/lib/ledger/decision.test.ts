import { expect, test } from "bun:test";
import { keccak256, pad, toBytes } from "viem";
import { Tier } from "../chain";
import { decisionHash } from "./decision";

test("matches the Solidity shared vector", () => {
  expect(
    decisionHash({
      chainId: 5042002,
      vault: "0x1111111111111111111111111111111111111111",
      attemptId: pad("0x7b"),
      payee: "0x000000000000000000000000000000000000dEaD",
      amount: 250_000n,
      tier: Tier.DISCRETIONARY,
      reason: "reported a reproducible Lattice issue",
      modelId: "openai/gpt-oss-120b",
      promptHash: keccak256(toBytes("prompt")),
    }),
  ).toBe("0x34eeff2d1846d4f5d2eeb8c7164b06dd1f7f9e851fc58b57d9224a057ac2331f");
});
