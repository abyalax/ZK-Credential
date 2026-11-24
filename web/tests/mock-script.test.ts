import { describe, expect, it } from 'vitest';
import { ABLATION_IDS, expectedOutcome, hasOnlyPublicData, isApplicable, replay } from '@/domain';
import { MOCK_SCENARIOS } from '@/infrastructure/mock/catalog';
import { buildRunScript } from '@/infrastructure/mock/run-script';

const attacks = MOCK_SCENARIOS.filter((scenario) => scenario.kind === 'attack');
const honest = MOCK_SCENARIOS.filter((scenario) => scenario.kind === 'honest');

describe('mock catalog', () => {
  it('mirrors the P5 catalog: 22 attacks and 4 honest scenarios', () => {
    expect(attacks).toHaveLength(22);
    expect(honest).toHaveLength(4);
    expect(new Set(MOCK_SCENARIOS.map((scenario) => scenario.id)).size).toBe(26);
  });

  it('runs attacks on the ablation ladder only, honest scenarios everywhere', () => {
    expect(attacks.every((scenario) => !isApplicable(scenario, 'A') && isApplicable(scenario, 'B4'))).toBe(true);
    expect(honest.every((scenario) => isApplicable(scenario, 'SD'))).toBe(true);
  });
});

describe('mock run scripts', () => {
  const cases = MOCK_SCENARIOS.flatMap((scenario) =>
    scenario.applicableConfigurations.map((configuration) => ({ scenario, configuration })),
  );

  it.each(cases)('$scenario.id on $configuration agrees with the catalog expectation', ({ scenario, configuration }) => {
    const script = buildRunScript(configuration, scenario);
    const expected = expectedOutcome(scenario, configuration);
    if (expected !== 'unknown') expect(script.outcome.accepted).toBe(expected === 'accepted');
    expect(script.events.length).toBeGreaterThan(0);
  });

  it.each(cases)('$scenario.id on $configuration carries only public data', ({ scenario, configuration }) => {
    const { events } = buildRunScript(configuration, scenario);
    const asEvents = events.map(({ event }, seq) => ({ ...event, runId: 'r', seq, at: 0 }));
    expect(asEvents.every(hasOnlyPublicData)).toBe(true);
  });

  it('ends a rejected prove stage at the holder', () => {
    const scenario = MOCK_SCENARIOS.find((item) => item.id === 'gpa-below-threshold');
    if (!scenario) throw new Error('missing scenario');
    const { events } = buildRunScript('B4', scenario);
    const graph = replay(events.map(({ event }, seq) => ({ ...event, runId: 'r', seq, at: 0 })));
    expect(graph.nodes.holder.status).toBe('rejected');
    expect(graph.edges['holder->verifier'].status).toBe('idle');
    expect(graph.nodes.contract.status).toBe('idle');
  });

  it('lets a relabelled replay through exactly where the circuit lacks replay binding', () => {
    const scenario = MOCK_SCENARIOS.find((item) => item.id === 'replay-relabelled-challenge');
    if (!scenario) throw new Error('missing scenario');
    const accepted = ABLATION_IDS.filter((id) => buildRunScript(id, scenario).outcome.accepted);
    expect(accepted).toEqual(['B1', 'B2', 'B3']);
  });
});
