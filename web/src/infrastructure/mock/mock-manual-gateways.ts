import type { HolderGateway, IssuerGateway, VerifierGateway } from '@/application';
import type { ChallengeView, CredentialView, IssuerView } from '@/domain';
import { err, ok } from '@/shared';

/** MOCK ONLY: in-memory wallet, challenge store and a fake proof, so the replay behavior can be tried in the browser. */
const MOCK_ISSUER: IssuerView = {
  id: 'issuer-demo',
  name: 'Universitas Demo (mock)',
  publicKey: '0x04a1…mock…9f2e',
  registered: true,
};
const MOCK_HOLDER_KEY = '0x7c3d…mock…41b0';
const PROOF_PREFIX = 'mock-groth16';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const randomHex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

export interface MockState {
  credentials: CredentialView[];
  challenges: ChallengeView[];
}

export const createMockState = (): MockState => ({ credentials: [], challenges: [] });

const statusOf = (challenge: ChallengeView, now: number): ChallengeView['status'] =>
  challenge.status === 'issued' && challenge.expiresAt <= now ? 'expired' : challenge.status;

export const createMockIssuer = (state: MockState): IssuerGateway => ({
  profile: () => Promise.resolve(MOCK_ISSUER),
  issued: () => Promise.resolve([...state.credentials]),
  issue: async (input) => {
    await sleep(250);
    if ([input.studentNumber, input.fullName, input.degree].some((value) => value.trim() === ''))
      return err('REQUIRED_FIELD_EMPTY');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.graduationDate)) return err('GRADUATION_DATE_INVALID');
    if (!Number.isInteger(input.gpa) || input.gpa < 0 || input.gpa > 400) return err('GPA_OUT_OF_RANGE');
    const credential: CredentialView = {
      ...input,
      id: `cred-${state.credentials.length + 1}`,
      issuerId: MOCK_ISSUER.id,
      holderPublicKey: MOCK_HOLDER_KEY,
      issuedAt: Date.now(),
    };
    state.credentials = [credential, ...state.credentials];
    return ok(credential);
  },
});

export const createMockHolder = (state: MockState): HolderGateway => ({
  credentials: () => Promise.resolve([...state.credentials]),
  createProof: async (input) => {
    const credential = state.credentials.find((candidate) => candidate.id === input.credentialId);
    if (!credential) return err('CREDENTIAL_NOT_FOUND');
    if (credential.gpa < input.threshold) return err('ATTRIBUTE_BELOW_THRESHOLD');
    await sleep(900);
    const payload = `${PROOF_PREFIX}:${input.challenge}`;
    return ok({
      payload,
      sizeBytes: payload.length,
      durationMs: 900,
      publicSignals: {
        issuerPublicKey: MOCK_ISSUER.publicKey,
        gpaThreshold: input.threshold,
        challenge: input.challenge,
        verifierId: input.verifierId,
      },
    });
  },
});

export const createMockVerifier = (state: MockState): VerifierGateway => ({
  challenges: () =>
    Promise.resolve(state.challenges.map((challenge) => ({ ...challenge, status: statusOf(challenge, Date.now()) }))),
  issueChallenge: ({ verifierId, ttlMs }) => {
    const now = Date.now();
    const challenge: ChallengeView = {
      value: randomHex(31),
      verifierId,
      issuedAt: now,
      expiresAt: now + ttlMs,
      status: 'issued',
    };
    state.challenges = [challenge, ...state.challenges];
    return Promise.resolve(challenge);
  },
  verify: async ({ proof, verifierId, requiredThreshold }) => {
    await sleep(60);
    const reject = (reason: string, stage: 'verify' = 'verify') => ({ accepted: false, stage, reason, durationMs: 60 });
    const claims = proof.publicSignals;
    if (claims.verifierId !== verifierId) return reject('CHALLENGE_VERIFIER_MISMATCH');
    if (claims.gpaThreshold < requiredThreshold) return reject('THRESHOLD_BELOW_REQUIRED');
    const stored = state.challenges.find((challenge) => challenge.value === claims.challenge);
    if (!stored || stored.verifierId !== verifierId) return reject('CHALLENGE_UNKNOWN');
    const status = statusOf(stored, Date.now());
    if (status === 'consumed') return reject('CHALLENGE_ALREADY_USED');
    if (status === 'expired') return reject('CHALLENGE_EXPIRED');
    if (proof.payload !== `${PROOF_PREFIX}:${claims.challenge}`) return reject('PROOF_INVALID');
    state.challenges = state.challenges.map((challenge) =>
      challenge === stored ? { ...challenge, status: 'consumed' } : challenge,
    );
    return { accepted: true, stage: 'verify' as const, reason: 'ACCEPTED', durationMs: 60 };
  },
});
