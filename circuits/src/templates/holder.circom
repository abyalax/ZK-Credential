pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "issuer.circom";

/*
 * Issuer authenticity (see issuer.circom) plus holder-key binding: the prover must know the
 * holderPrivateKey whose Poseidon hash is the holderPublicKey that the issuer signed into the
 * credential commitment. A copy of the credential is useless without that secret.
 */
template HolderCredential(BITS, MAX_GPA) {
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

    signal input gpaThreshold;
    signal output issuerKeyHash;

    // holderPublicKey = Poseidon(holderPrivateKey), the same value the issuer signed inside the commitment.
    component holderKey = Poseidon(1);
    holderKey.inputs[0] <== holderPrivateKey;
    holderKey.out === holderPublicKey;

    component credential = IssuerCredential(BITS, MAX_GPA);
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
    credential.gpaThreshold <== gpaThreshold;

    issuerKeyHash <== credential.issuerKeyHash;
}
