import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContainer } from '@/infrastructure';

const settle = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
};

describe('mock role-page flow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = async () => {
    const { issuer, holder, verifier } = createContainer('mock');
    const issued = await settle(
      issuer.issue({ studentNumber: '2210001', fullName: 'Test Student', degree: 'S1', graduationDate: '2026-08-01', gpa: 375 }),
      300,
    );
    if (!issued.ok) throw new Error('issue failed');
    const challenge = await verifier.issueChallenge({ verifierId: 'verifier-a', ttlMs: 300_000 });
    return { holder, verifier, credentialId: issued.value.id, challenge };
  };

  it('accepts a valid proof once and rejects the same proof as replay', async () => {
    const { holder, verifier, credentialId, challenge } = await setup();
    const proof = await settle(
      holder.createProof({ credentialId, challenge: challenge.value, verifierId: 'verifier-a', threshold: 350 }),
      1000,
    );
    if (!proof.ok) throw new Error('proof failed');
    const input = { proof: proof.value, verifierId: 'verifier-a', requiredThreshold: 350 };

    expect((await settle(verifier.verify(input), 100)).accepted).toBe(true);
    expect((await settle(verifier.verify(input), 100)).reason).toBe('CHALLENGE_ALREADY_USED');
  });

  it('refuses to prove a threshold above the GPA', async () => {
    const { holder, credentialId, challenge } = await setup();
    const result = await holder.createProof({
      credentialId,
      challenge: challenge.value,
      verifierId: 'verifier-a',
      threshold: 400,
    });
    expect(result).toEqual({ ok: false, error: 'ATTRIBUTE_BELOW_THRESHOLD' });
  });

  it('rejects a proof for a verifier that did not issue the challenge', async () => {
    const { holder, verifier, credentialId, challenge } = await setup();
    const proof = await settle(
      holder.createProof({ credentialId, challenge: challenge.value, verifierId: 'verifier-a', threshold: 350 }),
      1000,
    );
    if (!proof.ok) throw new Error('proof failed');
    const outcome = await settle(verifier.verify({ proof: proof.value, verifierId: 'verifier-b', requiredThreshold: 350 }), 100);
    expect(outcome.reason).toBe('CHALLENGE_VERIFIER_MISMATCH');
  });
});
