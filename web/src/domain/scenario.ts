import type { ConfigurationId, VariantName } from './configuration';
import { findConfiguration } from './configuration';

export type ScenarioKind = 'honest' | 'attack';
export type ScenarioCategory = 'baseline' | 'threshold' | 'issuer' | 'holder' | 'replay' | 'malformed';

/** One entry of `GET /api/scenarios`, mirroring `experiments/scenarios/types.ts`. */
export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly kind: ScenarioKind;
  readonly category: ScenarioCategory;
  /** Circuit variants where the attack is a documented gap and goes through. */
  readonly openIn: readonly VariantName[];
  /** Expected reason in the `full` variant (B4). */
  readonly fullReason: string;
  /** Configurations the server can run this scenario on (A and SD depend on the SD-JWT equivalents). */
  readonly applicableConfigurations: readonly ConfigurationId[];
}

export const isApplicable = (scenario: Scenario, configuration: ConfigurationId): boolean =>
  scenario.applicableConfigurations.includes(configuration);

export type ExpectedOutcome = 'accepted' | 'rejected' | 'unknown';

/** Expectation is defined per circuit variant only; A and SD depend on the SD-JWT equivalents. */
export const expectedOutcome = (scenario: Scenario, configuration: ConfigurationId): ExpectedOutcome => {
  const { circuit } = findConfiguration(configuration);
  if (circuit === undefined) return scenario.kind === 'honest' ? 'accepted' : 'unknown';
  return scenario.kind === 'honest' || scenario.openIn.includes(circuit) ? 'accepted' : 'rejected';
};

export const CATEGORY_LABEL: Readonly<Record<ScenarioCategory, string>> = {
  baseline: 'Alur sah',
  threshold: 'Threshold',
  issuer: 'Issuer',
  holder: 'Holder',
  replay: 'Replay',
  malformed: 'Data rusak',
};

export const groupByCategory = (scenarios: readonly Scenario[]): [ScenarioCategory, Scenario[]][] => {
  const order = Object.keys(CATEGORY_LABEL) as ScenarioCategory[];
  return order
    .map((category): [ScenarioCategory, Scenario[]] => [category, scenarios.filter((s) => s.category === category)])
    .filter(([, list]) => list.length > 0);
};
