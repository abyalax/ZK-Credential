pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "gpa_threshold.circom";

/*
 * Proves that the private credential fields satisfy the GPA policy and that an issuer key
 * matching the published key hash signed the Poseidon commitment to every credential field.
 */
template IssuerCredential(BITS, MAX_GPA) {
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

    signal input gpaThreshold;
    signal output issuerKeyHash;

    component threshold = GpaThreshold(BITS, MAX_GPA);
    threshold.gpa <== gpa;
    threshold.gpaThreshold <== gpaThreshold;

    component commitment = Poseidon(9);
    commitment.inputs[0] <== id;
    commitment.inputs[1] <== issuerId;
    commitment.inputs[2] <== holderPublicKey;
    commitment.inputs[3] <== studentNumber;
    commitment.inputs[4] <== fullName;
    commitment.inputs[5] <== degree;
    commitment.inputs[6] <== graduationDate;
    commitment.inputs[7] <== gpa;
    commitment.inputs[8] <== issuedAt;

    component issuerKey = Poseidon(2);
    issuerKey.inputs[0] <== Ax;
    issuerKey.inputs[1] <== Ay;
    issuerKeyHash <== issuerKey.out;

    component signature = EdDSAPoseidonVerifier();
    signature.enabled <== 1;
    signature.Ax <== Ax;
    signature.Ay <== Ay;
    signature.R8x <== R8x;
    signature.R8y <== R8y;
    signature.S <== S;
    signature.M <== commitment.out;
}
