// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {DiamondLoupeFacet} from "@diamond/facets/DiamondLoupeFacet.sol";
import {ERC165Facet} from "@diamond/facets/ERC165Facet.sol";
import {FacetCut} from "@diamond/libraries/DiamondLib.sol";
import {BaseDeploy} from "@lattice-script/base/BaseDeploy.s.sol";
import {Receive} from "@lattice/Receive.sol";
import {AccessControl} from "@lattice/access/AccessControl.sol";
import {SessionKey} from "@lattice/accounts/SessionKey.sol";
import {AccessControlDiamondCut} from "@lattice/governance/AccessControlDiamondCut.sol";
import {TimelockController} from "@lattice/governance/TimelockController.sol";
import {CircuitBreaker} from "@lattice/security/CircuitBreaker.sol";
import {EmergencyStop} from "@lattice/security/EmergencyStop.sol";
import {RateLimiter} from "@lattice/security/RateLimiter.sol";
import {DecisionLedgerFacet} from "../src/facets/DecisionLedgerFacet.sol";
import {TreasuryPolicyFacet} from "../src/facets/TreasuryPolicyFacet.sol";
import {TalosInit} from "../src/init/TalosInit.sol";
import {Tier} from "../src/libraries/TalosLib.sol";
import {TalosParams} from "./Params.s.sol";

/// @notice Composes, cuts and initializes TalosVault in one transaction through LatticeFactory.
///         `forge script script/Deploy.s.sol --rpc-url arc-testnet --broadcast --account <keystore>`
///         Env: OWNER_ADDRESS, AGENT_ADDRESS, optional VENDOR_ALLOWLIST / CONTRIBUTOR_ALLOWLIST (comma-separated).
contract Deploy is BaseDeploy {
    function buildCuts(TalosInit.Config memory cfg)
        public
        returns (FacetCut[] memory cuts, address init, bytes memory initCalldata)
    {
        // RateLimiter's public consume() is unguarded; Talos only consumes through TreasuryPolicyFacet.
        bytes4[] memory noConsume = new bytes4[](1);
        noConsume[0] = RateLimiter.consume.selector;

        cuts = new FacetCut[](12);
        cuts[0] = _cut(address(new ERC165Facet()));
        cuts[1] = _cut(address(new DiamondLoupeFacet()));
        cuts[2] = _cut(address(new AccessControl()));
        cuts[3] = _cut(address(new AccessControlDiamondCut()));
        cuts[4] = _cut(address(new EmergencyStop()));
        cuts[5] = _cutExcept(address(new RateLimiter()), noConsume);
        cuts[6] = _cut(address(new CircuitBreaker()));
        cuts[7] = _cut(address(new SessionKey()));
        cuts[8] = _cut(address(new TimelockController()));
        cuts[9] = _cut(address(new Receive()));
        cuts[10] = _cut(address(new DecisionLedgerFacet()));
        cuts[11] = _cut(address(new TreasuryPolicyFacet()));
        (init, initCalldata) =
            _withUpgradeableIntrospection(address(new TalosInit()), abi.encodeCall(TalosInit.init, (cfg)));
    }

    function config(address asset, address owner, address agent) public view returns (TalosInit.Config memory cfg) {
        address[] memory vendors = vm.envOr("VENDOR_ALLOWLIST", ",", new address[](0));
        address[] memory contributors = vm.envOr("CONTRIBUTOR_ALLOWLIST", ",", new address[](0));
        cfg.allowTiers = new Tier[](vendors.length + contributors.length);
        cfg.allowPayees = new address[](cfg.allowTiers.length);
        for (uint256 i; i < vendors.length; ++i) {
            (cfg.allowTiers[i], cfg.allowPayees[i]) = (Tier.VENDOR, vendors[i]);
        }
        for (uint256 i; i < contributors.length; ++i) {
            (cfg.allowTiers[vendors.length + i], cfg.allowPayees[vendors.length + i]) =
                (Tier.CONTRIBUTOR, contributors[i]);
        }
        cfg.asset = asset;
        cfg.owner = owner;
        cfg.agent = agent;
        cfg.agentExpiry = TalosParams.AGENT_EXPIRY;
        cfg.timelockDelay = TalosParams.TIMELOCK_DELAY;
        cfg.params = TalosParams.launch();
    }

    function run() external returns (address vault) {
        address owner = vm.envAddress("OWNER_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        require(owner != agent, "owner key must not be the agent key");
        TalosInit.Config memory cfg = config(TalosParams.ARC_USDC, owner, agent);
        vm.startBroadcast();
        (FacetCut[] memory cuts, address init, bytes memory initCalldata) = buildCuts(cfg);
        vault = _assemble(cuts, init, initCalldata);
        vm.stopBroadcast();
    }
}
