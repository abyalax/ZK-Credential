import type { PayloadContent } from '../proof-system/proof-payload.js';

type Pair = readonly [bigint, bigint];

/** Arguments of `CredentialVerifier.verifyCredential`, in ABI order. */
export interface VerifyCredentialArgs {
  readonly pA: Pair;
  readonly pB: readonly [Pair, Pair];
  readonly pC: Pair;
  readonly pubSignals: readonly [bigint, bigint, bigint, bigint];
}

/** Number of public signals of the `full` circuit: [issuerKeyHash, gpaThreshold, challenge, verifierId]. */
export const FULL_PUBLIC_SIGNAL_COUNT = 4;

/**
 * Maps a snarkjs Groth16 proof to Solidity calldata. The G2 point `pi_b` has its coordinate pairs
 * swapped, because the EVM pairing precompile expects (imaginary, real) while snarkjs emits
 * (real, imaginary). A wrong order makes every proof fail on-chain.
 */
export const toVerifyCredentialArgs = ({ proof, publicSignals }: PayloadContent): VerifyCredentialArgs => {
  const [a0, a1] = proof.pi_a.map(BigInt);
  const [c0, c1] = proof.pi_c.map(BigInt);
  const [[b00, b01], [b10, b11]] = proof.pi_b.map((pair) => pair.map(BigInt)) as [
    [bigint, bigint],
    [bigint, bigint],
    [bigint, bigint],
  ];
  const signals = publicSignals.map(BigInt);
  if (signals.length !== FULL_PUBLIC_SIGNAL_COUNT || a0 === undefined || a1 === undefined || c0 === undefined || c1 === undefined)
    throw new TypeError(`Expected ${FULL_PUBLIC_SIGNAL_COUNT} public signals`);
  const [s0, s1, s2, s3] = signals as [bigint, bigint, bigint, bigint];
  return {
    pA: [a0, a1],
    pB: [
      [b01, b00],
      [b11, b10],
    ],
    pC: [c0, c1],
    pubSignals: [s0, s1, s2, s3],
  };
};
