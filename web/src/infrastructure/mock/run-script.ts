import type { ConfigurationId, NodeId, Outcome, RunEvent, Scenario, StepStatus } from '@/domain';
import { expectedOutcome, usesCircuit } from '@/domain';

/**
 * MOCK ONLY: scripted events for developing the UI without the simulation server. Durations are made up,
 * and rejection reasons are those of the full variant. Real runs come from `GET /api/runs/:id/events`.
 */
export type ScriptedEvent = {
  readonly delayMs: number;
  readonly event: Omit<RunEvent, 'runId' | 'seq' | 'at'>;
};

export interface RunScript {
  readonly events: readonly ScriptedEvent[];
  readonly outcome: Outcome;
}

const STEP_GAP_MS = 450;
const PROVE_MS: Readonly<Record<string, number>> = { threshold: 300, issuer: 450, holder: 600, full: 800 };
const PRECONDITION_REASONS = [
  'CHALLENGE_UNKNOWN',
  'CHALLENGE_VERIFIER_MISMATCH',
  'CHALLENGE_ALREADY_USED',
  'CHALLENGE_EXPIRED',
  'THRESHOLD_BELOW_REQUIRED',
];
const ACCEPT_THEN_REPLAY = ['replay-same-proof', 'replay-relabelled-challenge'];

type StepExtra = Partial<Pick<RunEvent, 'data' | 'durationMs' | 'reason'>> & { readonly delayMs?: number };

const step = (node: NodeId, name: string, status: StepStatus, extra: StepExtra = {}): ScriptedEvent => {
  const { delayMs = STEP_GAP_MS, ...rest } = extra;
  return { delayMs, event: { node, step: name, status, ...rest } };
};

export const decideOutcome = (configuration: ConfigurationId, scenario: Scenario): Outcome => {
  if (expectedOutcome(scenario, configuration) === 'accepted') return { accepted: true, stage: 'verify', reason: 'ACCEPTED' };
  const reason = scenario.fullReason;
  return { accepted: false, stage: reason === 'PROVE_FAILED' ? 'prove' : 'verify', reason };
};

const CHALLENGE = 'c0ffee…1d2c3b';

const presentationData = (configuration: ConfigurationId): NonNullable<RunEvent['data']> => {
  if (configuration === 'A') return { attributesRevealed: 8 };
  if (configuration === 'SD') return { attributesRevealed: 1, challenge: CHALLENGE };
  return { gpaThreshold: 350, verifierId: 'verifier-a', challenge: CHALLENGE, attributesRevealed: 0 };
};

const proving = (configuration: ConfigurationId, outcome: Outcome): ScriptedEvent[] => {
  const prove =
    PROVE_MS[
      configuration === 'B1' ? 'threshold' : configuration === 'B2' ? 'issuer' : configuration === 'B3' ? 'holder' : 'full'
    ] ?? 800;
  const head = [
    step('holder', 'witness.computed', 'started'),
    step('holder', 'witness.computed', 'completed', { durationMs: 120, delayMs: 120 }),
  ];
  if (outcome.reason === 'PROVE_FAILED')
    return [...head, step('holder', 'proof.generated', 'rejected', { reason: outcome.reason })];
  return [
    ...head,
    step('holder', 'proof.generated', 'started'),
    step('holder', 'proof.generated', 'completed', { durationMs: prove, delayMs: prove }),
  ];
};

/** P6 `estimateGas` of `verifyCredential` (run 2026-11-22-081902). Only B4 has an on-chain verifier, so only B4 shows gas. */
const P6_B4_GAS = 251_374;

const checking = (outcome: Outcome, gasUsed?: number): ScriptedEvent[] => {
  const reason = outcome.reason;
  if (PRECONDITION_REASONS.includes(reason)) return [step('verifier', 'preconditions.checked', 'rejected', { reason })];
  const pre = step('verifier', 'preconditions.checked', 'completed');
  if (reason === 'ISSUER_NOT_REGISTERED') return [pre, step('contract', 'issuer.checked', 'rejected', { reason })];
  const issuer = step('contract', 'issuer.checked', 'completed', { data: { issuerId: 'issuer-simulation' } });
  if (reason === 'PROOF_INVALID') return [pre, issuer, step('contract', 'proof.verified', 'rejected', { reason })];
  return [
    pre,
    issuer,
    step('contract', 'proof.verified', 'started'),
    step('contract', 'proof.verified', 'completed', {
      durationMs: 40,
      delayMs: 40,
      ...(gasUsed === undefined ? {} : { data: { gasUsed } }),
    }),
  ];
};

const verifying = (configuration: ConfigurationId, outcome: Outcome): ScriptedEvent[] => {
  if (usesCircuit(configuration)) return checking(outcome, configuration === 'B4' ? P6_B4_GAS : undefined);
  return [step('verifier', 'proof.verified', 'completed', { durationMs: 8 })];
};

const presenting = (configuration: ConfigurationId): ScriptedEvent =>
  step('holder', 'presentation.sent', 'completed', { data: presentationData(configuration) });

const ACCEPTED: Outcome = { accepted: true, stage: 'verify', reason: 'ACCEPTED' };

const round = (configuration: ConfigurationId, outcome: Outcome): ScriptedEvent[] => {
  const zk = usesCircuit(configuration);
  const prove = zk ? proving(configuration, outcome) : [];
  if (outcome.stage === 'prove' && !outcome.accepted) return prove;
  const consume = outcome.accepted && configuration !== 'A' ? [step('verifier', 'challenge.consumed', 'completed')] : [];
  return [...prove, presenting(configuration), ...verifying(configuration, outcome), ...consume];
};

export const buildRunScript = (configuration: ConfigurationId, scenario: Scenario): RunScript => {
  const outcome = decideOutcome(configuration, scenario);
  const setup: ScriptedEvent[] = [
    step('issuer', 'credential.issued', 'completed', { data: { credentialId: 'cred-simulation', issuerId: 'issuer-simulation' } }),
    ...(configuration === 'A'
      ? []
      : [step('verifier', 'challenge.issued', 'completed', { data: { verifierId: 'verifier-a', challenge: CHALLENGE } })]),
  ];
  const replay = ACCEPT_THEN_REPLAY.includes(scenario.id) && usesCircuit(configuration);
  const rounds = replay
    ? [...round(configuration, ACCEPTED), ...round(configuration, outcome).slice(-4)]
    : round(configuration, outcome);
  return { events: [...setup, ...rounds], outcome };
};
