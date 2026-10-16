// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControlLib} from "@lattice/access/libraries/AccessControlLib.sol";
import {SessionKeyLib} from "@lattice/accounts/libraries/SessionKeyLib.sol";
import {CircuitBreakerLib} from "@lattice/security/libraries/CircuitBreakerLib.sol";
import {RateLimiterLib} from "@lattice/security/libraries/RateLimiterLib.sol";

enum Verdict {
    REFUSE,
    PAY,
    QUEUE
}

enum Tier {
    CONTRIBUTOR,
    VENDOR,
    DISCRETIONARY
}

/// @notice Every cap Talos lives under. All amounts are 6-decimal ERC-20 USDC. Changeable only by the diamond
///         itself, i.e. through a TimelockController round.
struct Params {
    uint256[3] perTxCap; // indexed by Tier
    uint256[3] dailyCap; // indexed by Tier; rolling token bucket, refills cap/86400 per second
    uint256 ownerPerTxCap; // approveQueued ceiling (owner-signed bounties)
    uint256 ownerDailyCap;
    uint256 velocityMax; // payouts per window before the breaker trips
    uint48 velocityWindow; // seconds
    uint64 commitTtl; // blocks
}

struct Commitment {
    uint64 blockNumber;
    Verdict verdict;
    bool spent;
}

struct QueuedPayment {
    bytes32 decisionHash;
    Tier tier;
    address payee;
    uint256 amount;
    uint8 status; // 0 pending, 1 approved, 2 rejected
}

/// @title TalosLib
/// @notice Shared ERC-7201 storage and authority checks for DecisionLedgerFacet and TreasuryPolicyFacet.
library TalosLib {
    /// @custom:storage-location erc7201:talos.treasury
    struct Layout {
        address asset;
        Params params;
        mapping(bytes32 => Commitment) commits;
        mapping(Tier => mapping(address => bool)) allowlist;
        mapping(uint256 => QueuedPayment) queue;
        uint256 queueCount;
    }

    // keccak256(abi.encode(uint256(keccak256("talos.treasury")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant SLOT = 0x99359fd3966c8f6dbdf4ba4f750fde8ad64b7fcbcce2509aa845f96156757000;

    /// @dev Held only by the human owner: approve/reject escalations, commit, instant resume.
    bytes32 internal constant OWNER_ROLE = keccak256("TALOS_OWNER_ROLE");

    bytes32 internal constant VELOCITY_KEY = keccak256("talos.velocity");
    bytes32 internal constant OWNER_BUDGET_KEY = keccak256("talos.budget.owner");

    error Unauthorized();
    error NotCommitted();
    error AlreadyCommitted();
    error AlreadySpent();
    error CommitExpired();
    error WrongVerdict();
    error ExceedsTierCap(uint256 amount, uint256 cap);
    error PayeeNotAllowlisted(address payee);
    error ZeroPayee();
    error QueueItemNotPending(uint256 id);
    error TransferFailed();

    function layout() internal pure returns (Layout storage l) {
        bytes32 s = SLOT;
        assembly {
            l.slot := s
        }
    }

    function budgetKey(Tier tier) internal pure returns (bytes32) {
        return keccak256(abi.encode("talos.budget", tier));
    }

    /// @dev The agent is an ordinary EOA registered through Lattice's SessionKey facet: it must be inside its
    ///      validity window and hold an explicit (diamond, selector) grant for the function being called.
    function isAgent() internal view returns (bool) {
        return SessionKeyLib.isSessionKeyActive(msg.sender)
            && SessionKeyLib.isCallPermitted(msg.sender, address(this), msg.sig);
    }

    function checkAgent() internal view {
        if (!isAgent()) revert Unauthorized();
    }

    function checkOwner() internal view {
        if (!AccessControlLib.hasRole(OWNER_ROLE, msg.sender)) revert Unauthorized();
    }

    /// @dev Consumes a fresh, unspent commitment of `verdict` for `decisionHash`. TTL is in blocks: Arc
    ///      timestamps can repeat.
    function spendCommit(bytes32 decisionHash, Verdict verdict) internal {
        Layout storage l = layout();
        Commitment storage c = l.commits[decisionHash];
        if (c.blockNumber == 0) revert NotCommitted();
        if (c.verdict != verdict) revert WrongVerdict();
        if (c.spent) revert AlreadySpent();
        if (block.number > c.blockNumber + l.params.commitTtl) revert CommitExpired();
        c.spent = true;
    }

    /// @dev Stores params and (re)configures the Lattice RateLimiter buckets and the velocity CircuitBreaker.
    ///      Reconfiguring a bucket refills it, which is acceptable because this only runs at init or after a
    ///      48h timelock.
    function applyParams(Params memory p) internal {
        layout().params = p;
        for (uint256 t; t < 3; ++t) {
            RateLimiterLib._configure(budgetKey(Tier(t)), p.dailyCap[t], p.dailyCap[t] / 1 days);
        }
        RateLimiterLib._configure(OWNER_BUDGET_KEY, p.ownerDailyCap, p.ownerDailyCap / 1 days);
        CircuitBreakerLib._setThreshold(VELOCITY_KEY, p.velocityMax, p.velocityWindow);
    }

    function transferAsset(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            layout().asset.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
