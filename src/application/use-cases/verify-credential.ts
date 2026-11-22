import type { Proof, RejectionReason, VerificationAccepted, VerificationPolicy } from '../../domain/index.js';
import { evaluatePreconditions } from '../../domain/index.js';
import type { Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';
import type { ChallengeStore, Clock, IssuerRegistry, ProofEngine } from '../ports/index.js';

export interface VerifyCredentialDeps {
  readonly challenges: ChallengeStore;
  readonly issuers: IssuerRegistry;
  readonly proofEngine: ProofEngine;
  readonly clock: Clock;
}

export interface VerifyCredentialInput {
  readonly proof: Proof;
  readonly policy: VerificationPolicy;
}

/** Verifier side: domain preconditions, then cryptographic check, then challenge consumption. */
export const makeVerifyCredential =
  (deps: VerifyCredentialDeps) =>
  async (input: VerifyCredentialInput): Promise<Result<VerificationAccepted, RejectionReason>> => {
    const { proof, policy } = input;
    const now = deps.clock.now();

    const [trustedIssuers, stored] = await Promise.all([
      deps.issuers.list(),
      deps.challenges.find(proof.publicSignals.challenge),
    ]);

    const preconditions = evaluatePreconditions({
      claims: proof.publicSignals,
      policy,
      trustedIssuers,
      stored,
      now,
    });
    if (!preconditions.ok) return preconditions;

    if (!(await deps.proofEngine.verify(proof))) return err('PROOF_INVALID');

    // Consume only after a valid proof, so a forged proof cannot burn someone else's challenge.
    const consumed = await deps.challenges.markConsumed(preconditions.value.challenge.value, now);
    if (!consumed) return err('CHALLENGE_ALREADY_USED');

    return ok({
      issuerId: preconditions.value.issuer.id,
      verifierId: policy.verifierId,
      gpaThreshold: proof.publicSignals.gpaThreshold,
      verifiedAt: now,
    });
  };
