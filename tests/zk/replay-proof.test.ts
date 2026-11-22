import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asChallengeValue, type Issuer, type Proof } from '../../src/domain/index.js';
import {
  createEddsaCredentialSigner,
  createSnarkjsProofEngine,
  createStaticIssuerRegistry,
  encodeChallenge,
  encodeVerifierId,
  fullVariant,
  generateHolderKeyPair,
  type HolderKeyPair,
  holderVariant,
  type SnarkjsProofEngine,
} from '../../src/infrastructure/index.js';
import { FORGED_PAYLOAD } from '../support/fakes.js';
import { createHarness, gpa, verifierA, verifierB } from '../support/harness.js';

/**
 * Real Groth16 proofs for the "full" circuit variant (P3). Needs `pnpm setup:zk` (run by
 * `pnpm test:zk`). The use cases are the same ones the fake-engine replay tests drive.
 */

const policy = { verifierId: verifierA, requiredGpaThreshold: gpa(300) };
const deterministic = (byte: number) => (size: number) => new Uint8Array(size).fill(byte);

let issuer: Issuer;
let signer: Awaited<ReturnType<typeof createEddsaCredentialSigner>>;
let holder: HolderKeyPair;
let fullEngine: SnarkjsProofEngine;
let holderEngine: SnarkjsProofEngine;

beforeAll(async () => {
  signer = await createEddsaCredentialSigner('11'.repeat(32));
  issuer = { id: 'issuer-p3' as Issuer['id'], name: 'P3 test issuer', publicKey: signer.publicKey };
  const issuers = createStaticIssuerRegistry([issuer]);
  [fullEngine, holderEngine, holder] = await Promise.all([
    createSnarkjsProofEngine({ variant: fullVariant, issuers }),
    createSnarkjsProofEngine({ variant: holderVariant, issuers }),
    generateHolderKeyPair(deterministic(0x11)),
  ]);
});

afterAll(async () => {
  await Promise.all([fullEngine?.close(), holderEngine?.close()]);
});

const harness = (proofEngine: SnarkjsProofEngine = fullEngine) =>
  createHarness({ proofEngine, signer, issuer, holder });

interface Payload {
  proof: unknown;
  publicSignals: string[];
}

const withPayload = (proof: Proof, change: (payload: Payload) => void): Proof => {
  const payload = JSON.parse(proof.payload) as Payload;
  change(payload);
  return { ...proof, payload: JSON.stringify(payload) as Proof['payload'] };
};

const otherChallenge = `${'00'.repeat(30)}ab`;

describe('full circuit variant: honest flow', () => {
  it('accepts a valid presentation and binds challenge and verifier as public signals', async () => {
    const h = harness();
    const started = performance.now();
    const proof = await h.presentProof(await h.issueTestCredential(375));
    const result = await h.verifyCredential({ proof, policy });
    // Single local observation for the ablation notes (P3.3), not a benchmark.
    console.info(`[ablation:full] prove+verify ${(performance.now() - started).toFixed(0)} ms`);

    expect(result).toMatchObject({ ok: true });
    const { publicSignals } = JSON.parse(proof.payload) as Payload;
    expect(publicSignals).toHaveLength(4);
    expect(publicSignals[1]).toBe('300');
    expect(publicSignals[2]).toBe(encodeChallenge(proof.publicSignals.challenge).toString());
    expect(publicSignals[3]).toBe(encodeVerifierId(verifierA).toString());
  });
});

describe('full circuit variant: challenge binding is cryptographic', () => {
  it('rejects a challenge relabelled in the claims (engine level, no domain checks)', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential());
    const relabelled: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, challenge: asChallengeValue(otherChallenge) },
    };

    expect(await fullEngine.verify(proof)).toBe(true);
    expect(await fullEngine.verify(relabelled)).toBe(false);
  });

  it('rejects a changed challenge even when the payload signals are edited to match', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential());
    const forged = withPayload(
      {
        ...proof,
        publicSignals: { ...proof.publicSignals, challenge: asChallengeValue(otherChallenge) },
      },
      (payload) => {
        payload.publicSignals[2] = encodeChallenge(otherChallenge).toString();
      },
    );

    // Claims and payload now agree, so only the Groth16 check can catch it.
    expect(await fullEngine.verify(forged)).toBe(false);
  });

  it('rejects a changed verifier id, in the claims and in the payload', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(), verifierA);
    const claimsOnly: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, verifierId: verifierB },
    };
    const consistent = withPayload(claimsOnly, (payload) => {
      payload.publicSignals[3] = encodeVerifierId(verifierB).toString();
    });

    expect(await fullEngine.verify(claimsOnly)).toBe(false);
    expect(await fullEngine.verify(consistent)).toBe(false);
  });
});

