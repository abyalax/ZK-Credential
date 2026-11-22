import type { CredentialSigner } from '../../src/application/index.js';
import {
  asChallengeValue,
  createCredential,
  type HolderPrivateKey,
  type Issuer,
  type Proof,
  type SignedCredential,
  type VerificationPolicy,
  type VerifierId,
} from '../../src/domain/index.js';
import {
  type CircuitVariant,
  createEddsaCredentialSigner,
  createSnarkjsProofEngine,
  createStaticIssuerRegistry,
  fullVariant,
  generateHolderKeyPair,
  type HolderKeyPair,
  holderVariant,
  issuerVariant,
  type SnarkjsProofEngine,
  thresholdVariant,
} from '../../src/infrastructure/index.js';
import { InfrastructureError } from '../../src/shared/index.js';
import { createHarness, gpa, verifierA } from '../../tests/support/harness.js';
import { ACCEPTED, type Outcome, PROVE_FAILED, type VariantName } from './types.js';

const VARIANTS: Record<VariantName, CircuitVariant> = {
  threshold: thresholdVariant,
  issuer: issuerVariant,
  holder: holderVariant,
  full: fullVariant,
};

const ISSUER_SECRET = '11'.repeat(32);
const ROGUE_ISSUER_SECRET = '22'.repeat(32);
const deterministic = (byte: number) => (size: number) => new Uint8Array(size).fill(byte);

export type Session = ReturnType<typeof createHarness>;

export interface SignOptions {
  readonly gpaScaled?: number;
  readonly holder?: HolderKeyPair;
  readonly signer?: CredentialSigner;
  readonly issuerId?: Issuer['id'];
}

export interface ScenarioContext {
  readonly variant: VariantName;
  readonly issuer: Issuer;
  /** An issuer the verifier never registered. */
  readonly rogueIssuer: Issuer;
  readonly signer: CredentialSigner;
  readonly rogueSigner: CredentialSigner;
  readonly owner: HolderKeyPair;
  readonly attacker: HolderKeyPair;
  /** Engine of the honest parties: its registry holds only the legitimate issuer. */
  readonly engine: SnarkjsProofEngine;
  /** Engine an attacker runs for themselves: its registry also resolves the rogue issuer. */
  readonly rogueEngine: SnarkjsProofEngine;
  /** A fresh verifier world: own clock, challenge store and credential repository. */
  readonly session: () => Session;
  readonly signCredential: (options?: SignOptions) => Promise<SignedCredential>;
  /** Builds a proof; `undefined` when the circuit refuses the witness (holder cannot prove). */
  readonly generate: (
    input: Parameters<SnarkjsProofEngine['generate']>[0],
    engine?: SnarkjsProofEngine,
  ) => Promise<Proof | undefined>;
  readonly close: () => Promise<void>;
}

export interface Parties {
  readonly issuer: Issuer;
  readonly rogueIssuer: Issuer;
  readonly signer: CredentialSigner & { publicKey: Issuer['publicKey'] };
  readonly rogueSigner: CredentialSigner & { publicKey: Issuer['publicKey'] };
  readonly owner: HolderKeyPair;
  readonly attacker: HolderKeyPair;
}

export const createParties = async (): Promise<Parties> => {
  const [signer, rogueSigner, owner, attacker] = await Promise.all([
    createEddsaCredentialSigner(ISSUER_SECRET),
    createEddsaCredentialSigner(ROGUE_ISSUER_SECRET),
    generateHolderKeyPair(deterministic(0x11)),
    generateHolderKeyPair(deterministic(0x22)),
  ]);
  return {
    signer,
    rogueSigner,
    owner,
    attacker,
    issuer: {
      id: 'issuer-p5' as Issuer['id'],
      name: 'P5 trusted issuer',
      publicKey: signer.publicKey,
    },
    rogueIssuer: {
      id: 'issuer-rogue' as Issuer['id'],
      name: 'P5 rogue issuer',
      publicKey: rogueSigner.publicKey,
    },
  };
};

export const makeSignCredential = (parties: Parties): ScenarioContext['signCredential'] => {
  let counter = 0;
  return async (options = {}) => {
    const holder = options.holder ?? parties.owner;
    const created = createCredential({
      id: `p5-credential-${++counter}`,
      issuerId: options.issuerId ?? parties.issuer.id,
      holderPublicKey: holder.publicKey,
      studentNumber: '2210001',
      fullName: 'P5 Test Student',
      degree: 'S.Kom.',
      graduationDate: '2026-08-20',
      gpa: options.gpaScaled ?? 375,
      issuedAt: 1_700_000_000_000,
    });
    if (!created.ok) throw new Error(`invalid P5 credential: ${created.error}`);
    const signedBy = options.signer ?? parties.signer;
    return { credential: created.value, signature: await signedBy.sign(created.value) };
  };
};

