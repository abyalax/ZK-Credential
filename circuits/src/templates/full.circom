pragma circom 2.1.6;

include "holder.circom";

/*
 * Replay binding: ties a proof to one verifier-issued challenge and one verifier.
 *
 * Groth16 only checks a public input against the verification key if some constraint uses it.
 * A public input that no constraint touches can be swapped after proving without invalidating
 * the proof (the "known gap" of the threshold variant). Squaring each signal below adds a real
 * constraint on it, so the proof is valid for exactly one (challenge, verifierId) pair.
 *
 * Signals:
 *   challenge   public  verifier-issued nonce, 31 random bytes read big-endian (< 2^248)
 *   verifierId  public  F_str(verifierId), see docs/protocol/protocol.md
 */
template ReplayBinding() {
    signal input challenge;
    signal input verifierId;

    signal challengeSquare;
    signal verifierIdSquare;

    challengeSquare <== challenge * challenge;
    verifierIdSquare <== verifierId * verifierId;
}

/*
 * Issuer authenticity + holder-key binding (holder.circom) + replay binding.
 *
 * Public signals, in order: [issuerKeyHash, gpaThreshold, challenge, verifierId]. Circom lists
 * outputs first, then public inputs in the order they are declared below.
 */
template FullCredential(BITS, MAX_GPA) {
    signal input id;
    signal input issuerId;
    signal input holderPublicKey;
    signal input studentNumber;
    signal input fullName;
    signal input degree;
    signal input graduationDate;
    signal input gpa;
    signal input issuedAt;
    signal input Ax;
    signal input Ay;
    signal input R8x;
    signal input R8y;
    signal input S;
    signal input holderPrivateKey;

    // Public inputs. Keep this declaration order in sync with the variant and the TS encoding.
    signal input gpaThreshold;
    signal input challenge;
    signal input verifierId;
    signal output issuerKeyHash;

    component credential = HolderCredential(BITS, MAX_GPA);
    credential.id <== id;
    credential.issuerId <== issuerId;
    credential.holderPublicKey <== holderPublicKey;
    credential.studentNumber <== studentNumber;
    credential.fullName <== fullName;
    credential.degree <== degree;
    credential.graduationDate <== graduationDate;
    credential.gpa <== gpa;
    credential.issuedAt <== issuedAt;
    credential.Ax <== Ax;
    credential.Ay <== Ay;
    credential.R8x <== R8x;
    credential.R8y <== R8y;
    credential.S <== S;
    credential.holderPrivateKey <== holderPrivateKey;
    credential.gpaThreshold <== gpaThreshold;

    component replay = ReplayBinding();
    replay.challenge <== challenge;
    replay.verifierId <== verifierId;

    issuerKeyHash <== credential.issuerKeyHash;
}
