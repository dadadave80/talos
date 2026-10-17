// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControlLib} from "@lattice/access/libraries/AccessControlLib.sol";
import {SessionKeyLib} from "@lattice/accounts/libraries/SessionKeyLib.sol";
import {TimelockControllerLib} from "@lattice/governance/libraries/TimelockControllerLib.sol";
import {ISessionKey} from "@lattice/interfaces/accounts/ISessionKey.sol";
import {CircuitBreakerLib} from "@lattice/security/libraries/CircuitBreakerLib.sol";
import {EmergencyStopLib, EMERGENCY_GUARDIAN_ROLE} from "@lattice/security/libraries/EmergencyStopLib.sol";
import {RateLimiterLib} from "@lattice/security/libraries/RateLimiterLib.sol";
import {DecisionLedgerFacet} from "../facets/DecisionLedgerFacet.sol";
import {TreasuryPolicyFacet} from "../facets/TreasuryPolicyFacet.sol";
import {TalosLib, Tier, Params} from "../libraries/TalosLib.sol";

/// @title TalosInit
/// @notice Runs once inside `Lattice.initialize`. Afterwards the diamond is its own sole DEFAULT_ADMIN, so every
///         cap, allowlist, session key and upgrade change is a TimelockController round (`timelockDelay`) that
///         only the owner can propose and execute. The agent key holds no role at all: it is a SessionKey with
///         grants for `commit`, `pay` and `queue` on this diamond, expiring at `agentExpiry`. `hotKey` is a second
///         SessionKey with `commit` only, so REFUSE commits never wait on the agent's MPC signer.
contract TalosInit {
    struct Config {
        address asset;
        address owner;
        address agent;
        address hotKey;
        uint48 agentExpiry;
        uint256 timelockDelay;
        Params params;
        Tier[] allowTiers;
        address[] allowPayees;
    }

    function init(Config calldata c) external {
        AccessControlLib.__AccessControl_init(address(this));
        EmergencyStopLib.__EmergencyStop_init();
        RateLimiterLib.__RateLimiter_init();
        CircuitBreakerLib.__CircuitBreaker_init();
        SessionKeyLib.__SessionKey_init();

        address[] memory owner = new address[](1);
        owner[0] = c.owner;
        TimelockControllerLib.__TimelockController_init(c.timelockDelay, owner, owner, address(0));

        AccessControlLib._grantRole(EMERGENCY_GUARDIAN_ROLE, c.owner);
        AccessControlLib._grantRole(TalosLib.OWNER_ROLE, c.owner);

        TalosLib.layout().asset = c.asset;
        TalosLib.applyParams(c.params);
        for (uint256 i; i < c.allowPayees.length; ++i) {
            TalosLib.layout().allowlist[c.allowTiers[i]][c.allowPayees[i]] = true;
        }

        // External self-call: the diamond is DEFAULT_ADMIN, and SessionKey wants calldata permissions.
        ISessionKey.Permission[] memory perms = new ISessionKey.Permission[](3);
        perms[0] = ISessionKey.Permission(address(this), DecisionLedgerFacet.commit.selector);
        perms[1] = ISessionKey.Permission(address(this), TreasuryPolicyFacet.pay.selector);
        perms[2] = ISessionKey.Permission(address(this), TreasuryPolicyFacet.queue.selector);
        ISessionKey(address(this)).registerSessionKey(c.agent, 0, c.agentExpiry, perms);
        ISessionKey.Permission[] memory commitOnly = new ISessionKey.Permission[](1);
        commitOnly[0] = perms[0];
        ISessionKey(address(this)).registerSessionKey(c.hotKey, 0, c.agentExpiry, commitOnly);
    }
}
