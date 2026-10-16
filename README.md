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
- **Agent authority comes from Lattice's `SessionKey` facet.** The agent is an EOA with grants for `commit`, `pay` and `queue` on the diamond, expiring 2026-10-20. Per-tx caps live in `TreasuryPolicyFacet`. Daily budgets come from `RateLimiter`, a rolling bucket rather than a calendar day.
- **The owner can resume instantly.** Lattice makes `emergencyResume` admin-only, which here would mean a 48h round. Talos adds an owner-only `resume()` that clears the EmergencyStop and the velocity breaker. The owner can unpause instantly. Nobody can raise a cap instantly.
- **Payment tests use a mock token.** Foundry cannot simulate USDC moves on Arc: they go through a node precompile that revm lacks. `pay()` logic is tested against a mock ERC-20. The real path is proven on Arc testnet and mainnet by recorded transactions (docs/ADDRESSES.md).
- `RateLimiter.consume` is unguarded upstream, so it is deliberately not cut.

## Layout
- `contracts/` — Foundry; Lattice pinned at `v0.5.0` in `contracts/lib/lattice`
- `apps/agent/` — Bun service: operator loop, arena, tools
- `apps/web/` — chat, `/evidence`, `/policy`

## Build
```sh
git clone --recursive <repo> && cd talos/contracts && forge build && forge test
```

MIT.
