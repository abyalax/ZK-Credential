import { describe, expect, it } from 'vitest';
import { FORGED_PAYLOAD } from '../support/fakes.js';
import { createHarness, gpa, verifierA, verifierB } from '../support/harness.js';

const policy = { verifierId: verifierA, requiredGpaThreshold: gpa(300) };

describe('replay protection (adversarial)', () => {
  it('rejects the same proof presented twice', async () => {
    const h = createHarness();
    const proof = await h.presentProof(await h.issueTestCredential());

    expect((await h.verifyCredential({ proof, policy })).ok).toBe(true);
    expect(await h.verifyCredential({ proof, policy })).toEqual({
      ok: false,
      error: 'CHALLENGE_ALREADY_USED',
    });
  });

  it('rejects a proof replayed at a different verifier', async () => {
    const h = createHarness();
    const proof = await h.presentProof(await h.issueTestCredential(), verifierA);

    const result = await h.verifyCredential({
      proof,
      policy: { verifierId: verifierB, requiredGpaThreshold: gpa(300) },
    });

    expect(result).toEqual({ ok: false, error: 'CHALLENGE_VERIFIER_MISMATCH' });
  });

  it('rejects an expired challenge', async () => {
    const h = createHarness();
    const proof = await h.presentProof(await h.issueTestCredential());

    h.clock.advance(5 * 60 * 1000);

    expect(await h.verifyCredential({ proof, policy })).toEqual({
      ok: false,
      error: 'CHALLENGE_EXPIRED',
    });
  });

  it('rejects a proof with a challenge the verifier never issued', async () => {
    const h = createHarness();
    const proof = await h.presentProof(await h.issueTestCredential());
    const forged = {
      ...proof,
      publicSignals: { ...proof.publicSignals, challenge: 'unknown' as never },
    };

    expect(await h.verifyCredential({ proof: forged, policy })).toEqual({
      ok: false,
      error: 'CHALLENGE_UNKNOWN',
    });
  });

  it('does not burn the challenge when the proof is invalid', async () => {
    const h = createHarness();
    const proof = await h.presentProof(await h.issueTestCredential());
    const forged = { ...proof, payload: FORGED_PAYLOAD };

    expect(await h.verifyCredential({ proof: forged, policy })).toEqual({
      ok: false,
      error: 'PROOF_INVALID',
    });
    // The legitimate holder can still use the same challenge afterwards.
    expect((await h.verifyCredential({ proof, policy })).ok).toBe(true);
  });
});
