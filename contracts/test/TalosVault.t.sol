// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {FacetCut, FacetCutAction} from "@diamond/libraries/DiamondLib.sol";
import {IDiamondLoupe} from "@diamond/interfaces/IDiamondLoupe.sol";
import {Lattice} from "@lattice/Lattice.sol";
import {IAccessControl} from "@lattice/interfaces/access/IAccessControl.sol";
import {AccessControlDiamondCut} from "@lattice/governance/AccessControlDiamondCut.sol";
import {TimelockController} from "@lattice/governance/TimelockController.sol";
import {ITimelockController} from "@lattice/interfaces/governance/ITimelockController.sol";
import {ICircuitBreaker} from "@lattice/interfaces/security/ICircuitBreaker.sol";
import {IEmergencyStop} from "@lattice/interfaces/security/IEmergencyStop.sol";
import {IRateLimiter} from "@lattice/interfaces/security/IRateLimiter.sol";
import {EmergencyStop} from "@lattice/security/EmergencyStop.sol";
import {RateLimiter} from "@lattice/security/RateLimiter.sol";
import {DecisionLedgerFacet} from "../src/facets/DecisionLedgerFacet.sol";
import {TreasuryPolicyFacet} from "../src/facets/TreasuryPolicyFacet.sol";
import {TalosInit} from "../src/init/TalosInit.sol";
import {TalosLib, Tier, Verdict, Params, QueuedPayment} from "../src/libraries/TalosLib.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {TalosParams} from "../script/Params.s.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

interface ITalos {
    function commit(bytes32, Verdict, bytes32) external;
    function committedAt(bytes32) external view returns (uint256, Verdict);
    function pay(bytes32, Tier, address, uint256) external;
    function queue(bytes32, Tier, address, uint256, string calldata) external;
    function approveQueued(uint256) external;
    function rejectQueued(uint256) external;
    function resume() external;
    function setAllowlist(Tier, address, bool) external;
    function setParams(Params calldata) external;
    function params() external view returns (Params memory);
    function isAllowlisted(Tier, address) external view returns (bool);
    function queued(uint256) external view returns (QueuedPayment memory);
}

