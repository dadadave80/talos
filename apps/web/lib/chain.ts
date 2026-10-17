import { createPublicClient, http, parseAbi, type Address } from "viem";
import { arc, arcTestnet } from "viem/chains";

export const chain = process.env.CHAIN === "arc" ? arc : arcTestnet;

export const publicClient = createPublicClient({
  chain,
  transport: http(chain.id === arc.id ? process.env.ARC_MAINNET_RPC : process.env.ARC_TESTNET_RPC),
});

export const vault = () => process.env.TALOS_VAULT as Address;

/// Arc USDC ERC-20 view, 6 decimals, same address on 5042 and 5042002.
export const USDC = "0x3600000000000000000000000000000000000000" as const;

export const explorer = chain.id === arc.id ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io";
export const txUrl = (hash: string) => `${explorer}/tx/${hash}`;

export enum Verdict {
  REFUSE,
  PAY,
  QUEUE,
}
export enum Tier {
  CONTRIBUTOR,
  VENDOR,
  DISCRETIONARY,
}

export const vaultAbi = parseAbi([
  "event DecisionCommitted(bytes32 indexed decisionHash, uint8 verdict, bytes32 attemptRef, address actor, uint256 blockNumber)",
  "event Paid(bytes32 indexed decisionHash, uint8 tier, address payee, uint256 amount)",
  "event Queued(uint256 indexed id, bytes32 decisionHash, uint8 tier, address payee, uint256 amount, string reason)",
  "event Approved(uint256 indexed id, address signer)",
  "event Rejected(uint256 indexed id, address signer)",
  "event Resumed(address indexed by, bool clearedStop, bool clearedVelocity)",
  "function commit(bytes32 decisionHash, uint8 verdict, bytes32 attemptRef)",
  "function pay(bytes32 decisionHash, uint8 tier, address payee, uint256 amount)",
  "function queue(bytes32 decisionHash, uint8 tier, address payee, uint256 amount, string reason)",
  "function committedAt(bytes32) view returns (uint256 blockNumber, uint8 verdict)",
  "struct Params { uint256[3] perTxCap; uint256[3] dailyCap; uint256 ownerPerTxCap; uint256 ownerDailyCap; uint256 velocityMax; uint48 velocityWindow; uint64 commitTtl; }",
  "function params() view returns (Params)",
  "function asset() view returns (address)",
  "function isAllowlisted(uint8 tier, address payee) view returns (bool)",
  "struct QueuedPayment { bytes32 decisionHash; uint8 tier; address payee; uint256 amount; uint8 status; }",
  "function queued(uint256 id) view returns (QueuedPayment)",
  "function queueCount() view returns (uint256)",
  "function getMinDelay() view returns (uint256)",
  "function isStopped() view returns (bool)",
  "function isTripped(bytes32 key) view returns (bool)",
  "function getAvailable(bytes32 key) view returns (uint256)",
  "function sessionKeyValidity(address key) view returns (uint48 validAfter, uint48 validUntil)",
  "function isSessionKeyActive(address key) view returns (bool)",
]);
