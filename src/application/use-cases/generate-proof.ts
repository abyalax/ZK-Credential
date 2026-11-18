import type { CredentialId, HolderSecretKey, Proof, ProofRequest } from '../../domain/index.js';
import { satisfiesGpaThreshold } from '../../domain/index.js';
import type { Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';
import type { CredentialRepository, ProofEngine } from '../ports/index.js';

export interface GenerateProofDeps {
  readonly credentials: CredentialRepository;
  readonly proofEngine: ProofEngine;
}

export interface GenerateProofInput {
  readonly credentialId: CredentialId;
  readonly holderSecretKey: HolderSecretKey;
  readonly request: ProofRequest;
}

export type GenerateProofError = 'CREDENTIAL_NOT_FOUND' | 'ATTRIBUTE_BELOW_THRESHOLD';

/** Holder side: builds a proof for a verifier's request. */
export const makeGenerateProof =
  (deps: GenerateProofDeps) =>
  async (input: GenerateProofInput): Promise<Result<Proof, GenerateProofError>> => {
    const signedCredential = await deps.credentials.findById(input.credentialId);
    if (!signedCredential) return err('CREDENTIAL_NOT_FOUND');

    // Fail fast: an unsatisfiable statement can never yield a valid proof.
    if (!satisfiesGpaThreshold(signedCredential.credential, input.request.gpaThreshold)) {
      return err('ATTRIBUTE_BELOW_THRESHOLD');
    }

    const proof = await deps.proofEngine.generate({
      signedCredential,
      holderSecretKey: input.holderSecretKey,
      request: input.request,
    });
    return ok(proof);
  };
