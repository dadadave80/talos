// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Facet, FacetCut, FacetCutAction} from "@diamond/libraries/DiamondLib.sol";
import {IDiamondLoupe} from "@diamond/interfaces/IDiamondLoupe.sol";
import {Lattice} from "@lattice/Lattice.sol";
import {IAccessControl} from "@lattice/interfaces/access/IAccessControl.sol";
import {AccessControlDiamondCut} from "@lattice/governance/AccessControlDiamondCut.sol";
import {TimelockController} from "@lattice/governance/TimelockController.sol";
import {ITimelockController} from "@lattice/interfaces/governance/ITimelockController.sol";
import {ICircuitBreaker} from "@lattice/interfaces/security/ICircuitBreaker.sol";
import {IEmergencyStop} from "@lattice/interfaces/security/IEmergencyStop.sol";
import {ISessionKey} from "@lattice/interfaces/accounts/ISessionKey.sol";
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
    address hotKey = makeAddr("hotKey");
    address contributor = makeAddr("contributor");
    address vendor = makeAddr("vendor");
    address attacker = makeAddr("attacker");
    uint256 nonce;

    function setUp() public {
        vm.roll(1000);
        vm.warp(1_760_000_000);
        usdc = new MockUSDC();
        Deploy d = new Deploy();
        TalosInit.Config memory cfg = d.config(address(usdc), owner, agent, hotKey);
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
        vm.roll(block.number + 601);
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

    /// @dev The velocity breaker trips after 10 payouts; the owner's resume clears it but not the daily budget.
    function test_thirteenthDiscretionaryPaymentReverts() public {
        for (uint256 i; i < 12; ++i) {
            if (i == 10) {
                vm.prank(owner);
                t.resume();
            }
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

    function test_breakerTripsOn11thPayout() public {
        for (uint256 i; i < 10; ++i) {
            _commitPay(Tier.DISCRETIONARY, attacker, USDC / 100);
        }
        bytes32 h = _hash();
        vm.startPrank(agent);
        t.commit(h, Verdict.PAY, bytes32(0)); // commits still flow
        vm.expectRevert(
            abi.encodeWithSelector(ICircuitBreaker.CircuitBreakerTrippedError.selector, TalosLib.VELOCITY_KEY)
        );
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

    // ---------------------------------------------------------------- two agent keys

    function test_hotKeyCommitsOnly() public {
        bytes32 h = _hash();
        vm.startPrank(hotKey);
        t.commit(h, Verdict.REFUSE, bytes32("attempt"));
        bytes32 p = _hash();
        t.commit(p, Verdict.PAY, bytes32(0));
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.pay(p, Tier.DISCRETIONARY, hotKey, USDC / 4);
        bytes32 q = _hash();
        t.commit(q, Verdict.QUEUE, bytes32(0));
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.queue(q, Tier.DISCRETIONARY, hotKey, USDC, "x");
        vm.stopPrank();
    }

    function _assertKeyDead(address key) internal {
        bytes32 h = _hash();
        vm.startPrank(key);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.commit(h, Verdict.PAY, bytes32(0));
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.pay(h, Tier.DISCRETIONARY, attacker, USDC / 4);
        vm.expectRevert(TalosLib.Unauthorized.selector);
        t.queue(h, Tier.DISCRETIONARY, attacker, USDC, "x");
        vm.stopPrank();
    }

    function test_expiredKeysRevertOnEverything() public {
        vm.warp(TalosParams.AGENT_EXPIRY + 1);
        _assertKeyDead(agent);
        _assertKeyDead(hotKey);
    }

    /// @dev Revocation is DEFAULT_ADMIN, i.e. a timelock round; pranking the diamond stands in for its execution.
    function test_revokedKeyRevertsOnEverything() public {
        vm.startPrank(vault);
        ISessionKey(vault).revokeSessionKey(agent);
        ISessionKey(vault).revokeSessionKey(hotKey);
        vm.stopPrank();
        _assertKeyDead(agent);
        _assertKeyDead(hotKey);
    }

    // ---------------------------------------------------------------- resume scope and timelock liveness

    function test_resumeLeavesBudgetsUntouched() public {
        for (uint256 i; i < 10; ++i) {
            _commitPay(Tier.DISCRETIONARY, attacker, USDC / 10);
        }
        vm.prank(owner);
        EmergencyStop(vault).emergencyStop("drill");
        IRateLimiter rl = IRateLimiter(vault);
        uint256 disc = rl.getAvailable(TalosLib.budgetKey(Tier.DISCRETIONARY));
        uint256 own = rl.getAvailable(TalosLib.OWNER_BUDGET_KEY);
        assertEq(disc, 2 * USDC);

        vm.expectEmit(vault);
        emit TreasuryPolicyFacet.Resumed(owner, true, true); // 10 payouts tripped velocity too
        vm.prank(owner);
        t.resume();
        assertEq(rl.getAvailable(TalosLib.budgetKey(Tier.DISCRETIONARY)), disc);
        assertEq(rl.getAvailable(TalosLib.OWNER_BUDGET_KEY), own);
        assertFalse(IEmergencyStop(vault).isStopped());
    }

    function test_timelockDelayLiveAtInit() public view {
        assertEq(tl.getMinDelay(), 172_800);
        assertTrue(IAccessControl(vault).hasRole(tl.PROPOSER_ROLE(), owner));
        assertTrue(IAccessControl(vault).hasRole(tl.EXECUTOR_ROLE(), owner));
        assertFalse(IAccessControl(vault).hasRole(tl.PROPOSER_ROLE(), agent));
        assertFalse(IAccessControl(vault).hasRole(tl.EXECUTOR_ROLE(), agent));
        assertTrue(IAccessControl(vault).hasRole(bytes32(0), vault), "diamond must stay its own admin");
        assertFalse(IAccessControl(vault).hasRole(bytes32(0), owner));
        assertTrue(IEmergencyStop(vault).isGuardian(owner));
        assertFalse(IEmergencyStop(vault).isGuardian(agent));
    }

    // ---------------------------------------------------------------- every selector's access control

    enum Who {
        VIEW, // anyone, read-only
        ADMIN, // DEFAULT_ADMIN = the diamond, i.e. a timelock round
        OWNER, // OWNER_ROLE / guardian / timelock proposer+executor
        AGENT, // Circle EOA session key (commit, pay, queue)
        COMMIT, // agent, hot key or owner
        SELF // renounceRole: only ever affects the caller
    }

    /// @dev Table of every selector cut into the diamond. The test fails if the loupe shows a selector missing
    ///      here, so a new facet or a forgotten exclusion cannot slip in unclassified.
    function _table() internal pure returns (bytes4[] memory s, Who[] memory w) {
        s = new bytes4[](80);
        w = new Who[](80);
        uint256 n;
        bytes4[34] memory views = [
            bytes4(0x01ffc9a7),
            0xcdffacc6,
            0x52ef6b2c,
            0xadfca15e,
            0x7a0ed627, // ERC165, loupe
            0x248a9ca3,
            0x91d14854, // AccessControl
            0x0c68ba21,
            0x3f683b6a,
            0x5b0b0c07, // EmergencyStop
            0xd121f72c,
            0x6dd5b69d, // RateLimiter
            0x7e633690,
            0x42acf119,
            0xcaac05fa, // CircuitBreaker
            0xe4aea089,
            0xf4d2a194,
            0x78b6590d,
            0xab1c8674, // SessionKey
            0xb08e51c0,
            0x07bd0265,
            0x8f61f4f5,
            0xf27a0c92,
            0x7958004c,
            0xd45c4435,
            0x8065657f,
            0xb1c5f427,
            0x31d50750,
            0x2ab0f529,
            0x584b153e,
            0x13bc9f20, // Timelock views
            0x6533d53f, // committedAt
            0x38d52e0f,
            0x97238867 // asset, isAllowlisted
        ];
        for (uint256 i; i < views.length; ++i) {
            (s[n], w[n++]) = (views[i], Who.VIEW);
        }
        bytes4[3] memory moreViews = [bytes4(0xcff0ab96), 0x9ef36bd1, 0x9f0c3101]; // params, queueCount, queued
        for (uint256 i; i < moreViews.length; ++i) {
            (s[n], w[n++]) = (moreViews[i], Who.VIEW);
        }
        bytes4[16] memory admin = [
            bytes4(0x2f2ff15d),
            0xd547741f, // grantRole, revokeRole
            0x1f931c1c, // diamondCut
            0x93c87f03,
            0xa526d83b,
            0x71404156, // emergencyResume, add/removeGuardian
            0xbe0b31ab, // RateLimiter.configure
            0x802ec864,
            0xef13ca9d,
            0xed3c7d40, // setThreshold, recordObservation, reset
            0xc8337e5a,
            0x84f4fc6a,
            0xba9735cc, // register/revoke session key, setSpendLimit
            0x64d62353, // updateDelay (timelock self-call only)
            0xd6cfa876,
            0xc7ed60f6 // setAllowlist, setParams
        ];
        for (uint256 i; i < admin.length; ++i) {
            (s[n], w[n++]) = (admin[i], Who.ADMIN);
        }
        bytes4[9] memory own = [
            bytes4(0xb1e3268b), // emergencyStop (guardian)
            0xc4d252f5,
            0x134008d3,
            0xe38335e5,
            0x01d5062a,
            0x8f2a0bb0, // timelock cancel/execute/schedule
            0x5e103bb3,
            0x3ace3f5d,
            0x046f7da2 // approveQueued, rejectQueued, resume
        ];
        for (uint256 i; i < own.length; ++i) {
            (s[n], w[n++]) = (own[i], Who.OWNER);
        }
        (s[n], w[n++]) = (bytes4(0x8e771aa1), Who.AGENT); // pay
        (s[n], w[n++]) = (bytes4(0xb1b32e87), Who.AGENT); // queue
        (s[n], w[n++]) = (bytes4(0x8bbe4d9d), Who.COMMIT); // commit
        (s[n], w[n++]) = (bytes4(0x36568abe), Who.SELF); // renounceRole
        (s[n], w[n++]) = (bytes4(0), Who.VIEW); // Receive's receive() sentinel: anyone may fund the vault
        assembly {
            mstore(s, n)
            mstore(w, n)
        }
    }

    function _allowed(Who w, address caller) internal view returns (bool) {
        if (w == Who.VIEW || w == Who.SELF) return true;
        if (w == Who.OWNER) return caller == owner;
        if (w == Who.AGENT) return caller == agent;
        if (w == Who.COMMIT) return caller == agent || caller == hotKey || caller == owner;
        return false; // ADMIN: no EOA, ever
    }

    function _isAuthError(bytes memory ret) internal pure returns (bool) {
        if (ret.length < 4) return false;
        bytes4 e = bytes4(ret);
        return e == TalosLib.Unauthorized.selector || e == IAccessControl.AccessControlUnauthorizedAccount.selector
            || e == ITimelockController.TimelockUnauthorizedCaller.selector
            || e == IEmergencyStop.EmergencyStopUnauthorizedGuardian.selector;
    }

    function test_everySelectorAccessControl() public {
        (bytes4[] memory sel, Who[] memory who) = _table();
        Facet[] memory facets = IDiamondLoupe(vault).facets();
        uint256 cut;
        for (uint256 f; f < facets.length; ++f) {
            for (uint256 i; i < facets[f].functionSelectors.length; ++i) {
                bytes4 x = facets[f].functionSelectors[i];
                bool found;
                for (uint256 j; j < sel.length; ++j) {
                    if (sel[j] == x) found = true;
                }
                assertTrue(found, vm.toString(abi.encodePacked(x)));
                ++cut;
            }
        }
        assertEq(cut, sel.length, "table lists a selector that is not cut");

        address[4] memory callers = [attacker, agent, hotKey, owner];
        for (uint256 j; j < sel.length; ++j) {
            if (who[j] == Who.VIEW || who[j] == Who.SELF) continue;
            for (uint256 c; c < callers.length; ++c) {
                if (_allowed(who[j], callers[c])) continue;
                vm.prank(callers[c]);
                (bool ok, bytes memory ret) = vault.call(abi.encodePacked(sel[j], new bytes(640)));
                assertFalse(ok, string.concat("callable: ", vm.toString(abi.encodePacked(sel[j]))));
                assertTrue(_isAuthError(ret), string.concat("non-auth revert: ", vm.toString(abi.encodePacked(sel[j]))));
            }
        }
    }

    // ---------------------------------------------------------------- shared decision-hash vector

    /// @dev Must equal apps/web decisionHash() for the same inputs (apps/web/src/ledger/decision.test.ts).
    ///      chainid and the vault address bind a decision to one deployment, so a testnet commit can never be
    ///      replayed as evidence for mainnet.
    function test_decisionHashVector() public pure {
        bytes32 h = keccak256(
            abi.encode(
                uint256(5_042_002),
                address(0x1111111111111111111111111111111111111111),
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

    bytes32 constant DECISION_HASH_VECTOR = 0x34eeff2d1846d4f5d2eeb8c7164b06dd1f7f9e851fc58b57d9224a057ac2331f;
}
