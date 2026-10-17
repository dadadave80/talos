# Prior work

## What existed before Tameion (27 Sep 2026)
- lattice: EIP-2535 facet library incl. SpendingLimit, RateLimiter, CircuitBreaker, TimelockController, CCTP adapter. Pinned as a git submodule at tag `v0.5.0` (commit `cca133b`, 9 Oct 2026) under `contracts/lib/lattice`. Never vendor-copied.
- engye (Lepton 2026, placed 3rd): chat server, Gateway nanopayment middleware, passkey rail. Adapted files are marked in their headers (`adapted from engye (Lepton, pre-Tameion)`).
- Arc-testnet CCTP demos in lattice (pre-event).

## Built during Tameion (from tag `tameion-baseline`, 16 Oct 2026)
- TalosVault diamond composition and parameters; DecisionLedger facet; tiered payee policy; escalation queue.
- Treasury operator agent (prompt, tools, loop, rationale stream).
- Arena: free tier, honeypot tier, anti-abuse, share receipts. (Paid toll: not built.)
- Evidence and Policy pages, hourly operator cycle, bounty inheritance from Lattice issues.
- Testnet deployment, Sourcify verification, on-chain proofs. (Mainnet: pending.)

## Reused files (exact list)
| File in this repo | Origin | Change |
| --- | --- | --- |
| `apps/web/lib/brain/llm.ts` | engye `lib/llm.ts` (pre-Tameion) | single role; strict JSON schema on gpt-oss; env names |
| `apps/web/lib/signers/send.ts` | engye's server-held EOA signer pattern (pre-Tameion) | Supabase-backed nonces for concurrent serverless senders |
| `apps/web/lib/circleWallet.ts` | engye `lib/circleWallet.ts` (pre-Tameion) | passkey register/login/derive only; message signing for the free tier; chain from `NEXT_PUBLIC_CHAIN` |
| `apps/web/app/passkey-store.ts` | engye `components/wallet/passkey.tsx` (pre-Tameion) | plain functions (the React context is `app/session.tsx`); Talos storage key; switch and remove |
| `apps/web/app/session.tsx` | engye `components/wallet/passkey.tsx` + `ConnectModal.tsx` flow (pre-Tameion) | one provider for passkey and injected wallet; wallet restored only via `eth_accounts`; cross-tab sync |
| `apps/web/app/wallet-control.tsx` | engye `components/wallet/WalletControl.tsx` (pre-Tameion) | free attempts on the chip; last 3 attempts; full keyboard menu; explorer link; Tailwind tokens |
| `apps/web/app/layout.tsx` (theme script) | engye `app/layout.tsx` THEME_SCRIPT (pre-Tameion) | Talos key and colours; System mode; `talos-theme` event; cross-tab sync |

Any Lattice facet patched during the event gets a labelled upstream PR and a line here.
