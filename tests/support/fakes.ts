import type {
  Clock,
  CredentialSigner,
  ProofEngine,
  Randomness,
} from '../../src/application/index.js';
import type { Issuer, Proof } from '../../src/domain/index.js';
import {
  asHolderPublicKey,
  asHolderSecretKey,
  asIssuerId,
  asIssuerPublicKey,
  asIssuerSignature,
  asProofPayload,
} from '../../src/domain/index.js';

/** Test doubles only: nothing here is cryptographically meaningful. */

export const testIssuer: Issuer = {
  id: asIssuerId('issuer-1'),
  name: 'Test University',
  publicKey: asIssuerPublicKey('issuer-1-public-key'),
};

export const testHolderPublicKey = asHolderPublicKey('holder-1-public-key');
export const testHolderSecretKey = asHolderSecretKey('holder-1-secret-key');

export interface FakeClock extends Clock {
  advance(ms: number): void;
}

export const createFakeClock = (start = 1_700_000_000_000): FakeClock => {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
};

/** Deterministic, unique values; keeps tests reproducible. */
export const createFakeRandomness = (): Randomness => {
  let counter = 0;
  return {
    hex: (bytes) => {
      counter += 1;
      return counter.toString(16).padStart(bytes * 2, '0');
    },
  };
};

export const createFakeSigner = (): CredentialSigner => ({
  sign: async (credential) => asIssuerSignature(`fake-signature:${credential.id}`),
});

export const VALID_PAYLOAD = asProofPayload('fake-proof:valid');
export const FORGED_PAYLOAD = asProofPayload('fake-proof:forged');

/** Accepts only proofs whose payload equals `VALID_PAYLOAD`. */
export const createFakeProofEngine = (issuer: Issuer = testIssuer): ProofEngine => ({
  generate: async ({ request }): Promise<Proof> => ({
    protocol: 'groth16',
    payload: VALID_PAYLOAD,
    publicSignals: {
      issuerPublicKey: issuer.publicKey,
      gpaThreshold: request.gpaThreshold,
      challenge: request.challenge,
      verifierId: request.verifierId,
    },
  }),
  verify: async (proof) => proof.payload === VALID_PAYLOAD,
});
