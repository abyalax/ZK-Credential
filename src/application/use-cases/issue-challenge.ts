import type { Challenge, VerifierId } from '../../domain/index.js';
import { asChallengeValue, createChallenge } from '../../domain/index.js';
import type { ChallengeStore, Clock, Randomness } from '../ports/index.js';

export const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;

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
    const challenge = createChallenge({
      value: asChallengeValue(deps.randomness.hex(32)),
      verifierId: input.verifierId,
      now: deps.clock.now(),
      ttlMs: input.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS,
    });
    await deps.challenges.save(challenge);
    return challenge;
  };
