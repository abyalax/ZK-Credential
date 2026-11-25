import type { Challenge, ChallengeValue, StoredChallenge } from '../../domain/index.js';

export interface ChallengeStore {
  save: (challenge: Challenge) => Promise<void>;
  find: (value: ChallengeValue) => Promise<StoredChallenge | undefined>;
  /** Every stored challenge with its consumption state, oldest first. */
  list: () => Promise<readonly StoredChallenge[]>;
  /**
   * Atomically marks the challenge as consumed.
   * Returns `false` if it is unknown or was already consumed, so concurrent
   * verifications of the same proof cannot both succeed.
   */
  markConsumed: (value: ChallengeValue, at: number) => Promise<boolean>;
}
