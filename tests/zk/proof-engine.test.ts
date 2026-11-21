import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asChallengeValue,
  asIssuerPublicKey,
  asVerifierId,
  createCredential,
  type Proof,
} from '../../src/domain/index.js';
import {
  createSnarkjsProofEngine,
  createStaticIssuerRegistry,
  type SnarkjsProofEngine,
  thresholdVariant,
} from '../../src/infrastructure/index.js';
import { InfrastructureError } from '../../src/shared/index.js';
import { testHolderPrivateKey, testHolderPublicKey, testIssuer } from '../support/fakes.js';
import { createHarness, gpa, verifierA } from '../support/harness.js';

/**
 * Real Groth16 proofs for the "threshold" circuit variant, driven through the same use cases as the
 * fake-engine tests. Needs `pnpm zk:setup` (run by `pnpm test:zk`).
 */

const policy = { verifierId: verifierA, requiredGpaThreshold: gpa(300) };

let engine: SnarkjsProofEngine;

beforeAll(async () => {
  engine = await createSnarkjsProofEngine({
    variant: thresholdVariant,
    issuers: createStaticIssuerRegistry([testIssuer]),
  });
});

afterAll(async () => {
  await engine?.close();
});

const harness = () => createHarness({ proofEngine: engine });

interface Payload {
  proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[]; protocol: string; curve: string };
  publicSignals: string[];
}

const withPayload = (proof: Proof, change: (payload: Payload) => void): Proof => {
  const payload = JSON.parse(proof.payload) as Payload;
  change(payload);
  return { ...proof, payload: JSON.stringify(payload) as Proof['payload'] };
};

describe('honest flow with the threshold circuit', () => {
  it('accepts a valid presentation end to end', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(375));

    expect(proof.protocol).toBe('groth16');
    expect(await h.verifyCredential({ proof, policy })).toMatchObject({ ok: true });
  });

  it('reveals only the threshold, not the GPA', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(375));

    expect((JSON.parse(proof.payload) as Payload).publicSignals).toEqual(['300']);
  });

  it('cannot produce a proof below the threshold, even without the use-case guard', async () => {
    const created = createCredential({
      id: 'cred-low',
      issuerId: testIssuer.id,
      holderPublicKey: testHolderPublicKey,
      studentNumber: '2210002',
      fullName: 'Low GPA',
      degree: 'S.Kom.',
      graduationDate: '2026-08-20',
      gpa: 250,
      issuedAt: 1_700_000_000_000,
    });
    if (!created.ok) throw new Error('invalid test credential');

    await expect(
      engine.generate({
        signedCredential: { credential: created.value, signature: 'sig' as never },
        holderPrivateKey: testHolderPrivateKey,
        request: {
          verifierId: verifierA,
          challenge: asChallengeValue('c1'),
          gpaThreshold: gpa(300),
        },
      }),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });
});

describe('forged claims and proofs', () => {
  it('rejects a proof for a lower threshold relabelled as the required one', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(300), verifierA, gpa(100));
    const relabelled: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, gpaThreshold: gpa(300) },
    };

    // The domain preconditions pass (claims 300 >= 300); only the engine can catch this.
    expect(await h.verifyCredential({ proof: relabelled, policy })).toEqual({
      ok: false,
      error: 'PROOF_INVALID',
    });
  });

  it('rejects a relabelled proof even when the payload signals are edited to match', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(375), verifierA, gpa(100));
    const forged = withPayload(
      { ...proof, publicSignals: { ...proof.publicSignals, gpaThreshold: gpa(300) } },
      (payload) => {
        payload.publicSignals = ['300'];
      },
    );

    expect(await engine.verify(forged)).toBe(false);
  });

  it('rejects a proof with altered proof elements', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(375));
    const tampered = withPayload(proof, (payload) => {
      payload.proof.pi_a[0] = '1';
    });

    expect(await h.verifyCredential({ proof: tampered, policy })).toEqual({
      ok: false,
      error: 'PROOF_INVALID',
    });
  });
});

describe('malformed proof payloads', () => {
  it.each([
    ['not JSON', 'not json'],
    ['an empty object', '{}'],
    ['a null proof', JSON.stringify({ proof: null, publicSignals: ['300'] })],
    [
      'non-numeric proof elements',
      JSON.stringify({
        proof: { pi_a: ['x', 'y', '1'], pi_b: [], pi_c: [], protocol: 'groth16', curve: 'bn128' },
        publicSignals: ['300'],
      }),
    ],
    [
      'the wrong curve',
      JSON.stringify({
        proof: {
          pi_a: ['1', '2', '1'],
          pi_b: [
            ['1', '2'],
            ['1', '2'],
            ['1', '0'],
          ],
          pi_c: ['1', '2', '1'],
          protocol: 'groth16',
          curve: 'bls12381',
        },
        publicSignals: ['300'],
      }),
    ],
  ])('rejects a malformed payload (%s) without throwing', async (_label, payload) => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(375));

    await expect(engine.verify({ ...proof, payload: payload as Proof['payload'] })).resolves.toBe(
      false,
    );
  });
});

/**
 * KNOWN GAP, deliberately documented: the threshold-only circuit does not constrain the issuer
 * key, the challenge or the verifier. These tests show what that costs (ablation config B) and
 * must be inverted when the issuer, holder and replay variants bind those claims (P1-P3).
 */
describe('known gap: claims the threshold circuit does not bind', () => {
  it('still verifies after the challenge claim is swapped', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(375));
    const swapped: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, challenge: asChallengeValue('another-challenge') },
    };

    expect(await engine.verify(swapped)).toBe(true);
  });

  it('still verifies after the verifier and issuer claims are swapped', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(375));
    const swapped: Proof = {
      ...proof,
      publicSignals: {
        ...proof.publicSignals,
        verifierId: asVerifierId('someone-else'),
        issuerPublicKey: asIssuerPublicKey('rogue-issuer-key'),
      },
    };

    expect(await engine.verify(swapped)).toBe(true);
  });
});