contract TalosVaultTest is Test {
    uint256 constant USDC = 1e6;
    bytes32 constant SALT = bytes32("talos");

    MockUSDC usdc;
    address vault;
    ITalos t;
    TimelockController tl;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address contributor = makeAddr("contributor");
    address vendor = makeAddr("vendor");
    address attacker = makeAddr("attacker");
    uint256 nonce;

    function setUp() public {
        vm.roll(1000);
        vm.warp(1_760_000_000);
        usdc = new MockUSDC();
        Deploy d = new Deploy();
        TalosInit.Config memory cfg = d.config(address(usdc), owner, agent);
        cfg.allowTiers = new Tier[](2);
        cfg.allowPayees = new address[](2);
        (cfg.allowTiers[0], cfg.allowPayees[0]) = (Tier.CONTRIBUTOR, contributor);
        (cfg.allowTiers[1], cfg.allowPayees[1]) = (Tier.VENDOR, vendor);
        (FacetCut[] memory cuts, address init, bytes memory data) = d.buildCuts(cfg);
        Lattice l = new Lattice();
        l.initialize(cuts, init, data);
        vault = address(l);
        t = ITalos(vault);
        tl = TimelockController(payable(vault));
        usdc.mint(vault, 50 * USDC);
    }

    function _hash() internal returns (bytes32) {
        return keccak256(abi.encode(++nonce));
    }

    function _commitPay(Tier tier, address payee, uint256 amount) internal returns (bytes32 h) {
        h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        t.pay(h, tier, payee, amount);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- commit-before-pay

    function test_payWithoutCommitReverts() public {
        vm.prank(agent);
        vm.expectRevert(TalosLib.NotCommitted.selector);
        t.pay(_hash(), Tier.DISCRETIONARY, attacker, USDC / 4);
    }

    function test_payWithCommitSucceeds() public {
        _commitPay(Tier.CONTRIBUTOR, contributor, 10 * USDC);
        assertEq(usdc.balanceOf(contributor), 10 * USDC);
    }

    function test_payTwiceReverts() public {
        bytes32 h = _commitPay(Tier.DISCRETIONARY, attacker, USDC / 4);
        vm.prank(agent);
        vm.expectRevert(TalosLib.AlreadySpent.selector);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4);
    }

    function test_payAfterTtlReverts() public {
        bytes32 h = _hash();
        vm.prank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.roll(block.number + 301);
        vm.prank(agent);
        vm.expectRevert(TalosLib.CommitExpired.selector);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4);
    }

    function test_refuseCommitCannotPay() public {
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.REFUSE, bytes32("attempt"));
        vm.expectRevert(TalosLib.WrongVerdict.selector);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4);
        vm.stopPrank();
    }

    function test_commitCannotBeRefreshed() public {
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(TalosLib.AlreadyCommitted.selector);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.stopPrank();
    }

    function test_strangerCannotCommit() public {
        vm.prank(attacker);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.commit(_hash(), Verdict.PAY, bytes32(0));
    }

    // ---------------------------------------------------------------- caps and allowlist

    function test_nonAllowlistedContributorReverts() public {
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(TalosLib.PayeeNotAllowlisted.selector, attacker));
        t.pay(h, Tier.CONTRIBUTOR, attacker, USDC);
        vm.stopPrank();
    }

    function test_nonAllowlistedVendorReverts() public {
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(TalosLib.PayeeNotAllowlisted.selector, attacker));
        t.pay(h, Tier.VENDOR, attacker, USDC);
        vm.stopPrank();
    }

    function test_discretionaryAbovePerTxCapReverts() public {
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(TalosLib.ExceedsTierCap.selector, USDC / 4 + 1, USDC / 4));
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4 + 1);
        vm.stopPrank();
    }

    function test_thirteenthDiscretionaryPaymentReverts() public {
        for (uint256 i; i < 12; ++i) {
            _commitPay(Tier.DISCRETIONARY, attacker, USDC / 4);
        }
        assertEq(usdc.balanceOf(attacker), 3 * USDC);
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectPartialRevert(IRateLimiter.RateLimitExceeded.selector);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4);
        vm.stopPrank();
    }

    function test_contributorDailyCap() public {
        _commitPay(Tier.CONTRIBUTOR, contributor, 10 * USDC);
        _commitPay(Tier.CONTRIBUTOR, contributor, 10 * USDC);
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectPartialRevert(IRateLimiter.RateLimitExceeded.selector);
        t.pay(h, Tier.CONTRIBUTOR, contributor, 10 * USDC);
        vm.stopPrank();
    }

    /// @dev Replaces the brief's "SpendingLimit hook" check (SpendingLimit is an ERC-6900 module and cannot be
    ///      installed on a diamond): no selector other than pay/approveQueued can move the asset.
    function test_noOtherAssetOutPath() public view {
        IDiamondLoupe loupe = IDiamondLoupe(vault);
        assertEq(loupe.facetAddress(RateLimiter.consume.selector), address(0), "unguarded consume exposed");
        assertEq(loupe.facetAddress(bytes4(keccak256("transfer(address,uint256)"))), address(0));
        assertEq(loupe.facetAddress(bytes4(keccak256("withdraw(uint256,address,address)"))), address(0));
        assertEq(loupe.facetAddress(bytes4(keccak256("execute(bytes32,bytes)"))), address(0), "7821 executor");
    }

    // ---------------------------------------------------------------- circuit breaker and emergency stop

    function test_breakerTripsOn21stPayout() public {
        for (uint256 i; i < 20; ++i) {
            _commitPay(Tier.DISCRETIONARY, attacker, USDC / 100);
        }
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0)); // commits still flow
        vm.expectRevert(abi.encodeWithSelector(ICircuitBreaker.CircuitBreakerTrippedError.selector, TalosLib.VELOCITY_KEY));
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 100);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.resume();
        vm.stopPrank();

        vm.prank(owner);
        t.resume();
        vm.prank(agent);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 100);
    }

    function test_emergencyStopPausesPayNotCommit() public {
        vm.prank(owner);
        EmergencyStop(vault).emergencyStop("drill");
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(IEmergencyStop.EmergencyStopActive.selector);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.resume();
        vm.expectPartialRevert(IAccessControl.AccessControlUnauthorizedAccount.selector);
        EmergencyStop(vault).emergencyResume();
        vm.stopPrank();

        vm.prank(owner);
        t.resume();
        vm.prank(agent);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4);
    }

    // ---------------------------------------------------------------- timelock authority

    function test_settersRevertForAgentAndOwner() public {
        Params memory p = t.params();
        p.perTxCap[2] = 100 * USDC;
        FacetCut[] memory none = new FacetCut[](0);
        address[2] memory callers = [agent, owner];
        for (uint256 i; i < 2; ++i) {
            vm.startPrank(callers[i]);
            vm.expectPartialRevert(IAccessControl.AccessControlUnauthorizedAccount.selector);
            t.setParams(p);
            vm.expectPartialRevert(IAccessControl.AccessControlUnauthorizedAccount.selector);
            t.setAllowlist(Tier.CONTRIBUTOR, attacker, true);
            vm.expectPartialRevert(IAccessControl.AccessControlUnauthorizedAccount.selector);
            AccessControlDiamondCut(vault).diamondCut(none, address(0), "");
            vm.stopPrank();
        }
    }

    function test_onlyTimelockChangesAllowlistAfter48h() public {
        bytes memory data = abi.encodeCall(ITalos.setAllowlist, (Tier.CONTRIBUTOR, attacker, true));
        vm.prank(agent);
        vm.expectPartialRevert(IAccessControl.AccessControlUnauthorizedAccount.selector);
        tl.schedule(vault, 0, data, bytes32(0), SALT, 172_800);

        vm.prank(owner);
        vm.expectPartialRevert(ITimelockController.TimelockInsufficientDelay.selector);
        tl.schedule(vault, 0, data, bytes32(0), SALT, 172_799);

        vm.prank(owner);
        tl.schedule(vault, 0, data, bytes32(0), SALT, 172_800);
        vm.warp(block.timestamp + 172_799);
        vm.prank(owner);
        vm.expectRevert();
        tl.execute(vault, 0, data, bytes32(0), SALT);

        vm.warp(block.timestamp + 1);
        vm.prank(agent);
        vm.expectRevert();
        tl.execute(vault, 0, data, bytes32(0), SALT);
        vm.prank(owner);
        tl.execute(vault, 0, data, bytes32(0), SALT);
        assertTrue(t.isAllowlisted(Tier.CONTRIBUTOR, attacker));
    }

    function test_timelockSetParams() public {
        Params memory p = t.params();
        p.perTxCap[2] = USDC / 10;
        bytes memory data = abi.encodeCall(ITalos.setParams, (p));
        vm.prank(owner);
        tl.schedule(vault, 0, data, bytes32(0), SALT, 172_800);
        vm.warp(block.timestamp + 172_800);
        vm.prank(owner);
        tl.execute(vault, 0, data, bytes32(0), SALT);
        assertEq(t.params().perTxCap[2], USDC / 10);
    }

    // ---------------------------------------------------------------- escalation queue

    function _queue(uint256 amount) internal returns (bytes32 h) {
        h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.QUEUE, bytes32(0));
        t.queue(h, Tier.DISCRETIONARY, attacker, amount, "novel finding");
        vm.stopPrank();
    }

    function test_queueRequiresQueueCommit() public {
        bytes32 h = _hash();
        vm.startPrank(agent);
        vm.expectRevert(TalosLib.NotCommitted.selector);
        t.queue(h, Tier.DISCRETIONARY, attacker, 10 * USDC, "x");
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(TalosLib.WrongVerdict.selector);
        t.queue(h, Tier.DISCRETIONARY, attacker, 10 * USDC, "x");
        vm.stopPrank();
    }

    function test_approveQueued() public {
        _queue(10 * USDC);
        vm.prank(agent);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.approveQueued(0);

        vm.expectEmit(vault);
        emit TreasuryPolicyFacet.Approved(0, owner);
        vm.prank(owner);
        t.approveQueued(0);
        assertEq(usdc.balanceOf(attacker), 10 * USDC);
        assertEq(t.queued(0).status, 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TalosLib.QueueItemNotPending.selector, 0));
        t.approveQueued(0);
    }

    function test_rejectQueued() public {
        _queue(10 * USDC);
        vm.prank(agent);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.rejectQueued(0);
        vm.prank(owner);
        t.rejectQueued(0);
        assertEq(t.queued(0).status, 2);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TalosLib.QueueItemNotPending.selector, 0));
        t.approveQueued(0);
    }

    function test_approveAboveOwnerCapReverts() public {
        _queue(21 * USDC);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TalosLib.ExceedsTierCap.selector, 21 * USDC, 20 * USDC));
        t.approveQueued(0);
    }

    // ---------------------------------------------------------------- agent key scope

    function test_agentKeyScope() public {
        vm.startPrank(agent);
        vm.expectPartialRevert(IAccessControl.AccessControlUnauthorizedAccount.selector);
        IAccessControl(vault).grantRole(bytes32(0), agent);
        vm.expectRevert();
        EmergencyStop(vault).emergencyStop("x");
        vm.stopPrank();
    }

    function test_agentKeyExpires() public {
        vm.warp(TalosParams.AGENT_EXPIRY + 1);
        vm.prank(agent);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.commit(_hash(), Verdict.REFUSE, bytes32(0));
    }

    // ---------------------------------------------------------------- shared decision-hash vector

    /// @dev Must equal apps/agent's decisionHash() for the same inputs (see the TS test with the same vector).
    function test_decisionHashVector() public pure {
        bytes32 h = keccak256(
            abi.encode(
                bytes32(uint256(123)),
                address(0x000000000000000000000000000000000000dEaD),
                uint256(250_000),
                uint8(Tier.DISCRETIONARY),
                keccak256(bytes("reported a reproducible Lattice issue")),
                "openai/gpt-oss-120b",
                keccak256(bytes("prompt"))
            )
        );
        assertEq(h, DECISION_HASH_VECTOR);
    }

    bytes32 constant DECISION_HASH_VECTOR = 0x38e542d458cd821f47601b4e70408f1c14aecebf4a470ccd31cb6877aac4f90a;
}
