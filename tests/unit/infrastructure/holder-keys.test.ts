import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { ProofGenerationInput } from '../../../src/application/index.js';
import {
  asChallengeValue,
  asHolderPrivateKey,
  asIssuerId,
  asVerifierId,
  createCredential,
  type Issuer,
  toGpa,
} from '../../../src/domain/index.js';
import {
  BN254_FIELD_ORDER,
  createEddsaCredentialSigner,
  credentialCommitmentInputs,
  deriveHolderPublicKey,
  generateHolderKeyPair,
  holderVariant,
  parseFieldElement,
} from '../../../src/infrastructure/index.js';
import { testHolderPublicKey } from '../../support/fakes.js';

/** A credential signed by a real EdDSA key, bound to `testHolderPublicKey`. */
const buildFixture = async () => {
  const signer = await createEddsaCredentialSigner('11'.repeat(32));
  const created = createCredential({
    id: 'cred-h',
    issuerId: 'issuer-h',
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
    id: asIssuerId('issuer-h'),
    name: 'Holder test issuer',
    publicKey: signer.publicKey,
  };
  const input: ProofGenerationInput = {
    signedCredential: {
      credential: created.value,
      signature: await signer.sign(created.value),
    },
    holderPrivateKey: asHolderPrivateKey('777'),
    request: {
      verifierId: asVerifierId('verifier-h'),
      challenge: asChallengeValue('challenge-h'),
      gpaThreshold: threshold.value,
    },
  };
  return { input, issuer };
};

const fixedRandom = (byte: number) => (size: number) => new Uint8Array(size).fill(byte);

describe('holder key derivation', () => {
  it('derives holderPublicKey = Poseidon(holderPrivateKey) as a canonical decimal below the field order', async () => {
    const publicKey = await deriveHolderPublicKey(asHolderPrivateKey('123'));

    expect(publicKey).toMatch(/^(?:0|[1-9]\d*)$/);
    expect(BigInt(publicKey)).toBeLessThan(BN254_FIELD_ORDER);
    // Pins the derivation (Poseidon of one input, circomlibjs) against accidental changes.
    expect(publicKey).toBe('9904028930859697121695025471312564917337032846528014134060777877259199866166');
    expect(publicKey).not.toBe(await deriveHolderPublicKey(asHolderPrivateKey('124')));
  });

  it('generates a 248-bit secret whose public key matches the derivation', async () => {
    const pair = await generateHolderKeyPair(fixedRandom(0xff));

    expect(BigInt(pair.privateKey)).toBe((1n << 248n) - 1n);
    expect(pair.publicKey).toBe(await deriveHolderPublicKey(pair.privateKey));
  });

  it('generates different keys on every call with the default CSPRNG', async () => {
    const [a, b] = await Promise.all([generateHolderKeyPair(), generateHolderKeyPair()]);

    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe('holder private key hygiene', () => {
  it('keeps the secret out of JSON, spreading and inspection of the key pair', async () => {
    const pair = await generateHolderKeyPair(fixedRandom(0x42));
    const rendered = [JSON.stringify(pair), inspect(pair, { depth: 4 }), JSON.stringify({ ...pair })];

    for (const text of rendered) expect(text).not.toContain(pair.privateKey);
    expect(JSON.stringify(pair)).toContain(pair.publicKey);
    expect(pair.privateKey).toBeDefined();
  });

  it('never repeats the offending value in validation errors', () => {
    const secret = `${BN254_FIELD_ORDER}`;

    expect(() => parseFieldElement(secret, 'Holder private key')).toThrow(/below the BN254/);
    try {
      parseFieldElement(secret, 'Holder private key');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe('parseFieldElement', () => {
  it.each([
    ['empty', ''],
    ['hex', '0x10'],
    ['negative', '-1'],
    ['leading zero', '007'],
    ['decimal point', '1.5'],
    ['padded', ' 5'],
    ['the field order itself', BN254_FIELD_ORDER.toString()],
  ])('rejects %s', (_label, value) => {
    expect(() => parseFieldElement(value, 'value')).toThrow(TypeError);
  });

  it('accepts zero and the largest field element', () => {
    expect(parseFieldElement('0', 'value')).toBe(0n);
    expect(parseFieldElement((BN254_FIELD_ORDER - 1n).toString(), 'value')).toBe(BN254_FIELD_ORDER - 1n);
  });
});

describe('holder key in the credential commitment', () => {
  it('uses holderPublicKey as the third committed field', async () => {
    const { input } = await buildFixture();

    expect(credentialCommitmentInputs(input.signedCredential.credential)[2]).toBe(BigInt(testHolderPublicKey));
  });
});

describe('holderVariant', () => {
  it('feeds the holder private key to the circuit next to every issuer input', async () => {
    const { input, issuer } = await buildFixture();
    const inputs = holderVariant.circuitInputs(input, issuer);

    expect(inputs).toMatchObject({
      holderPrivateKey: '777',
      holderPublicKey: testHolderPublicKey,
      gpa: '375',
      gpaThreshold: '300',
    });
    expect(Object.keys(inputs)).toHaveLength(16);
  });

  it('rejects a secret that is not a field element before any witness is built', async () => {
    const { input, issuer } = await buildFixture();
    const bad = { ...input, holderPrivateKey: asHolderPrivateKey('not-a-number') };

    expect(() => holderVariant.circuitInputs(bad, issuer)).toThrow(TypeError);
  });
});
