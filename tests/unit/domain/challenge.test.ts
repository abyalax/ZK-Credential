import { describe, expect, it } from 'vitest';
import {
  asChallengeValue,
  asVerifierId,
  challengeStatus,
  createChallenge,
  evaluateChallenge,
} from '../../../src/domain/index.js';

const verifier = asVerifierId('verifier-a');
const challenge = createChallenge({
  value: asChallengeValue('abc'),
  verifierId: verifier,
  now: 1_000,
  ttlMs: 500,
});
const fresh = { challenge, consumedAt: undefined };

describe('evaluateChallenge', () => {
  it('accepts a fresh challenge for the expected verifier', () => {
    expect(evaluateChallenge({ stored: fresh, expectedVerifierId: verifier, now: 1_499 }).ok).toBe(true);
  });

  it('rejects an unknown challenge', () => {
    expect(evaluateChallenge({ stored: undefined, expectedVerifierId: verifier, now: 1_000 })).toEqual({
      ok: false,
      error: 'CHALLENGE_UNKNOWN',
    });
  });

  it('rejects a challenge issued for another verifier', () => {
    expect(evaluateChallenge({ stored: fresh, expectedVerifierId: asVerifierId('other'), now: 1_000 })).toEqual({
      ok: false,
      error: 'CHALLENGE_VERIFIER_MISMATCH',
    });
  });

  it('rejects a consumed challenge', () => {
    expect(
      evaluateChallenge({
        stored: { challenge, consumedAt: 1_100 },
        expectedVerifierId: verifier,
        now: 1_200,
      }),
    ).toEqual({ ok: false, error: 'CHALLENGE_ALREADY_USED' });
  });

  it('rejects an expired challenge at the exact expiry instant', () => {
    expect(evaluateChallenge({ stored: fresh, expectedVerifierId: verifier, now: 1_500 })).toEqual({
      ok: false,
      error: 'CHALLENGE_EXPIRED',
    });
  });
});

describe('challengeStatus', () => {
  const stored = {
    challenge: createChallenge({
      value: asChallengeValue('ab'.repeat(31)),
      verifierId: asVerifierId('v'),
      now: 1_000,
      ttlMs: 500,
    }),
    consumedAt: undefined,
  };

  it('is issued before expiry, expired from the expiry instant on', () => {
    expect(challengeStatus(stored, 1_499)).toBe('issued');
    expect(challengeStatus(stored, 1_500)).toBe('expired');
  });

  it('stays consumed after the time limit passes', () => {
    expect(challengeStatus({ ...stored, consumedAt: 1_100 }, 1_200)).toBe('consumed');
    expect(challengeStatus({ ...stored, consumedAt: 1_100 }, 9_999)).toBe('consumed');
  });
});
