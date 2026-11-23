import { makeIssueChallenge } from '../../src/application/index.js';
import { asChallengeValue, evaluateChallenge, type VerifierId } from '../../src/domain/index.js';
import {
  createInMemoryChallengeStore,
  generateSdJwtKeyPair,
  issueSdJwt,
  peekKeyBinding,
  presentSdJwt,
  type SdJwtKeyPair,
  verifySdJwtPresentation,
} from '../../src/infrastructure/index.js';
import { createFakeClock, createFakeRandomness } from '../../tests/support/fakes.js';
import { verifierA, verifierB } from '../../tests/support/harness.js';
import { ACCEPTED, type Outcome } from './types.js';

/**
 * P5 scenarios for the SD-JWT baseline (D9). Ids match `catalog.ts` where the attack has an SD-JWT
 * counterpart; attacks aimed at ZK-specific encodings are listed in `SD_NOT_APPLICABLE`.
 */

const TRUSTED_ISSUER = 'issuer-p5';
const ROGUE_ISSUER = 'issuer-rogue';
const REQUIRED_GPA = 300;
const TTL_MS = 5 * 60 * 1000;

export interface SdWorld {
  readonly issuerKeys: SdJwtKeyPair;
  readonly rogueKeys: SdJwtKeyPair;
  readonly holderKeys: SdJwtKeyPair;
  readonly attackerKeys: SdJwtKeyPair;
}

export const createSdWorld = (): SdWorld => ({
  issuerKeys: generateSdJwtKeyPair(),
  rogueKeys: generateSdJwtKeyPair(),
  holderKeys: generateSdJwtKeyPair(),
  attackerKeys: generateSdJwtKeyPair(),
});

/** A fresh verifier: own clock and challenge store, trusting only the legitimate issuer. */
const createVerifier = (world: SdWorld) => {
  const clock = createFakeClock();
  const challenges = createInMemoryChallengeStore();
  const issueChallenge = makeIssueChallenge({ challenges, clock, randomness: createFakeRandomness() });
  const trustedIssuers = new Map([[TRUSTED_ISSUER, world.issuerKeys.publicKey]]);

  const verify = async (presentation: string, verifierId: VerifierId, requiredGpa = REQUIRED_GPA): Promise<Outcome> => {
    const reject = (reason: string): Outcome => ({ accepted: false, stage: 'verify', reason });
    const claimed = peekKeyBinding(presentation);
    if (!claimed) return reject('SD_JWT_MALFORMED');
    if (claimed.audience !== verifierId) return reject('CHALLENGE_VERIFIER_MISMATCH');

    const stored = await challenges.find(asChallengeValue(claimed.nonce));
    const challenge = evaluateChallenge({ stored, expectedVerifierId: verifierId, now: clock.now() });
    if (!challenge.ok) return reject(challenge.error);

    const checked = verifySdJwtPresentation({
      presentation,
      trustedIssuers,
      expectedAudience: verifierId,
      expectedNonce: claimed.nonce,
    });
    if (!checked.ok) return reject(checked.error);

    const disclosedGpa = checked.value.disclosed.gpa;
    if (typeof disclosedGpa !== 'number') return reject('GPA_NOT_DISCLOSED');
    if (disclosedGpa < requiredGpa) return reject('THRESHOLD_BELOW_REQUIRED');

    // Consume only after every check passed, as in the ZK verify use case.
    if (!(await challenges.markConsumed(challenge.value.value, clock.now()))) return reject('CHALLENGE_ALREADY_USED');
    return ACCEPTED;
  };
  return { clock, issueChallenge, verify };
};

type Verifier = ReturnType<typeof createVerifier>;

interface Build {
  readonly gpa?: number;
  readonly issuer?: string;
  readonly signWith?: SdJwtKeyPair;
  readonly bindWith?: SdJwtKeyPair;
  readonly disclose?: readonly string[];
  readonly verifierId?: VerifierId;
  /** Skips asking the verifier for a challenge and uses this nonce instead. */
  readonly nonce?: string;
}

interface Prepared {
  readonly verifier: Verifier;
  readonly presentation: string;
  readonly verifierId: VerifierId;
}

