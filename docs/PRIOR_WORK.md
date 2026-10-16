# Prior work

## What existed before Tameion (27 Sep 2026)
- lattice: EIP-2535 facet library incl. SpendingLimit, RateLimiter, CircuitBreaker, TimelockController, CCTP adapter. Pinned as a git submodule at tag `v0.5.0` (commit `cca133b`, 9 Oct 2026) under `contracts/lib/lattice`. Never vendor-copied.
- engye (Lepton 2026, placed 3rd): chat server, Gateway nanopayment middleware, passkey rail. Adapted files are marked in their headers (`adapted from engye (Lepton, pre-Tameion)`).
- Arc-testnet CCTP demos in lattice (pre-event).

## Built during Tameion (from tag `tameion-baseline`, 16 Oct 2026)
- TalosVault diamond composition and parameters; DecisionLedger facet; tiered payee policy; escalation queue.
- Treasury operator agent (prompt, tools, loop, rationale stream).
- Arena: toll, free tier, honeypot tier, bounty path, anti-abuse.
- Evidence page and traction reporting.
- Mainnet deployment, verification, live operations log.

Any Lattice facet patched during the event gets a labelled upstream PR and a line here.
