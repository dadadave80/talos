// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Test-only smart account: ERC-1271 valid iff the owner EOA signed the hash. Used by
///         apps/web/lib/accounts/freeTier.test.ts to exercise deployed (1271) and undeployed (6492) verification.
contract Mock1271Wallet {
    address public immutable owner;

    constructor(address o) {
        owner = o;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (sig.length != 65) return 0xffffffff;
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        return ecrecover(hash, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract Mock1271Factory {
    function deploy(address o) external returns (address) {
        return address(new Mock1271Wallet{salt: bytes32(0)}(o));
    }
}
