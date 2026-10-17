# Operations runbook

Claude Code prepares and checks; the owner runs every mainnet command from their own shell. No private key is
ever passed on a command line: deploys use the `dave1` Foundry keystore; agent and hot keys live only in the app env.

## Keys and roles
| Who | Address source | Can |
| --- | --- | --- |
| Owner (EOA) | `OWNER_ADDRESS` | approve/reject queued payments, `resume()`, EmergencyStop guardian, timelock proposer + executor |
| Agent (server-held EOA) | `AGENT_ADDRESS` | `commit`, `pay`, `queue` (SessionKey, expires 2026-11-30 23:59 UTC); Gateway/x402 signing |
| Hot commit key | `HOT_COMMIT_ADDRESS` | `commit` only (REFUSE commits); ~2 USDC of gas, nothing else |
| The diamond itself | — | sole DEFAULT_ADMIN: every cap, allowlist, key or upgrade change is a 48 h timelock round. Never renounce it: in Lattice v0.5.0 a stop with no live admin is permanent. |

## Deploy (testnet rehearsal: dave1 is deployer and owner)
```sh
cd contracts
export OWNER_ADDRESS=<dave1> AGENT_ADDRESS=<agent> HOT_COMMIT_ADDRESS=<hot key>
export VENDOR_ALLOWLIST=<agent>                       # ops float
export CONTRIBUTOR_ALLOWLIST=<team contributor wallet>
forge script script/Deploy.s.sol --rpc-url arc-testnet --broadcast --account dave1 \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ --chain-id 5042002
```
Record the diamond, every facet, the deploy block and explorer links in `docs/ADDRESSES.md`; set `TALOS_VAULT`
and `DEPLOY_BLOCK` in the app env.

## Deploy (mainnet: the owner runs this)
Same command with `--rpc-url arc-mainnet`, the real `OWNER_ADDRESS`, fresh mainnet agent and hot keys (never reuse the testnet ones), and Sourcify verification
(`--verify --verifier sourcify --chain-id 5042`; Arcscan imports the match). Before running: the vault will hold at
most 50 USDC; total funding ≤ 60 USDC including gas.

## Smoke checks after any deploy
```sh
V=<diamond>; R=arc-testnet
cast call $V "getMinDelay()(uint256)" --rpc-url $R                       # 172800
cast call $V "params()((uint256[3],uint256[3],uint256,uint256,uint256,uint48,uint64))" --rpc-url $R
cast call $V "isSessionKeyActive(address)(bool)" <agent> --rpc-url $R    # true
cast call $V "isCallPermitted(address,address,bytes4)(bool)" <hot> $V 0x8e771aa1 --rpc-url $R   # pay: false
```

## Pause and resume
- Pause: owner calls `emergencyStop("reason")`. Commits and escalations keep flowing; `pay()` and `approveQueued()` stop.
- Resume: owner calls `resume()`. It clears only the stop flag and the velocity counter; daily budgets are untouched.

## Changing a cap, an allowlist or a key (48 h)
1. Owner: `schedule(V, 0, <calldata>, 0x0, <salt>, 172800)` with calldata for `setParams`, `setAllowlist`,
   `registerSessionKey` or `revokeSessionKey`.
2. After 48 h: `execute(V, 0, <calldata>, 0x0, <salt>)`.
The pending operation is visible on `/policy` and on the explorer.

## Rotate the agent key
Schedule `revokeSessionKey(old)` and `registerSessionKey(new, 0, expiry, [commit, pay, queue])` in one
`scheduleBatch`. Until it executes, pause with `emergencyStop` if the old key is suspected compromised.

## Cron
`.github/workflows/cycle.yml` runs hourly and on demand (Actions → operator-cycle → Run workflow). Repo secret
`CRON_SECRET`, repo variable `TALOS_URL`. A failed run is not retried; the next hour picks up where it left off.

## Bounties
Label a Lattice issue `bounty:N` (labels `bounty:2`, `bounty:3`, `bounty:4` exist). A merged PR that closes it
("Closes #335") inherits the bounty; no PR label needed. A `bounty:N` label on the PR itself overrides. One payment per
issue. The author's payout address goes in `CONTRIBUTOR_WALLETS` (`login:0x…`); non-allowlisted payees are queued
for the owner.

## Cut list log
Applied Sat 17 Oct 01:20 UTC+1: Phase 2's exit gate (testnet `pay()` proven) is more than 30 minutes past its
anchor, waiting on Circle keys and testnet funding.
1. `talos-primitives` repo → not built; DecisionLedgerFacet stays in this repo.
2. Leaderboard → the counters on `/evidence` are enough.
3. CCTP payout to Base → all contributors are paid on Arc.
4. Owner notification card → the owner polls `/policy` for the pending queue.

## Safe owner path (not used)
The owner is an EOA for speed. A Safe could hold OWNER_ROLE, the guardian role and the timelock roles instead;
the change is a timelock round granting the Safe and revoking the EOA.