const prepare = async (world: SdWorld, build: Build = {}): Promise<Prepared> => {
  const verifier = createVerifier(world);
  const verifierId = build.verifierId ?? verifierA;
  const nonce = build.nonce ?? (await verifier.issueChallenge({ verifierId })).value;
  const sdJwt = issueSdJwt({
    issuer: build.issuer ?? TRUSTED_ISSUER,
    issuerPrivateKey: (build.signWith ?? world.issuerKeys).privateKey,
    holderPublicKey: world.holderKeys.publicKey,
    claims: {
      studentNumber: '2210001',
      fullName: 'P5 Test Student',
      degree: 'S.Kom.',
      graduationDate: '2026-08-20',
      gpa: build.gpa ?? 375,
    },
    issuedAt: 1_700_000_000,
  });
  const presentation = presentSdJwt({
    sdJwt,
    disclose: build.disclose ?? ['gpa'],
    holderPrivateKey: (build.bindWith ?? world.holderKeys).privateKey,
    nonce,
    audience: verifierId,
    issuedAt: 1_700_000_100,
  });
  return { verifier, presentation, verifierId };
};

const attempt = async (world: SdWorld, build: Build = {}): Promise<Outcome> => {
  const prepared = await prepare(world, build);
  return prepared.verifier.verify(prepared.presentation, prepared.verifierId);
};

const decodePart = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
const encodePart = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Rewrites the key-binding payload without re-signing it, as an attacker without the key would. */
const relabelKeyBinding = (presentation: string, changes: Record<string, string>): string => {
  const parts = presentation.split('~');
  const [header = '', payload = '', signature = ''] = (parts.pop() ?? '').split('.');
  return [...parts, [header, encodePart({ ...decodePart(payload), ...changes }), signature].join('.')].join('~');
};

const flipIssuerSignature = (presentation: string): string => {
  const [jwt = '', ...rest] = presentation.split('~');
  const [header = '', payload = '', signature = ''] = jwt.split('.');
  const flipped = Buffer.from(signature, 'base64url');
  flipped[0] = (flipped[0] ?? 0) ^ 0xff;
  return [[header, payload, flipped.toString('base64url')].join('.'), ...rest].join('~');
};

export interface SdScenario {
  readonly id: string;
  readonly kind: 'honest' | 'attack';
  /** `ACCEPTED` for honest scenarios, otherwise the expected rejection reason. */
  readonly reason: string;
  readonly run: (world: SdWorld) => Promise<Outcome>;
}

const replayed = async (world: SdWorld, relabel?: (prepared: Prepared) => Promise<string>): Promise<Outcome> => {
  const prepared = await prepare(world);
  const first = await prepared.verifier.verify(prepared.presentation, prepared.verifierId);
  if (!first.accepted) return first;
  const second = relabel ? await relabel(prepared) : prepared.presentation;
  return prepared.verifier.verify(second, prepared.verifierId);
};

