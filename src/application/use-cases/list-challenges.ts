import type { Challenge, ChallengeStatus } from '../../domain/index.js';
import { challengeStatus } from '../../domain/index.js';
import type { ChallengeStore, Clock } from '../ports/index.js';

export interface ListChallengesDeps {
  readonly challenges: ChallengeStore;
  readonly clock: Clock;
}

export interface ChallengeListing {
  readonly challenge: Challenge;
  readonly status: ChallengeStatus;
}

/** Verifier side: every challenge, newest first, with its status computed at the current time. */
export const makeListChallenges = (deps: ListChallengesDeps) => async (): Promise<readonly ChallengeListing[]> => {
  const now = deps.clock.now();
  const stored = await deps.challenges.list();
  return stored
    .map((entry) => ({ challenge: entry.challenge, status: challengeStatus(entry, now) }))
    .sort((a, b) => b.challenge.issuedAt - a.challenge.issuedAt);
};
