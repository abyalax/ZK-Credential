// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Interface of the snarkjs-generated `Groth16Verifier` for the `full` circuit variant.
///      The four public signals are [issuerKeyHash, gpaThreshold, challenge, verifierId].
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals
    ) external view returns (bool);
}

interface IIssuerRegistry {
    function isTrusted(uint256 publicKeyHash) external view returns (bool);
}

/// @title CredentialVerifier
/// @notice Checks that the proof's issuer is registered, then verifies the Groth16 proof.
/// @dev Challenge consumption stays off-chain (hybrid enforcement): the challenge and verifier id
///      are bound inside the proof, and the verifier service owns the single-use rule.
contract CredentialVerifier {
    /// @dev Public signal positions. They must match the circuit's output/input declaration order
    ///      (circuits/src/templates/full.circom): outputs first, then public inputs.
    uint256 public constant ISSUER_KEY_HASH = 0;
    uint256 public constant GPA_THRESHOLD = 1;
    uint256 public constant CHALLENGE = 2;
    uint256 public constant VERIFIER_ID = 3;

    IIssuerRegistry public immutable registry;
    IGroth16Verifier public immutable groth16Verifier;

    error UntrustedIssuer(uint256 issuerKeyHash);

    constructor(IIssuerRegistry registry_, IGroth16Verifier groth16Verifier_) {
        registry = registry_;
        groth16Verifier = groth16Verifier_;
    }

    /// @notice Reverts with `UntrustedIssuer` for an unregistered issuer, returns false for any
    ///         proof or public signals the Groth16 verifier rejects.
    function verifyCredential(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals
    ) external view returns (bool) {
        uint256 issuerKeyHash = pubSignals[ISSUER_KEY_HASH];
        if (!registry.isTrusted(issuerKeyHash)) revert UntrustedIssuer(issuerKeyHash);
        return groth16Verifier.verifyProof(pA, pB, pC, pubSignals);
    }
}
