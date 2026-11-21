import { DEFAULT_CHALLENGE_TTL_MS } from '../../src/application/index.js';
import {
  asChallengeValue,
  asHolderPrivateKey,
  asIssuerSignature,
  asProofPayload,
  type Proof,
} from '../../src/domain/index.js';
import { BN254_FIELD_ORDER } from '../../src/infrastructure/index.js';
import { gpa, verifierA, verifierB } from '../../tests/support/harness.js';
import { attempt, type PresentOptions, policyFor, prepareAttempt, present } from './context.js';
import { ACCEPTED, PROOF_INVALID, PROVE_FAILED, type Scenario, type VariantName } from './types.js';

const NONE: readonly VariantName[] = [];
/** Variants whose circuit does not (yet) bind the replay inputs, so relabelling goes through. */
const WITHOUT_REPLAY_BINDING: readonly VariantName[] = ['threshold', 'issuer', 'holder'];

interface PayloadShape {
  proof: { pi_a: string[] } & Record<string, unknown>;
  publicSignals: string[];
}

/** Rewrites the serialized payload of a proof; claims are left as they were. */
const editPayload = (proof: Proof, edit: (payload: PayloadShape) => void): Proof => {
  const payload = JSON.parse(proof.payload) as PayloadShape;
  edit(payload);
  return { ...proof, payload: asProofPayload(JSON.stringify(payload)) };
};

const tamperPayload =
  (edit: (payload: PayloadShape) => void): PresentOptions['tamper'] =>
  (proof) =>
    editPayload(proof, edit);

const lastIndex = (payload: PayloadShape): number => payload.publicSignals.length - 1;

const honest = (id: string, title: string, run: Scenario['run']): Scenario => ({
  id,
  title,
  kind: 'honest',
  category: 'baseline',
  openIn: NONE,
  fullReason: ACCEPTED.reason,
  run,
});

const attack = (
  base: Pick<Scenario, 'id' | 'title' | 'category' | 'fullReason' | 'run'> & {
    openIn?: readonly VariantName[];
  },
): Scenario => ({ ...base, kind: 'attack', openIn: base.openIn ?? NONE });

const honestScenarios: Scenario[] = [
  honest('valid-accepted', 'Valid proof for the credential owner is accepted', (ctx) =>
    attempt(ctx),
  ),
  honest('valid-gpa-equals-threshold', 'GPA exactly at the threshold is accepted', async (ctx) =>
    attempt(ctx, { signedCredential: await ctx.signCredential({ gpaScaled: 300 }) }),
  ),
  honest('valid-gpa-maximum', 'Maximum GPA (4.00) is accepted', async (ctx) =>
    attempt(ctx, { signedCredential: await ctx.signCredential({ gpaScaled: 400 }) }),
  ),
  honest('valid-other-verifier', 'Valid proof for a second verifier is accepted', (ctx) =>
    attempt(ctx, { verifierId: verifierB }),
  ),
];

const thresholdScenarios: Scenario[] = [
  attack({
    id: 'gpa-below-threshold',
    title: 'GPA below the claimed threshold cannot be proven',
    category: 'threshold',
    fullReason: PROVE_FAILED.reason,
    run: async (ctx) =>
      attempt(ctx, { signedCredential: await ctx.signCredential({ gpaScaled: 250 }) }),
  }),
  attack({
    id: 'threshold-below-policy',
    title: 'Proof of a weaker threshold than the verifier requires is rejected',
    category: 'threshold',
    fullReason: 'THRESHOLD_BELOW_REQUIRED',
    run: (ctx) => attempt(ctx, { threshold: 200 }),
  }),
];

