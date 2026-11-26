import type { ChallengeValue, Proof } from '../../domain/index.js';
import { asVerifierId } from '../../domain/index.js';
import type { Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';
import {
  payloadBadShape,
  payloadNotJson,
  proofBytesTampered,
  signalsNonDecimal,
  signalsOutOfField,
  signalsTruncated,
} from './proof-tampering.js';
import type { ConfigurationId } from './run-event.js';
import type { ScenarioInfo, ScenarioView } from './scenario-catalog.js';
import { SCENARIO_CATALOG } from './scenario-catalog.js';

export const FLOW_DEFAULTS = {
  gpa: 350,
  threshold: 300,
  requiredThreshold: 300,
  verifierId: 'verifier-a',
  otherVerifierId: 'verifier-b',
} as const;

/** The server wires one circuit and one deployed verifier: the full variant, B4. */
export const SERVED_CONFIGURATIONS: readonly ConfigurationId[] = ['B4'];

export type HolderKeyChoice = 'owner' | 'attacker' | 'public-as-private' | 'aliased';

export interface TamperContext {
  /** Asks the verifier for one more challenge, as an attacker relabelling a proof would. */
  readonly issueChallenge: (verifierId: string) => Promise<ChallengeValue>;
}

export type ProofTamper = (proof: Proof, context: TamperContext) => Promise<Proof> | Proof;

export interface Presentation {
  /** Verifier the proof is presented to; defaults to the verifier it was built for. */
  readonly policyVerifierId?: string;
  readonly tamper?: ProofTamper;
}

/** What differs from the honest flow. Everything omitted takes the value in `FLOW_DEFAULTS`. */
export interface FlowPlan {
  readonly gpa?: number;
  /** Threshold the holder claims in the proof. */
  readonly threshold?: number;
  /** Threshold the verifier requires. */
  readonly requiredThreshold?: number;
  readonly verifierId?: string;
  readonly challengeTtlMs?: number;
  /** Proves against this value instead of the challenge the verifier issued. */
  readonly unissuedChallenge?: string;
  readonly holderKey?: HolderKeyChoice;
  /** One entry per time the proof is presented. Defaults to a single plain presentation. */
  readonly presentations?: readonly Presentation[];
}

const relabel =
  (verifierId: string): ProofTamper =>
  async (proof, context) => ({
    ...proof,
    publicSignals: {
      ...proof.publicSignals,
      verifierId: asVerifierId(verifierId),
      challenge: await context.issueChallenge(verifierId),
    },
  });

const tampered = (tamper: (proof: Proof) => Proof): FlowPlan => ({ presentations: [{ tamper }] });

/**
 * Scenarios this server can run on the real container. The five that need a second issuer or a
 * doctored stored credential (`credential-tampered`, `signature-*`, `issuer-unregistered`) and the
 * engine-level `claims-challenge-out-of-field` are listed but not applicable yet; see docs/ui/server.md.
 */
const PLANS: Readonly<Record<string, FlowPlan>> = {
  'valid-accepted': {},
  'valid-gpa-equals-threshold': { gpa: 300 },
  'valid-gpa-maximum': { gpa: 400 },
  'valid-other-verifier': { verifierId: FLOW_DEFAULTS.otherVerifierId },
  'gpa-below-threshold': { gpa: 250 },
  'threshold-below-policy': { threshold: 200 },
  'holder-without-key': { holderKey: 'attacker' },
  'holder-secret-guessed': { holderKey: 'public-as-private' },
  'holder-secret-out-of-field': { holderKey: 'aliased' },
  'replay-same-proof': { presentations: [{}, {}] },
  'replay-relabelled-challenge': { presentations: [{}, { tamper: relabel(FLOW_DEFAULTS.verifierId) }] },
  'relay-to-other-verifier': {
    presentations: [{ policyVerifierId: FLOW_DEFAULTS.otherVerifierId, tamper: relabel(FLOW_DEFAULTS.otherVerifierId) }],
  },
  'wrong-verifier': { presentations: [{ policyVerifierId: FLOW_DEFAULTS.otherVerifierId }] },
  // A zero time limit expires the challenge on issue, with no sleeping and the same result on any clock.
  'challenge-expired': { challengeTtlMs: 0 },
  'challenge-unknown': { unissuedChallenge: 'ab'.repeat(31) },
  'payload-not-json': tampered(payloadNotJson),
  'payload-bad-shape': tampered(payloadBadShape),
  'proof-bytes-tampered': tampered(proofBytesTampered),
  'signals-truncated': tampered(signalsTruncated),
  'signals-non-decimal': tampered(signalsNonDecimal),
  'signals-out-of-field': tampered(signalsOutOfField),
};

export interface ResolvedScenario {
  readonly info: ScenarioInfo;
  readonly plan: FlowPlan;
}

export type ScenarioResolveError = 'SCENARIO_UNKNOWN' | 'SCENARIO_NOT_APPLICABLE';

const applicableConfigurations = (id: string): readonly ConfigurationId[] => (id in PLANS ? SERVED_CONFIGURATIONS : []);

/** `GET /api/scenarios`: the full catalog with the configurations this server can run each one on. */
export const listScenarios = (): readonly ScenarioView[] =>
  SCENARIO_CATALOG.map((info) => ({ ...info, applicableConfigurations: applicableConfigurations(info.id) }));

export const resolveScenario = (id: string, configuration: ConfigurationId): Result<ResolvedScenario, ScenarioResolveError> => {
  const info = SCENARIO_CATALOG.find((candidate) => candidate.id === id);
  if (!info) return err('SCENARIO_UNKNOWN');
  const plan = PLANS[id];
  if (!(plan && applicableConfigurations(id).includes(configuration))) return err('SCENARIO_NOT_APPLICABLE');
  return ok({ info, plan });
};
