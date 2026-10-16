// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {GovernedVault} from "@lattice/defi/GovernedVault.sol";
import {RateLimiter} from "@lattice/security/RateLimiter.sol";
import {CircuitBreaker} from "@lattice/security/CircuitBreaker.sol";
import {EmergencyStop} from "@lattice/security/EmergencyStop.sol";
import {TimelockController} from "@lattice/governance/TimelockController.sol";
import {SpendingLimit} from "@lattice/accounts/erc6900/modules/SpendingLimit.sol";
import {SessionKey} from "@lattice/accounts/SessionKey.sol";
import {DiamondCutFacet} from "@diamond/facets/DiamondCutFacet.sol";

/// Proves the pinned Lattice tag exposes every facet Talos composes.
contract LatticePinTest is Test {
    function test_facetsDeploy() public {
        new GovernedVault();
        new RateLimiter();
        new CircuitBreaker();
        new EmergencyStop();
        new TimelockController();
        new SpendingLimit();
        new SessionKey();
        new DiamondCutFacet();
    }
}
