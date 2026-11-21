import { describe, expect, it } from 'vitest';
import type { ProofGenerationInput } from '../../../src/application/index.js';
import {
  asChallengeValue,
  asHolderPrivateKey,
  asIssuerId,
  asVerifierId,
  createCredential,
  type Issuer,
  type PublicSignals,
  toGpa,
} from '../../../src/domain/index.js';
import {
  createEddsaCredentialSigner,
  encodeChallenge,
  encodeCredentialText,
  encodeVerifierId,
  fullVariant,
} from '../../../src/infrastructure/index.js';
import { testHolderPublicKey } from '../../support/fakes.js';

const CHALLENGE = `${'00'.repeat(30)}c1`;

const buildFixture = async (challenge = CHALLENGE) => {
  const signer = await createEddsaCredentialSigner('11'.repeat(32));
  const created = createCredential({
    id: 'cred-f',
    issuerId: 'issuer-f',
    holderPublicKey: testHolderPublicKey,
    studentNumber: '2210001',
    fullName: 'Test Student',
    degree: 'S.Kom.',
    graduationDate: '2026-08-20',
    gpa: 375,
    issuedAt: 1_700_000_000_000,
  });
  const threshold = toGpa(300);
  if (!(created.ok && threshold.ok)) throw new Error('invalid fixture');
  const issuer: Issuer = {
    id: asIssuerId('issuer-f'),
    name: 'Full test issuer',
    publicKey: signer.publicKey,
  };
  const input: ProofGenerationInput = {
    signedCredential: { credential: created.value, signature: await signer.sign(created.value) },
    holderPrivateKey: asHolderPrivateKey('777'),
    request: {
      verifierId: asVerifierId('verifier-f'),
      challenge: asChallengeValue(challenge),
      gpaThreshold: threshold.value,
    },
  };
  return { input, issuer };
};

describe('challenge and verifier id encoding', () => {
  it('reads the 31 challenge bytes big-endian', () => {
    expect(encodeChallenge(CHALLENGE)).toBe(0xc1n);
    expect(encodeChallenge('ff'.repeat(31))).toBe((1n << 248n) - 1n);
  });

  it.each([
    ['too short', 'c1'],
    ['too long', '00'.repeat(32)],
    ['uppercase', 'C1'.repeat(31)],
    ['not hex', 'zz'.repeat(31)],
    ['0x prefix', `0x${'00'.repeat(30)}`],
  ])('rejects a challenge that is %s', (_label, value) => {
    expect(() => encodeChallenge(value)).toThrow(TypeError);
  });

  it('encodes the verifier id like any other text attribute', () => {
    expect(encodeVerifierId('verifier-f')).toBe(encodeCredentialText('verifier-f'));
  });
});

describe('fullVariant', () => {
  it('adds the challenge and verifier id to the holder circuit inputs', async () => {
    const { input, issuer } = await buildFixture();
    const inputs = fullVariant.circuitInputs(input, issuer);

    expect(inputs).toMatchObject({
      challenge: '193',
      verifierId: encodeVerifierId('verifier-f').toString(),
      holderPrivateKey: '777',
      gpaThreshold: '300',
    });
    expect(Object.keys(inputs)).toHaveLength(18);
  });

  it('rejects a challenge the circuit cannot encode before any witness is built', async () => {
    const { input, issuer } = await buildFixture('not-a-challenge');

    expect(() => fullVariant.circuitInputs(input, issuer)).toThrow(TypeError);
  });

  it('expects [issuerKeyHash, gpaThreshold, challenge, verifierId] as public signals', async () => {
    const { input, issuer } = await buildFixture();
    const claims: PublicSignals = {
      issuerPublicKey: issuer.publicKey,
      gpaThreshold: input.request.gpaThreshold,
      challenge: input.request.challenge,
      verifierId: input.request.verifierId,
    };
    const signals = await fullVariant.expectedPublicSignals(claims);

    expect(signals).toHaveLength(4);
    expect(signals.slice(1)).toEqual(['300', '193', encodeVerifierId('verifier-f').toString()]);
  });
});
