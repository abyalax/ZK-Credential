// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IssuerRegistry
/// @notice Owner-managed allowlist of issuer public keys, identified by their key hash.
/// @dev The circuit exposes `issuerKeyHash = Poseidon(Ax, Ay)` as a public signal, so trust is
///      keyed by that hash and `CredentialVerifier` can check it without hashing on-chain.
///      The hash is computed off-chain by the owner's tooling. There is deliberately no
///      revocation path (out of scope, see docs/architecture/overview.md).
contract IssuerRegistry {
    address public immutable owner;
    mapping(uint256 => bool) private trustedKeyHashes;

    event IssuerAdded(uint256 indexed publicKeyHash);

    error NotOwner();
    error AlreadyTrusted();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function addIssuer(uint256 publicKeyHash) external onlyOwner {
        if (trustedKeyHashes[publicKeyHash]) revert AlreadyTrusted();
        trustedKeyHashes[publicKeyHash] = true;
        emit IssuerAdded(publicKeyHash);
    }

    function isTrusted(uint256 publicKeyHash) external view returns (bool) {
        return trustedKeyHashes[publicKeyHash];
    }
}
