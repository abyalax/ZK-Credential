import type { ScenarioContext } from './context.js';

/** Circuit variants of the ablation ladder. Each one is a "configuration" in the P5/P6 results. */
export const VARIANT_NAMES = ['threshold', 'issuer', 'holder', 'full'] as const;
export type VariantName = (typeof VARIANT_NAMES)[number];

export type ScenarioKind = 'honest' | 'attack';

export type ScenarioCategory = 'baseline' | 'threshold' | 'issuer' | 'holder' | 'replay' | 'malformed';

/** Where an attempt ended: the holder could not build a proof, or the verifier decided. */
export type OutcomeStage = 'prove' | 'verify';

export interface Outcome {
  readonly accepted: boolean;
  readonly stage: OutcomeStage;
  /** `ACCEPTED`, `PROVE_FAILED`, or a domain `RejectionReason`. */
  readonly reason: string;
}

export const ACCEPTED: Outcome = { accepted: true, stage: 'verify', reason: 'ACCEPTED' };
export const PROVE_FAILED: Outcome = { accepted: false, stage: 'prove', reason: 'PROVE_FAILED' };
export const PROOF_INVALID: Outcome = { accepted: false, stage: 'verify', reason: 'PROOF_INVALID' };

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly kind: ScenarioKind;
  readonly category: ScenarioCategory;
  /**
   * Variants whose circuit leaves this attack open. The attack is expected to be accepted there
   * (a documented gap of that ablation step) and rejected everywhere else.
   */
  readonly openIn: readonly VariantName[];
  /** Expected outcome reason in the `full` variant (the proposed model). */
  readonly fullReason: string;
  readonly run: (ctx: ScenarioContext) => Promise<Outcome>;
}

export const expectedAcceptance = (scenario: Scenario, variant: VariantName): boolean =>
  scenario.kind === 'honest' || scenario.openIn.includes(variant);

export interface ScenarioResult {
  readonly configuration: VariantName;
  readonly scenarioId: string;
  readonly kind: ScenarioKind;
  readonly category: ScenarioCategory;
  readonly expectedAccepted: boolean;
  readonly accepted: boolean;
  readonly stage: OutcomeStage;
  readonly reason: string;
  readonly durationMs: number;
}
