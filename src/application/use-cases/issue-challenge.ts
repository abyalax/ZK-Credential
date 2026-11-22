import type { Challenge, VerifierId } from '../../domain/index.js';
import { asChallengeValue, createChallenge } from '../../domain/index.js';
import type { ChallengeStore, Clock, Randomness } from '../ports/index.js';

export const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** 31 bytes fit in BN254 without modular reduction, so distinct nonces stay distinct. */
export const CHALLENGE_RANDOM_BYTES = 31;

const CANONICAL_CHALLENGE = new RegExp(`^[0-9a-f]{${CHALLENGE_RANDOM_BYTES * 2}}$`);

/**
 * Canonical challenge text: exactly 31 bytes as lowercase hex. Exactly one string maps to each
 * circuit field element, so a challenge cannot be re-spelled ("0a" vs "a") without detection.
 */
export const isCanonicalChallenge = (value: string): boolean => CANONICAL_CHALLENGE.test(value);

export interface IssueChallengeDeps {
  readonly challenges: ChallengeStore;
  readonly clock: Clock;
  readonly randomness: Randomness;
}

export interface IssueChallengeInput {
  readonly verifierId: VerifierId;
  readonly ttlMs?: number;
}

/** Verifier side: registers a fresh single-use challenge that the holder must bind its proof to. */
export const makeIssueChallenge =
  (deps: IssueChallengeDeps) =>
  async (input: IssueChallengeInput): Promise<Challenge> => {
    const value = deps.randomness.hex(CHALLENGE_RANDOM_BYTES);
    // Fail fast: a challenge the circuit cannot encode would only fail later, at proving time.
    if (!isCanonicalChallenge(value)) {
      throw new TypeError(`Randomness must return ${CHALLENGE_RANDOM_BYTES} bytes as lowercase hex for a challenge`);
    }
    const challenge = createChallenge({
      value: asChallengeValue(value),
      verifierId: input.verifierId,
      now: deps.clock.now(),
      ttlMs: input.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS,
    });
    await deps.challenges.save(challenge);
    return challenge;
  };
