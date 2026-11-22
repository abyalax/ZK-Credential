import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../../experiments/scenarios/catalog.js';
import { resultsToCsv, summarize, summaryToCsv } from '../../../experiments/scenarios/metrics.js';
import { expectedAcceptance, type ScenarioResult, VARIANT_NAMES } from '../../../experiments/scenarios/types.js';

const row = (overrides: Partial<ScenarioResult>): ScenarioResult => ({
  configuration: 'full',
  scenarioId: 'x',
  kind: 'attack',
  category: 'replay',
  expectedAccepted: false,
  accepted: false,
  stage: 'verify',
  reason: 'PROOF_INVALID',
  durationMs: 1,
  ...overrides,
});

describe('scenario catalog', () => {
  it('has unique ids, honest scenarios, and covers every P5.1 attack family', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SCENARIOS.some((scenario) => scenario.kind === 'honest')).toBe(true);
    const categories = new Set(SCENARIOS.map((scenario) => scenario.category));
    for (const category of ['threshold', 'issuer', 'holder', 'replay', 'malformed']) {
      expect(categories.has(category as never)).toBe(true);
    }
  });

  it('expects the proposed model to reject every attack', () => {
    for (const scenario of SCENARIOS.filter((item) => item.kind === 'attack')) {
      expect(expectedAcceptance(scenario, 'full')).toBe(false);
    }
  });

  it('only lists known variants as open gaps', () => {
    for (const scenario of SCENARIOS) {
      for (const variant of scenario.openIn) expect(VARIANT_NAMES).toContain(variant);
    }
  });
});

describe('summarize', () => {
  it('computes success and rejection rates and lists open attacks', () => {
    const [summary] = summarize([
      row({ scenarioId: 'ok', kind: 'honest', expectedAccepted: true, accepted: true }),
      row({ scenarioId: 'ok2', kind: 'honest', expectedAccepted: true, accepted: false }),
      row({ scenarioId: 'a1' }),
      row({ scenarioId: 'a2', accepted: true, expectedAccepted: true }),
      row({ scenarioId: 'a3' }),
    ]);

    expect(summary).toMatchObject({
      configuration: 'full',
      verificationSuccessRate: 0.5,
      attackTotal: 3,
      attackRejected: 2,
      attackRejectionRate: 0.6667,
      openAttacks: ['a2'],
      unexpected: ['ok2'],
    });
  });

  it('skips configurations without results', () => {
    expect(summarize([])).toEqual([]);
  });
});

describe('csv output', () => {
  it('writes a header and one line per result', () => {
    const csv = resultsToCsv([row({ scenarioId: 'a1' })]);
    expect(csv.split('\n')).toEqual([
      'configuration,scenario_id,kind,category,expected_accepted,accepted,stage,reason,duration_ms',
      'full,a1,attack,replay,false,false,verify,PROOF_INVALID,1',
      '',
    ]);
  });

  it('joins open attacks with semicolons and quotes cells that contain commas', () => {
    const csv = summaryToCsv(summarize([row({ scenarioId: 'a,b', accepted: true })]));
    expect(csv).toContain('"a,b"');
  });
});
