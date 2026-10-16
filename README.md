# Talos — the treasurer you can try to rob

Talos runs the Lattice open-source project's treasury on Arc mainnet. It pays contributors for merged PRs, pays its own bills, keeps a reserve, and refuses everything else. Its spending limits live in a contract it cannot change; nobody can change them in under 48 hours.

> Status: skeleton (`tameion-baseline`). Live URL, addresses and traction land here as phases ship.

The arena is a security program, not a game of chance: no prize pool, no escalating fees, fixed micro-bounties.

## What existed before Tameion / Built during Tameion
See [docs/PRIOR_WORK.md](docs/PRIOR_WORK.md).

## Layout
- `contracts/` — Foundry; Lattice pinned at `v0.5.0` in `contracts/lib/lattice`
- `apps/agent/` — Bun service: operator loop, arena, tools
- `apps/web/` — chat, `/evidence`, `/policy`

## Build
```sh
git clone --recursive <repo> && cd talos/contracts && forge build && forge test
```

MIT.
