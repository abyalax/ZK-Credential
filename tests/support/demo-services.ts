import {
  type Clock,
  type HolderKeyring,
  makeGenerateProof,
  makeGetIssuerProfile,
  makeIssueChallenge,
  makeIssueCredential,
  makeListChallenges,
  makeListCredentials,
  makeRunScenario,
  makeVerifyCredential,
  type ProofEngine,
} from '../../src/application/index.js';
import type { HolderKeys, Issuer, Proof } from '../../src/domain/index.js';
import { asHolderPrivateKey, asHolderPublicKey, asProofPayload } from '../../src/domain/index.js';
import {
  createInMemoryChallengeStore,
  createInMemoryCredentialRepository,
  createStaticIssuerRegistry,
} from '../../src/infrastructure/index.js';
import type { HttpServices } from '../../src/interfaces/http/index.js';
import { InfrastructureError } from '../../src/shared/index.js';
import { createFakeClock, createFakeRandomness, createFakeSigner, type FakeClock, testIssuer } from './fakes.js';

/** Decimal private keys, because the alias attack adds the field order to the secret. */
export const simulationHolder: HolderKeys = {
  publicKey: asHolderPublicKey('12345'),
  privateKey: asHolderPrivateKey('424242'),
};
export const attackerHolder: HolderKeys = {
  publicKey: asHolderPublicKey('99999'),
  privateKey: asHolderPrivateKey('777777'),
};

/** Numeric text for any string, so the payload looks like decimal public signals. */
const numeric = (text: string): string => BigInt(`0x${Buffer.from(text).toString('hex')}`).toString();

const signalsOf = (claims: Proof['publicSignals']): string[] => [
  numeric(claims.issuerPublicKey),
  String(claims.gpaThreshold),
  numeric(claims.challenge),
  numeric(claims.verifierId),
];

const isWellFormed = (value: unknown): value is { proof: { pi_a: string[] }; publicSignals: string[] } => {
  const shape = value as { proof?: { pi_a?: unknown }; publicSignals?: unknown } | null;
  return Array.isArray(shape?.proof?.pi_a) && Array.isArray(shape.publicSignals);
};

const parse = (payload: string): unknown => {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
};

/**
 * Stands in for snarkjs with the same shape of payload (`proof.pi_a`, `publicSignals`) and the same
 * bindings: only the owner key proves, and a proof verifies only for the exact claims it was made for.
 * Nothing here is cryptographic; the real-proof run lives in tests/zk.
 */
export const createBindingFakeEngine = (issuer: Issuer = testIssuer): ProofEngine => ({
  generate: async ({ holderPrivateKey, request }) => {
    if (holderPrivateKey !== simulationHolder.privateKey) throw new InfrastructureError('witness refused');
    const publicSignals = {
      issuerPublicKey: issuer.publicKey,
      gpaThreshold: request.gpaThreshold,
      challenge: request.challenge,
      verifierId: request.verifierId,
    };
    const payload = JSON.stringify({ proof: { pi_a: ['2', '3', '1'] }, publicSignals: signalsOf(publicSignals) });
    return { protocol: 'groth16', payload: asProofPayload(payload), publicSignals };
  },
  verify: async (proof) => {
    const parsed = parse(proof.payload);
    if (!isWellFormed(parsed)) return false;
    return (
      parsed.proof.pi_a[0] === '2' && JSON.stringify(parsed.publicSignals) === JSON.stringify(signalsOf(proof.publicSignals))
    );
  },
});

export interface SimulationServices {
  readonly services: HttpServices;
  readonly clock: FakeClock;
}

/** The HTTP slice of the container, wired to in-memory adapters and the binding fake engine. */
export const createSimulationServices = (
  overrides: Partial<HttpServices> = {},
  options: { readonly verifyCredentialGas?: number } = {},
): SimulationServices => {
  const clock = createFakeClock();
  const randomness = createFakeRandomness();
  const credentials = createInMemoryCredentialRepository();
  const challenges = createInMemoryChallengeStore();
  const issuers = createStaticIssuerRegistry([testIssuer]);
  const proofEngine = createBindingFakeEngine();
  const holderKeyring: HolderKeyring = { current: async () => simulationHolder, generate: async () => attackerHolder };

  const issueCredential = makeIssueCredential({ credentials, issuers, signer: createFakeSigner(), clock, randomness });
  const issueChallenge = makeIssueChallenge({ challenges, clock, randomness });
  const generateProof = makeGenerateProof({ credentials, proofEngine });
  const verifyCredential = makeVerifyCredential({ challenges, issuers, proofEngine, clock });
  const runClock: Clock = clock;

  return {
    clock,
    services: {
      clock: runClock,
      issuer: testIssuer,
      holderKeyring,
      issueCredential,
      issueChallenge,
      generateProof,
      verifyCredential,
      getIssuerProfile: makeGetIssuerProfile({ issuer: testIssuer, issuers }),
      listCredentials: makeListCredentials({ credentials }),
      listChallenges: makeListChallenges({ challenges, clock }),
      runScenario: makeRunScenario({
        issuer: testIssuer,
        issuers,
        holderKeyring,
        clock,
        issueCredential,
        issueChallenge,
        generateProof,
        verifyCredential,
        ...(options.verifyCredentialGas === undefined ? {} : { verifyCredentialGas: options.verifyCredentialGas }),
      }),
      ...overrides,
    },
  };
};
