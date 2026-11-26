import type {
  Challenge,
  CredentialId,
  HolderKeys,
  HolderPrivateKey,
  Issuer,
  Proof,
  RejectionReason,
  VerificationAccepted,
} from '../../domain/index.js';
import { asHolderPrivateKey, asVerifierId, toGpa } from '../../domain/index.js';
import type { Result } from '../../shared/index.js';
import { err, InfrastructureError, ok } from '../../shared/index.js';
import type { Clock, HolderKeyring, IssuerRegistry } from '../ports/index.js';
import type { makeGenerateProof, makeIssueChallenge, makeIssueCredential, makeVerifyCredential } from '../use-cases/index.js';
import { FIELD_ORDER } from './proof-tampering.js';
import type { ConfigurationId, EventDraft, RunEvent, RunOutcome, RunSummary } from './run-event.js';
import { ACCEPTED_OUTCOME, PROVE_FAILED_OUTCOME, privateDataKeys } from './run-event.js';
import type { FlowPlan, HolderKeyChoice, Presentation, ResolvedScenario } from './scenario-plans.js';
import { FLOW_DEFAULTS } from './scenario-plans.js';
import { verificationEvents } from './verification-events.js';

export interface RunScenarioDeps {
  readonly issuer: Issuer;
  readonly issuers: IssuerRegistry;
  readonly holderKeyring: HolderKeyring;
  readonly clock: Clock;
  readonly issueCredential: ReturnType<typeof makeIssueCredential>;
  readonly issueChallenge: ReturnType<typeof makeIssueChallenge>;
  readonly generateProof: ReturnType<typeof makeGenerateProof>;
  readonly verifyCredential: ReturnType<typeof makeVerifyCredential>;
  /** P6 reference gas of `CredentialVerifier.verifyCredential`; attached to accepted verifications when known. */
  readonly verifyCredentialGas?: number;
}

export interface RunScenarioInput {
  readonly runId: string;
  readonly configuration: ConfigurationId;
  readonly scenario: ResolvedScenario;
  readonly emit: (event: RunEvent) => void;
}

type Emit = (draft: EventDraft) => void;

interface Run {
  readonly deps: RunScenarioDeps;
  readonly plan: FlowPlan;
  readonly emit: Emit;
}

const DEMO_STUDENT = {
  studentNumber: '2210001',
  fullName: 'Simulation Student',
  degree: 'S.Kom.',
  graduationDate: '2026-08-20',
} as const;

/** Stamps `runId`, `seq` and `at` on a step and refuses any key outside the public allowlist. */
const createEmitter = (input: RunScenarioInput, clock: Clock): Emit => {
  let seq = 0;
  return (draft) => {
    const leaked = privateDataKeys(draft.data);
    if (leaked.length > 0) throw new TypeError(`Event ${draft.step} carries non-public keys: ${leaked.join(', ')}`);
    input.emit({ ...draft, runId: input.runId, seq, at: clock.now() });
    seq += 1;
  };
};

const gpaOf = (scaled: number) => {
  const gpa = toGpa(scaled);
  if (!gpa.ok) throw new TypeError(`Invalid scenario GPA: ${scaled}`);
  return gpa.value;
};

const KEY_CHOICES: Record<HolderKeyChoice, (owner: HolderKeys, keyring: HolderKeyring) => Promise<HolderPrivateKey>> = {
  owner: async (owner) => owner.privateKey,
  attacker: async (_owner, keyring) => (await keyring.generate()).privateKey,
  'public-as-private': async (owner) => asHolderPrivateKey(owner.publicKey),
  aliased: async (owner) => asHolderPrivateKey((BigInt(owner.privateKey) + FIELD_ORDER).toString()),
};

const issuePhase = async (run: Run, holder: HolderKeys): Promise<Result<CredentialId, string>> => {
  const result = await run.deps.issueCredential({
    ...DEMO_STUDENT,
    issuerId: run.deps.issuer.id,
    holderPublicKey: holder.publicKey,
    gpa: run.plan.gpa ?? FLOW_DEFAULTS.gpa,
  });
  if (!result.ok) {
    run.emit({ node: 'issuer', step: 'credential.issued', status: 'rejected', reason: result.error });
    return err(result.error);
  }
  const { credential } = result.value;
  run.emit({
    node: 'issuer',
    step: 'credential.issued',
    status: 'completed',
    data: { credentialId: credential.id, issuerId: credential.issuerId },
  });
  return ok(credential.id);
};

const challengePhase = async (run: Run, verifierId: string): Promise<Challenge> => {
  const { challengeTtlMs } = run.plan;
  const challenge = await run.deps.issueChallenge({
    verifierId: asVerifierId(verifierId),
    ...(challengeTtlMs === undefined ? {} : { ttlMs: challengeTtlMs }),
  });
  run.emit({
    node: 'verifier',
    step: 'challenge.issued',
    status: 'completed',
    data: { verifierId, challenge: challenge.value, expiresAt: challenge.expiresAt },
  });
  return challenge;
};

interface ProveInput {
  readonly credentialId: CredentialId;
  readonly holder: HolderKeys;
  readonly challenge: string;
  readonly verifierId: string;
}