const issuerScenarios: Scenario[] = [
  attack({
    id: 'credential-tampered',
    title: 'Attribute changed after signing (GPA 2.50 -> 3.90)',
    category: 'issuer',
    openIn: ['threshold'],
    fullReason: PROVE_FAILED.reason,
    run: async (ctx) => {
      const original = await ctx.signCredential({ gpaScaled: 250 });
      const tampered = { ...original, credential: { ...original.credential, gpa: gpa(390) } };
      return attempt(ctx, { signedCredential: tampered });
    },
  }),
  attack({
    id: 'signature-other-issuer',
    title: 'Signature made by another key than the claimed issuer',
    category: 'issuer',
    openIn: ['threshold'],
    fullReason: PROVE_FAILED.reason,
    run: async (ctx) =>
      attempt(ctx, { signedCredential: await ctx.signCredential({ signer: ctx.rogueSigner }) }),
  }),
  attack({
    id: 'signature-malformed',
    title: 'Malformed signature string',
    category: 'issuer',
    openIn: ['threshold'],
    fullReason: PROVE_FAILED.reason,
    run: async (ctx) => {
      const signed = await ctx.signCredential();
      return attempt(ctx, {
        signedCredential: { ...signed, signature: asIssuerSignature('not-json') },
      });
    },
  }),
  attack({
    id: 'issuer-unregistered',
    title: 'Credential signed by an issuer the verifier never registered',
    category: 'issuer',
    fullReason: 'ISSUER_NOT_REGISTERED',
    run: async (ctx) =>
      attempt(ctx, {
        engine: ctx.rogueEngine,
        signedCredential: await ctx.signCredential({
          signer: ctx.rogueSigner,
          issuerId: ctx.rogueIssuer.id,
        }),
      }),
  }),
];

const holderScenarios: Scenario[] = [
  attack({
    id: 'holder-without-key',
    title: 'Copy of the credential presented with the attacker key',
    category: 'holder',
    openIn: ['threshold', 'issuer'],
    fullReason: PROVE_FAILED.reason,
    run: (ctx) => attempt(ctx, { holderPrivateKey: ctx.attacker.privateKey }),
  }),
  attack({
    id: 'holder-secret-guessed',
    title: 'Public key used as if it were the private key',
    category: 'holder',
    openIn: ['threshold', 'issuer'],
    fullReason: PROVE_FAILED.reason,
    run: (ctx) => attempt(ctx, { holderPrivateKey: asHolderPrivateKey(ctx.owner.publicKey) }),
  }),
  attack({
    id: 'holder-secret-out-of-field',
    title: 'Correct secret aliased above the field order (secret + r)',
    category: 'holder',
    openIn: ['threshold', 'issuer'],
    fullReason: PROVE_FAILED.reason,
    run: (ctx) =>
      attempt(ctx, {
        holderPrivateKey: asHolderPrivateKey(
          (BigInt(ctx.owner.privateKey) + BN254_FIELD_ORDER).toString(),
        ),
      }),
  }),
];

const replayScenarios: Scenario[] = [
  attack({
    id: 'replay-same-proof',
    title: 'Accepted proof presented a second time',
    category: 'replay',
    fullReason: 'CHALLENGE_ALREADY_USED',
    run: async (ctx) => {
      const prepared = await prepareAttempt(ctx);
      const first = await present(prepared);
      return first.accepted ? present(prepared) : first;
    },
  }),
  attack({
    id: 'replay-relabelled-challenge',
    title: 'Used proof relabelled onto a fresh challenge of the same verifier',
    category: 'replay',
    openIn: WITHOUT_REPLAY_BINDING,
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) => {
      const prepared = await prepareAttempt(ctx);
      const first = await present(prepared);
      if (!first.accepted) return first;
      return present(prepared, {
        tamper: async (proof, session) => ({
          ...proof,
          publicSignals: {
            ...proof.publicSignals,
            challenge: (await session.issueChallenge({ verifierId: verifierA })).value,
          },
        }),
      });
    },
  }),
  attack({
    id: 'relay-to-other-verifier',
    title: 'Proof for verifier A relabelled for verifier B and its fresh challenge',
    category: 'replay',
    openIn: WITHOUT_REPLAY_BINDING,
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) =>
      present(await prepareAttempt(ctx), {
        policy: policyFor(verifierB),
        tamper: async (proof, session) => ({
          ...proof,
          publicSignals: {
            ...proof.publicSignals,
            verifierId: verifierB,
            challenge: (await session.issueChallenge({ verifierId: verifierB })).value,
          },
        }),
      }),
  }),
  attack({
    id: 'wrong-verifier',
    title: 'Proof for verifier A presented to verifier B unchanged',
    category: 'replay',
    fullReason: 'CHALLENGE_VERIFIER_MISMATCH',
    run: async (ctx) => present(await prepareAttempt(ctx), { policy: policyFor(verifierB) }),
  }),
  attack({
    id: 'challenge-expired',
    title: 'Proof presented after the challenge expired',
    category: 'replay',
    fullReason: 'CHALLENGE_EXPIRED',
    run: async (ctx) =>
      present(await prepareAttempt(ctx), { advanceMs: DEFAULT_CHALLENGE_TTL_MS + 1 }),
  }),
  attack({
    id: 'challenge-unknown',
    title: 'Challenge the verifier never issued',
    category: 'replay',
    fullReason: 'CHALLENGE_UNKNOWN',
    run: (ctx) => attempt(ctx, { challenge: 'ab'.repeat(31) }),
  }),
];

