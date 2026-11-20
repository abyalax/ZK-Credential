pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/*
 * Core statement: "my GPA is at least `gpaThreshold`".
 *
 * GPA is an integer scaled by 100 (3.75 -> 375) and must lie in [0, MAX_GPA].
 *
 * circomlib's GreaterEqThan/LessEqThan are only sound when their inputs fit in BITS bits, so
 * both values are range-checked with Num2Bits first. Without that, some out-of-range inputs
 * slip through: with BITS = 9, gpa = 600 against gpaThreshold = 300 is accepted as ">=".
 * (Other out-of-range inputs, such as p - 1, are already rejected by the comparator itself.)
 *
 * Parameters:
 *   BITS     bit width used for every comparison; MAX_GPA + 1 must be below 2^BITS.
 *   MAX_GPA  inclusive upper bound of a valid GPA. Keep in sync with GPA_MAX in
 *            src/domain/credential/gpa.ts (a circuit test enforces this).
 *
 * Signals:
 *   gpa            private  the holder's GPA
 *   gpaThreshold   public   the verifier's minimum
 *
 * This template proves nothing about *where* the GPA came from. Issuer, holder and challenge
 * binding are layered on top of it by the later circuit variants.
 */
template GpaThreshold(BITS, MAX_GPA) {
    assert(MAX_GPA + 1 < (1 << BITS));

    signal input gpa;
    signal input gpaThreshold;

    component gpaBits = Num2Bits(BITS);
    gpaBits.in <== gpa;

    component thresholdBits = Num2Bits(BITS);
    thresholdBits.in <== gpaThreshold;

    component gpaInRange = LessEqThan(BITS);
    gpaInRange.in[0] <== gpa;
    gpaInRange.in[1] <== MAX_GPA;
    gpaInRange.out === 1;

    component thresholdInRange = LessEqThan(BITS);
    thresholdInRange.in[0] <== gpaThreshold;
    thresholdInRange.in[1] <== MAX_GPA;
    thresholdInRange.out === 1;

    component meetsThreshold = GreaterEqThan(BITS);
    meetsThreshold.in[0] <== gpa;
    meetsThreshold.in[1] <== gpaThreshold;
    meetsThreshold.out === 1;
}
