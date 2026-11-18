import type { Brand, Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';

export type ChallengeValue = Brand<string, 'ChallengeValue'>;
export type VerifierId = Brand<string, 'VerifierId'>;

export const asChallengeValue = (value: string): ChallengeValue => value as ChallengeValue;
export const asVerifierId = (value: string): VerifierId => value as VerifierId;

/** A single-use, verifier-scoped, time-limited nonce (challenge-based replay protection). */
export interface Challenge {
  readonly value: ChallengeValue;
  readonly verifierId: VerifierId;
  /** Epoch milliseconds. */
  readonly issuedAt: number;
  /** Epoch milliseconds. The challenge is expired once `now >= expiresAt`. */
  readonly expiresAt: number;
}

export interface StoredChallenge {
  readonly challenge: Challenge;
  /** Epoch milliseconds, or `undefined` while the challenge is still unused. */
  readonly consumedAt: number | undefined;
}

export type ChallengeRejection =
  | 'CHALLENGE_UNKNOWN'
  | 'CHALLENGE_VERIFIER_MISMATCH'
  | 'CHALLENGE_ALREADY_USED'
  | 'CHALLENGE_EXPIRED';

export interface CreateChallengeParams {
  readonly value: ChallengeValue;
  readonly verifierId: VerifierId;
  readonly now: number;
  readonly ttlMs: number;
}

export const createChallenge = ({
  value,
  verifierId,
  now,
  ttlMs,
}: CreateChallengeParams): Challenge => ({
  value,
  verifierId,
  issuedAt: now,
  expiresAt: now + ttlMs,
});

export interface EvaluateChallengeParams {
  readonly stored: StoredChallenge | undefined;
  readonly expectedVerifierId: VerifierId;
  readonly now: number;
}

/** Pure replay-protection rules: known, issued for this verifier, unused and not expired. */
export const evaluateChallenge = ({
  stored,
  expectedVerifierId,
  now,
}: EvaluateChallengeParams): Result<Challenge, ChallengeRejection> => {
  if (!stored) return err('CHALLENGE_UNKNOWN');
  if (stored.challenge.verifierId !== expectedVerifierId) return err('CHALLENGE_VERIFIER_MISMATCH');
  if (stored.consumedAt !== undefined) return err('CHALLENGE_ALREADY_USED');
  if (now >= stored.challenge.expiresAt) return err('CHALLENGE_EXPIRED');
  return ok(stored.challenge);
};
