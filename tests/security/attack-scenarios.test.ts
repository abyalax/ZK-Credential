import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../experiments/scenarios/catalog.js';
import { createScenarioContext, type ScenarioContext } from '../../experiments/scenarios/context.js';
import { expectedAcceptance, type Outcome, VARIANT_NAMES, type VariantName } from '../../experiments/scenarios/types.js';

/**
 * P5.1: every scenario runs with real Groth16 proofs against every circuit variant. A variant is
 * expected to accept an attack only where the scenario lists it in `openIn` (a documented
 * ablation gap); the proposed model (`full`) must reject every attack for the stated reason.
 * Needs `pnpm setup:zk` (run by `pnpm test:zk` and `pnpm test:security`).
 */

describe.each(VARIANT_NAMES)('attack scenarios on the "%s" circuit variant', (variant: VariantName) => {
  let ctx: ScenarioContext;
  const outcomes = new Map<string, Outcome>();

  beforeAll(async () => {
    ctx = await createScenarioContext(variant);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  for (const scenario of SCENARIOS) {
    const expected = expectedAcceptance(scenario, variant);
    it(`${scenario.id}: ${expected ? 'accepted' : 'rejected'}`, async () => {
      const outcome = await scenario.run(ctx);
      outcomes.set(scenario.id, outcome);

      expect(outcome.accepted).toBe(expected);
      if (variant === 'full') expect(outcome.reason).toBe(scenario.fullReason);
    });
  }

  it('leaves no attack open in the proposed model, and only listed gaps elsewhere', () => {
    const open = SCENARIOS.filter((scenario) => scenario.kind === 'attack' && outcomes.get(scenario.id)?.accepted).map(
      (scenario) => scenario.id,
    );
    const listed = SCENARIOS.filter((scenario) => scenario.kind === 'attack' && scenario.openIn.includes(variant)).map(
      (scenario) => scenario.id,
    );

    expect(open.sort()).toEqual(listed.sort());
    if (variant === 'full') expect(open).toEqual([]);
  });
});
