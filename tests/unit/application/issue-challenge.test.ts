import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_RANDOM_BYTES,
  isCanonicalChallenge,
  makeIssueChallenge,
} from '../../../src/application/index.js';
import { createInMemoryChallengeStore } from '../../../src/infrastructure/index.js';
import { createFakeClock, createFakeRandomness } from '../../support/fakes.js';
import { verifierA } from '../../support/harness.js';

describe('makeIssueChallenge', () => {
  it('issues a canonical challenge that fits the BN254 field', async () => {
    const issue = makeIssueChallenge({
      challenges: createInMemoryChallengeStore(),
      clock: createFakeClock(),
      randomness: createFakeRandomness(),
    });
    const challenge = await issue({ verifierId: verifierA });

    expect(challenge.value).toHaveLength(CHALLENGE_RANDOM_BYTES * 2);
    expect(isCanonicalChallenge(challenge.value)).toBe(true);
  });

  it('refuses randomness that would produce a challenge the circuit cannot encode', async () => {
    const issue = makeIssueChallenge({
      challenges: createInMemoryChallengeStore(),
      clock: createFakeClock(),
      randomness: { hex: () => 'AB'.repeat(32) },
    });

    await expect(issue({ verifierId: verifierA })).rejects.toThrow(TypeError);
  });
});
