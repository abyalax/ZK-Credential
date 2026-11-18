import { describe, expect, it } from 'vitest';
import {
  asChallengeValue,
  asIssuerPublicKey,
  createChallenge,
  evaluatePreconditions,
  type VerificationClaims,
} from '../../../src/domain/index.js';
import { testIssuer } from '../../support/fakes.js';
import { gpa, verifierA, verifierB } from '../../support/harness.js';

const challenge = createChallenge({
  value: asChallengeValue('abc'),
  verifierId: verifierA,
  now: 0,
  ttlMs: 1_000,
});

const claims: VerificationClaims = {
  issuerPublicKey: testIssuer.publicKey,
  gpaThreshold: gpa(300),
  challenge: challenge.value,
  verifierId: verifierA,
};

const base = {
  claims,
  policy: { verifierId: verifierA, requiredGpaThreshold: gpa(300) },
  trustedIssuers: [testIssuer],
  stored: { challenge, consumedAt: undefined },
  now: 10,
};

describe('evaluatePreconditions', () => {
  it('passes when everything is in order', () => {
    expect(evaluatePreconditions(base).ok).toBe(true);
  });

  it('accepts a proof for a higher threshold than required', () => {
    const result = evaluatePreconditions({
      ...base,
      claims: { ...claims, gpaThreshold: gpa(350) },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a lower threshold than required', () => {
    const result = evaluatePreconditions({
      ...base,
      claims: { ...claims, gpaThreshold: gpa(250) },
    });
    expect(result).toEqual({ ok: false, error: 'THRESHOLD_BELOW_REQUIRED' });
  });

  it('rejects an unregistered issuer', () => {
    const result = evaluatePreconditions({
      ...base,
      claims: { ...claims, issuerPublicKey: asIssuerPublicKey('rogue') },
    });
    expect(result).toEqual({ ok: false, error: 'ISSUER_NOT_REGISTERED' });
  });

  it('rejects a proof bound to a different verifier', () => {
    const result = evaluatePreconditions({ ...base, claims: { ...claims, verifierId: verifierB } });
    expect(result).toEqual({ ok: false, error: 'CHALLENGE_VERIFIER_MISMATCH' });
  });
});
