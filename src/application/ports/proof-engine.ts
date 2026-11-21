import type { HolderSecretKey, Proof, ProofRequest, SignedCredential } from '../../domain/index.js';

export interface ProofGenerationInput {
  readonly signedCredential: SignedCredential;
  readonly holderSecretKey: HolderSecretKey;
  readonly request: ProofRequest;
}

/** Boundary to the zk-SNARK backend (circuit witness building, proving, verifying). */
export interface ProofEngine {
  generate: (input: ProofGenerationInput) => Promise<Proof>;
  /** Cryptographic verification only; business rules are checked by the domain. */
  verify: (proof: Proof) => Promise<boolean>;
}
