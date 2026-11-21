import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asChallengeValue,
  asVerifierId,
  type Credential,
  createCredential,
  type Issuer,
  type SignedCredential,
} from '../../src/domain/index.js';
import {
  createEddsaCredentialSigner,
  createSnarkjsProofEngine,
  issuerVariant,
} from '../../src/infrastructure/index.js';
import { InfrastructureError } from '../../src/shared/index.js';

const ISSUER_SECRET = '11'.repeat(32);
const OTHER_ISSUER_SECRET = '22'.repeat(32);
const holderSecretKey = '123';

let issuer: Issuer;
let signer: Awaited<ReturnType<typeof createEddsaCredentialSigner>>;
let engine: Awaited<ReturnType<typeof createSnarkjsProofEngine>>;
let credential: Credential;

beforeAll(async () => {
  signer = await createEddsaCredentialSigner(ISSUER_SECRET);
  issuer = {
    id: 'issuer-p1' as Issuer['id'],
    name: 'P1 test issuer',
    publicKey: signer.publicKey,
  };
  const created = createCredential({
    id: 'p1-credential',
    issuerId: issuer.id,
    holderPublicKey: holderSecretKey,
    studentNumber: '2210001',
    fullName: 'P1 Test Student',
    degree: 'S.Kom.',
    graduationDate: '2026-08-20',
    gpa: 375,
    issuedAt: 1_700_000_000_000,
  });
  if (!created.ok) throw new Error('invalid P1 test credential');
  credential = created.value;
  engine = await createSnarkjsProofEngine({
    variant: issuerVariant,
    issuers: { list: async () => [issuer] },
  });
});

afterAll(async () => {
  await engine?.close();
});

const prove = (signedCredential: SignedCredential) =>
  engine.generate({
    signedCredential,
    holderSecretKey: holderSecretKey as never,
    request: {
      verifierId: asVerifierId('p1-verifier'),
      challenge: asChallengeValue('p1-challenge'),
      gpaThreshold: 300 as never,
    },
  });

describe('issuer circuit variant', () => {
  it('accepts a valid EdDSA-Poseidon signature and exposes issuer key hash plus threshold', async () => {
    const signedCredential = { credential, signature: await signer.sign(credential) };
    const proof = await prove(signedCredential);

    expect(proof.publicSignals.gpaThreshold).toBe(300);
    expect(await engine.verify(proof)).toBe(true);
  });

  it('rejects a credential whose attributes changed after signing', async () => {
    const signature = await signer.sign(credential);
    const changed = { ...credential, fullName: 'Changed Student' } as Credential;
    await expect(prove({ credential: changed, signature })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });

  it('rejects a signature made by a different issuer', async () => {
    const otherSigner = await createEddsaCredentialSigner(OTHER_ISSUER_SECRET);
    const signature = await otherSigner.sign(credential);
    await expect(prove({ credential, signature })).rejects.toBeInstanceOf(InfrastructureError);
  });

  it('rejects a malformed signature before witness generation', async () => {
    await expect(prove({ credential, signature: 'not-json' as never })).rejects.toMatchObject({
      name: 'InfrastructureError',
      cause: expect.objectContaining({ message: 'Issuer signature is not valid JSON' }),
    });
  });
});
