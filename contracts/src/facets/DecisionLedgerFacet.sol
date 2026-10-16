// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TalosLib, Verdict, Commitment} from "../libraries/TalosLib.sol";

/// @title DecisionLedgerFacet
/// @notice The complete record, in the contract path: every Talos decision (including refusals) is committed
///         here before anything else happens, and `pay()` cannot clear without a fresh PAY commitment.
contract DecisionLedgerFacet {
    event DecisionCommitted(
        bytes32 indexed decisionHash, Verdict verdict, bytes32 attemptRef, address actor, uint256 blockNumber
    );

    /// @notice Records a decision. Callable by the agent session key or the owner. A hash commits once, so a
    ///         commitment cannot be refreshed to extend its TTL.
    function commit(bytes32 decisionHash, Verdict verdict, bytes32 attemptRef) external {
        if (!TalosLib.isAgent()) TalosLib.checkOwner();
        Commitment storage c = TalosLib.layout().commits[decisionHash];
        if (c.blockNumber != 0) revert TalosLib.AlreadyCommitted();
        c.blockNumber = uint64(block.number);
        c.verdict = verdict;
        emit DecisionCommitted(decisionHash, verdict, attemptRef, msg.sender, block.number);
    }

    function committedAt(bytes32 decisionHash) external view returns (uint256 blockNumber, Verdict verdict) {
        Commitment storage c = TalosLib.layout().commits[decisionHash];
        return (c.blockNumber, c.verdict);
    }

    function exportSelectors() external pure returns (bytes memory) {
        return abi.encodePacked(this.commit.selector, this.committedAt.selector);
    }
}
