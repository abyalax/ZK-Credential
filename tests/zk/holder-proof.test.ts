import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asChallengeValue,
  asHolderPrivateKey,
  asVerifierId,
  type Credential,
  createCredential,
  type HolderPrivateKey,
  type Issuer,
  type SignedCredential,
  toGpa,
} from '../../src/domain/index.js';
import {
  createEddsaCredentialSigner,
  createSnarkjsProofEngine,
  generateHolderKeyPair,
  type HolderKeyPair,
  holderVariant,
  issuerVariant,
} from '../../src/infrastructure/index.js';
import { InfrastructureError } from '../../src/shared/index.js';

/**
 * Real Groth16 proofs for the "holder" circuit variant (P2). Needs `pnpm setup:zk` (run by
 * `pnpm test:zk`). Keys are deterministic so a failure is reproducible.
 */

const deterministic = (byte: number) => (size: number) => new Uint8Array(size).fill(byte);

let issuer: Issuer;
let signer: Awaited<ReturnType<typeof createEddsaCredentialSigner>>;
let holderEngine: Awaited<ReturnType<typeof createSnarkjsProofEngine>>;
let issuerEngine: Awaited<ReturnType<typeof createSnarkjsProofEngine>>;
let owner: HolderKeyPair;
let attacker: HolderKeyPair;

beforeAll(async () => {
  signer = await createEddsaCredentialSigner('11'.repeat(32));
  issuer = { id: 'issuer-p2' as Issuer['id'], name: 'P2 test issuer', publicKey: signer.publicKey };
  const issuers = { list: async () => [issuer] };
  [holderEngine, issuerEngine, owner, attacker] = await Promise.all([
    createSnarkjsProofEngine({ variant: holderVariant, issuers }),
    createSnarkjsProofEngine({ variant: issuerVariant, issuers }),
    generateHolderKeyPair(deterministic(0x11)),
    generateHolderKeyPair(deterministic(0x22)),
  ]);
});

afterAll(async () => {
  await Promise.all([holderEngine?.close(), issuerEngine?.close()]);
});

const issue = async (holder: HolderKeyPair): Promise<SignedCredential> => {
  const created = createCredential({
    id: 'p2-credential',
    issuerId: issuer.id,
    holderPublicKey: holder.publicKey,
    studentNumber: '2210001',
    fullName: 'P2 Test Student',
    degree: 'S.Kom.',
    graduationDate: '2026-08-20',
    gpa: 375,
    issuedAt: 1_700_000_000_000,
  });
  if (!created.ok) throw new Error('invalid P2 test credential');
  const credential: Credential = created.value;
  return { credential, signature: await signer.sign(credential) };
};

const request = () => {
  const gpaThreshold = toGpa(300);
  if (!gpaThreshold.ok) throw new Error('invalid threshold');
  return {
    verifierId: asVerifierId('p2-verifier'),
    challenge: asChallengeValue('p2-challenge'),
    gpaThreshold: gpaThreshold.value,
  };
};

const prove = (engine: typeof holderEngine, signedCredential: SignedCredential, holderPrivateKey: HolderPrivateKey) =>
  engine.generate({ signedCredential, holderPrivateKey, request: request() });

describe('holder circuit variant: honest holder', () => {
  it('accepts the credential owner, who knows holderPrivateKey', async () => {
    const signedCredential = await issue(owner);
    const started = performance.now();
    const proof = await prove(holderEngine, signedCredential, owner.privateKey);
    const verified = await holderEngine.verify(proof);
    // Single local observation for the ablation notes (P2.3), not a benchmark.
    console.info(`[ablation:holder] prove+verify ${(performance.now() - started).toFixed(0)} ms`);

    expect(verified).toBe(true);
    expect(JSON.parse(proof.payload).publicSignals).toHaveLength(2);
  });
});

describe('holder circuit variant: attackers', () => {
  it('rejects someone who holds a copy of the credential but not the private key', async () => {
    const signedCredential = await issue(owner);

    await expect(prove(holderEngine, signedCredential, attacker.privateKey)).rejects.toBeInstanceOf(InfrastructureError);
  });

  it('rejects guessed secrets, including the public key used as a secret', async () => {
    const signedCredential = await issue(owner);

    for (const guess of ['0', '123', owner.publicKey]) {
      await expect(prove(holderEngine, signedCredential, asHolderPrivateKey(guess))).rejects.toBeInstanceOf(InfrastructureError);
    }
  });

  it('rejects a credential issued to another holder when proving with our own secret', async () => {
    const issuedToOther = await issue(attacker);

    await expect(prove(holderEngine, issuedToOther, owner.privateKey)).rejects.toBeInstanceOf(InfrastructureError);
  });

  it('rejects a credential whose holderPublicKey was swapped after signing', async () => {
    const signedCredential = await issue(owner);
    const swapped = {
      ...signedCredential,
      credential: { ...signedCredential.credential, holderPublicKey: attacker.publicKey },
    };

    // Even with the attacker's own secret: the issuer signed the owner's holderPublicKey, not this one.
    await expect(prove(holderEngine, swapped, attacker.privateKey)).rejects.toBeInstanceOf(InfrastructureError);
  });
});

describe('holder circuit variant: secret hygiene and ablation', () => {
  it('never leaks the holder private key into the proof or into errors', async () => {
    const signedCredential = await issue(owner);
    const proof = await prove(holderEngine, signedCredential, owner.privateKey);
    expect(JSON.stringify(proof)).not.toContain(owner.privateKey);

    const failure = await prove(holderEngine, signedCredential, attacker.privateKey).catch((error: unknown) => error);
    const cause = (failure as Error).cause as Error | undefined;
    for (const text of [String(failure), String(cause?.message), String(cause)]) {
      expect(text).not.toContain(attacker.privateKey);
      expect(text).not.toContain(owner.privateKey);
    }
  });

  /**
   * Why P2 exists (ablation config C): the issuer variant checks the signature but never asks for
   * holderPrivateKey, so a copied credential is enough to produce a valid proof.
   */
  it('known gap closed: the issuer-only circuit accepts a copy without the private key', async () => {
    const signedCredential = await issue(owner);
    const proof = await prove(issuerEngine, signedCredential, attacker.privateKey);

    expect(await issuerEngine.verify(proof)).toBe(true);
  });
});
