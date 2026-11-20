import type { CircuitSignals } from 'snarkjs';
import type { ProofGenerationInput } from '../../application/index.js';
import type { PublicSignals } from '../../domain/index.js';

/**
 * One circuit of the ablation ladder (threshold -> +issuer -> +holder -> +replay). A variant knows
 * how to turn domain data into circuit inputs, and which public signals a proof must carry for
 * the claims it makes. Names match `circuits/src/variants/<name>.circom`.
 */
export interface CircuitVariant {
  readonly name: string;
  circuitInputs(input: ProofGenerationInput): CircuitSignals;
  /**
   * The circuit's public signals, in circuit order, as implied by the claims of a proof. The
   * engine rejects a proof whose payload carries different signals than its claims, so a claim
   * can never be altered without invalidating the proof.
   */
  expectedPublicSignals(claims: PublicSignals): readonly string[];
}

/**
 * GPA threshold only. Public signals: [gpaThreshold].
 *
 * The issuer key, challenge and verifier id are NOT constrained by this circuit, so they can be
 * swapped without breaking the proof. That is the gap the later variants close.
 */
export const thresholdVariant: CircuitVariant = {
  name: 'threshold',
  circuitInputs: ({ signedCredential, request }) => ({
    gpa: signedCredential.credential.gpa.toString(),
    gpaThreshold: request.gpaThreshold.toString(),
  }),
  expectedPublicSignals: (claims) => [claims.gpaThreshold.toString()],
};
