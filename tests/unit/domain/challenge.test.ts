import { describe, expect, it } from 'vitest';
import {
  asChallengeValue,
  asVerifierId,
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
    expect(evaluateChallenge({ stored: fresh, expectedVerifierId: verifier, now: 1_499 }).ok).toBe(
      true,
    );
  });

  it('rejects an unknown challenge', () => {
    expect(
      evaluateChallenge({ stored: undefined, expectedVerifierId: verifier, now: 1_000 }),
    ).toEqual({
      ok: false,
      error: 'CHALLENGE_UNKNOWN',
    });
  });

  it('rejects a challenge issued for another verifier', () => {
    expect(
      evaluateChallenge({ stored: fresh, expectedVerifierId: asVerifierId('other'), now: 1_000 }),
    ).toEqual({ ok: false, error: 'CHALLENGE_VERIFIER_MISMATCH' });
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
