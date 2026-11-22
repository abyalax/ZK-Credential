import { type ScenarioResult, VARIANT_NAMES, type VariantName } from './types.js';

export interface ConfigurationSummary {
  readonly configuration: VariantName;
  readonly honestTotal: number;
  readonly honestAccepted: number;
  /** Accepted honest presentations / honest presentations. */
  readonly verificationSuccessRate: number;
  readonly attackTotal: number;
  readonly attackRejected: number;
  /** Rejected attacks / attacks. */
  readonly attackRejectionRate: number;
  /** Attacks this configuration accepted (open gaps), by scenario id. */
  readonly openAttacks: readonly string[];
  /** Scenarios whose outcome differs from the expectation. Must be empty in a healthy run. */
  readonly unexpected: readonly string[];
}

const ratio = (part: number, total: number): number => (total === 0 ? 0 : Math.round((part / total) * 10_000) / 10_000);

export const summarize = (results: readonly ScenarioResult[]): ConfigurationSummary[] =>
  VARIANT_NAMES.map((configuration) => {
    const rows = results.filter((row) => row.configuration === configuration);
    const honest = rows.filter((row) => row.kind === 'honest');
    const attacks = rows.filter((row) => row.kind === 'attack');
    const honestAccepted = honest.filter((row) => row.accepted).length;
    const attackRejected = attacks.filter((row) => !row.accepted).length;
    return {
      configuration,
      honestTotal: honest.length,
      honestAccepted,
      verificationSuccessRate: ratio(honestAccepted, honest.length),
      attackTotal: attacks.length,
      attackRejected,
      attackRejectionRate: ratio(attackRejected, attacks.length),
      openAttacks: attacks.filter((row) => row.accepted).map((row) => row.scenarioId),
      unexpected: rows.filter((row) => row.accepted !== row.expectedAccepted).map((row) => row.scenarioId),
    };
  }).filter((summary) => summary.honestTotal + summary.attackTotal > 0);

const csvCell = (value: string | number | boolean): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const toCsv = (header: readonly string[], rows: readonly (readonly (string | number | boolean)[])[]) =>
  `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;

export const resultsToCsv = (results: readonly ScenarioResult[]): string =>
  toCsv(
    ['configuration', 'scenario_id', 'kind', 'category', 'expected_accepted', 'accepted', 'stage', 'reason', 'duration_ms'],
    results.map((row) => [
      row.configuration,
      row.scenarioId,
      row.kind,
      row.category,
      row.expectedAccepted,
      row.accepted,
      row.stage,
      row.reason,
      row.durationMs,
    ]),
  );

export const summaryToCsv = (summaries: readonly ConfigurationSummary[]): string =>
  toCsv(
    [
      'configuration',
      'honest_total',
      'honest_accepted',
      'verification_success_rate',
      'attack_total',
      'attack_rejected',
      'attack_rejection_rate',
      'open_attacks',
      'unexpected',
    ],
    summaries.map((row) => [
      row.configuration,
      row.honestTotal,
      row.honestAccepted,
      row.verificationSuccessRate,
      row.attackTotal,
      row.attackRejected,
      row.attackRejectionRate,
      row.openAttacks.join(';'),
      row.unexpected.join(';'),
    ]),
  );
