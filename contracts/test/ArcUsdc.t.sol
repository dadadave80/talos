// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {FacetCut} from "@diamond/libraries/DiamondLib.sol";
import {Lattice} from "@lattice/Lattice.sol";
import {TreasuryPolicyFacet} from "../src/facets/TreasuryPolicyFacet.sol";
import {DecisionLedgerFacet} from "../src/facets/DecisionLedgerFacet.sol";
import {TalosInit} from "../src/init/TalosInit.sol";
import {TalosLib, Tier, Verdict} from "../src/libraries/TalosLib.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {TalosParams} from "../script/Params.s.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

/// @notice Payments against Arc's real USDC (ERC-20 view of the native balance). Stock revm lacks Arc's USDC
///         precompile, so these run only under Arc Foundry: `ARC_FORGE=1 arc-forge test --mc ArcUsdc`
///         (forks arc-testnet). Under plain forge they are skipped.
contract ArcUsdcTest is Test {
    uint256 constant USDC = 1e6;
    IERC20 constant usdc = IERC20(TalosParams.ARC_USDC);
    address vault;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address hotKey = makeAddr("hotKey");
    address contributor = makeAddr("contributor");

    function setUp() public {
        vm.skip(!vm.envOr("ARC_FORGE", false));
        vm.createSelectFork("arc-testnet");
        Deploy d = new Deploy();
        TalosInit.Config memory cfg = d.config(TalosParams.ARC_USDC, owner, agent, hotKey);
        cfg.allowTiers = new Tier[](1);
        cfg.allowPayees = new address[](1);
        (cfg.allowTiers[0], cfg.allowPayees[0]) = (Tier.CONTRIBUTOR, contributor);
        (FacetCut[] memory cuts, address init, bytes memory data) = d.buildCuts(cfg);
        Lattice l = new Lattice();
        l.initialize(cuts, init, data);
        vault = address(l);
        vm.deal(vault, 50 ether); // native view, 18 decimals == 50 USDC in the 6-decimal ERC-20 view
    }

    function test_realUsdcPay() public {
        assertEq(usdc.balanceOf(vault), 50 * USDC);
        bytes32 h = keccak256("arc-usdc");
        vm.startPrank(agent);
        DecisionLedgerFacet(vault).commit(h, Verdict.PAY, bytes32(0));
        TreasuryPolicyFacet(vault).pay(h, Tier.CONTRIBUTOR, contributor, 10 * USDC);
        vm.stopPrank();
        assertEq(usdc.balanceOf(contributor), 10 * USDC);
        assertEq(usdc.balanceOf(vault), 40 * USDC);
    }

    function test_realUsdcPayWithoutCommitReverts() public {
        vm.prank(agent);
        vm.expectRevert(TalosLib.NotCommitted.selector);
        TreasuryPolicyFacet(vault).pay(keccak256("x"), Tier.DISCRETIONARY, contributor, USDC / 4);
    }

    /// @dev Blocklisted or otherwise failing transfer: pay() reverts as a whole, the commit stays unspent but the
    ///      agent never retries the same decision (it is a failed attempt; the revert still burns gas).
    function test_realUsdcZeroPayeeReverts() public {
        bytes32 h = keccak256("zero");
        vm.startPrank(agent);
        DecisionLedgerFacet(vault).commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(TalosLib.ZeroPayee.selector);
        TreasuryPolicyFacet(vault).pay(h, Tier.DISCRETIONARY, address(0), USDC / 4);
        vm.stopPrank();
    }
}
