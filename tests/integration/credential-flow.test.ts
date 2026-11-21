import { describe, expect, it } from 'vitest';
import { testHolderPrivateKey } from '../support/fakes.js';
import { createHarness, gpa, verifierA } from '../support/harness.js';

describe('credential flow (issue -> challenge -> prove -> verify)', () => {
  it('accepts a valid presentation', async () => {
    const h = createHarness();
    const proof = await h.presentProof(await h.issueTestCredential(375));

    const result = await h.verifyCredential({
      proof,
      policy: { verifierId: verifierA, requiredGpaThreshold: gpa(300) },
    });

    expect(result.ok).toBe(true);
  });

  it('issues a 31-byte challenge that fits the BN254 field without reduction', async () => {
    const h = createHarness();
    const challenge = await h.issueChallenge({ verifierId: verifierA });

    expect(challenge.value).toMatch(/^[0-9a-f]{62}$/);
  });

  it('refuses to issue for an unregistered issuer', async () => {
    const h = createHarness();
    const result = await h.issueCredential({
      issuerId: 'rogue' as never,
      holderPublicKey: 'pk',
      studentNumber: '1',
      fullName: 'X',
      degree: 'S.Kom.',
      graduationDate: '2026-08-20',
      gpa: 300,
    });
    expect(result).toEqual({ ok: false, error: 'ISSUER_NOT_REGISTERED' });
  });

  it('refuses to build a proof when GPA is below the threshold', async () => {
    const h = createHarness();
    const credentialId = await h.issueTestCredential(250);
    const challenge = await h.issueChallenge({ verifierId: verifierA });

    const result = await h.generateProof({
      credentialId,
      holderPrivateKey: testHolderPrivateKey,
      request: { verifierId: verifierA, challenge: challenge.value, gpaThreshold: gpa(300) },
    });

    expect(result).toEqual({ ok: false, error: 'ATTRIBUTE_BELOW_THRESHOLD' });
  });
});
