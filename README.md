# Talos — the treasurer you can try to rob

Talos runs the Lattice open-source project's treasury on Arc mainnet. It pays contributors for merged PRs, pays its own bills, keeps a reserve, and refuses everything else. Its spending limits live in a contract it cannot change; nobody can change them in under 48 hours.

> Status: skeleton (`tameion-baseline`). Live URL, addresses and traction land here as phases ship.

The arena is a security program, not a game of chance: no prize pool, no escalating fees, fixed micro-bounties.

## What existed before Tameion / Built during Tameion
See [docs/PRIOR_WORK.md](docs/PRIOR_WORK.md).

## How it is bounded
- **Commit before pay, in the contract.** `pay()` reverts `NotCommitted` without a fresh PAY commitment (≤ 300 blocks old), `AlreadySpent` on reuse. Refusals are committed too.
- **Per-tier caps.** CONTRIBUTOR 10 / 25, VENDOR 5 / 10, DISCRETIONARY 0.25 / 3.00 USDC (per tx / rolling day). CONTRIBUTOR and VENDOR payees must be allowlisted.
- **Human threshold.** Anything above a cap is `queue()`d. Only the owner can `approveQueued` (≤ 20 USDC each, 40 a day).
- **Velocity breaker.** The 21st payout within an hour reverts until the owner resumes. Commits keep flowing.
- **48h timelock.** The diamond is its own only admin. Caps, allowlists, session keys and upgrades change only through a 48h TimelockController round that the owner proposes and executes. The agent key holds no role.

## Honest gaps and deviations from the plan
- **Unaudited.** The vault is kept at or below 50 USDC on mainnet.
- **Two Lattice facets were dropped.** `GovernedVault` is an ERC-4626 share vault with no payout path. `SpendingLimit` is an ERC-6900 account module and cannot be installed on a diamond. The diamond holds USDC directly. `pay` and `approveQueued` are the only exits; a test asserts the loupe exposes no other path.
- **Agent authority comes from Lattice's `SessionKey` facet.** Two keys are registered at init, both expiring 2026-11-30: the agent's Circle developer-controlled EOA (`commit`, `pay`, `queue`) and a hot key with `commit` only, so REFUSE commits never wait on the MPC signer. A table-driven test checks the access control of every selector cut into the diamond. Per-tx caps live in `TreasuryPolicyFacet`. Daily budgets come from `RateLimiter`, a rolling bucket rather than a calendar day.
- **The owner can resume instantly.** Lattice makes `emergencyResume` admin-only, which here would mean a 48h round. Talos adds an owner-only `resume()` that clears only the EmergencyStop flag and the velocity counter (RateLimiter budgets are untouched) and emits `Resumed`. The owner can unpause instantly. Nobody can raise a cap instantly.
- **Payment logic is unit-tested against a mock token; the real-USDC path runs under Arc Foundry.** Stock Foundry cannot execute Arc's USDC precompile. `test/ArcUsdc.t.sol` forks Arc testnet and pays real USDC under `arc-forge --network arc` (Arc Foundry v0.8.0-2, all pass); stock forge fails the same payment with `TransferFailed()`, so it is skipped there. Testnet and mainnet transactions are recorded in docs/ADDRESSES.md.
- **Decision hashes bind chain and deployment.** The preimage is `abi.encode(chainid, vault, attemptId, payee, amount, tier, keccak(reason), modelId, keccak(prompt))`; the contract stores only the hash, and the shared vector is checked in Solidity and TypeScript.
- `RateLimiter.consume` is unguarded upstream, so it is deliberately not cut.
- **Hosting:** the public launch runs on Vercel's Hobby plan; tolls are revenue to an open-source treasury, so Pro is the correct plan under Vercel's terms. The build is identical.
- **Testnet VENDOR purchases hit a Circle x402 test endpoint, not Exa** (Exa settles on Arc mainnet only). The ops log records the URL of every purchase.
- **Owner bounties come from the same vault** through `approveQueued`: only items the agent queued are payable, capped at 20 USDC per approval and 40 per rolling day, each linked on-chain to its decision.
- **Cut for time:** talos-primitives repo, leaderboard, CCTP payout to Base, owner push notification (docs/OPERATIONS.md).

## Layout
- `contracts/` — Foundry; Lattice pinned at `v0.5.0` in `contracts/lib/lattice`
- `apps/web/` — one Next.js app on Vercel: agent, arena, `/evidence`, `/policy`; the hourly cycle is triggered by GitHub Actions

## Build
```sh
git clone --recursive <repo> && cd talos/contracts && forge build && forge test
# real Arc USDC (Arc Foundry: foundryup -r circlefin/arc-foundry -b main, binaries linked as arc-forge)
ARC_FORGE=1 ARC_TESTNET_RPC=https://rpc.testnet.arc.io arc-forge test --network arc --mc ArcUsdc
```

MIT.