export const SD_SCENARIOS: readonly SdScenario[] = [
  { id: 'valid-accepted', kind: 'honest', reason: 'ACCEPTED', run: (w) => attempt(w) },
  { id: 'valid-gpa-equals-threshold', kind: 'honest', reason: 'ACCEPTED', run: (w) => attempt(w, { gpa: 300 }) },
  { id: 'valid-gpa-maximum', kind: 'honest', reason: 'ACCEPTED', run: (w) => attempt(w, { gpa: 400 }) },
  { id: 'valid-other-verifier', kind: 'honest', reason: 'ACCEPTED', run: (w) => attempt(w, { verifierId: verifierB }) },
  { id: 'gpa-below-threshold', kind: 'attack', reason: 'THRESHOLD_BELOW_REQUIRED', run: (w) => attempt(w, { gpa: 250 }) },
  { id: 'gpa-not-disclosed', kind: 'attack', reason: 'GPA_NOT_DISCLOSED', run: (w) => attempt(w, { disclose: ['degree'] }) },
  {
    id: 'credential-tampered',
    kind: 'attack',
    reason: 'DISCLOSURE_INVALID',
    run: async (w) => {
      const { verifier, presentation, verifierId } = await prepare(w, { gpa: 250 });
      const [jwt = '', disclosure = '', keyBinding = ''] = presentation.split('~');
      const forged = encodePart([decodePart(disclosure)[0], 'gpa', 390]);
      return verifier.verify([jwt, forged, keyBinding].join('~'), verifierId);
    },
  },
  {
    id: 'signature-other-issuer',
    kind: 'attack',
    reason: 'ISSUER_SIGNATURE_INVALID',
    run: (w) => attempt(w, { signWith: w.rogueKeys }),
  },
  {
    id: 'signature-malformed',
    kind: 'attack',
    reason: 'ISSUER_SIGNATURE_INVALID',
    run: async (w) => {
      const { verifier, presentation, verifierId } = await prepare(w);
      const [jwt = '', ...rest] = presentation.split('~');
      const [header = '', payload = ''] = jwt.split('.');
      return verifier.verify([`${header}.${payload}.not-json`, ...rest].join('~'), verifierId);
    },
  },
  {
    id: 'issuer-unregistered',
    kind: 'attack',
    reason: 'ISSUER_NOT_REGISTERED',
    run: (w) => attempt(w, { signWith: w.rogueKeys, issuer: ROGUE_ISSUER }),
  },
  {
    id: 'holder-without-key',
    kind: 'attack',
    reason: 'KEY_BINDING_INVALID',
    run: (w) => attempt(w, { bindWith: w.attackerKeys }),
  },
  { id: 'replay-same-proof', kind: 'attack', reason: 'CHALLENGE_ALREADY_USED', run: (w) => replayed(w) },
  {
    id: 'replay-relabelled-challenge',
    kind: 'attack',
    reason: 'KEY_BINDING_INVALID',
    run: (w) =>
      replayed(w, async ({ verifier, presentation, verifierId }) =>
        relabelKeyBinding(presentation, { nonce: (await verifier.issueChallenge({ verifierId })).value }),
      ),
  },
  {
    id: 'relay-to-other-verifier',
    kind: 'attack',
    reason: 'KEY_BINDING_INVALID',
    run: async (w) => {
      const { verifier, presentation } = await prepare(w);
      const fresh = (await verifier.issueChallenge({ verifierId: verifierB })).value;
      return verifier.verify(relabelKeyBinding(presentation, { aud: verifierB, nonce: fresh }), verifierB);
    },
  },
  {
    id: 'wrong-verifier',
    kind: 'attack',
    reason: 'CHALLENGE_VERIFIER_MISMATCH',
    run: async (w) => {
      const { verifier, presentation } = await prepare(w);
      return verifier.verify(presentation, verifierB);
    },
  },
  {
    id: 'challenge-expired',
    kind: 'attack',
    reason: 'CHALLENGE_EXPIRED',
    run: async (w) => {
      const { verifier, presentation, verifierId } = await prepare(w);
      verifier.clock.advance(TTL_MS + 1);
      return verifier.verify(presentation, verifierId);
    },
  },
  { id: 'challenge-unknown', kind: 'attack', reason: 'CHALLENGE_UNKNOWN', run: (w) => attempt(w, { nonce: 'ab'.repeat(31) }) },
  {
    id: 'payload-not-json',
    kind: 'attack',
    reason: 'SD_JWT_MALFORMED',
    run: async (w) => (await prepare(w)).verifier.verify('not-json', verifierA),
  },
  {
    id: 'payload-bad-shape',
    kind: 'attack',
    reason: 'SD_JWT_MALFORMED',
    run: async (w) => (await prepare(w)).verifier.verify('e30.e30.AA~e30.e30.AA', verifierA),
  },
  {
    id: 'proof-bytes-tampered',
    kind: 'attack',
    reason: 'ISSUER_SIGNATURE_INVALID',
    run: async (w) => {
      const { verifier, presentation, verifierId } = await prepare(w);
      return verifier.verify(flipIssuerSignature(presentation), verifierId);
    },
  },
];

/** Catalog attacks with no SD-JWT counterpart, with the reason. Reported next to the results. */
export const SD_NOT_APPLICABLE: Readonly<Record<string, string>> = {
  'threshold-below-policy': 'SD-JWT has no claimed threshold; the verifier applies its policy to the disclosed GPA',
  'holder-secret-guessed': 'Poseidon holder-key derivation does not exist in SD-JWT (Ed25519 key binding)',
  'holder-secret-out-of-field': 'Field-order aliasing is specific to BN254 circuits',
  'signals-truncated': 'No public signals in SD-JWT',
  'signals-non-decimal': 'No public signals in SD-JWT',
  'signals-out-of-field': 'No public signals in SD-JWT',
  'claims-challenge-out-of-field': 'Challenge is an opaque string in SD-JWT, not a field element',
};
