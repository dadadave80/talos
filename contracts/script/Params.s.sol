// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Params} from "../src/libraries/TalosLib.sol";

/// @notice Every launch cap and threshold, in ONE place. Amounts are 6-decimal USDC. Once deployed these sit
///         behind the 48h timelock; change them here only with the owner.
library TalosParams {
    uint256 internal constant USDC = 1e6;

    /// @dev Arc USDC ERC-20 view, same on mainnet (5042) and testnet (5042002); 6 decimals. Confirmed on-chain
    ///      against both RPCs on 2026-10-16.
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    uint256 internal constant TIMELOCK_DELAY = 172_800; // 48h, seconds
    uint48 internal constant AGENT_EXPIRY = 1_792_540_799; // 2026-10-20 23:59:59 UTC

    function launch() internal pure returns (Params memory p) {
        p.perTxCap = [10 * USDC, 5 * USDC, USDC / 4]; // CONTRIBUTOR, VENDOR, DISCRETIONARY
        p.dailyCap = [25 * USDC, 10 * USDC, 3 * USDC];
        p.ownerPerTxCap = 20 * USDC; // owner-signed bounties 5-20
        p.ownerDailyCap = 40 * USDC;
        p.velocityMax = 20; // the 21st payout inside the window reverts until the owner resumes
        p.velocityWindow = 3600;
        p.commitTtl = 300; // blocks; ~2.5 min at Arc's measured ~0.51 s blocks
    }
}