/** Only a refused witness (`InfrastructureError`) counts as "the attack failed"; real bugs stay visible. */
const tryGenerate = async (run: Run, input: ProveInput): Promise<Proof | undefined> => {
  const holderPrivateKey = await KEY_CHOICES[run.plan.holderKey ?? 'owner'](input.holder, run.deps.holderKeyring);
  try {
    const result = await run.deps.generateProof({
      credentialId: input.credentialId,
      holderPrivateKey,
      request: {
        verifierId: asVerifierId(input.verifierId),
        challenge: input.challenge as Proof['publicSignals']['challenge'],
        gpaThreshold: gpaOf(run.plan.threshold ?? FLOW_DEFAULTS.threshold),
      },
    });
    return result.ok ? result.value : undefined;
  } catch (error) {
    if (error instanceof InfrastructureError) return undefined;
    throw error;
  }
};

/** The witness is built inside the prover, so its duration is not separable: only `proof.generated` is timed. */
const provePhase = async (run: Run, input: ProveInput): Promise<Proof | undefined> => {
  run.emit({ node: 'holder', step: 'witness.computed', status: 'started' });
  run.emit({ node: 'holder', step: 'proof.generated', status: 'started' });
  const startedAt = run.deps.clock.now();
  const proof = await tryGenerate(run, input);
  const durationMs = run.deps.clock.now() - startedAt;
  run.emit({ node: 'holder', step: 'witness.computed', status: 'completed' });
  if (!proof) {
    run.emit({ node: 'holder', step: 'proof.generated', status: 'rejected', durationMs, reason: PROVE_FAILED_OUTCOME.reason });
    return undefined;
  }
  run.emit({
    node: 'holder',
    step: 'proof.generated',
    status: 'completed',
    durationMs,
    data: { proofBytes: proof.payload.length },
  });
  return proof;
};

const toOutcome = (verdict: Result<VerificationAccepted, RejectionReason>): RunOutcome =>
  verdict.ok ? ACCEPTED_OUTCOME : { accepted: false, stage: 'verify', reason: verdict.error };

const presentOnce = async (run: Run, presented: Proof, verifierId: string): Promise<RunOutcome> => {
  const { publicSignals } = presented;
  run.emit({
    node: 'holder',
    step: 'presentation.sent',
    status: 'completed',
    data: {
      gpaThreshold: publicSignals.gpaThreshold,
      verifierId: publicSignals.verifierId,
      challenge: publicSignals.challenge,
      attributesRevealed: 0,
    },
  });
  const startedAt = run.deps.clock.now();
  const verdict = await run.deps.verifyCredential({
    proof: presented,
    policy: {
      verifierId: asVerifierId(verifierId),
      requiredGpaThreshold: gpaOf(run.plan.requiredThreshold ?? FLOW_DEFAULTS.requiredThreshold),
    },
  });
  const durationMs = run.deps.clock.now() - startedAt;
  const trusted = await run.deps.issuers.list();
  const issuerId = trusted.find((candidate) => candidate.publicKey === publicSignals.issuerPublicKey)?.id;
  const { verifyCredentialGas } = run.deps;
  const facts = {
    issuerPublicKey: publicSignals.issuerPublicKey,
    durationMs,
    ...(issuerId ? { issuerId } : {}),
    ...(verifyCredentialGas === undefined ? {} : { gasUsed: verifyCredentialGas }),
  };
  for (const draft of verificationEvents(verdict, facts)) run.emit(draft);
  return toOutcome(verdict);
};

interface PresentInput {
  readonly proof: Proof;
  readonly verifierId: string;
  readonly presentations: readonly Presentation[];
  readonly index: number;
}

/** Presents the same proof once per plan entry and stops at the first rejection (no `await` in a loop). */
const presentAll = async (run: Run, input: PresentInput): Promise<RunOutcome> => {
  const presentation = input.presentations[input.index] ?? {};
  const tamperContext = {
    issueChallenge: async (verifierId: string) => (await run.deps.issueChallenge({ verifierId: asVerifierId(verifierId) })).value,
  };
  const presented = presentation.tamper ? await presentation.tamper(input.proof, tamperContext) : input.proof;
  const outcome = await presentOnce(run, presented, presentation.policyVerifierId ?? input.verifierId);
  const next = input.index + 1;
  if (!outcome.accepted || next >= input.presentations.length) return outcome;
  return presentAll(run, { ...input, index: next });
};

const execute = async (run: Run): Promise<RunOutcome> => {
  const verifierId = run.plan.verifierId ?? FLOW_DEFAULTS.verifierId;
  const holder = await run.deps.holderKeyring.current();
  const issued = await issuePhase(run, holder);
  if (!issued.ok) return { accepted: false, stage: 'prove', reason: issued.error };

  const challenge = await challengePhase(run, verifierId);
  const proof = await provePhase(run, {
    credentialId: issued.value,
    holder,
    challenge: run.plan.unissuedChallenge ?? challenge.value,
    verifierId,
  });
  if (!proof) return PROVE_FAILED_OUTCOME;
  return presentAll(run, { proof, verifierId, presentations: run.plan.presentations ?? [{}], index: 0 });
};

/**
 * Simulation orchestrator: runs one scenario against the real use cases and reports each step as an event.
 * It adds no protocol rule; every verdict comes from `makeVerifyCredential`. Returns the closing summary.
 */
export const makeRunScenario =
  (deps: RunScenarioDeps) =>
  async (input: RunScenarioInput): Promise<RunSummary> => {
    const startedAt = deps.clock.now();
    const run: Run = { deps, plan: input.scenario.plan, emit: createEmitter(input, deps.clock) };
    const outcome = await execute(run);
    return {
      runId: input.runId,
      configuration: input.configuration,
      scenarioId: input.scenario.info.id,
      outcome,
      totalMs: deps.clock.now() - startedAt,
    };
  };
