import type { Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';
import type { Gpa } from '../credential/index.js';
import type { Issuer, IssuerBindingRejection, IssuerId, IssuerPublicKey } from '../issuer/index.js';
import { evaluateIssuerBinding } from '../issuer/index.js';
import type {
  Challenge,
  ChallengeRejection,
  ChallengeValue,
  StoredChallenge,
  VerifierId,
} from './challenge.js';
import { evaluateChallenge } from './challenge.js';

export type RejectionReason =
  | ChallengeRejection
  | IssuerBindingRejection
  | 'THRESHOLD_BELOW_REQUIRED'
  | 'PROOF_INVALID';

/** What a proof claims publicly. `PublicSignals` of a proof satisfies this shape. */
export interface VerificationClaims {
  readonly issuerPublicKey: IssuerPublicKey;
  readonly gpaThreshold: Gpa;
  readonly challenge: ChallengeValue;
  readonly verifierId: VerifierId;
}

/** What the verifier demands, independent of what the holder presents. */
export interface VerificationPolicy {
  readonly verifierId: VerifierId;
  readonly requiredGpaThreshold: Gpa;
}

export interface VerificationAccepted {
  readonly issuerId: IssuerId;
  readonly verifierId: VerifierId;
  readonly gpaThreshold: Gpa;
  /** Epoch milliseconds. */
  readonly verifiedAt: number;
}

export interface PreconditionInput {
  readonly claims: VerificationClaims;
  readonly policy: VerificationPolicy;
  readonly trustedIssuers: readonly Issuer[];
  readonly stored: StoredChallenge | undefined;
  readonly now: number;
}

export interface PreconditionsMet {
  readonly issuer: Issuer;
  readonly challenge: Challenge;
}

/**
 * Cheap, deterministic checks that run before the (expensive) cryptographic verification:
 * the proof targets this verifier, is bound to a registered issuer, proves a strong enough
 * threshold, and carries a fresh, unused challenge.
 */
export const evaluatePreconditions = ({
  claims,
  policy,
  trustedIssuers,
  stored,
  now,
}: PreconditionInput): Result<PreconditionsMet, RejectionReason> => {
  if (claims.verifierId !== policy.verifierId) return err('CHALLENGE_VERIFIER_MISMATCH');
  if (claims.gpaThreshold < policy.requiredGpaThreshold) return err('THRESHOLD_BELOW_REQUIRED');

  const issuer = evaluateIssuerBinding(claims.issuerPublicKey, trustedIssuers);
  if (!issuer.ok) return issuer;

  const challenge = evaluateChallenge({ stored, expectedVerifierId: policy.verifierId, now });
  if (!challenge.ok) return challenge;

  return ok({ issuer: issuer.value, challenge: challenge.value });
};