const malformedScenarios: Scenario[] = [
  attack({
    id: 'payload-not-json',
    title: 'Proof payload is not JSON',
    category: 'malformed',
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) =>
      present(await prepareAttempt(ctx), {
        tamper: (proof) => ({ ...proof, payload: asProofPayload('not-json') }),
      }),
  }),
  attack({
    id: 'payload-bad-shape',
    title: 'Proof payload has the wrong structure',
    category: 'malformed',
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) =>
      present(await prepareAttempt(ctx), {
        tamper: (proof) => ({
          ...proof,
          payload: asProofPayload(JSON.stringify({ proof: {}, publicSignals: [] })),
        }),
      }),
  }),
  attack({
    id: 'proof-bytes-tampered',
    title: 'Proof point pi_a changed',
    category: 'malformed',
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) =>
      present(await prepareAttempt(ctx), {
        tamper: tamperPayload((payload) => {
          payload.proof.pi_a[0] = '1';
        }),
      }),
  }),
  attack({
    id: 'signals-truncated',
    title: 'Last public signal removed from the payload',
    category: 'malformed',
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) =>
      present(await prepareAttempt(ctx), {
        tamper: tamperPayload((payload) => {
          payload.publicSignals.pop();
        }),
      }),
  }),
  attack({
    id: 'signals-non-decimal',
    title: 'Public signal is not a decimal string',
    category: 'malformed',
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) =>
      present(await prepareAttempt(ctx), {
        tamper: tamperPayload((payload) => {
          payload.publicSignals[0] = '0x10';
        }),
      }),
  }),
  attack({
    id: 'signals-out-of-field',
    title: 'Last public signal aliased above the field order (s + r)',
    category: 'malformed',
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) =>
      present(await prepareAttempt(ctx), {
        tamper: tamperPayload((payload) => {
          const index = lastIndex(payload);
          payload.publicSignals[index] = (
            BigInt(payload.publicSignals[index] ?? '0') + BN254_FIELD_ORDER
          ).toString();
        }),
      }),
  }),
  attack({
    id: 'claims-challenge-out-of-field',
    title: 'Claimed challenge does not fit the field (engine-level check)',
    category: 'malformed',
    openIn: WITHOUT_REPLAY_BINDING,
    fullReason: PROOF_INVALID.reason,
    run: async (ctx) => {
      const { proof } = await prepareAttempt(ctx);
      if (!proof) return PROVE_FAILED;
      const forged: Proof = {
        ...proof,
        publicSignals: { ...proof.publicSignals, challenge: asChallengeValue('ff'.repeat(32)) },
      };
      return (await ctx.engine.verify(forged)) ? ACCEPTED : PROOF_INVALID;
    },
  }),
];

export const SCENARIOS: readonly Scenario[] = [
  ...honestScenarios,
  ...thresholdScenarios,
  ...issuerScenarios,
  ...holderScenarios,
  ...replayScenarios,
  ...malformedScenarios,
];
