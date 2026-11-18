import type { Brand } from '../../shared/index.js';
import type { Gpa } from '../credential/index.js';
import type { IssuerPublicKey } from '../issuer/index.js';
import type { ChallengeValue, VerifierId } from '../verification/index.js';

/** Serialized proof bytes. Opaque to the domain so it stays independent of snarkjs. */
export type ProofPayload = Brand<string, 'ProofPayload'>;

export const asProofPayload = (value: string): ProofPayload => value as ProofPayload;

/** Public inputs of the statement: "I hold an authentic credential with GPA >= threshold". */
export interface PublicSignals {
  readonly issuerPublicKey: IssuerPublicKey;
  readonly gpaThreshold: Gpa;
  readonly challenge: ChallengeValue;
  readonly verifierId: VerifierId;
}

export interface Proof {
  readonly protocol: 'groth16';
  readonly payload: ProofPayload;
  readonly publicSignals: PublicSignals;
}

/** Sent by the verifier to the holder; asks for a proof of a GPA threshold bound to a challenge. */
export interface ProofRequest {
  readonly verifierId: VerifierId;
  readonly challenge: ChallengeValue;
  readonly gpaThreshold: Gpa;
}