describe('full circuit variant: relabelling attacks', () => {
  it('returns false, not an exception, for claims that cannot be encoded', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential());
    const malformed: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, challenge: asChallengeValue('unknown') },
    };

    expect(await fullEngine.verify(malformed)).toBe(false);
  });

  it('rejects a proof relabelled onto another fresh challenge, and keeps that challenge usable', async () => {
    const h = harness();
    const credentialId = await h.issueTestCredential();
    const proof = await h.presentProof(credentialId);
    const second = await h.issueChallenge({ verifierId: verifierA });
    const relabelled: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, challenge: second.value },
    };

    // Domain preconditions pass (registered, unused, unexpired); the circuit binding rejects it.
    expect(await h.verifyCredential({ proof: relabelled, policy })).toEqual({
      ok: false,
      error: 'PROOF_INVALID',
    });
    const fresh = await h.generateProof({
      credentialId,
      holderPrivateKey: holder.privateKey,
      request: { verifierId: verifierA, challenge: second.value, gpaThreshold: gpa(300) },
    });
    if (!fresh.ok) throw new Error('proof generation failed');
    expect((await h.verifyCredential({ proof: fresh.value, policy })).ok).toBe(true);
  });

  it("rejects a proof for verifier A relabelled for verifier B, even with B's own challenge", async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(), verifierA);
    const forB = await h.issueChallenge({ verifierId: verifierB });
    const relabelled: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, verifierId: verifierB, challenge: forB.value },
    };

    expect(
      await h.verifyCredential({
        proof: relabelled,
        policy: { verifierId: verifierB, requiredGpaThreshold: gpa(300) },
      }),
    ).toEqual({ ok: false, error: 'PROOF_INVALID' });
  });
});

describe('holder circuit variant: known gap', () => {
  it('known gap closed: the holder-only circuit accepts a relabelled challenge', async () => {
    const h = harness(holderEngine);
    const proof = await h.presentProof(await h.issueTestCredential());
    const relabelled: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, challenge: asChallengeValue(otherChallenge) },
    };

    expect(await holderEngine.verify(relabelled)).toBe(true);
  });
});

describe('full circuit variant: replay protection with real proofs', () => {
  it('rejects the same proof presented twice', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential());

    expect((await h.verifyCredential({ proof, policy })).ok).toBe(true);
    expect(await h.verifyCredential({ proof, policy })).toEqual({
      ok: false,
      error: 'CHALLENGE_ALREADY_USED',
    });
  });

  it('rejects a proof replayed at a different verifier', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential(), verifierA);

    expect(
      await h.verifyCredential({
        proof,
        policy: { verifierId: verifierB, requiredGpaThreshold: gpa(300) },
      }),
    ).toEqual({ ok: false, error: 'CHALLENGE_VERIFIER_MISMATCH' });
  });

  it('rejects an expired challenge', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential());

    h.clock.advance(5 * 60 * 1000);

    expect(await h.verifyCredential({ proof, policy })).toEqual({
      ok: false,
      error: 'CHALLENGE_EXPIRED',
    });
  });
});

describe('full circuit variant: challenge lifecycle with real proofs', () => {
  it('rejects a proof with a challenge the verifier never issued', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential());
    const forged: Proof = {
      ...proof,
      publicSignals: { ...proof.publicSignals, challenge: asChallengeValue(otherChallenge) },
    };

    expect(await h.verifyCredential({ proof: forged, policy })).toEqual({
      ok: false,
      error: 'CHALLENGE_UNKNOWN',
    });
  });

  it('does not burn the challenge when the proof is invalid', async () => {
    const h = harness();
    const credentialId = await h.issueTestCredential();
    const proof = await h.presentProof(credentialId);
    const other = await h.presentProof(credentialId);
    const garbage: Proof = { ...proof, payload: FORGED_PAYLOAD };
    const swapped: Proof = { ...proof, payload: other.payload };

    for (const forged of [garbage, swapped]) {
      expect(await h.verifyCredential({ proof: forged, policy })).toEqual({
        ok: false,
        error: 'PROOF_INVALID',
      });
    }
    // The legitimate holder can still use the same challenge afterwards.
    expect((await h.verifyCredential({ proof, policy })).ok).toBe(true);
  });

  it('lets only one of several parallel verifications of the same proof succeed', async () => {
    const h = harness();
    const proof = await h.presentProof(await h.issueTestCredential());

    const results = await Promise.all(
      Array.from({ length: 4 }, () => h.verifyCredential({ proof, policy })),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results.filter((item) => !item.ok)) {
      expect(result).toEqual({ ok: false, error: 'CHALLENGE_ALREADY_USED' });
    }
  });
});