const generateOrUndefined =
  (defaultEngine: SnarkjsProofEngine): ScenarioContext['generate'] =>
  async (input, using = defaultEngine) => {
    try {
      return await using.generate(input);
    } catch (error) {
      // Only a refused witness counts as "the attack failed"; real bugs must stay visible.
      if (error instanceof InfrastructureError) return;
      throw error;
    }
  };

export const createScenarioContext = async (
  variantName: VariantName,
  artifactsDir?: string,
): Promise<ScenarioContext> => {
  const variant = VARIANTS[variantName];
  const parties = await createParties();
  const { issuer, rogueIssuer, signer, owner } = parties;
  const [engine, rogueEngine] = await Promise.all([
    createSnarkjsProofEngine({
      variant,
      issuers: createStaticIssuerRegistry([issuer]),
      artifactsDir,
    }),
    createSnarkjsProofEngine({
      variant,
      issuers: createStaticIssuerRegistry([rogueIssuer]),
      artifactsDir,
    }),
  ]);

  return {
    ...parties,
    variant: variantName,
    engine,
    rogueEngine,
    session: () => createHarness({ proofEngine: engine, signer, issuer, holder: owner }),
    signCredential: makeSignCredential(parties),
    generate: generateOrUndefined(engine),
    close: async () => {
      await Promise.all([engine.close(), rogueEngine.close()]);
    },
  };
};

export const policyFor = (verifierId: VerifierId, required = 300): VerificationPolicy => ({
  verifierId,
  requiredGpaThreshold: gpa(required),
});

export interface AttemptOptions {
  readonly session?: Session;
  readonly signedCredential?: SignedCredential;
  readonly holderPrivateKey?: HolderPrivateKey;
  readonly engine?: SnarkjsProofEngine;
  readonly verifierId?: VerifierId;
  /** Claimed GPA threshold (scaled x100). */
  readonly threshold?: number;
  /** Skips issuing a challenge and uses this value instead. */
  readonly challenge?: string;
}

export interface PresentOptions {
  readonly policy?: VerificationPolicy;
  readonly advanceMs?: number;
  readonly tamper?: (proof: Proof, session: Session) => Promise<Proof> | Proof;
}

export interface Prepared {
  readonly session: Session;
  readonly verifierId: VerifierId;
  readonly proof: Proof | undefined;
}

/** Holder side: obtains a challenge from the verifier and tries to build a proof for it. */
export const prepareAttempt = async (
  ctx: ScenarioContext,
  options: AttemptOptions = {},
): Promise<Prepared> => {
  const session = options.session ?? ctx.session();
  const verifierId = options.verifierId ?? verifierA;
  const challenge =
    options.challenge ?? (await session.issueChallenge({ verifierId })).value.toString();
  const signedCredential = options.signedCredential ?? (await ctx.signCredential());
  const proof = await ctx.generate(
    {
      signedCredential,
      holderPrivateKey: options.holderPrivateKey ?? ctx.owner.privateKey,
      request: {
        verifierId,
        challenge: asChallengeValue(challenge),
        gpaThreshold: gpa(options.threshold ?? 300),
      },
    },
    options.engine,
  );
  return { session, verifierId, proof };
};

/** Verifier side: runs the real verify use case (domain preconditions, then the circuit). */
export const present = async (
  prepared: Prepared,
  options: PresentOptions = {},
): Promise<Outcome> => {
  const { session, proof } = prepared;
  if (!proof) return PROVE_FAILED;
  if (options.advanceMs) session.clock.advance(options.advanceMs);
  const presented = options.tamper ? await options.tamper(proof, session) : proof;
  const result = await session.verifyCredential({
    proof: presented,
    policy: options.policy ?? policyFor(prepared.verifierId),
  });
  if (result.ok) return ACCEPTED;
  return { accepted: false, stage: 'verify', reason: result.error };
};

export const attempt = async (
  ctx: ScenarioContext,
  attemptOptions: AttemptOptions = {},
  presentOptions: PresentOptions = {},
): Promise<Outcome> => present(await prepareAttempt(ctx, attemptOptions), presentOptions);
