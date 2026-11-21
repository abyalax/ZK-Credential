// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IssuerRegistry
/// @notice Owner-managed allowlist of canonical BabyJubJub issuer public keys.
/// @dev Deliberately has no revocation path in the P1 research scope.
contract IssuerRegistry {
    address public immutable owner;
    mapping(bytes32 => bool) private trustedKeys;

    event IssuerAdded(string publicKey);

    error NotOwner();
    error EmptyPublicKey();
    error AlreadyTrusted();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function addIssuer(string calldata publicKey) external onlyOwner {
        if (bytes(publicKey).length == 0) revert EmptyPublicKey();
        bytes32 key = keccak256(bytes(publicKey));
        if (trustedKeys[key]) revert AlreadyTrusted();
        trustedKeys[key] = true;
        emit IssuerAdded(publicKey);
    }

    function isTrusted(string calldata publicKey) external view returns (bool) {
        return trustedKeys[keccak256(bytes(publicKey))];
    }
}
