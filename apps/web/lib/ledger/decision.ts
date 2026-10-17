import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";
import type { Tier } from "../chain";

export type Decision = {
  chainId: number;
  vault: Address;
  attemptId: Hex; // bytes32
  payee: Address;
  amount: bigint; // 6-decimal USDC
  tier: Tier;
  reason: string;
  modelId: string;
  promptHash: Hex; // keccak256 of prompt.md
};

/// Same preimage as contracts/test/TalosVault.t.sol test_decisionHashVector. chainId and vault bind a decision
/// to one deployment, so a testnet commit is never evidence on mainnet.
export const decisionHash = (d: Decision): Hex =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "string" },
        { type: "bytes32" },
      ],
      [
        BigInt(d.chainId),
        d.vault,
        d.attemptId,
        d.payee,
        d.amount,
        d.tier,
        keccak256(toBytes(d.reason)),
        d.modelId,
        d.promptHash,
      ],
    ),
  );
