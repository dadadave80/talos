// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControlLib, DEFAULT_ADMIN_ROLE} from "@lattice/access/libraries/AccessControlLib.sol";
import {CircuitBreakerLib} from "@lattice/security/libraries/CircuitBreakerLib.sol";
import {EmergencyStopLib} from "@lattice/security/libraries/EmergencyStopLib.sol";
import {RateLimiterLib} from "@lattice/security/libraries/RateLimiterLib.sol";
import {TalosLib, Tier, Verdict, Params, QueuedPayment} from "../libraries/TalosLib.sol";

/// @title TreasuryPolicyFacet
/// @notice The only paths USDC leaves the vault: `pay` (agent, within tier caps, after a PAY commit) and
///         `approveQueued` (human owner, within the owner cap). Caps and allowlists change only via the timelock.
contract TreasuryPolicyFacet {
    event Paid(bytes32 indexed decisionHash, Tier tier, address payee, uint256 amount);
    event Queued(uint256 indexed id, bytes32 decisionHash, Tier tier, address payee, uint256 amount, string reason);
    event Approved(uint256 indexed id, address signer);
    event Rejected(uint256 indexed id, address signer);
    event AllowlistSet(Tier indexed tier, address indexed payee, bool allowed);
    event ParamsSet(Params p);
    event Resumed(address indexed by, bool clearedStop, bool clearedVelocity);

    function pay(bytes32 decisionHash, Tier tier, address payee, uint256 amount) external {
        TalosLib.checkAgent();
        EmergencyStopLib.checkNotStopped();
        CircuitBreakerLib.checkNotTripped(TalosLib.VELOCITY_KEY);
        TalosLib.spendCommit(decisionHash, Verdict.PAY);
        if (payee == address(0)) revert TalosLib.ZeroPayee();

        TalosLib.Layout storage l = TalosLib.layout();
        uint256 cap = l.params.perTxCap[uint256(tier)];
        if (amount > cap) revert TalosLib.ExceedsTierCap(amount, cap);
        if (tier != Tier.DISCRETIONARY && !l.allowlist[tier][payee]) revert TalosLib.PayeeNotAllowlisted(payee);
        RateLimiterLib.consume(TalosLib.budgetKey(tier), amount);

        TalosLib.transferAsset(payee, amount);
        // Recorded last and never followed by a revert: a revert here would roll the trip back.
        CircuitBreakerLib._recordObservation(TalosLib.VELOCITY_KEY, 1);
        emit Paid(decisionHash, tier, payee, amount);
    }

    /// @notice Escalates a payment to the human owner. Works while the breaker is tripped or the vault is
    ///         stopped: escalating moves no money.
    function queue(bytes32 decisionHash, Tier tier, address payee, uint256 amount, string calldata reason) external {
        TalosLib.checkAgent();
        TalosLib.spendCommit(decisionHash, Verdict.QUEUE);
        if (payee == address(0)) revert TalosLib.ZeroPayee();
        TalosLib.Layout storage l = TalosLib.layout();
        uint256 id = l.queueCount++;
        l.queue[id] = QueuedPayment(decisionHash, tier, payee, amount, 0);
        emit Queued(id, decisionHash, tier, payee, amount, reason);
    }

    function approveQueued(uint256 id) external {
        TalosLib.checkOwner();
        EmergencyStopLib.checkNotStopped();
        TalosLib.Layout storage l = TalosLib.layout();
        QueuedPayment storage q = l.queue[id];
        if (id >= l.queueCount || q.status != 0) revert TalosLib.QueueItemNotPending(id);
        if (q.amount > l.params.ownerPerTxCap) revert TalosLib.ExceedsTierCap(q.amount, l.params.ownerPerTxCap);
        RateLimiterLib.consume(TalosLib.OWNER_BUDGET_KEY, q.amount);
        q.status = 1;
        TalosLib.transferAsset(q.payee, q.amount);
        emit Approved(id, msg.sender);
        emit Paid(q.decisionHash, q.tier, q.payee, q.amount);
    }

    function rejectQueued(uint256 id) external {
        TalosLib.checkOwner();
        TalosLib.Layout storage l = TalosLib.layout();
        if (id >= l.queueCount || l.queue[id].status != 0) revert TalosLib.QueueItemNotPending(id);
        l.queue[id].status = 2;
        emit Rejected(id, msg.sender);
    }

    /// @notice Owner's instant recovery: clears only the EmergencyStop flag and the velocity counter; RateLimiter
    ///         budgets are untouched. Deliberate deviation from Lattice, where resume is DEFAULT_ADMIN (here: a 48h
    ///         timelock round). The owner can resume instantly; nobody can raise a cap instantly.
    function resume() external {
        TalosLib.checkOwner();
        bool clearedStop = EmergencyStopLib.isStopped();
        bool clearedVelocity = CircuitBreakerLib.isTripped(TalosLib.VELOCITY_KEY);
        if (clearedStop) EmergencyStopLib._emergencyResume();
        if (clearedVelocity) CircuitBreakerLib._reset(TalosLib.VELOCITY_KEY);
        emit Resumed(msg.sender, clearedStop, clearedVelocity);
    }

    function setAllowlist(Tier tier, address payee, bool allowed) external {
        AccessControlLib.checkRole(DEFAULT_ADMIN_ROLE);
        TalosLib.layout().allowlist[tier][payee] = allowed;
        emit AllowlistSet(tier, payee, allowed);
    }

    function setParams(Params calldata p) external {
        AccessControlLib.checkRole(DEFAULT_ADMIN_ROLE);
        TalosLib.applyParams(p);
        emit ParamsSet(p);
    }

    function params() external view returns (Params memory) {
        return TalosLib.layout().params;
    }

    function asset() external view returns (address) {
        return TalosLib.layout().asset;
    }

    function isAllowlisted(Tier tier, address payee) external view returns (bool) {
        return TalosLib.layout().allowlist[tier][payee];
    }

    function queued(uint256 id) external view returns (QueuedPayment memory) {
        return TalosLib.layout().queue[id];
    }

    function queueCount() external view returns (uint256) {
        return TalosLib.layout().queueCount;
    }

    function exportSelectors() external pure returns (bytes memory) {
        return abi.encodePacked(
            abi.encodePacked(
                this.pay.selector,
                this.queue.selector,
                this.approveQueued.selector,
                this.rejectQueued.selector,
                this.resume.selector,
                this.setAllowlist.selector,
                this.setParams.selector
            ),
            abi.encodePacked(
                this.params.selector,
                this.asset.selector,
                this.isAllowlisted.selector,
                this.queued.selector,
                this.queueCount.selector
            )
        );
    }
}
