import {
  makeGenerateProof,
  makeIssueChallenge,
  makeIssueCredential,
  makeVerifyCredential,
  type ProofEngine,
} from '../../src/application/index.js';
import {
  asVerifierId,
  type Gpa,
  type Proof,
  toGpa,
  type VerifierId,
} from '../../src/domain/index.js';
import {
  createInMemoryChallengeStore,
  createInMemoryCredentialRepository,
  createStaticIssuerRegistry,
} from '../../src/infrastructure/index.js';
import {
  createFakeClock,
  createFakeProofEngine,
  createFakeRandomness,
  createFakeSigner,
  testHolderPrivateKey,
  testHolderPublicKey,
  testIssuer,
} from './fakes.js';

export const gpa = (scaled: number): Gpa => {
  const result = toGpa(scaled);
  if (!result.ok) throw new Error(`invalid test GPA: ${scaled}`);
  return result.value;
};

export const verifierA: VerifierId = asVerifierId('verifier-a');
export const verifierB: VerifierId = asVerifierId('verifier-b');

export interface HarnessOptions {
  /** Defaults to the fake engine; pass a real one to run the same flows with real proofs. */
  readonly proofEngine?: ProofEngine;
}

/** Wires the use cases to in-memory adapters and fakes, as a composition root would. */
export const createHarness = (options: HarnessOptions = {}) => {
  const clock = createFakeClock();
  const randomness = createFakeRandomness();
  const credentials = createInMemoryCredentialRepository();
  const challenges = createInMemoryChallengeStore();
  const issuers = createStaticIssuerRegistry([testIssuer]);
  const proofEngine = options.proofEngine ?? createFakeProofEngine();
  const signer = createFakeSigner();

  const issueCredential = makeIssueCredential({ credentials, issuers, signer, clock, randomness });
  const issueChallenge = makeIssueChallenge({ challenges, clock, randomness });
  const generateProof = makeGenerateProof({ credentials, proofEngine });
  const verifyCredential = makeVerifyCredential({ challenges, issuers, proofEngine, clock });

  /** Issues a credential with the given GPA and returns its id. */
  const issueTestCredential = async (gpaScaled = 375) => {
    const result = await issueCredential({
      issuerId: testIssuer.id,
      holderPublicKey: testHolderPublicKey,
      studentNumber: '2210001',
      fullName: 'Test Student',
      degree: 'S.Kom.',
      graduationDate: '2026-08-20',
      gpa: gpaScaled,
    });
    if (!result.ok) throw new Error(`issuance failed: ${result.error}`);
    return result.value.credential.id;
  };

  /** Full happy-path presentation: new challenge for `verifierId`, then a proof for it. */
  const presentProof = async (
    credentialId: Awaited<ReturnType<typeof issueTestCredential>>,
    verifierId: VerifierId = verifierA,
    threshold = gpa(300),
  ): Promise<Proof> => {
    const challenge = await issueChallenge({ verifierId });
    const proof = await generateProof({
      credentialId,
      holderPrivateKey: testHolderPrivateKey,
      request: { verifierId, challenge: challenge.value, gpaThreshold: threshold },
    });
    if (!proof.ok) throw new Error(`proof generation failed: ${proof.error}`);
    return proof.value;
  };

  return {
    clock,
    issuers,
    challenges,
    issueCredential,
    issueChallenge,
    generateProof,
    verifyCredential,
    issueTestCredential,
    presentProof,
  };
};
